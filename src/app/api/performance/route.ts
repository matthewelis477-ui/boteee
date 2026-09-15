import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const closed = await prisma.managedTrade.findMany({
    where: { status: "closed" },
    orderBy: { closedAt: "desc" },
    take: 500,
  });

  const wins = closed.filter((t) => t.realizedPnl > 0);
  const losses = closed.filter((t) => t.realizedPnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.realizedPnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.realizedPnl, 0));
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin ? 99 : 0;
  const winRate = closed.length ? wins.length / closed.length : 0;
  const avgGain = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0;

  let equity = 0;
  let peak = 0;
  let maxDd = 0;
  for (const t of [...closed].reverse()) {
    equity += t.realizedPnl - t.feesUsd;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, peak - equity);
  }

  const byCoinMap = new Map<string, { pnl: number; n: number; wins: number }>();
  for (const t of closed) {
    const coin = t.asset.split("/")[0];
    const row = byCoinMap.get(coin) || { pnl: 0, n: 0, wins: 0 };
    row.pnl += t.realizedPnl;
    row.n += 1;
    if (t.realizedPnl > 0) row.wins += 1;
    byCoinMap.set(coin, row);
  }

  return NextResponse.json({
    totalSignals: await prisma.marketSignal.count(),
    closedTrades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdownUsd: Math.round(maxDd * 100) / 100,
    avgGain: Math.round(avgGain * 100) / 100,
    avgLoss: Math.round(avgLoss * 100) / 100,
    feesNote: "PnL includes modeled fees where recorded on ManagedTrade. Slippage is exchange-realized.",
    byCoin: [...byCoinMap.entries()].map(([coin, r]) => ({
      coin,
      n: r.n,
      wr: r.n ? Math.round((r.wins / r.n) * 100) : 0,
      pnl: Math.round(r.pnl * 100) / 100,
    })),
  });
}
