import type { MarketSignal } from "@prisma/client";
import type { Signal } from "./types";

export function dbToSignal(row: MarketSignal, delayed = false): Signal {
  return {
    id: row.id,
    side: row.side as Signal["side"],
    asset: row.asset,
    exchange: row.exchange,
    marketType: row.marketType as Signal["marketType"],
    entryLow: row.entryLow,
    entryHigh: row.entryHigh,
    targets: [row.target1, row.target2, row.target3],
    stopLoss: row.stopLoss,
    leverage: row.leverage,
    rr: row.rr,
    confidence: row.confidence,
    style: row.style as Signal["style"],
    timeframe: row.timeframe,
    validForMinutes: row.validForMinutes,
    marketCondition: row.marketCondition,
    publishedAt: row.publishedAt.toISOString(),
    status: row.status as Signal["status"],
    risk: row.risk as Signal["risk"],
    delayed: delayed || row.delayed,
    approved: row.approved,
    why: JSON.parse(row.whyJson),
    updates: JSON.parse(row.updatesJson),
  };
}
