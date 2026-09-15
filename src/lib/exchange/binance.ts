import { createHmac } from "node:crypto";
import { isBinanceTestnetConfig } from "@/lib/platform-config";



export type BinanceCreds = { apiKey: string; apiSecret: string };
export type Side = "BUY" | "SELL";

export function isBinanceTestnet() {
  return isBinanceTestnetConfig();
}

export function spotBase() {
  return isBinanceTestnet() ? "https://testnet.binance.vision" : "https://api.binance.com";
}

export function futuresBase() {
  return isBinanceTestnet() ? "https://testnet.binancefuture.com" : "https://fapi.binance.com";
}

function sign(secret: string, query: string) {
  return createHmac("sha256", secret).update(query).digest("hex");
}

function fmtQty(n: number) {
  if (n >= 1) return n.toFixed(3);
  if (n >= 0.01) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPrice(n: number) {
  if (n >= 1000) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

async function signedRequest(
  base: string,
  path: string,
  method: "GET" | "POST" | "DELETE",
  creds: BinanceCreds,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const timestamp = Date.now();
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    q.set(k, String(v));
  }
  q.set("timestamp", String(timestamp));
  q.set("recvWindow", "5000");
  const query = q.toString();
  const signature = sign(creds.apiSecret, query);
  const url = `${base}${path}?${query}&signature=${signature}`;
  const res = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": creds.apiKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const msg = typeof json === "object" && json && "msg" in json ? String((json as { msg: string }).msg) : text;
    throw new Error(`Binance ${method} ${path}: ${msg}`);
  }
  return json;
}

export async function validateApiKey(exchange: "binance_spot" | "binance_futures", creds: BinanceCreds) {
  if (exchange === "binance_spot") {
    const info = (await signedRequest(spotBase(), "/api/v3/account", "GET", creds)) as {
      permissions?: string[];
      canTrade?: boolean;
      canWithdraw?: boolean;
    };
    const perms = info.permissions || [];
    const canTrade = info.canTrade !== false && (perms.length ? perms.includes("SPOT") || perms.includes("MARGIN") : true);
    const canWithdraw = Boolean(info.canWithdraw) || perms.includes("WITHDRAW");
    if (canWithdraw) throw new Error("This API key allows withdrawals. Please create a key with trading only.");
    if (!canTrade) throw new Error("This API key cannot place Spot trades.");
    return { canTrade: true, canWithdraw: false, testnet: isBinanceTestnet() };
  }

  await signedRequest(futuresBase(), "/fapi/v2/account", "GET", creds);
  try {
    const perms = (await signedRequest(futuresBase(), "/fapi/v1/apiKeyPermission", "GET", creds)) as {
      enableWithdrawals?: boolean;
      enableFutures?: boolean;
    };
    if (perms.enableWithdrawals) throw new Error("This API key allows withdrawals. Please create a key with trading only.");
    if (perms.enableFutures === false) throw new Error("This API key cannot place Futures trades.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Rejecting") || msg.includes("cannot trade")) throw e;
  }
  return { canTrade: true, canWithdraw: false, testnet: isBinanceTestnet() };
}

export async function getSpotUsdtFree(creds: BinanceCreds) {
  const info = (await signedRequest(spotBase(), "/api/v3/account", "GET", creds)) as {
    balances: { asset: string; free: string; locked?: string }[];
  };
  const row = info.balances.find((b) => b.asset === "USDT");
  return Number(row?.free || 0);
}

export async function getSpotBalances(creds: BinanceCreds) {
  const info = (await signedRequest(spotBase(), "/api/v3/account", "GET", creds)) as {
    balances: { asset: string; free: string; locked?: string }[];
  };
  return (info.balances || [])
    .map((b) => ({
      asset: b.asset,
      free: Number(b.free || 0),
      locked: Number(b.locked || 0),
    }))
    .filter((b) => b.free + b.locked > 0);
}

export async function getSpotAssetFree(creds: BinanceCreds, asset: string) {
  const info = (await signedRequest(spotBase(), "/api/v3/account", "GET", creds)) as {
    balances: { asset: string; free: string }[];
  };
  const base = asset.replace("USDT", "").replace("/", "");
  const row = info.balances.find((b) => b.asset === base);
  return Number(row?.free || 0);
}

export async function getFuturesUsdtAvailable(creds: BinanceCreds) {
  const info = (await signedRequest(futuresBase(), "/fapi/v2/account", "GET", creds)) as {
    availableBalance?: string;
    assets?: { asset: string; availableBalance: string }[];
  };
  if (info.availableBalance != null) return Number(info.availableBalance);
  const usdt = info.assets?.find((a) => a.asset === "USDT");
  return Number(usdt?.availableBalance || 0);
}

export async function getFuturesPosition(creds: BinanceCreds, symbol: string) {
  const rows = (await signedRequest(futuresBase(), "/fapi/v2/positionRisk", "GET", creds, { symbol })) as {
    symbol: string;
    positionAmt: string;
    entryPrice: string;
    unRealizedProfit: string;
  }[];
  const row = Array.isArray(rows) ? rows.find((r) => r.symbol === symbol) : null;
  if (!row) return { amt: 0, entry: 0, upnl: 0 };
  return { amt: Number(row.positionAmt), entry: Number(row.entryPrice), upnl: Number(row.unRealizedProfit) };
}

export async function placeSpotMarketOrder(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  quantity: number,
  clientOrderId?: string,
) {
  return signedRequest(spotBase(), "/api/v3/order", "POST", creds, {
    symbol,
    side,
    type: "MARKET",
    quantity: fmtQty(quantity),
    ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
  }) as Promise<{ orderId: number; clientOrderId?: string; fills?: { price: string; qty: string; commission?: string }[]; status?: string; executedQty?: string }>;
}

export async function placeSpotStopLoss(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  quantity: number,
  stopPrice: number,
  clientOrderId?: string,
) {
  // STOP_LOSS (market when triggered) survives fast gaps better than STOP_LOSS_LIMIT
  return signedRequest(spotBase(), "/api/v3/order", "POST", creds, {
    symbol,
    side,
    type: "STOP_LOSS",
    quantity: fmtQty(quantity),
    stopPrice: fmtPrice(stopPrice),
    ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
  }) as Promise<{ orderId: number }>;
}

/** Spot take-profit: triggers a limit when price reaches the target. */
export async function placeSpotTakeProfit(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  quantity: number,
  triggerPrice: number,
  clientOrderId?: string,
) {
  return signedRequest(spotBase(), "/api/v3/order", "POST", creds, {
    symbol,
    side,
    type: "TAKE_PROFIT_LIMIT",
    timeInForce: "GTC",
    quantity: fmtQty(quantity),
    stopPrice: fmtPrice(triggerPrice),
    price: fmtPrice(triggerPrice),
    ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
  }) as Promise<{ orderId: number }>;
}

/** Spot OCO: take-profit limit + stop-loss market (Binance cancels the other when one triggers). */
export async function placeSpotOcoExit(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  quantity: number,
  takeProfitPrice: number,
  stopPrice: number,
  listClientOrderId?: string,
) {
  return signedRequest(spotBase(), "/api/v3/orderList/oco", "POST", creds, {
    symbol,
    side,
    quantity: fmtQty(quantity),
    aboveType: "LIMIT_MAKER",
    abovePrice: fmtPrice(takeProfitPrice),
    belowType: "STOP_LOSS",
    belowStopPrice: fmtPrice(stopPrice),
    ...(listClientOrderId ? { listClientOrderId: listClientOrderId.slice(0, 36) } : {}),
  }) as Promise<{ orderListId: number; orders?: { orderId: number }[] }>;
}

export async function placeFuturesMarketOrder(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  quantity: number,
  opts?: { clientOrderId?: string; reduceOnly?: boolean },
) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "POST", creds, {
    symbol,
    side,
    type: "MARKET",
    quantity: fmtQty(quantity),
    ...(opts?.reduceOnly ? { reduceOnly: true } : {}),
    ...(opts?.clientOrderId ? { newClientOrderId: opts.clientOrderId } : {}),
  }) as Promise<{ orderId: number; avgPrice?: string; clientOrderId?: string; status?: string }>;
}

export async function setFuturesLeverage(creds: BinanceCreds, symbol: string, leverage: number) {
  return signedRequest(futuresBase(), "/fapi/v1/leverage", "POST", creds, { symbol, leverage });
}

export async function placeFuturesStopMarket(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  stopPrice: number,
  opts?: { closePosition?: boolean; quantity?: number; clientOrderId?: string },
) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "POST", creds, {
    symbol,
    side,
    type: "STOP_MARKET",
    stopPrice: fmtPrice(stopPrice),
    // Mark price reduces last-price wick stop-outs on thin books
    workingType: "MARK_PRICE",
    ...(opts?.closePosition !== false && !opts?.quantity ? { closePosition: true } : {}),
    ...(opts?.quantity ? { quantity: fmtQty(opts.quantity), reduceOnly: true } : {}),
    ...(opts?.clientOrderId ? { newClientOrderId: opts.clientOrderId } : {}),
  }) as Promise<{ orderId: number }>;
}

export async function placeFuturesTakeProfit(
  creds: BinanceCreds,
  symbol: string,
  side: Side,
  stopPrice: number,
  quantity?: number,
  clientOrderId?: string,
) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "POST", creds, {
    symbol,
    side,
    type: "TAKE_PROFIT_MARKET",
    stopPrice: fmtPrice(stopPrice),
    workingType: "MARK_PRICE",
    ...(quantity ? { quantity: fmtQty(quantity), reduceOnly: true } : { closePosition: true }),
    ...(clientOrderId ? { newClientOrderId: clientOrderId } : {}),
  }) as Promise<{ orderId: number }>;
}

export async function cancelFuturesOrder(creds: BinanceCreds, symbol: string, orderId: number) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "DELETE", creds, { symbol, orderId });
}

export async function cancelSpotOrder(creds: BinanceCreds, symbol: string, orderId: number) {
  return signedRequest(spotBase(), "/api/v3/order", "DELETE", creds, { symbol, orderId });
}

export async function cancelAllFuturesOrders(creds: BinanceCreds, symbol: string) {
  return signedRequest(futuresBase(), "/fapi/v1/allOpenOrders", "DELETE", creds, { symbol });
}

export async function cancelAllSpotOrders(creds: BinanceCreds, symbol: string) {
  return signedRequest(spotBase(), "/api/v3/openOrders", "DELETE", creds, { symbol });
}

export async function closeFuturesPosition(creds: BinanceCreds, symbol: string, positionAmt: number) {
  if (!positionAmt) return null;
  const side: Side = positionAmt > 0 ? "SELL" : "BUY";
  return placeFuturesMarketOrder(creds, symbol, side, Math.abs(positionAmt), {
    reduceOnly: true,
    clientOrderId: `close-${symbol}-${Date.now()}`.slice(0, 36),
  });
}

export async function getFuturesMarkPrice(symbol: string) {
  const res = await fetch(`${futuresBase()}/fapi/v1/premiumIndex?symbol=${symbol}`, { cache: "no-store" });
  if (!res.ok) throw new Error("mark price failed");
  const j = await res.json();
  return Number(j.markPrice);
}

export async function getSpotPrice(symbol: string) {
  const res = await fetch(`${spotBase()}/api/v3/ticker/price?symbol=${symbol}`, { cache: "no-store" });
  if (!res.ok) throw new Error("spot price failed");
  const j = await res.json();
  return Number(j.price);
}

export async function getSpotOrder(creds: BinanceCreds, symbol: string, orderId: string | number) {
  return signedRequest(spotBase(), "/api/v3/order", "GET", creds, { symbol, orderId }) as Promise<{
    orderId: number;
    status: string;
    executedQty: string;
    cummulativeQuoteQty?: string;
    price: string;
    clientOrderId?: string;
  }>;
}

export async function getFuturesOrder(creds: BinanceCreds, symbol: string, orderId: string | number) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "GET", creds, { symbol, orderId }) as Promise<{
    orderId: number;
    status: string;
    executedQty: string;
    avgPrice?: string;
    price: string;
    clientOrderId?: string;
  }>;
}

export async function getFuturesOrderByClientId(creds: BinanceCreds, symbol: string, clientOrderId: string) {
  return signedRequest(futuresBase(), "/fapi/v1/order", "GET", creds, { symbol, origClientOrderId: clientOrderId }) as Promise<{
    orderId: number;
    status: string;
    executedQty: string;
    avgPrice?: string;
  }>;
}

export async function getSpotOrderByClientId(creds: BinanceCreds, symbol: string, clientOrderId: string) {
  return signedRequest(spotBase(), "/api/v3/order", "GET", creds, { symbol, origClientOrderId: clientOrderId }) as Promise<{
    orderId: number;
    status: string;
    executedQty: string;
    cummulativeQuoteQty?: string;
  }>;
}

export function toBinanceSymbol(asset: string) {
  return asset.replace("/", "").toUpperCase();
}

export function makeClientOrderId(prefix: string, tradeId: string) {
  // Binance: max 36 chars, alphanumeric + dash/underscore
  const raw = `${prefix}-${tradeId}`.replace(/[^a-zA-Z0-9-_]/g, "");
  return raw.slice(0, 36);
}
