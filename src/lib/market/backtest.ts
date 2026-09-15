import { atr, ema, rsi, type Candle } from "@/lib/market/indicators";

export type StrategyParams = {
  key: string;
  emaFast: number;
  emaSlow: number;
  rsiPeriod: number;
  rsiLongMin: number;
  rsiLongMax: number;
  rsiShortMin: number;
  rsiShortMax: number;
  atrMultStop: number;
  atrMultT1: number;
  atrMultT2: number;
  atrMultT3: number;
  minVolRatio: number;
  feePct: number;
  slipPct: number;
  /** Minimum T1 R:R after stop distance */
  minRr: number;
  /** Require higher-timeframe EMA stack alignment */
  requireHtf: boolean;
  /** Max % distance from fast EMA (avoid chasing) */
  maxDistFromEmaPct: number;
  /** Only publish / auto-consider setups at or above this confidence */
  minPublishConfidence: number;
  /** Max directional signals promoted per pipeline run */
  maxSignalsPerRun: number;
};

export const STRATEGIES: StrategyParams[] = [
  {
    key: "v1-ema-rsi",
    emaFast: 20,
    emaSlow: 50,
    rsiPeriod: 14,
    rsiLongMin: 48,
    rsiLongMax: 68,
    rsiShortMin: 32,
    rsiShortMax: 52,
    atrMultStop: 1.15,
    atrMultT1: 1.1,
    atrMultT2: 1.9,
    atrMultT3: 2.9,
    minVolRatio: 1.15,
    feePct: 0.08,
    slipPct: 0.05,
    minRr: 0.9,
    requireHtf: false,
    maxDistFromEmaPct: 3.5,
    minPublishConfidence: 62,
    maxSignalsPerRun: 8,
  },
  {
    key: "v2-ema-rsi-atr",
    emaFast: 21,
    emaSlow: 55,
    rsiPeriod: 14,
    rsiLongMin: 50,
    rsiLongMax: 65,
    rsiShortMin: 35,
    rsiShortMax: 50,
    atrMultStop: 1.35,
    atrMultT1: 1.2,
    atrMultT2: 2.1,
    atrMultT3: 3.2,
    minVolRatio: 1.25,
    feePct: 0.08,
    slipPct: 0.05,
    minRr: 1.0,
    requireHtf: false,
    maxDistFromEmaPct: 2.8,
    minPublishConfidence: 68,
    maxSignalsPerRun: 6,
  },
  {
    key: "v3-quality-mtf",
    emaFast: 21,
    emaSlow: 55,
    rsiPeriod: 14,
    rsiLongMin: 52,
    rsiLongMax: 64,
    rsiShortMin: 36,
    rsiShortMax: 48,
    atrMultStop: 1.45,
    atrMultT1: 1.35,
    atrMultT2: 2.3,
    atrMultT3: 3.5,
    minVolRatio: 1.35,
    feePct: 0.08,
    slipPct: 0.06,
    minRr: 1.15,
    requireHtf: true,
    maxDistFromEmaPct: 2.2,
    minPublishConfidence: 74,
    maxSignalsPerRun: 5,
  },
];

export function getStrategy(key?: string) {
  const k = key || process.env.ACTIVE_STRATEGY || "v3-quality-mtf";
  return STRATEGIES.find((s) => s.key === k) || STRATEGIES[2];
}

/** Prefer DB active strategy; fall back to env / default. */
export async function resolveActiveStrategy(): Promise<StrategyParams> {
  try {
    const { prisma } = await import("@/lib/db");
    const active = await prisma.strategyVersion.findFirst({ where: { active: true } });
    if (active) {
      const fromCode = STRATEGIES.find((s) => s.key === active.key);
      if (fromCode) return fromCode;
      try {
        return { ...getStrategy(), ...JSON.parse(active.paramsJson), key: active.key };
      } catch {
        /* use code */
      }
    }
  } catch {
    /* db unavailable during seed */
  }
  return getStrategy();
}

type Trade = {
  side: "LONG" | "SHORT";
  entry: number;
  stop: number;
  t1: number;
  exit: number;
  pnlPct: number;
  barsHeld: number;
};

export function runBacktest(candles: Candle[], params: StrategyParams) {
  const trades: Trade[] = [];
  let equity = 1;
  let peak = 1;
  let maxDd = 0;
  let i = Math.max(params.emaSlow + 5, 40);

  while (i < candles.length - 2) {
    const slice = candles.slice(0, i + 1);
    const closes = slice.map((c) => c.close);
    const vols = slice.map((c) => c.volume);
    const last = slice[slice.length - 1];
    const eFast = ema(closes, params.emaFast);
    const eSlow = ema(closes, params.emaSlow);
    const r = rsi(closes, params.rsiPeriod);
    const a = atr(slice, 14);
    const volAvg = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / Math.max(1, vols.slice(-21, -1).length);
    const volRatio = volAvg ? last.volume / volAvg : 1;
    const distPct = (Math.abs(last.close - eFast) / last.close) * 100;

    let side: "LONG" | "SHORT" | null = null;
    if (
      last.close > eFast &&
      eFast > eSlow &&
      r >= params.rsiLongMin &&
      r <= params.rsiLongMax &&
      volRatio >= params.minVolRatio &&
      distPct <= params.maxDistFromEmaPct
    ) {
      side = "LONG";
    } else if (
      last.close < eFast &&
      eFast < eSlow &&
      r <= params.rsiShortMax &&
      r >= params.rsiShortMin &&
      volRatio >= params.minVolRatio &&
      distPct <= params.maxDistFromEmaPct
    ) {
      side = "SHORT";
    }

    if (!side || a <= 0) {
      i += 1;
      continue;
    }

    const slip = params.slipPct / 100;
    const entry = side === "LONG" ? last.close * (1 + slip) : last.close * (1 - slip);
    const stop = side === "LONG" ? entry - a * params.atrMultStop : entry + a * params.atrMultStop;
    const t1 = side === "LONG" ? entry + a * params.atrMultT1 : entry - a * params.atrMultT1;
    const t2 = side === "LONG" ? entry + a * params.atrMultT2 : entry - a * params.atrMultT2;
    const rr = Math.abs(t1 - entry) / Math.max(Math.abs(entry - stop), 1e-9);
    if (rr < params.minRr) {
      i += 1;
      continue;
    }

    let exit = entry;
    let barsHeld = 0;
    let done = false;
    for (let j = i + 1; j < Math.min(candles.length, i + 48); j++) {
      const c = candles[j];
      barsHeld = j - i;
      if (side === "LONG") {
        if (c.low <= stop) {
          exit = stop * (1 - slip);
          done = true;
          break;
        }
        if (c.high >= t2) {
          exit = t2 * (1 - slip);
          done = true;
          break;
        }
        if (c.high >= t1 && j > i + 2) {
          exit = t1 * (1 - slip);
          done = true;
          break;
        }
      } else {
        if (c.high >= stop) {
          exit = stop * (1 + slip);
          done = true;
          break;
        }
        if (c.low <= t2) {
          exit = t2 * (1 + slip);
          done = true;
          break;
        }
        if (c.low <= t1 && j > i + 2) {
          exit = t1 * (1 + slip);
          done = true;
          break;
        }
      }
    }
    if (!done) exit = candles[Math.min(candles.length - 1, i + barsHeld || i + 1)].close;

    const raw = side === "LONG" ? (exit - entry) / entry : (entry - exit) / entry;
    const pnlPct = (raw - (params.feePct * 2) / 100) * 100;
    trades.push({ side, entry, stop, t1, exit, pnlPct, barsHeld });
    equity *= 1 + pnlPct / 100;
    peak = Math.max(peak, equity);
    maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
    i += Math.max(2, barsHeld);
  }

  const wins = trades.filter((t) => t.pnlPct > 0);
  const losses = trades.filter((t) => t.pnlPct <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnlPct, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnlPct, 0));
  const profitFactor = grossLoss ? grossWin / grossLoss : grossWin ? 99 : 0;
  const avgReturn = trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0;

  return {
    trades: trades.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    profitFactor: Math.round(profitFactor * 100) / 100,
    maxDrawdownPct: Math.round(maxDd * 100) / 100,
    avgReturnPct: Math.round(avgReturn * 1000) / 1000,
    expectancyPct: Math.round(avgReturn * 1000) / 1000,
    notes:
      profitFactor < 1.1
        ? "Edge weak after fees/slippage — do not promote this version for auto-trade."
        : "Acceptable sample expectancy after fees/slippage model. Still not a guarantee of future profit.",
    sample: trades.slice(-10),
  };
}
