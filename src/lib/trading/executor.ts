import { prisma } from "@/lib/db";
import {
  brokerNormalize,
  brokerPlaceMarket,
  brokerPlaceSpotOco,
  brokerPlaceStop,
  brokerPlaceTakeProfit,
  brokerPosition,
  brokerSetLeverage,
  brokerUsdtAvailable,
  isFuturesVenue,
  isTradingTestnet,
  makeClientOrderId,
} from "@/lib/exchange/broker";
import { asVenueId, loadBrokerCreds } from "@/lib/exchange/creds";
import { resolveVenueId, type VenueId } from "@/lib/exchange/venues";
import { positionPlan } from "@/lib/risk";
import { notifyAdmin, sendTelegram } from "@/lib/telegram";
import { dbToSignal } from "@/lib/signal-map";
import { enqueueTradeJob } from "@/lib/trading/queue";
import { ensurePlatformConfig, isLiveTradingEnabled } from "@/lib/platform-config";

const AUTO_PLANS = new Set(["pro", "elite", "institutional"]);

function parseLev(raw: string, cap: number) {
  const m = raw.match(/(\d+)/);
  const n = m ? Number(m[1]) : 1;
  return Math.max(1, Math.min(cap, n || 1));
}

async function addEvent(tradeId: string, message: string) {
  await prisma.tradeEvent.create({ data: { tradeId, message } });
}

function signalStillValid(publishedAt: Date, validForMinutes: number) {
  return Date.now() - publishedAt.getTime() <= validForMinutes * 60_000;
}

function requireVenue(exchange: string): VenueId {
  const v = asVenueId(exchange);
  if (!v) throw new Error(`Unsupported exchange venue: ${exchange}`);
  return v;
}

/** Place or repair protective SL/TP only — never re-enters size. */
export async function placeProtectionForTrade(tradeId: string) {
  const trade = await prisma.managedTrade.findUnique({ where: { id: tradeId }, include: { user: true } });
  if (!trade || !["open", "partial"].includes(trade.status)) return;
  if (trade.protectStatus === "active" && trade.slOrderId) return;

  const venue = requireVenue(trade.exchange);
  const creds = await loadBrokerCreds(trade.userId, venue);
  if (!creds) throw new Error("Missing trade-only credentials for protection");

  const closeSide = trade.side === "LONG" ? "SELL" : "BUY";
  const qty = trade.remainingQty || trade.qty;
  const stop = trade.stopLoss;
  const stopNorm = await brokerNormalize(venue, trade.asset, qty, stop);
  const stopPx = stopNorm.price ?? stop;

  if (isFuturesVenue(venue)) {
    const pos = await brokerPosition(venue, creds, trade.asset);
    if (Math.abs(pos.amt) < 1e-12) {
      await prisma.managedTrade.update({
        where: { id: trade.id },
        data: { status: "closed", remainingQty: 0, closedAt: new Date(), protectStatus: "none" },
      });
      await addEvent(trade.id, "Protection skipped — no futures position");
      return;
    }
    const sl = await brokerPlaceStop(
      venue,
      creds,
      trade.asset,
      closeSide,
      stopPx,
      Math.abs(pos.amt),
      makeClientOrderId("sl", trade.id),
    );
    const t1Qty = (await brokerNormalize(venue, trade.asset, Math.abs(pos.amt) * 0.4)).qty;
    let tp1OrderId: string | undefined;
    try {
      const tp1 = await brokerPlaceTakeProfit(
        venue,
        creds,
        trade.asset,
        closeSide,
        trade.target1,
        t1Qty,
        makeClientOrderId("tp1", trade.id),
      );
      tp1OrderId = tp1.orderId || undefined;
    } catch (e) {
      await addEvent(trade.id, `TP1 place failed: ${e instanceof Error ? e.message : "err"}`);
    }
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: {
        slOrderId: sl.orderId,
        tp1OrderId: tp1OrderId || trade.tp1OrderId,
        protectStatus: "active",
        remainingQty: Math.abs(pos.amt),
        errorMessage: null,
        lastSyncedAt: new Date(),
      },
    });
    await addEvent(trade.id, `Protection active SL=${sl.orderId}${tp1OrderId ? ` TP1=${tp1OrderId}` : ""}`);
    return;
  }

  // Spot: OCO when supported (Binance), else stop + TP
  try {
    const oco = await brokerPlaceSpotOco(
      venue,
      creds,
      trade.asset,
      closeSide,
      stopNorm.qty,
      trade.target1,
      stopPx,
      makeClientOrderId("oco", trade.id),
    );
    const ids = oco.orders?.map((o) => String(o.orderId)) || [];
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: {
        slOrderId: ids[1] || ids[0] || null,
        tp1OrderId: ids[0] || null,
        protectStatus: "active",
        errorMessage: null,
        lastSyncedAt: new Date(),
      },
    });
    await addEvent(trade.id, `Spot protection active`);
    return;
  } catch (e) {
    await addEvent(trade.id, `OCO unavailable, stop only: ${e instanceof Error ? e.message : "err"}`);
  }
  const sl = await brokerPlaceStop(
    venue,
    creds,
    trade.asset,
    closeSide,
    stopPx,
    stopNorm.qty,
    makeClientOrderId("sl", trade.id),
  );
  await prisma.managedTrade.update({
    where: { id: trade.id },
    data: {
      slOrderId: sl.orderId,
      protectStatus: "active",
      errorMessage: null,
      lastSyncedAt: new Date(),
    },
  });
  await addEvent(trade.id, `Spot stop active ${sl.orderId}`);
}

export async function placeEntryForTrade(tradeId: string) {
  const trade = await prisma.managedTrade.findUnique({
    where: { id: tradeId },
    include: { user: true, signal: true },
  });
  if (!trade) return;
  if (!["pending_entry", "open"].includes(trade.status)) return;
  if (trade.status === "open" || trade.entryOrderId) {
    if (trade.protectStatus !== "active") await placeProtectionForTrade(trade.id);
    return;
  }

  if (!signalStillValid(trade.signal.publishedAt, trade.signal.validForMinutes)) {
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: { status: "cancelled", closedAt: new Date(), errorMessage: "Signal expired before entry" },
    });
    await addEvent(trade.id, "Cancelled — signal validForMinutes elapsed");
    return;
  }

  const venue = requireVenue(trade.exchange);
  const creds = await loadBrokerCreds(trade.userId, venue);
  if (!creds) throw new Error("Missing trade-only credentials");

  const side = trade.side === "LONG" ? "BUY" : "SELL";
  const clientOrderId = trade.clientOrderId || makeClientOrderId("en", trade.id);
  if (!trade.clientOrderId) {
    await prisma.managedTrade.update({ where: { id: trade.id }, data: { clientOrderId } });
  }

  // Futures: adopt existing position instead of doubling
  if (isFuturesVenue(venue)) {
    const pos = await brokerPosition(venue, creds, trade.asset);
    const wantLong = trade.side === "LONG";
    if ((wantLong && pos.amt > 0) || (!wantLong && pos.amt < 0)) {
      await prisma.managedTrade.update({
        where: { id: trade.id },
        data: {
          status: "open",
          filledEntry: pos.entry || trade.entry,
          qty: Math.abs(pos.amt),
          remainingQty: Math.abs(pos.amt),
          lastSyncedAt: new Date(),
          errorMessage: "Adopted existing exchange position",
        },
      });
      await addEvent(trade.id, `Adopted existing position amt=${pos.amt}`);
      await placeProtectionForTrade(trade.id);
      return;
    }
  }

  const norm = await brokerNormalize(venue, trade.asset, trade.qty, trade.entry);
  const qty = norm.qty;

  if (isFuturesVenue(venue)) {
    const avail = await brokerUsdtAvailable(venue, creds);
    const marginNeeded = (qty * trade.entry) / Math.max(1, trade.leverage);
    if (avail < marginNeeded * 1.05) {
      throw new Error(`Insufficient futures margin: need ~$${marginNeeded.toFixed(2)}, have $${avail.toFixed(2)}`);
    }
    await brokerSetLeverage(venue, creds, trade.asset, trade.leverage);
    const order = await brokerPlaceMarket(venue, creds, trade.asset, side, qty, { clientOrderId });
    const filledEntry = Number(order.avgPrice || trade.entry);
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: {
        status: "open",
        entryOrderId: order.orderId,
        clientOrderId,
        filledEntry,
        qty,
        remainingQty: qty,
        protectStatus: "pending",
        lastSyncedAt: new Date(),
      },
    });
    await addEvent(
      trade.id,
      `Futures entry ${order.orderId} @ ~${filledEntry} on ${venue}${isTradingTestnet() ? " [TESTNET]" : ""}`,
    );
  } else {
    if (trade.side === "SHORT") throw new Error("Spot SHORT is not supported. Use a futures venue.");
    const usdt = await brokerUsdtAvailable(venue, creds);
    if (usdt < qty * trade.entry * 1.01) {
      throw new Error(`Insufficient spot USDT: need ~$${(qty * trade.entry).toFixed(2)}, have $${usdt.toFixed(2)}`);
    }
    const order = await brokerPlaceMarket(venue, creds, trade.asset, side, qty, { clientOrderId });
    let filledEntry = trade.entry;
    let filledQty = qty;
    if (order.fills?.length) {
      const notional = order.fills.reduce((s, f) => s + Number(f.price) * Number(f.qty), 0);
      filledQty = order.fills.reduce((s, f) => s + Number(f.qty), 0);
      filledEntry = filledQty ? notional / filledQty : trade.entry;
    } else if (order.executedQty) {
      filledQty = Number(order.executedQty) || qty;
    }
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: {
        status: "open",
        entryOrderId: order.orderId,
        clientOrderId,
        filledEntry,
        qty: filledQty,
        remainingQty: filledQty,
        protectStatus: "pending",
        lastSyncedAt: new Date(),
      },
    });
    await addEvent(trade.id, `Spot entry ${order.orderId} @ ~${filledEntry} on ${venue}`);
  }

  try {
    await placeProtectionForTrade(trade.id);
  } catch (e) {
    const message = e instanceof Error ? e.message : "protection failed";
    await prisma.managedTrade.update({
      where: { id: trade.id },
      data: { protectStatus: "unprotected", errorMessage: message },
    });
    await enqueueTradeJob({
      kind: "place_protect",
      userId: trade.userId,
      tradeId: trade.id,
      signalId: trade.signalId,
      payload: {},
      delayMs: 2000,
    });
    void notifyAdmin(`<b>UNPROTECTED POSITION</b>\n${trade.asset} ${trade.id}\n${venue}\n${message}`);
  }

  const refreshed = await prisma.managedTrade.findUnique({ where: { id: trade.id } });
  if (refreshed) {
    const { notifyTradeOpened } = await import("@/lib/notices");
    void notifyTradeOpened({
      userId: trade.userId,
      asset: trade.asset,
      side: trade.side,
      qty: refreshed.qty,
      entry: refreshed.filledEntry,
      stop: trade.stopLoss,
      telegramChatId: trade.user.telegramChatId,
      testnet: isTradingTestnet(),
    });
  }
}

export async function executeApprovedSignals() {
  await ensurePlatformConfig();
  if (!isTradingTestnet() && !isLiveTradingEnabled()) {
    return {
      created: 0,
      queued: 0,
      skippedExpired: 0,
      blocked: "Live trading is off. Keep testnet on, or enable live trading in Admin → Launch config.",
      testnet: false,
    };
  }

  if (process.env.SKIP_STRATEGY_GATE !== "1") {
    try {
      const active = await prisma.strategyVersion.findFirst({
        where: { active: true },
        include: { backtests: { orderBy: { createdAt: "desc" }, take: 1 } },
      });
      const last = active?.backtests[0];
      if (!last) {
        void notifyAdmin("<b>Auto-trade blocked</b>\nNo backtest on active strategy. Run Admin → BTC backtest first.");
        return { created: 0, queued: 0, skippedExpired: 0, blocked: "no_backtest", testnet: isTradingTestnet() };
      }
      if (last.profitFactor < 1.1) {
        void notifyAdmin(
          `<b>Auto-trade blocked</b>\nActive strategy PF ${last.profitFactor} &lt; 1.1. Do not promote weak edge.`,
        );
        return { created: 0, queued: 0, skippedExpired: 0, blocked: "weak_backtest", testnet: isTradingTestnet() };
      }
    } catch {
      /* continue */
    }
  }

  const signals = await prisma.marketSignal.findMany({
    where: {
      approved: true,
      side: { in: ["LONG", "SHORT"] },
      status: { in: ["active", "monitoring"] },
    },
    orderBy: { publishedAt: "desc" },
    take: 20,
  });

  let created = 0;
  let queued = 0;
  let skippedExpired = 0;

  for (const row of signals) {
    if (!signalStillValid(row.publishedAt, row.validForMinutes)) {
      if (row.status === "active") {
        await prisma.marketSignal.update({ where: { id: row.id }, data: { status: "expired" } });
      }
      skippedExpired += 1;
      continue;
    }

    const signal = dbToSignal(row);
    if (signal.marketType === "spot" && signal.side === "SHORT") continue;

    const users = await prisma.user.findMany({
      where: {
        plan: { in: [...AUTO_PLANS] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        tradingPrefs: {
          is: { autoTradeEnabled: true, killSwitch: false },
        },
      },
      include: { tradingPrefs: true },
    });

    for (const user of users) {
      const prefs = user.tradingPrefs;
      if (!prefs) continue;
      if (signal.confidence < user.minConfidence) continue;
      const coins = user.coins.split(",").map((c) => c.trim()).filter(Boolean);
      if (coins.length && !coins.includes(signal.asset)) continue;
      const markets = prefs.markets.split(",").map((m) => m.trim());
      if (!markets.includes(signal.marketType)) continue;

      const openCount = await prisma.managedTrade.count({
        where: { userId: user.id, status: { in: ["pending_entry", "open", "partial"] } },
      });
      if (openCount >= prefs.maxOpenTrades) continue;

      const existing = await prisma.managedTrade.findUnique({
        where: { userId_signalId: { userId: user.id, signalId: signal.id } },
      });
      if (existing) continue;

      const venue = resolveVenueId(prefs.preferredVenue || "binance", signal.marketType === "futures" ? "futures" : "spot");
      const creds = await loadBrokerCreds(user.id, venue);
      if (!creds) continue;

      const entry = (signal.entryLow + signal.entryHigh) / 2;
      const plan = positionPlan({
        capital: prefs.capitalUsd,
        riskPct: prefs.maxRiskPct,
        entry,
        stop: signal.stopLoss,
        leverage: prefs.maxLeverage,
        targets: signal.targets,
      });
      if (!plan || plan.qty <= 0) continue;

      let qty = plan.qty;
      try {
        const norm = await brokerNormalize(venue, signal.asset, plan.qty, entry);
        qty = norm.qty;
      } catch {
        continue;
      }

      const leverage = parseLev(signal.leverage, prefs.maxLeverage);
      const clientOrderId = makeClientOrderId("en", `${user.id.slice(0, 8)}${signal.id}`.slice(0, 24));

      let trade;
      try {
        trade = await prisma.managedTrade.create({
          data: {
            userId: user.id,
            signalId: signal.id,
            exchange: venue,
            marketType: signal.marketType,
            asset: signal.asset,
            side: signal.side,
            qty,
            remainingQty: qty,
            entry,
            stopLoss: signal.stopLoss,
            target1: signal.targets[0],
            target2: signal.targets[1],
            target3: signal.targets[2],
            leverage,
            status: "pending_entry",
            protectStatus: "none",
            clientOrderId,
          },
        });
      } catch {
        continue;
      }

      try {
        await placeEntryForTrade(trade.id);
        created += 1;
      } catch (e) {
        const message = e instanceof Error ? e.message : "Execution failed";
        const current = await prisma.managedTrade.findUnique({ where: { id: trade.id } });
        if (current && !current.entryOrderId && current.status === "pending_entry") {
          await addEvent(trade.id, `Entry failed — queued retry: ${message}`);
          await enqueueTradeJob({
            kind: "place_entry",
            userId: user.id,
            tradeId: trade.id,
            signalId: signal.id,
            payload: {},
            delayMs: 4000,
          });
          queued += 1;
        } else if (current && current.entryOrderId && current.protectStatus !== "active") {
          await enqueueTradeJob({
            kind: "place_protect",
            userId: user.id,
            tradeId: trade.id,
            signalId: signal.id,
            payload: {},
            delayMs: 2000,
          });
        }
        if (user.telegramChatId) {
          void sendTelegram(user.telegramChatId, `<b>Auto-trade issue</b>\n${signal.asset}\n${venue}\n${message}`);
        }
      }
    }
  }
  return { created, queued, skippedExpired, testnet: isTradingTestnet() };
}

export async function handleTradeJob(job: {
  kind: string;
  userId: string;
  tradeId: string | null;
  payload: unknown;
}) {
  if (job.kind === "place_entry" && job.tradeId) {
    await placeEntryForTrade(job.tradeId);
    return;
  }
  if ((job.kind === "place_protect" || job.kind === "place_sl") && job.tradeId) {
    await placeProtectionForTrade(job.tradeId);
    return;
  }
  if (job.kind === "flatten" && job.tradeId) {
    const { flattenManagedTrade } = await import("@/lib/trading/flatten");
    const reason = (job.payload as { reason?: string })?.reason || "job flatten";
    await flattenManagedTrade(job.tradeId, reason);
  }
}
