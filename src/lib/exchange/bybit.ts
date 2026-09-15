import { createHmac } from "node:crypto";
import { isBinanceTestnetConfig } from "@/lib/platform-config";
import type { BrokerCreds, OrderSide, VenueId } from "@/lib/exchange/venues";
import { toVenueSymbol } from "@/lib/exchange/venues";

function bybitBase() {
  return isBinanceTestnetConfig() ? "https://api-testnet.bybit.com" : "https://api.bybit.com";
}

function category(venue: VenueId): "spot" | "linear" {
  return venue === "bybit_linear" ? "linear" : "spot";
}

function sign(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

async function bybitRequest(
  method: "GET" | "POST",
  path: string,
  creds: BrokerCreds,
  params: Record<string, string | number | boolean | undefined> = {},
) {
  const timestamp = String(Date.now());
  const recvWindow = "5000";
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    clean[k] = String(v);
  }

  let url = `${bybitBase()}${path}`;
  let body = "";
  let signPayload: string;

  if (method === "GET") {
    const q = new URLSearchParams(clean).toString();
    if (q) url += `?${q}`;
    signPayload = `${timestamp}${creds.apiKey}${recvWindow}${q}`;
  } else {
    body = JSON.stringify(clean);
    signPayload = `${timestamp}${creds.apiKey}${recvWindow}${body}`;
  }

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-BAPI-API-KEY": creds.apiKey,
      "X-BAPI-SIGN": sign(creds.apiSecret, signPayload),
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": recvWindow,
    },
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as { retCode?: number; retMsg?: string; result?: unknown };
  if (!res.ok || (json.retCode != null && json.retCode !== 0)) {
    throw new Error(`Bybit ${method} ${path}: ${json.retMsg || res.statusText}`);
  }
  return json.result;
}

export async function bybitValidate(venue: VenueId, creds: BrokerCreds) {
  const info = (await bybitRequest("GET", "/v5/user/query-api", creds)) as {
    permissions?: { ContractTrade?: string[]; Spot?: string[]; Wallet?: string[] };
  };
  const wallet = info.permissions?.Wallet || [];
  if (wallet.some((p) => /Withdraw/i.test(p))) {
    throw new Error("This API key allows withdrawals. Please create a trade-only key.");
  }
  if (venue === "bybit_spot") {
    const spot = info.permissions?.Spot || [];
    if (spot.length && !spot.some((p) => /SpotTrade|Order/i.test(p))) {
      throw new Error("This API key cannot place Spot trades on Bybit.");
    }
  } else {
    const ct = info.permissions?.ContractTrade || [];
    if (ct.length && !ct.some((p) => /Order|Trade/i.test(p))) {
      throw new Error("This API key cannot place Contract trades on Bybit.");
    }
  }
  // Live ping wallet
  await bybitRequest("GET", "/v5/account/wallet-balance", creds, { accountType: "UNIFIED" });
  return { canTrade: true, canWithdraw: false, testnet: isBinanceTestnetConfig() };
}

export async function bybitUsdtAvailable(creds: BrokerCreds) {
  const result = (await bybitRequest("GET", "/v5/account/wallet-balance", creds, { accountType: "UNIFIED" })) as {
    list?: { coin?: { coin: string; availableToWithdraw?: string; walletBalance?: string; equity?: string }[] }[];
  };
  const coins = result.list?.[0]?.coin || [];
  const usdt = coins.find((c) => c.coin === "USDT");
  return Number(usdt?.availableToWithdraw || usdt?.equity || usdt?.walletBalance || 0);
}

async function bybitPublic(path: string) {
  const res = await fetch(`${bybitBase()}${path}`, { cache: "no-store" });
  const json = (await res.json()) as { retCode?: number; retMsg?: string; result?: unknown };
  if (!res.ok || (json.retCode != null && json.retCode !== 0)) {
    throw new Error(`Bybit public ${path}: ${json.retMsg || res.statusText}`);
  }
  return json.result;
}

export async function bybitInstruments(venue: VenueId, symbol: string) {
  const cat = category(venue);
  const result = (await bybitPublic(`/v5/market/instruments-info?category=${cat}&symbol=${symbol}`)) as {
    list?: { lotSizeFilter?: { qtyStep?: string; minOrderQty?: string }; priceFilter?: { tickSize?: string } }[];
  };
  return result?.list?.[0];
}

export async function bybitNormalizePublic(venue: VenueId, symbol: string, qty: number, price?: number) {
  const row = await bybitInstruments(venue, symbol);
  const step = Number(row?.lotSizeFilter?.qtyStep || "0.001");
  const minQty = Number(row?.lotSizeFilter?.minOrderQty || step);
  const tick = Number(row?.priceFilter?.tickSize || "0.01");
  const precision = Math.max(0, (String(step).split(".")[1] || "").length);
  const q = Math.max(minQty, Math.floor(qty / step) * step);
  const p =
    price != null
      ? Number((Math.round(price / tick) * tick).toFixed(Math.max(0, (String(tick).split(".")[1] || "").length)))
      : undefined;
  return { qty: Number(q.toFixed(precision)), price: p, step, tick, minNotional: 5 };
}

export async function bybitPlaceMarket(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  qty: number,
  opts?: { clientOrderId?: string; reduceOnly?: boolean },
) {
  const result = (await bybitRequest("POST", "/v5/order/create", creds, {
    category: category(venue),
    symbol,
    side: side === "BUY" ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(qty),
    ...(opts?.reduceOnly ? { reduceOnly: true } : {}),
    ...(opts?.clientOrderId ? { orderLinkId: opts.clientOrderId } : {}),
  })) as { orderId?: string; orderLinkId?: string };
  return { orderId: result.orderId || "", clientOrderId: result.orderLinkId };
}

export async function bybitSetLeverage(creds: BrokerCreds, symbol: string, leverage: number) {
  try {
    await bybitRequest("POST", "/v5/position/set-leverage", creds, {
      category: "linear",
      symbol,
      buyLeverage: String(leverage),
      sellLeverage: String(leverage),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    // Bybit returns error if leverage unchanged — ignore
    if (!/not modified|leverage not modified/i.test(msg)) throw e;
  }
}

export async function bybitPlaceStop(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  stopPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const isBuy = side === "BUY";
  const result = (await bybitRequest("POST", "/v5/order/create", creds, {
    category: category(venue),
    symbol,
    side: isBuy ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(qty),
    triggerPrice: String(stopPrice),
    triggerDirection: isBuy ? 1 : 2,
    orderFilter: "StopOrder",
    reduceOnly: venue === "bybit_linear" ? true : undefined,
    ...(clientOrderId ? { orderLinkId: clientOrderId } : {}),
  })) as { orderId?: string };
  return { orderId: result.orderId || "" };
}

export async function bybitPlaceTakeProfit(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  triggerPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const isBuy = side === "BUY";
  const result = (await bybitRequest("POST", "/v5/order/create", creds, {
    category: category(venue),
    symbol,
    side: isBuy ? "Buy" : "Sell",
    orderType: "Market",
    qty: String(qty),
    triggerPrice: String(triggerPrice),
    triggerDirection: isBuy ? 1 : 2,
    orderFilter: "StopOrder",
    reduceOnly: venue === "bybit_linear" ? true : undefined,
    ...(clientOrderId ? { orderLinkId: clientOrderId } : {}),
  })) as { orderId?: string };
  return { orderId: result.orderId || "" };
}

export async function bybitPosition(creds: BrokerCreds, symbol: string) {
  const result = (await bybitRequest("GET", "/v5/position/list", creds, {
    category: "linear",
    symbol,
  })) as { list?: { size?: string; side?: string; avgPrice?: string; unrealisedPnl?: string }[] };
  const row = result.list?.[0];
  if (!row) return { amt: 0, entry: 0, upnl: 0 };
  const size = Number(row.size || 0);
  const amt = row.side === "Sell" ? -size : size;
  return { amt, entry: Number(row.avgPrice || 0), upnl: Number(row.unrealisedPnl || 0) };
}

export async function bybitCancel(venue: VenueId, creds: BrokerCreds, symbol: string, orderId: string) {
  await bybitRequest("POST", "/v5/order/cancel", creds, {
    category: category(venue),
    symbol,
    orderId,
  });
}

export async function bybitCancelAll(venue: VenueId, creds: BrokerCreds, symbol: string) {
  await bybitRequest("POST", "/v5/order/cancel-all", creds, {
    category: category(venue),
    symbol,
  });
}

export async function bybitPrice(venue: VenueId, symbol: string) {
  const cat = category(venue);
  const url = `${bybitBase()}/v5/market/tickers?category=${cat}&symbol=${symbol}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as { result?: { list?: { lastPrice?: string; markPrice?: string }[] } };
  const row = json.result?.list?.[0];
  return Number(row?.markPrice || row?.lastPrice || 0);
}

export async function bybitGetOrder(venue: VenueId, creds: BrokerCreds, symbol: string, orderId: string) {
  const result = (await bybitRequest("GET", "/v5/order/realtime", creds, {
    category: category(venue),
    symbol,
    orderId,
  })) as { list?: { orderId?: string; orderStatus?: string; cumExecQty?: string; avgPrice?: string }[] };
  const row = result.list?.[0];
  return {
    orderId: row?.orderId || orderId,
    status: row?.orderStatus || "UNKNOWN",
    executedQty: row?.cumExecQty || "0",
    avgPrice: row?.avgPrice,
  };
}

export { toVenueSymbol };
