/**
 * Unified multi-exchange broker facade.
 * Supports: Binance Spot/Futures, Bybit Spot/Linear, OKX Spot/Swap.
 */
import {
  cancelAllFuturesOrders,
  cancelAllSpotOrders,
  cancelFuturesOrder,
  cancelSpotOrder,
  closeFuturesPosition,
  getFuturesMarkPrice,
  getFuturesOrder,
  getFuturesPosition,
  getFuturesUsdtAvailable,
  getSpotOrder,
  getSpotPrice,
  getSpotUsdtFree,
  isBinanceTestnet,
  placeFuturesMarketOrder,
  placeFuturesStopMarket,
  placeFuturesTakeProfit,
  placeSpotMarketOrder,
  placeSpotOcoExit,
  placeSpotStopLoss,
  placeSpotTakeProfit,
  setFuturesLeverage,
  toBinanceSymbol,
  validateApiKey as validateBinance,
  type BinanceCreds,
} from "@/lib/exchange/binance";
import { normalizeOrder as normalizeBinance } from "@/lib/exchange/filters";
import * as bybit from "@/lib/exchange/bybit";
import * as okx from "@/lib/exchange/okx";
import {
  familyFromVenue,
  isVenueId,
  makeClientOrderId,
  toVenueSymbol,
  type BrokerCreds,
  type OrderSide,
  type VenueId,
} from "@/lib/exchange/venues";

export { makeClientOrderId, toVenueSymbol, isVenueId };
export type { BrokerCreds, VenueId, OrderSide };

export function isTradingTestnet() {
  return isBinanceTestnet();
}

export async function validateVenueKey(venue: VenueId, creds: BrokerCreds) {
  const family = familyFromVenue(venue);
  if (family === "binance") {
    return validateBinance(venue as "binance_spot" | "binance_futures", creds as BinanceCreds);
  }
  if (family === "bybit") return bybit.bybitValidate(venue, creds);
  return okx.okxValidate(venue, creds);
}

export async function brokerNormalize(venue: VenueId, asset: string, qty: number, price?: number) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    const market = venue === "binance_futures" ? "futures" : "spot";
    return normalizeBinance(market, symbol, qty, price);
  }
  if (family === "bybit") return bybit.bybitNormalizePublic(venue, symbol, qty, price);
  return okx.okxNormalizePublic(venue, symbol, qty, price);
}

export async function brokerUsdtAvailable(venue: VenueId, creds: BrokerCreds) {
  const family = familyFromVenue(venue);
  if (family === "binance") {
    return venue === "binance_futures" ? getFuturesUsdtAvailable(creds as BinanceCreds) : getSpotUsdtFree(creds as BinanceCreds);
  }
  if (family === "bybit") return bybit.bybitUsdtAvailable(creds);
  return okx.okxUsdtAvailable(creds);
}

export async function brokerPrice(venue: VenueId, asset: string) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    return venue === "binance_futures" ? getFuturesMarkPrice(symbol) : getSpotPrice(symbol);
  }
  if (family === "bybit") return bybit.bybitPrice(venue, symbol);
  return okx.okxPrice(venue, symbol);
}

export async function brokerSetLeverage(venue: VenueId, creds: BrokerCreds, asset: string, leverage: number) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance" && venue === "binance_futures") {
    return setFuturesLeverage(creds as BinanceCreds, symbol, leverage);
  }
  if (family === "bybit" && venue === "bybit_linear") {
    return bybit.bybitSetLeverage(creds, symbol, leverage);
  }
  if (family === "okx" && venue === "okx_swap") {
    return okx.okxSetLeverage(creds, symbol, leverage);
  }
}

export async function brokerPlaceMarket(
  venue: VenueId,
  creds: BrokerCreds,
  asset: string,
  side: OrderSide,
  qty: number,
  opts?: { clientOrderId?: string; reduceOnly?: boolean },
) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") {
      const o = await placeFuturesMarketOrder(creds as BinanceCreds, symbol, side, qty, opts);
      return { orderId: String(o.orderId), avgPrice: o.avgPrice, status: o.status, clientOrderId: o.clientOrderId };
    }
    const o = await placeSpotMarketOrder(creds as BinanceCreds, symbol, side, qty, opts?.clientOrderId);
    return {
      orderId: String(o.orderId),
      status: o.status,
      clientOrderId: o.clientOrderId,
      fills: o.fills,
      executedQty: o.executedQty,
    };
  }
  if (family === "bybit") {
    const o = await bybit.bybitPlaceMarket(venue, creds, symbol, side, qty, opts);
    return { orderId: String(o.orderId), clientOrderId: o.clientOrderId };
  }
  const o = await okx.okxPlaceMarket(venue, creds, symbol, side, qty, opts);
  return { orderId: String(o.orderId), clientOrderId: o.clientOrderId };
}

export async function brokerPlaceStop(
  venue: VenueId,
  creds: BrokerCreds,
  asset: string,
  side: OrderSide,
  stopPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") {
      const o = await placeFuturesStopMarket(creds as BinanceCreds, symbol, side, stopPrice, {
        closePosition: true,
        clientOrderId,
      });
      return { orderId: String(o.orderId) };
    }
    const o = await placeSpotStopLoss(creds as BinanceCreds, symbol, side, qty, stopPrice, clientOrderId);
    return { orderId: String(o.orderId) };
  }
  if (family === "bybit") {
    const o = await bybit.bybitPlaceStop(venue, creds, symbol, side, stopPrice, qty, clientOrderId);
    return { orderId: String(o.orderId) };
  }
  const o = await okx.okxPlaceStop(venue, creds, symbol, side, stopPrice, qty, clientOrderId);
  return { orderId: String(o.orderId) };
}

export async function brokerPlaceTakeProfit(
  venue: VenueId,
  creds: BrokerCreds,
  asset: string,
  side: OrderSide,
  triggerPrice: number,
  qty: number,
  clientOrderId?: string,
) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") {
      const o = await placeFuturesTakeProfit(creds as BinanceCreds, symbol, side, triggerPrice, qty, clientOrderId);
      return { orderId: String(o.orderId) };
    }
    const o = await placeSpotTakeProfit(creds as BinanceCreds, symbol, side, qty, triggerPrice, clientOrderId);
    return { orderId: String(o.orderId) };
  }
  if (family === "bybit") {
    const o = await bybit.bybitPlaceTakeProfit(venue, creds, symbol, side, triggerPrice, qty, clientOrderId);
    return { orderId: String(o.orderId) };
  }
  const o = await okx.okxPlaceTakeProfit(venue, creds, symbol, side, triggerPrice, qty, clientOrderId);
  return { orderId: String(o.orderId) };
}

export async function brokerPlaceSpotOco(
  venue: VenueId,
  creds: BrokerCreds,
  asset: string,
  side: OrderSide,
  qty: number,
  takeProfit: number,
  stop: number,
  listClientOrderId?: string,
) {
  if (venue !== "binance_spot") {
    // Other venues: place stop + TP separately
    const sl = await brokerPlaceStop(venue, creds, asset, side, stop, qty, listClientOrderId ? `${listClientOrderId}sl` : undefined);
    let tpId = "";
    try {
      const tp = await brokerPlaceTakeProfit(
        venue,
        creds,
        asset,
        side,
        takeProfit,
        qty,
        listClientOrderId ? `${listClientOrderId}tp` : undefined,
      );
      tpId = tp.orderId;
    } catch {
      /* TP optional */
    }
    return { orderListId: 0, orders: [{ orderId: Number(tpId) || 0 }, { orderId: Number(sl.orderId) || 0 }] };
  }
  const symbol = toBinanceSymbol(asset);
  return placeSpotOcoExit(creds as BinanceCreds, symbol, side, qty, takeProfit, stop, listClientOrderId);
}

export async function brokerPosition(venue: VenueId, creds: BrokerCreds, asset: string) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance" && venue === "binance_futures") {
    return getFuturesPosition(creds as BinanceCreds, symbol);
  }
  if (family === "bybit" && venue === "bybit_linear") {
    return bybit.bybitPosition(creds, symbol);
  }
  if (family === "okx" && venue === "okx_swap") {
    return okx.okxPosition(creds, symbol);
  }
  return { amt: 0, entry: 0, upnl: 0 };
}

export async function brokerCancel(venue: VenueId, creds: BrokerCreds, asset: string, orderId: string) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") return cancelFuturesOrder(creds as BinanceCreds, symbol, Number(orderId));
    return cancelSpotOrder(creds as BinanceCreds, symbol, Number(orderId));
  }
  if (family === "bybit") return bybit.bybitCancel(venue, creds, symbol, orderId);
  return okx.okxCancel(venue, creds, symbol, orderId);
}

export async function brokerCancelAll(venue: VenueId, creds: BrokerCreds, asset: string) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") return cancelAllFuturesOrders(creds as BinanceCreds, symbol);
    return cancelAllSpotOrders(creds as BinanceCreds, symbol);
  }
  if (family === "bybit") return bybit.bybitCancelAll(venue, creds, symbol);
  return okx.okxCancelAll(venue, creds, symbol);
}

export async function brokerCloseFutures(venue: VenueId, creds: BrokerCreds, asset: string, positionAmt: number) {
  if (!positionAmt) return null;
  const side: OrderSide = positionAmt > 0 ? "SELL" : "BUY";
  if (venue === "binance_futures") {
    return closeFuturesPosition(creds as BinanceCreds, toBinanceSymbol(asset), positionAmt);
  }
  return brokerPlaceMarket(venue, creds, asset, side, Math.abs(positionAmt), {
    reduceOnly: true,
    clientOrderId: makeClientOrderId("cl", String(Date.now())),
  });
}

export async function brokerGetOrder(venue: VenueId, creds: BrokerCreds, asset: string, orderId: string) {
  const symbol = toVenueSymbol(venue, asset);
  const family = familyFromVenue(venue);
  if (family === "binance") {
    if (venue === "binance_futures") {
      const o = await getFuturesOrder(creds as BinanceCreds, symbol, orderId);
      return { orderId: String(o.orderId), status: o.status, executedQty: o.executedQty, avgPrice: o.avgPrice };
    }
    const o = await getSpotOrder(creds as BinanceCreds, symbol, orderId);
    return { orderId: String(o.orderId), status: o.status, executedQty: o.executedQty, avgPrice: o.price };
  }
  if (family === "bybit") return bybit.bybitGetOrder(venue, creds, symbol, orderId);
  return okx.okxGetOrder(venue, creds, symbol, orderId);
}

export function isFuturesVenue(venue: VenueId) {
  return venue === "binance_futures" || venue === "bybit_linear" || venue === "okx_swap";
}
