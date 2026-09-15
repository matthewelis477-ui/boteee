import { prisma } from "@/lib/db";
import {
  brokerCancel,
  brokerCancelAll,
  brokerCloseFutures,
  brokerGetOrder,
  brokerPlaceMarket,
  brokerPosition,
  isFuturesVenue,
} from "@/lib/exchange/broker";
import { asVenueId, loadBrokerCreds } from "@/lib/exchange/creds";
import { notifyAdmin } from "@/lib/telegram";

async function addEvent(tradeId: string, message: string) {
  await prisma.tradeEvent.create({ data: { tradeId, message } });
}

/** Cancel open protective orders and flatten remaining exchange exposure for a managed trade. */
export async function flattenManagedTrade(tradeId: string, reason: string) {
  const trade = await prisma.managedTrade.findUnique({
    where: { id: tradeId },
    include: { user: true },
  });
  if (!trade) return { ok: false as const, error: "not found" };
  if (["closed", "cancelled", "flattened"].includes(trade.status)) {
    return { ok: true as const, alreadyDone: true };
  }

  const venue = asVenueId(trade.exchange);
  const creds = venue ? await loadBrokerCreds(trade.userId, venue) : null;
  let realized = trade.realizedPnl;

  if (creds && venue) {
    try {
      for (const oid of [trade.slOrderId, trade.tp1OrderId, trade.tp2OrderId, trade.tp3OrderId]) {
        if (!oid) continue;
        try {
          await brokerCancel(venue, creds, trade.asset, oid);
        } catch {
          /* may already be gone */
        }
      }
      try {
        await brokerCancelAll(venue, creds, trade.asset);
      } catch {
        /* ignore */
      }

      if (isFuturesVenue(venue)) {
        const pos = await brokerPosition(venue, creds, trade.asset);
        if (pos.amt) {
          const close = await brokerCloseFutures(venue, creds, trade.asset, pos.amt);
          realized = pos.upnl || realized;
          await addEvent(
            trade.id,
            `Flattened futures position amt=${pos.amt} order=${close && "orderId" in close ? close.orderId : "?"} (${reason})`,
          );
        } else {
          await addEvent(trade.id, `No futures position to flatten (${reason})`);
        }
      } else if (trade.side === "LONG") {
        const qty = trade.remainingQty || trade.qty;
        if (qty > 0) {
          const order = await brokerPlaceMarket(venue, creds, trade.asset, "SELL", qty, {
            clientOrderId: `flat-${trade.id}`.slice(0, 32),
          });
          await addEvent(trade.id, `Flattened spot LONG qty=${qty} order=${order.orderId} (${reason})`);
        }
      } else {
        await addEvent(trade.id, `Spot SHORT flatten skipped (${reason})`);
        void notifyAdmin(`<b>Manual flatten needed</b>\nSpot SHORT ${trade.asset} user ${trade.userId}\n${reason}`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "flatten failed";
      await addEvent(trade.id, `Flatten error: ${message}`);
      void notifyAdmin(`<b>Flatten failed</b>\n${trade.asset} ${trade.id}\n${message}`);
      await prisma.managedTrade.update({
        where: { id: trade.id },
        data: { status: "error", errorMessage: `Flatten failed: ${message}`, lastSyncedAt: new Date() },
      });
      return { ok: false as const, error: message };
    }
  } else {
    await addEvent(trade.id, `Flatten without creds — DB only (${reason})`);
  }

  await prisma.managedTrade.update({
    where: { id: trade.id },
    data: {
      status: "cancelled",
      remainingQty: 0,
      protectStatus: "none",
      realizedPnl: realized,
      closedAt: new Date(),
      lastSyncedAt: new Date(),
      errorMessage: reason,
    },
  });

  const { notifyTradeClosed } = await import("@/lib/notices");
  const isSl = /sl|stop/i.test(reason);
  void notifyTradeClosed({
    userId: trade.userId,
    asset: trade.asset,
    reason,
    pnl: realized,
    telegramChatId: trade.user.telegramChatId,
    kind: isSl ? "stop_hit" : "trade_closed",
  });

  return { ok: true as const };
}

/** Reconcile managed trade qty/PnL vs exchange position + protective order status. */
export async function reconcileTrade(tradeId: string) {
  const trade = await prisma.managedTrade.findUnique({
    where: { id: tradeId },
    include: { user: { include: { credentials: true } } },
  });
  if (!trade || !["open", "partial", "pending_entry"].includes(trade.status)) return null;

  const venue = asVenueId(trade.exchange);
  const creds = venue ? await loadBrokerCreds(trade.userId, venue) : null;
  if (!creds || !venue) return null;

  const updates: Record<string, unknown> = { lastSyncedAt: new Date() };

  if (isFuturesVenue(venue)) {
    const pos = await brokerPosition(venue, creds, trade.asset);
    const abs = Math.abs(pos.amt);
    if (abs < 1e-12 && trade.status !== "pending_entry") {
      updates.status = "closed";
      updates.remainingQty = 0;
      updates.closedAt = new Date();
      updates.realizedPnl = trade.realizedPnl || pos.upnl;
      await addEvent(trade.id, "Reconcile: futures position flat — marking closed");
      if (trade.status !== "closed") {
        const { notifyTradeClosed } = await import("@/lib/notices");
        void notifyTradeClosed({
          userId: trade.userId,
          asset: trade.asset,
          reason: "Position closed",
          pnl: Number(updates.realizedPnl) || undefined,
          telegramChatId: trade.user.telegramChatId,
          kind: "trade_closed",
        });
      }
    } else if (abs > 0) {
      updates.remainingQty = abs;
      if (pos.entry) updates.filledEntry = pos.entry;
      if (trade.status === "pending_entry") updates.status = "open";
    }

    if (trade.slOrderId) {
      try {
        const sl = await brokerGetOrder(venue, creds, trade.asset, trade.slOrderId);
        const filled = /FILLED|filled|closed/i.test(sl.status);
        if (filled) {
          updates.status = "closed";
          updates.remainingQty = 0;
          updates.closedAt = new Date();
          await addEvent(trade.id, `Reconcile: SL order FILLED (${sl.orderId})`);
          const { notifyTradeClosed } = await import("@/lib/notices");
          void notifyTradeClosed({
            userId: trade.userId,
            asset: trade.asset,
            reason: "Stop-loss filled",
            telegramChatId: trade.user.telegramChatId,
            kind: "stop_hit",
          });
        } else if (/CANCELED|CANCELLED|EXPIRED|canceled/i.test(sl.status) && abs > 0) {
          updates.protectStatus = "unprotected";
          await addEvent(trade.id, `Reconcile: SL ${sl.status} while position open — unprotected`);
        } else if (/NEW|PARTIALLY|live|active/i.test(sl.status)) {
          updates.protectStatus = "active";
        }
      } catch {
        /* order may not exist */
      }
    }
  } else if (trade.entryOrderId) {
    try {
      const o = await brokerGetOrder(venue, creds, trade.asset, trade.entryOrderId);
      const filled = Number(o.executedQty);
      if (filled > 0 && trade.status === "pending_entry") {
        updates.status = "open";
        updates.qty = filled;
        updates.remainingQty = filled;
      }
      if (o.avgPrice) updates.filledEntry = Number(o.avgPrice);
    } catch {
      /* ignore */
    }
  }

  await prisma.managedTrade.update({ where: { id: trade.id }, data: updates });
  return updates;
}
