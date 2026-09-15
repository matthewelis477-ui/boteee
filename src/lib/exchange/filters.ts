import { isBinanceTestnetConfig } from "@/lib/platform-config";

type Filter = {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: { filterType: string; tickSize?: string; stepSize?: string; minQty?: string; minNotional?: string; notional?: string }[];
};

const cache = new Map<string, { at: number; symbols: Filter[] }>();

async function loadExchangeInfo(market: "spot" | "futures") {
  const testnet = isBinanceTestnetConfig();
  const key = `${market}:${testnet ? "1" : "0"}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.symbols;
  const url = testnet
    ? market === "spot"
      ? "https://testnet.binance.vision/api/v3/exchangeInfo"
      : "https://testnet.binancefuture.com/fapi/v1/exchangeInfo"
    : market === "spot"
      ? "https://api.binance.com/api/v3/exchangeInfo"
      : "https://fapi.binance.com/fapi/v1/exchangeInfo";
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`exchangeInfo ${market} ${res.status}`);
  const json = (await res.json()) as { symbols: Filter[] };
  const symbols = json.symbols.filter((s) => s.status === "TRADING");
  cache.set(key, { at: Date.now(), symbols });
  return symbols;
}

function floorToStep(value: number, step: number) {
  if (step <= 0) return value;
  const precision = Math.max(0, (step.toString().split(".")[1] || "").length);
  const floored = Math.floor(value / step) * step;
  return Number(floored.toFixed(precision));
}

function roundToTick(value: number, tick: number) {
  if (tick <= 0) return value;
  const precision = Math.max(0, (tick.toString().split(".")[1] || "").length);
  const rounded = Math.round(value / tick) * tick;
  return Number(rounded.toFixed(precision));
}

export async function normalizeOrder(
  market: "spot" | "futures",
  symbol: string,
  qty: number,
  price?: number,
) {
  const symbols = await loadExchangeInfo(market);
  const info = symbols.find((s) => s.symbol === symbol);
  if (!info) throw new Error(`Symbol ${symbol} not tradable on ${market}`);

  const lot = info.filters.find((f) => f.filterType === "LOT_SIZE" || f.filterType === "MARKET_LOT_SIZE");
  const priceFilter = info.filters.find((f) => f.filterType === "PRICE_FILTER");
  const notionalFilter = info.filters.find((f) => f.filterType === "NOTIONAL" || f.filterType === "MIN_NOTIONAL");

  const step = Number(lot?.stepSize || "0.000001");
  const minQty = Number(lot?.minQty || "0");
  const tick = Number(priceFilter?.tickSize || "0.01");
  let q = floorToStep(qty, step);
  if (q < minQty) throw new Error(`Qty ${q} below minQty ${minQty} for ${symbol}`);

  let p = price;
  if (p != null) p = roundToTick(p, tick);

  const minNotional = Number(notionalFilter?.minNotional || notionalFilter?.notional || "0");
  if (p != null && minNotional && q * p < minNotional) {
    q = floorToStep(minNotional / p * 1.01, step);
  }

  return { qty: q, price: p, step, tick, minNotional };
}
