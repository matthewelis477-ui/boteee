import { prisma } from "@/lib/db";
import {
  brokerCancel,
  brokerNormalize,
  brokerPlaceStop,
  brokerPlaceTakeProfit,
  brokerPrice,
  isFuturesVenue,
  makeClientOrderId,
} from "@/lib/exchange/broker";
import { asVenueId, loadBrokerCreds } from "@/lib/exchange/creds";
import { enqueueTradeJob } from "@/lib/trading/queue";
import { flattenManagedTrade, reconcileTrade } from "@/lib/trading/flatten";
import { placeProtectionForTrade } from "@/lib/trading/executor";

async function addEvent(tradeId: string, message: string) {
  await prisma.tradeEvent.create({ data: { tradeId, message } });
}

export async function manageOpenTrades() {
  const open = await prisma.managedTrade.findMany({
    where: { status: { in: ["pending_entry", "open", "partial"] } },
    include: { user: { include: { tradingPrefs: true, credentials: true } }, signal: true },
  });

  let updates = 0;
  for (const trade of open) {
    // Kill switch — flatten exchange risk, not just DB
    if (trade.user.tradingPrefs?.killSwitch) {
      await flattenManagedTrade(trade.id, "Kill switch");
      updates += 1;
      continue;
    }

    // Signal invalidated / paused / expired — flatten
    if (["invalidated", "paused", "expired"].includes(trade.signal.status)) {
      await flattenManagedTrade(trade.id, `Signal ${trade.signal.status}`);
      updates += 1;
      continue;
    }

    // Signal validity window elapsed while open — flatten remaining
    const ageMin = (Date.now() - trade.signal.publishedAt.getTime()) / 60_000;
    if (trade.status === "pending_entry" && ageMin > trade.signal.validForMinutes) {
      await prisma.managedTrade.update({
        where: { id: trade.id },
        data: { status: "cancelled", closedAt: new Date(), errorMessage: "Expired before fill" },
      });
      await addEvent(trade.id, "Cancelled — expired before entry fill");
      updates += 1;
      continue;
    }

    // Reconcile vs exchange
    try {
      await reconcileTrade(trade.id);
    } catch {
      /* continue with local state */
    }

    const fresh = await prisma.managedTrade.findUnique({
      where: { id: trade.id },
      include: { user: { include: { credentials: true, tradingPrefs: true } }, signal: true },
    });
    if (!fresh || ["closed", "cancelled", "error"].includes(fresh.status)) {
      updates += 1;
      continue;
    }

    // Repair unprotected fills
    if (["open", "partial"].includes(fresh.status) && fresh.protectStatus === "unprotected") {
      try {
        await placeProtectionForTrade(fresh.id);
        updates += 1;
      } catch {
        await enqueueTradeJob({
          kind: "place_protect",
          userId: fresh.userId,
          tradeId: fresh.id,
          payload: {},
          delayMs: 3000,
        });
      }
    }

    const venue = asVenueId(fresh.exchange);
    if (!venue) continue;
    let price = 0;
    try {
      price = await brokerPrice(venue, fresh.asset);
    } catch {
      continue;
    }

    const long = fresh.side === "LONG";
    // Mark-price hints only — closures prefer reconcile of SL/TP fills.
    // Still act if price clearly through SL and we appear unprotected.
    const hitSl = long ? price <= fresh.stopLoss : price >= fresh.stopLoss;
    if (hitSl && fresh.protectStatus === "unprotected") {
      await flattenManagedTrade(fresh.id, "SL breached while unprotected — emergency flatten");
      updates += 1;
      continue;
    }

    const hitT1 = !fresh.hitT1 && (long ? price >= fresh.target1 : price <= fresh.target1);
    const hitT2 = !fresh.hitT2 && (long ? price >= fresh.target2 : price <= fresh.target2);
    const hitT3 = !fresh.hitT3 && (long ? price >= fresh.target3 : price <= fresh.target3);

    if (hitT1 && isFuturesVenue(venue)) {
      const entry = fresh.filledEntry || fresh.entry;
      const creds = await loadBrokerCreds(fresh.userId, venue);
      if (creds) {
        const closeSide = long ? "SELL" : "BUY";
        if (fresh.slOrderId) {
          try {
            await brokerCancel(venue, creds, fresh.asset, fresh.slOrderId);
            await addEvent(fresh.id, `Cancelled prior SL ${fresh.slOrderId} before BE replace`);
          } catch {
            /* may already be filled */
          }
        }
        try {
          const stopNorm = await brokerNormalize(venue, fresh.asset, fresh.remainingQty || fresh.qty, entry);
          const sl = await brokerPlaceStop(
            venue,
            creds,
            fresh.asset,
            closeSide,
            stopNorm.price || entry,
            stopNorm.qty,
            makeClientOrderId("be", fresh.id),
          );
          await prisma.managedTrade.update({
            where: { id: fresh.id },
            data: {
              hitT1: true,
              status: "partial",
              slMovedToBe: true,
              stopLoss: entry,
              slOrderId: sl.orderId,
              protectStatus: "active",
              remainingQty: (fresh.remainingQty || fresh.qty) * 0.6,
            },
          });
          await addEvent(fresh.id, `T1 — SL moved to BE order ${sl.orderId}`);
        } catch (e) {
          await prisma.managedTrade.update({
            where: { id: fresh.id },
            data: { hitT1: true, status: "partial", slMovedToBe: true, stopLoss: entry, protectStatus: "unprotected" },
          });
          await addEvent(fresh.id, `T1 BE replace failed: ${e instanceof Error ? e.message : "err"}`);
          await enqueueTradeJob({
            kind: "place_protect",
            userId: fresh.userId,
            tradeId: fresh.id,
            payload: {},
            delayMs: 2000,
          });
        }
      } else {
        await prisma.managedTrade.update({
          where: { id: fresh.id },
          data: { hitT1: true, status: "partial", slMovedToBe: true, stopLoss: entry },
        });
      }
      const { createUserNotice } = await import("@/lib/notices");
      void createUserNotice({
        userId: fresh.userId,
        kind: "target_hit",
        title: `Target 1 hit · ${fresh.asset}`,
        body: "Stop moved to breakeven.",
        telegramChatId: fresh.user.telegramChatId,
        telegramHtml: `<b>Target 1 hit</b>\n${fresh.asset}\nStop moved to breakeven.`,
      });
      updates += 1;
    } else if (hitT1) {
      await prisma.managedTrade.update({
        where: { id: fresh.id },
        data: { hitT1: true, status: "partial", slMovedToBe: true, stopLoss: fresh.filledEntry || fresh.entry },
      });
      await addEvent(fresh.id, "T1 marked (spot — manage SL manually / existing stop)");
      updates += 1;
    }

    if (hitT2 && isFuturesVenue(venue)) {
      const creds = await loadBrokerCreds(fresh.userId, venue);
      if (creds) {
        try {
          const closeSide = long ? "SELL" : "BUY";
          const rem = fresh.remainingQty || fresh.qty;
          const t2Qty = (await brokerNormalize(venue, fresh.asset, rem * 0.5)).qty;
          const tp2 = await brokerPlaceTakeProfit(
            venue,
            creds,
            fresh.asset,
            closeSide,
            fresh.target2,
            t2Qty,
            makeClientOrderId("tp2", fresh.id),
          );
          await prisma.managedTrade.update({
            where: { id: fresh.id },
            data: { hitT2: true, status: "partial", tp2OrderId: tp2.orderId, remainingQty: rem * 0.5 },
          });
          await addEvent(fresh.id, `T2 TP order ${tp2.orderId}`);
        } catch {
          await prisma.managedTrade.update({ where: { id: fresh.id }, data: { hitT2: true, status: "partial" } });
        }
      } else {
        await prisma.managedTrade.update({ where: { id: fresh.id }, data: { hitT2: true, status: "partial" } });
      }
      updates += 1;
    }

    if (hitT3) {
      await flattenManagedTrade(fresh.id, "T3 reached — closing remainder");
      await prisma.managedTrade.update({
        where: { id: fresh.id },
        data: { hitT3: true },
      });
      const { createUserNotice } = await import("@/lib/notices");
      void createUserNotice({
        userId: fresh.userId,
        kind: "target_hit",
        title: `Target 3 hit · ${fresh.asset}`,
        body: "Remainder closed.",
        telegramChatId: fresh.user.telegramChatId,
        telegramHtml: `<b>Target 3 hit</b>\n${fresh.asset}\nRemainder closed.`,
      });
      updates += 1;
    }
  }

  // Re-protect any unprotected open trades
  const unprotected = await prisma.managedTrade.findMany({
    where: { status: { in: ["open", "partial"] }, protectStatus: "unprotected" },
    take: 20,
  });
  for (const t of unprotected) {
    await enqueueTradeJob({
      kind: "place_protect",
      userId: t.userId,
      tradeId: t.id,
      payload: {},
      delayMs: 0,
    });
  }

  return { checked: open.length, updates, unprotectedQueued: unprotected.length };
}
