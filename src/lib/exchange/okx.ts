import { createHmac } from "node:crypto";
import { isBinanceTestnetConfig } from "@/lib/platform-config";
import type { BrokerCreds, OrderSide, VenueId } from "@/lib/exchange/venues";

function okxBase() {
  return "https://www.okx.com";
}

function isoNow() {
  return new Date().toISOString();
}

function sign(secret: string, prehash: string) {
  return createHmac("sha256", secret).update(prehash).digest("base64");
}

function instId(venue: VenueId, symbolOrAsset: string) {
  if (symbolOrAsset.includes("-")) return symbolOrAsset.toUpperCase();
  const compact = symbolOrAsset.replace("/", "").toUpperCase();
  const base = compact.replace(/USDT$/, "");
  return venue === "okx_swap" ? `${base}-USDT-SWAP` : `${base}-USDT`;
}

async function okxRequest(
  method: "GET" | "POST",
  path: string,
  creds: BrokerCreds,
  bodyObj?: Record<string, unknown>,
) {
  if (!creds.passphrase) throw new Error("OKX requires an API passphrase.");
  const timestamp = isoNow();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const prehash = `${timestamp}${method}${path}${body}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "OK-ACCESS-KEY": creds.apiKey,
    "OK-ACCESS-SIGN": sign(creds.apiSecret, prehash),
    "OK-ACCESS-TIMESTAMP": timestamp,
    "OK-ACCESS-PASSPHRASE": creds.passphrase,
  };
  // Demo / simulated trading when platform testnet flag is on
  if (isBinanceTestnetConfig()) headers["x-simulated-trading"] = "1";

  const res = await fetch(`${okxBase()}${path}`, {
    method,
    headers,
    body: method === "POST" ? body : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as { code?: string; msg?: string; data?: unknown[] };
  if (!res.ok || (json.code != null && json.code !== "0")) {
    throw new Error(`OKX ${method} ${path}: ${json.msg || res.statusText}`);
  }
  return json.data || [];
}

export async function okxValidate(venue: VenueId, creds: BrokerCreds) {
  const rows = (await okxRequest("GET", "/api/v5/account/config", creds)) as {
    acctLv?: string;
    perm?: string;
  }[];
  const perm = String(rows[0]?.perm || "");
  if (/withdraw/i.test(perm)) {
    throw new Error("This API key allows withdrawals. Please create a trade-only key.");
  }
  // Balance ping confirms key works for trading account
  await okxRequest("GET", "/api/v5/account/balance?ccy=USDT", creds);
  void venue;
  return { canTrade: true, canWithdraw: false, testnet: isBinanceTestnetConfig() };
}

export async function okxUsdtAvailable(creds: BrokerCreds) {
  const rows = (await okxRequest("GET", "/api/v5/account/balance?ccy=USDT", creds)) as {
    details?: { ccy?: string; availBal?: string; cashBal?: string }[];
  }[];
  const detail = rows[0]?.details?.find((d) => d.ccy === "USDT") || rows[0]?.details?.[0];
  return Number(detail?.availBal || detail?.cashBal || 0);
}

export async function okxNormalizePublic(venue: VenueId, symbol: string, qty: number, price?: number) {
  const id = instId(venue, symbol);
  const url = `${okxBase()}/api/v5/public/instruments?instType=${venue === "okx_swap" ? "SWAP" : "SPOT"}&instId=${id}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as {
    data?: { lotSz?: string; minSz?: string; tickSz?: string; ctVal?: string }[];
  };
  const row = json.data?.[0];
  const step = Number(row?.lotSz || "0.0001");
  const minQty = Number(row?.minSz || step);
  const tick = Number(row?.tickSz || "0.01");
  // For SWAP, sz is in contracts; approximate contracts from base qty using ctVal when present
  const ctVal = Number(row?.ctVal || "0");
  let target = qty;
  if (venue === "okx_swap" && ctVal > 0) {
    target = qty / ctVal;
  }
  const precision = Math.max(0, (String(step).split(".")[1] || "").length);
  const q = Math.max(minQty, Math.floor(target / step) * step);
  const p =
    price != null
      ? Number((Math.round(price / tick) * tick).toFixed(Math.max(0, (String(tick).split(".")[1] || "").length)))
      : undefined;
  return { qty: Number(q.toFixed(precision)), price: p, step, tick, minNotional: 5, ctVal };
}

export async function okxPlaceMarket(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  qty: number,
  opts?: { clientOrderId?: string; reduceOnly?: boolean },
) {
  const id = instId(venue, symbol);
  const data = (await okxRequest("POST", "/api/v5/trade/order", creds, {
    instId: id,
    tdMode: venue === "okx_swap" ? "cross" : "cash",
    side: side.toLowerCase(),
    ordType: "market",
    sz: String(qty),
    ...(venue === "okx_swap" && opts?.reduceOnly ? { reduceOnly: true } : {}),
    ...(opts?.clientOrderId ? { clOrdId: opts.clientOrderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) } : {}),
  })) as { ordId?: string; clOrdId?: string }[];
  return { orderId: data[0]?.ordId || "", clientOrderId: data[0]?.clOrdId };
}

export async function okxSetLeverage(creds: BrokerCreds, symbol: string, leverage: number) {
  const id = instId("okx_swap", symbol);
  await okxRequest("POST", "/api/v5/account/set-leverage", creds, {
    instId: id,
    lever: String(leverage),
    mgnMode: "cross",
  });
}

export async function okxPlaceStop(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  stopPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const id = instId(venue, symbol);
  // OKX algo order (conditional)
  const data = (await okxRequest("POST", "/api/v5/trade/order-algo", creds, {
    instId: id,
    tdMode: venue === "okx_swap" ? "cross" : "cash",
    side: side.toLowerCase(),
    ordType: "conditional",
    sz: String(qty),
    slTriggerPx: String(stopPrice),
    slOrdPx: "-1", // market
    ...(venue === "okx_swap" ? { reduceOnly: true } : {}),
    ...(clientOrderId ? { algoClOrdId: clientOrderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) } : {}),
  })) as { algoId?: string }[];
  return { orderId: data[0]?.algoId || "" };
}

export async function okxPlaceTakeProfit(
  venue: VenueId,
  creds: BrokerCreds,
  symbol: string,
  side: OrderSide,
  triggerPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const id = instId(venue, symbol);
  const data = (await okxRequest("POST", "/api/v5/trade/order-algo", creds, {
    instId: id,
    tdMode: venue === "okx_swap" ? "cross" : "cash",
    side: side.toLowerCase(),
    ordType: "conditional",
    sz: String(qty),
    tpTriggerPx: String(triggerPrice),
    tpOrdPx: "-1",
    ...(venue === "okx_swap" ? { reduceOnly: true } : {}),
    ...(clientOrderId ? { algoClOrdId: clientOrderId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32) } : {}),
  })) as { algoId?: string }[];
  return { orderId: data[0]?.algoId || "" };
}

export async function okxPosition(creds: BrokerCreds, symbol: string) {
  const id = instId("okx_swap", symbol);
  const rows = (await okxRequest("GET", `/api/v5/account/positions?instType=SWAP&instId=${id}`, creds)) as {
    pos?: string;
    avgPx?: string;
    upl?: string;
    posSide?: string;
  }[];
  const row = rows[0];
  if (!row) return { amt: 0, entry: 0, upnl: 0 };
  return { amt: Number(row.pos || 0), entry: Number(row.avgPx || 0), upnl: Number(row.upl || 0) };
}

export async function okxCancel(venue: VenueId, creds: BrokerCreds, symbol: string, orderId: string) {
  const id = instId(venue, symbol);
  try {
    await okxRequest("POST", "/api/v5/trade/cancel-order", creds, { instId: id, ordId: orderId });
  } catch {
    // Algo / conditional orders use a different cancel endpoint
    const timestamp = isoNow();
    const body = JSON.stringify([{ instId: id, algoId: orderId }]);
    if (!creds.passphrase) throw new Error("OKX requires an API passphrase.");
    const path = "/api/v5/trade/cancel-algos";
    const prehash = `${timestamp}POST${path}${body}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "OK-ACCESS-KEY": creds.apiKey,
      "OK-ACCESS-SIGN": sign(creds.apiSecret, prehash),
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": creds.passphrase,
    };
    if (isBinanceTestnetConfig()) headers["x-simulated-trading"] = "1";
    const res = await fetch(`${okxBase()}${path}`, { method: "POST", headers, body, cache: "no-store" });
    const json = (await res.json()) as { code?: string; msg?: string };
    if (!res.ok || (json.code != null && json.code !== "0")) {
      throw new Error(`OKX cancel-algos: ${json.msg || res.statusText}`);
    }
  }
}

export async function okxCancelAll(venue: VenueId, creds: BrokerCreds, symbol: string) {
  const id = instId(venue, symbol);
  const instType = venue === "okx_swap" ? "SWAP" : "SPOT";
  try {
    const pending = (await okxRequest(
      "GET",
      `/api/v5/trade/orders-pending?instType=${instType}&instId=${id}`,
      creds,
    )) as { ordId?: string }[];
    for (const row of pending.slice(0, 20)) {
      if (row.ordId) {
        try {
          await okxRequest("POST", "/api/v5/trade/cancel-order", creds, { instId: id, ordId: row.ordId });
        } catch {
          /* continue */
        }
      }
    }
  } catch {
    /* no pending */
  }
  try {
    const algos = (await okxRequest(
      "GET",
      `/api/v5/trade/orders-algo-pending?ordType=conditional&instId=${id}`,
      creds,
    )) as { algoId?: string }[];
    if (algos.length) {
      const timestamp = isoNow();
      const body = JSON.stringify(algos.filter((a) => a.algoId).map((a) => ({ instId: id, algoId: a.algoId })));
      if (!creds.passphrase || body === "[]") return;
      const path = "/api/v5/trade/cancel-algos";
      const prehash = `${timestamp}POST${path}${body}`;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "OK-ACCESS-KEY": creds.apiKey,
        "OK-ACCESS-SIGN": sign(creds.apiSecret, prehash),
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": creds.passphrase,
      };
      if (isBinanceTestnetConfig()) headers["x-simulated-trading"] = "1";
      await fetch(`${okxBase()}${path}`, { method: "POST", headers, body, cache: "no-store" });
    }
  } catch {
    /* no algos */
  }
}

export async function okxPrice(venue: VenueId, symbol: string) {
  const id = instId(venue, symbol);
  const url = `${okxBase()}/api/v5/market/ticker?instId=${id}`;
  const res = await fetch(url, { cache: "no-store" });
  const json = (await res.json()) as { data?: { last?: string; markPx?: string }[] };
  return Number(json.data?.[0]?.markPx || json.data?.[0]?.last || 0);
}

export async function okxGetOrder(venue: VenueId, creds: BrokerCreds, symbol: string, orderId: string) {
  const id = instId(venue, symbol);
  try {
    const rows = (await okxRequest(
      "GET",
      `/api/v5/trade/order?instId=${id}&ordId=${orderId}`,
      creds,
    )) as { ordId?: string; state?: string; accFillSz?: string; avgPx?: string }[];
    const row = rows[0];
    return {
      orderId: row?.ordId || orderId,
      status: row?.state || "UNKNOWN",
      executedQty: row?.accFillSz || "0",
      avgPrice: row?.avgPx,
    };
  } catch {
    return { orderId, status: "UNKNOWN", executedQty: "0" };
  }
}
