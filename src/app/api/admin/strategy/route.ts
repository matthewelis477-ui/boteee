import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStrategy, runBacktest, STRATEGIES } from "@/lib/market/backtest";
import type { Candle } from "@/lib/market/indicators";

async function fetchKlines(symbol: string, interval: string, limit = 500): Promise<Candle[]> {
  const hosts = ["https://data-api.binance.vision", "https://api.binance.com"];
  for (const host of hosts) {
    const res = await fetch(`${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`, {
      cache: "no-store",
    });
    if (!res.ok) continue;
    const raw = (await res.json()) as (string | number)[][];
    return raw.map((k) => ({
      openTime: Number(k[0]),
      open: Number(k[1]),
      high: Number(k[2]),
      low: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5]),
    }));
  }
  throw new Error("Could not load klines");
}

async function ensureStrategies() {
  for (const s of STRATEGIES) {
    const exists = await prisma.strategyVersion.findUnique({ where: { key: s.key } });
    if (exists) {
      await prisma.strategyVersion.update({
        where: { key: s.key },
        data: {
          name: s.key,
          description: `EMA ${s.emaFast}/${s.emaSlow} + RSI ${s.rsiPeriod}`,
          paramsJson: JSON.stringify(s),
        },
      });
    } else {
      await prisma.strategyVersion.create({
        data: {
          key: s.key,
          name: s.key,
          description: `EMA ${s.emaFast}/${s.emaSlow} + RSI ${s.rsiPeriod}`,
          paramsJson: JSON.stringify(s),
          active: s.key === (process.env.ACTIVE_STRATEGY || "v3-quality-mtf"),
        },
      });
    }
  }
  const anyActive = await prisma.strategyVersion.findFirst({ where: { active: true } });
  if (!anyActive) {
    const fallback = process.env.ACTIVE_STRATEGY || "v3-quality-mtf";
    await prisma.strategyVersion.updateMany({
      where: { key: fallback },
      data: { active: true },
    });
  }
}

export async function GET() {
  const user = await readUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensureStrategies();
  const strategies = await prisma.strategyVersion.findMany({
    include: { backtests: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "asc" },
  });
  const qa = await prisma.signalQaNote.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  const activeRow = await prisma.strategyVersion.findFirst({ where: { active: true } });
  const { ensurePlatformConfig, isBinanceTestnetConfig, isLiveTradingEnabled } = await import("@/lib/platform-config");
  await ensurePlatformConfig();
  return NextResponse.json({
    active: activeRow?.key || getStrategy().key,
    testnet: isBinanceTestnetConfig(),
    liveEnabled: isLiveTradingEnabled(),
    strategies,
    qa,
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const action = String(body.action || "backtest");

  if (action === "qa") {
    const signalId = String(body.signalId || "");
    const decision = String(body.decision || "approve");
    const note = String(body.note || "").trim();
    if (!signalId || !note) return NextResponse.json({ error: "signalId and note required" }, { status: 400 });
    const row = await prisma.signalQaNote.create({
      data: { signalId, adminId: user.id, decision, note },
    });
    if (decision === "approve") {
      await prisma.marketSignal.update({ where: { id: signalId }, data: { approved: true } });
    } else if (decision === "reject") {
      await prisma.marketSignal.update({ where: { id: signalId }, data: { approved: false, status: "paused" } });
    }
    return NextResponse.json({ ok: true, qa: row });
  }

  if (action === "activate") {
    const key = String(body.key || "");
    await ensureStrategies();
    await prisma.strategyVersion.updateMany({ data: { active: false } });
    await prisma.strategyVersion.update({ where: { key }, data: { active: true } });
    return NextResponse.json({
      ok: true,
      active: key,
      note: "Live signals now use this DB-active strategy via resolveActiveStrategy().",
    });
  }

  await ensureStrategies();
  const key = String(body.key || getStrategy().key);
  const symbol = String(body.symbol || "BTCUSDT");
  const interval = String(body.interval || "1h");
  const params = STRATEGIES.find((s) => s.key === key) || getStrategy();
  const candles = await fetchKlines(symbol, interval, 500);
  const result = runBacktest(candles, params);
  const strategy = await prisma.strategyVersion.findUnique({ where: { key } });
  if (!strategy) return NextResponse.json({ error: "Strategy missing" }, { status: 404 });

  const run = await prisma.backtestRun.create({
    data: {
      strategyId: strategy.id,
      symbol,
      interval,
      bars: candles.length,
      trades: result.trades,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      maxDrawdownPct: result.maxDrawdownPct,
      avgReturnPct: result.avgReturnPct,
      expectancyPct: result.expectancyPct,
      notes: result.notes,
      resultsJson: JSON.stringify(result),
    },
  });

  return NextResponse.json({ ok: true, run, result });
}
