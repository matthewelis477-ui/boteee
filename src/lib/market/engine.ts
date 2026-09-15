import { prisma } from "@/lib/db";
import type { Signal } from "@/lib/types";
import { resolveActiveStrategy, type StrategyParams } from "./backtest";
import { atr, ema, roundPx, rsi, type Candle } from "./indicators";

/**
 * Why not "all Binance symbols"?
 * Illiquid pairs = fake volume, wide spreads, SL slippage that destroys edge.
 * We scan a liquid universe (top USDT volume + curated majors), score them,
 * and only promote the best few setups per cycle.
 */
const CURATED: { pair: string; marketType: "spot" | "futures"; style: "intraday" | "swing"; tf: string }[] = [
  { pair: "BTCUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "ETHUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "BNBUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "SOLUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "XRPUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "ADAUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "DOGEUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "AVAXUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "LINKUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "DOTUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "MATICUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "LTCUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "ATOMUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "UNIUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "NEARUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "APTUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "ARBUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "OPUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "SUIUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "INJUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "AAVEUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "FILUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "TONUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  { pair: "TRXUSDT", marketType: "futures", style: "intraday", tf: "1h" },
  // Spot swing sleeve (LONG only)
  { pair: "BTCUSDT", marketType: "spot", style: "swing", tf: "4h" },
  { pair: "ETHUSDT", marketType: "spot", style: "swing", tf: "4h" },
  { pair: "BNBUSDT", marketType: "spot", style: "swing", tf: "4h" },
  { pair: "SOLUSDT", marketType: "spot", style: "swing", tf: "4h" },
  { pair: "LINKUSDT", marketType: "spot", style: "swing", tf: "4h" },
  { pair: "AVAXUSDT", marketType: "spot", style: "swing", tf: "4h" },
];

const SKIP_BASES = new Set([
  "USDC", "BUSD", "TUSD", "FDUSD", "DAI", "EUR", "GBP",
  "UP", "DOWN", "BULL", "BEAR",
]);

const KLINE_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api.binance.us",
];

type Spec = {
  pair: string;
  asset: string;
  marketType: "spot" | "futures";
  style: "intraday" | "swing";
  tf: string;
  exchange: string;
  quoteVolume?: number;
};

function assetOf(pair: string) {
  return pair.replace("USDT", "/USDT");
}

async function klines(symbol: string, interval: string, limit = 120): Promise<Candle[]> {
  let last = "no host";
  for (const host of KLINE_HOSTS) {
    const url = `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
    const res = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "BoteeSignalPipeline/1.0" },
    });
    if (!res.ok) {
      last = `${host} ${res.status}`;
      continue;
    }
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
  throw new Error(`klines ${symbol} (${last})`);
}

async function funding(symbol: string) {
  try {
    const res = await fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`, { cache: "no-store" });
    if (!res.ok) return null;
    const j = await res.json();
    return { lastFundingRate: Number(j.lastFundingRate), markPrice: Number(j.markPrice) };
  } catch {
    return null;
  }
}

/** Top liquid USDT pairs by 24h quote volume (spot ticker — good liquidity proxy). */
async function topLiquidUsdt(limit = 35): Promise<{ pair: string; quoteVolume: number }[]> {
  try {
    const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", { cache: "no-store" });
    if (!res.ok) return [];
    const rows = (await res.json()) as { symbol: string; quoteVolume: string }[];
    return rows
      .filter((r) => r.symbol.endsWith("USDT"))
      .filter((r) => {
        const base = r.symbol.replace("USDT", "");
        if (SKIP_BASES.has(base)) return false;
        if (base.endsWith("UP") || base.endsWith("DOWN")) return false;
        return true;
      })
      .map((r) => ({ pair: r.symbol, quoteVolume: Number(r.quoteVolume) || 0 }))
      .sort((a, b) => b.quoteVolume - a.quoteVolume)
      .slice(0, limit);
  } catch {
    return [];
  }
}

async function buildUniverse(): Promise<Spec[]> {
  const liquid = await topLiquidUsdt(40);
  const byPair = new Map(liquid.map((l) => [l.pair, l.quoteVolume]));
  const specs: Spec[] = [];
  const seen = new Set<string>();

  for (const c of CURATED) {
    const key = `${c.pair}:${c.marketType}:${c.tf}`;
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({
      pair: c.pair,
      asset: assetOf(c.pair),
      marketType: c.marketType,
      style: c.style,
      tf: c.tf,
      exchange: c.marketType === "futures" ? "Binance Futures" : "Binance Spot",
      quoteVolume: byPair.get(c.pair) || 0,
    });
  }

  // Add top liquid majors as futures 1h if not already covered
  for (const l of liquid.slice(0, 28)) {
    const key = `${l.pair}:futures:1h`;
    if (seen.has(key)) continue;
    seen.add(key);
    specs.push({
      pair: l.pair,
      asset: assetOf(l.pair),
      marketType: "futures",
      style: "intraday",
      tf: "1h",
      exchange: "Binance Futures",
      quoteVolume: l.quoteVolume,
    });
  }

  return specs;
}

type FfEvent = { title?: string; date?: string; impact?: string; country?: string };

async function newsProtection() {
  try {
    const res = await fetch("https://nfs.faireconomy.media/ff_calendar_thisweek.json", { cache: "no-store" });
    if (!res.ok) return null;
    const events = (await res.json()) as FfEvent[];
    const soon = events.find((e) => {
      if (!e.date) return false;
      const t = new Date(e.date).getTime();
      const diff = t - Date.now();
      const high = String(e.impact).toLowerCase() === "high";
      const us = !e.country || e.country === "USD" || e.country === "United States";
      return us && high && diff > 0 && diff < 45 * 60_000;
    });
    if (!soon) return null;
    return {
      id: "live-macro",
      title: soon.title || "High-impact US event",
      when: "Within 45 minutes",
      impact: "high" as const,
      protection: `${soon.title} is due shortly. New directional signals are paused because volatility may increase.`,
    };
  } catch {
    return null;
  }
}

function htfTrend(candles: Candle[], p: StrategyParams): "up" | "down" | "flat" {
  if (candles.length < p.emaSlow + 2) return "flat";
  const closes = candles.map((c) => c.close);
  const last = closes.at(-1)!;
  const eFast = ema(closes, p.emaFast);
  const eSlow = ema(closes, p.emaSlow);
  if (last > eFast && eFast > eSlow) return "up";
  if (last < eFast && eFast < eSlow) return "down";
  return "flat";
}

function buildSignal(args: {
  spec: Spec;
  candles: Candle[];
  htfCandles: Candle[] | null;
  btcClose: number;
  btcEma20: number;
  pause: boolean;
  fund?: number | null;
  strategy: StrategyParams;
}): Signal & { qualityScore: number } {
  const p = args.strategy;
  const closes = args.candles.map((c) => c.close);
  const vols = args.candles.map((c) => c.volume);
  const last = args.candles.at(-1)!;
  const eFast = ema(closes, p.emaFast);
  const eSlow = ema(closes, p.emaSlow);
  const r = rsi(closes, p.rsiPeriod);
  const a = atr(args.candles, 14);
  const volAvg = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / Math.max(1, vols.slice(-21, -1).length);
  const volRatio = volAvg ? last.volume / volAvg : 1;
  const btcBull = args.btcClose >= args.btcEma20;
  const trendUp = last.close > eFast && eFast > eSlow;
  const trendDown = last.close < eFast && eFast < eSlow;
  const volOk = volRatio >= p.minVolRatio;
  const rsiLong = r >= p.rsiLongMin && r <= p.rsiLongMax;
  const rsiShort = r <= p.rsiShortMax && r >= p.rsiShortMin;
  const distPct = (Math.abs(last.close - eFast) / last.close) * 100;
  const notChasing = distPct <= p.maxDistFromEmaPct;
  const htf = args.htfCandles ? htfTrend(args.htfCandles, p) : "flat";
  const htfOkLong = !p.requireHtf || htf === "up";
  const htfOkShort = !p.requireHtf || htf === "down";
  const liquidBonus = args.spec.quoteVolume && args.spec.quoteVolume > 50_000_000 ? 8 : args.spec.quoteVolume && args.spec.quoteVolume > 10_000_000 ? 4 : 0;

  let side: Signal["side"] = "NO-TRADE";
  const checks = { trendUp, trendDown, volOk, rsiLong, rsiShort, btcBull, notChasing, htf };
  if (args.pause) side = "NO-TRADE";
  else if (trendUp && rsiLong && volOk && notChasing && htfOkLong && (btcBull || args.spec.pair === "BTCUSDT")) side = "LONG";
  else if (trendDown && rsiShort && volOk && notChasing && htfOkShort && (!btcBull || args.spec.pair === "BTCUSDT")) side = "SHORT";

  // Spot SHORT blocked
  if (args.spec.marketType === "spot" && side === "SHORT") side = "NO-TRADE";

  const zone = a * 0.18;
  const entry = last.close;
  const long = side !== "SHORT";
  const stop = long ? entry - a * p.atrMultStop : entry + a * p.atrMultStop;
  const t1 = long ? entry + a * p.atrMultT1 : entry - a * p.atrMultT1;
  const t2 = long ? entry + a * p.atrMultT2 : entry - a * p.atrMultT2;
  const t3 = long ? entry + a * p.atrMultT3 : entry - a * p.atrMultT3;
  const rr = Math.abs(t1 - entry) / Math.max(Math.abs(entry - stop), 1e-9);

  if (side !== "NO-TRADE" && rr < p.minRr) side = "NO-TRADE";

  const qualityScore =
    (trendUp || trendDown ? 18 : 4) +
    (volOk ? 16 : 4) +
    (rsiLong || rsiShort ? 14 : 3) +
    (btcBull && side === "LONG" ? 12 : !btcBull && side === "SHORT" ? 12 : 4) +
    (notChasing ? 12 : 2) +
    (htf === "up" && side === "LONG" ? 14 : htf === "down" && side === "SHORT" ? 14 : p.requireHtf ? 0 : 6) +
    (rr >= p.minRr ? 10 : 0) +
    liquidBonus;

  const confidence = Math.max(28, Math.min(94, qualityScore));
  if (side !== "NO-TRADE" && confidence < p.minPublishConfidence) {
    side = "NO-TRADE";
  }

  const risk: Signal["risk"] = confidence >= 82 && volOk && htf !== "flat" ? "low" : confidence >= 70 ? "medium" : "high";
  const condition = trendUp ? "Bullish" : trendDown ? "Bearish" : "Choppy";

  const summary =
    side === "NO-TRADE"
      ? args.pause
        ? `No new ${args.spec.asset} directional signal: news protection is on.`
        : `${args.spec.asset} filtered under ${p.key} (RSI ${r.toFixed(0)}, vol ${volRatio.toFixed(2)}x, HTF ${htf}, dist ${distPct.toFixed(2)}%).`
      : `${args.spec.asset} ${side}. HTF ${htf}, RSI ${r.toFixed(0)}, vol ${volRatio.toFixed(2)}x, RR 1:${rr.toFixed(1)}. BTC ${btcBull ? "bid" : "soft"}.`;

  const now = new Date();
  const tfLabel = args.spec.tf === "4h" ? "4 Hour" : "1 Hour";

  return {
    id: `${args.spec.pair}-${args.spec.marketType}-${args.spec.tf}-${now.toISOString().slice(0, 13)}`,
    side,
    asset: args.spec.asset,
    exchange: args.spec.exchange,
    marketType: args.spec.marketType,
    entryLow: roundPx(entry - zone),
    entryHigh: roundPx(entry + zone),
    targets: side === "NO-TRADE" ? [0, 0, 0] : [roundPx(t1), roundPx(t2), roundPx(t3)],
    stopLoss: side === "NO-TRADE" ? 0 : roundPx(stop),
    leverage: args.spec.marketType === "spot" ? "1×" : risk === "high" ? "2×–3×" : "3×–5×",
    rr: side === "NO-TRADE" ? 0 : Math.round(rr * 10) / 10,
    confidence: side === "NO-TRADE" ? Math.min(confidence, 48) : confidence,
    style: args.spec.style,
    timeframe: tfLabel,
    validForMinutes: args.spec.tf === "4h" ? 720 : 90,
    marketCondition: condition,
    risk,
    publishedAt: now.toISOString(),
    status: args.pause || side === "NO-TRADE" ? "paused" : "active",
    qualityScore,
    why: {
      summary,
      trend: `EMA${p.emaFast} ${roundPx(eFast)} / EMA${p.emaSlow} ${roundPx(eSlow)}. Close ${roundPx(last.close)}. Dist ${distPct.toFixed(2)}%.`,
      supportResistance: `ATR ${roundPx(a)}. Invalid if ${side === "SHORT" ? "reclaimed" : "lost"} beyond the stop.`,
      volume: `Last bar ${volRatio.toFixed(2)}× avg (min ${p.minVolRatio}×). 24h quote vol proxy $${Math.round((args.spec.quoteVolume || 0) / 1e6)}M.`,
      rsiMacd: `RSI(${p.rsiPeriod}) ${r.toFixed(1)}. Strategy ${p.key}.`,
      maStructure: checks.trendUp
        ? `Bullish stack + HTF ${htf}.`
        : checks.trendDown
          ? `Bearish stack + HTF ${htf}.`
          : "EMAs intertwined. No clear structure edge.",
      setup: side === "LONG" ? "MTF trend continuation" : side === "SHORT" ? "MTF trend continuation short" : "Stand aside / ranked out",
      btcDirection: `BTC ${roundPx(args.btcClose)} vs EMA20 ${roundPx(args.btcEma20)} (${btcBull ? "bullish" : "soft"}).`,
      sentiment: args.fund != null ? `Perp funding ${(args.fund * 100).toFixed(4)}%.` : "Funding n/a.",
      risks: [
        args.pause ? "Macro event window" : "Event risk still possible",
        "Liquid universe scan (majors and high-volume pairs)",
        "Not a profit guarantee; fees/slippage can erase small edges",
      ],
    },
    updates: [
      {
        time: now.toISOString().slice(11, 16),
        message: `Scored ${qualityScore} with ${p.key}. Ranked among liquid universe; only top setups stay directional.`,
      },
    ],
  };
}

export async function runSignalPipeline() {
  const strategy = await resolveActiveStrategy();
  const pauseEvent = await newsProtection();
  const universe = await buildUniverse();
  const btc = await klines("BTCUSDT", "1h");
  const btc4h = await klines("BTCUSDT", "4h", 80);
  const btcCloses = btc.map((c) => c.close);
  const btcClose = btcCloses.at(-1)!;
  const btcEma20 = ema(btcCloses, 20);
  const btcFund = await funding("BTCUSDT");

  const scored: (Signal & { qualityScore: number })[] = [];
  const bullish: string[] = [];
  const bearish: string[] = [];
  const oversold: string[] = [];
  const overbought: string[] = [];
  const unusual: string[] = [];
  const avoid: string[] = [];
  const reversals: string[] = [];
  const sr: string[] = [];
  const highVol: string[] = [];
  const pndRisk: string[] = [];

  // Cache klines to avoid duplicate fetches (BTC/ETH used multiple times)
  const cache1h = new Map<string, Candle[]>();
  const cache4h = new Map<string, Candle[]>();
  cache1h.set("BTCUSDT", btc);
  cache4h.set("BTCUSDT", btc4h);

  async function get1h(pair: string) {
    if (cache1h.has(pair)) return cache1h.get(pair)!;
    const c = await klines(pair, "1h");
    cache1h.set(pair, c);
    return c;
  }
  async function get4h(pair: string) {
    if (cache4h.has(pair)) return cache4h.get(pair)!;
    const c = await klines(pair, "4h", 80);
    cache4h.set(pair, c);
    return c;
  }

  for (const spec of universe) {
    try {
      const candles = spec.tf === "4h" ? await get4h(spec.pair) : await get1h(spec.pair);
      const htfCandles = spec.tf === "1h" ? await get4h(spec.pair) : null;
      const fund = spec.marketType === "futures" ? (await funding(spec.pair))?.lastFundingRate : null;
      const signal = buildSignal({
        spec,
        candles,
        htfCandles,
        btcClose,
        btcEma20,
        pause: Boolean(pauseEvent) && spec.style !== "swing",
        fund,
        strategy,
      });
      scored.push(signal);
      if (signal.side === "LONG") bullish.push(signal.asset);
      if (signal.side === "SHORT") bearish.push(signal.asset);
      if (signal.side === "NO-TRADE") avoid.push(signal.asset);
      const lastR = rsi(candles.map((c) => c.close));
      if (lastR < 32) oversold.push(`${signal.asset} RSI ${lastR.toFixed(0)}`);
      if (lastR > 70) overbought.push(`${signal.asset} RSI ${lastR.toFixed(0)}`);
      const vols = candles.map((c) => c.volume);
      const avg = vols.slice(-21, -1).reduce((s, v) => s + v, 0) / 20;
      const ratio = avg ? candles.at(-1)!.volume / avg : 1;
      if (ratio > 1.8) unusual.push(`${signal.asset} +${Math.round((ratio - 1) * 100)}% vol`);
      if (ratio > 2.5) highVol.push(`${signal.asset} vol x${ratio.toFixed(1)}`);
      const closes = candles.map((c) => c.close);
      const e20 = ema(closes, 20);
      const prev = closes.at(-2)!;
      const last = closes.at(-1)!;
      if (prev < e20 && last > e20) reversals.push(`${signal.asset} reclaim EMA20`);
      if (prev > e20 && last < e20) reversals.push(`${signal.asset} lose EMA20`);
      const recent = closes.slice(-20);
      const hi = Math.max(...recent);
      const lo = Math.min(...recent);
      if (last >= hi * 0.998) sr.push(`${signal.asset} testing 20-bar high ${roundPx(hi)}`);
      if (last <= lo * 1.002) sr.push(`${signal.asset} testing 20-bar low ${roundPx(lo)}`);
      // Thin / narrative risk: very high vol + low confidence NO-TRADE
      if (ratio > 3 && signal.confidence < 55) pndRisk.push(`${signal.asset} spike vol + weak structure`);
    } catch (e) {
      console.warn("universe skip", spec.pair, e instanceof Error ? e.message : e);
    }
  }

  // Promote only the best directional setups — demote the rest to NO-TRADE for quality
  const directional = scored
    .filter((s) => s.side === "LONG" || s.side === "SHORT")
    .sort((a, b) => b.qualityScore - a.qualityScore || b.confidence - a.confidence);
  const winners = new Set(directional.slice(0, strategy.maxSignalsPerRun).map((s) => s.id));
  const signals: Signal[] = scored.map((s) => {
    const base = { ...s };
    delete (base as { qualityScore?: number }).qualityScore;
    if ((s.side === "LONG" || s.side === "SHORT") && !winners.has(s.id)) {
      return {
        ...base,
        side: "NO-TRADE" as const,
        status: "paused" as const,
        confidence: Math.min(s.confidence, 50),
        why: {
          ...s.why,
          summary: `${s.asset} had a setup but was not among the top ideas this cycle.`,
          setup: "Stand aside",
        },
      };
    }
    return base;
  });

  const scanner = {
    bullish: [...new Set(bullish)].slice(0, 12),
    bearish: [...new Set(bearish)].slice(0, 12),
    unusualVolume: unusual.slice(0, 10),
    breakouts: unusual.filter((u) => /vol/i.test(u)).slice(0, 8),
    oversold: oversold.slice(0, 8),
    overbought: overbought.slice(0, 8),
    reversals: [...new Set(reversals)].slice(0, 10),
    sr: [...new Set(sr)].slice(0, 10),
    listings: [] as string[], // exchange listing calendars are not a stable public API
    highVol: [...new Set(highVol)].slice(0, 10),
    pndRisk: [...new Set(pndRisk)].slice(0, 8),
    avoid: [...new Set(avoid)].slice(0, 15),
    movers: [...new Set([...bullish, ...bearish])].slice(0, 12),
    vsBtc: [
      `BTC ${btcClose >= btcEma20 ? "leading" : "soft"} vs EMA20`,
      `Live scan · ${universe.length} markets · top ${winners.size} ideas`,
    ],
  };

  for (const s of signals) {
    const existing = await prisma.marketSignal.findUnique({ where: { id: s.id } });
    if (!existing) {
      await prisma.marketSignal.create({
        data: {
          id: s.id,
          side: s.side,
          asset: s.asset,
          exchange: s.exchange,
          marketType: s.marketType,
          entryLow: s.entryLow,
          entryHigh: s.entryHigh,
          target1: s.targets[0],
          target2: s.targets[1],
          target3: s.targets[2],
          stopLoss: s.stopLoss,
          leverage: s.leverage,
          rr: s.rr,
          confidence: s.confidence,
          style: s.style,
          timeframe: s.timeframe,
          validForMinutes: s.validForMinutes,
          marketCondition: s.marketCondition,
          risk: s.risk,
          publishedAt: new Date(s.publishedAt),
          status: s.status,
          delayed: Boolean(s.delayed),
          approved: s.side === "NO-TRADE",
          strategyVersion: strategy.key,
          whyJson: JSON.stringify(s.why),
          updatesJson: JSON.stringify(s.updates),
        },
      });
      continue;
    }
    if (existing.approved && existing.side !== "NO-TRADE") {
      const expired = Date.now() - existing.publishedAt.getTime() > existing.validForMinutes * 60_000;
      await prisma.marketSignal.update({
        where: { id: s.id },
        data: {
          status: expired ? "expired" : existing.status,
          whyJson: JSON.stringify({
            ...JSON.parse(existing.whyJson || "{}"),
            liveNote: "Levels locked after approval.",
          }),
        },
      });
      continue;
    }
    await prisma.marketSignal.update({
      where: { id: s.id },
      data: {
        side: s.side,
        entryLow: s.entryLow,
        entryHigh: s.entryHigh,
        target1: s.targets[0],
        target2: s.targets[1],
        target3: s.targets[2],
        stopLoss: s.stopLoss,
        leverage: s.leverage,
        rr: s.rr,
        confidence: s.confidence,
        marketCondition: s.marketCondition,
        risk: s.risk,
        status: s.status,
        strategyVersion: strategy.key,
        whyJson: JSON.stringify(s.why),
        updatesJson: JSON.stringify(s.updates),
      },
    });
  }

  await prisma.scannerSnapshot.upsert({
    where: { id: "latest" },
    update: {
      json: JSON.stringify({
        scanner,
        pauseEvent,
        strategy: strategy.key,
        universeSize: universe.length,
        promoted: winners.size,
        btc: { close: btcClose, ema20: btcEma20, funding: btcFund },
      }),
    },
    create: {
      id: "latest",
      json: JSON.stringify({
        scanner,
        pauseEvent,
        strategy: strategy.key,
        universeSize: universe.length,
        promoted: winners.size,
        btc: { close: btcClose, ema20: btcEma20, funding: btcFund },
      }),
    },
  });
  await prisma.pipelineRun.create({
    data: {
      source: "binance-public",
      count: signals.length,
      note: pauseEvent
        ? pauseEvent.protection
        : `${strategy.key} · scanned ${universe.length} · promoted ${winners.size} · BTC ${roundPx(btcClose)}`,
    },
  });

  if (pauseEvent) {
    await prisma.newsEvent.create({
      data: {
        title: pauseEvent.title,
        whenLabel: pauseEvent.when,
        impact: pauseEvent.impact,
        protection: pauseEvent.protection,
        source: "pipeline",
      },
    });
  }

  return {
    signals,
    scanner,
    pauseEvent,
    btcClose,
    universeSize: universe.length,
    promoted: winners.size,
  };
}
