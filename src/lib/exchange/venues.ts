/** Canonical venue IDs stored on ExchangeCredential / ManagedTrade.exchange */
export type VenueId =
  | "binance_spot"
  | "binance_futures"
  | "bybit_spot"
  | "bybit_linear"
  | "okx_spot"
  | "okx_swap";

export type VenueFamily = "binance" | "bybit" | "okx";
export type MarketKind = "spot" | "futures";
export type OrderSide = "BUY" | "SELL";

export type BrokerCreds = {
  apiKey: string;
  apiSecret: string;
  /** Required for OKX */
  passphrase?: string;
};

export type VenueMeta = {
  id: VenueId;
  family: VenueFamily;
  market: MarketKind;
  label: string;
  docsUrl: string;
  needsPassphrase: boolean;
  keyHints: string[];
};

export const VENUES: VenueMeta[] = [
  {
    id: "binance_spot",
    family: "binance",
    market: "spot",
    label: "Binance Spot",
    docsUrl: "https://developers.binance.com/docs/binance-spot-api-docs",
    needsPassphrase: false,
    keyHints: ["Enable Spot trading", "Disable withdrawals", "Optional IP allowlist"],
  },
  {
    id: "binance_futures",
    family: "binance",
    market: "futures",
    label: "Binance Futures USD-M",
    docsUrl: "https://developers.binance.com/docs/derivatives/usds-margined-futures",
    needsPassphrase: false,
    keyHints: ["Enable Futures", "Disable withdrawals", "Optional IP allowlist"],
  },
  {
    id: "bybit_spot",
    family: "bybit",
    market: "spot",
    label: "Bybit Spot",
    docsUrl: "https://bybit-exchange.github.io/docs/v5/intro",
    needsPassphrase: false,
    keyHints: ["Read + Spot trade permissions", "No withdrawal permission", "Unified trading account recommended"],
  },
  {
    id: "bybit_linear",
    family: "bybit",
    market: "futures",
    label: "Bybit Linear (USDT perps)",
    docsUrl: "https://bybit-exchange.github.io/docs/v5/order/create-order",
    needsPassphrase: false,
    keyHints: ["Read + Contract trade permissions", "No withdrawal permission", "USDT perpetual (linear)"],
  },
  {
    id: "okx_spot",
    family: "okx",
    market: "spot",
    label: "OKX Spot",
    docsUrl: "https://www.okx.com/docs-v5/en/",
    needsPassphrase: true,
    keyHints: ["Trade permission", "Passphrase required", "No withdrawal permission", "Use Demo Trading flag for sandbox"],
  },
  {
    id: "okx_swap",
    family: "okx",
    market: "futures",
    label: "OKX Perpetual Swap",
    docsUrl: "https://www.okx.com/docs-v5/en/#order-book-trading-trade",
    needsPassphrase: true,
    keyHints: ["Trade permission", "Passphrase required", "No withdrawal permission", "USDT-margined SWAP"],
  },
];

export function venueMeta(id: string): VenueMeta | undefined {
  return VENUES.find((v) => v.id === id);
}

export function isVenueId(id: string): id is VenueId {
  return VENUES.some((v) => v.id === id);
}

/** Map user preferred family + signal market to a concrete venue id. */
export function resolveVenueId(family: string, market: MarketKind): VenueId {
  const f = (family || "binance").toLowerCase();
  if (f === "bybit") return market === "futures" ? "bybit_linear" : "bybit_spot";
  if (f === "okx") return market === "futures" ? "okx_swap" : "okx_spot";
  return market === "futures" ? "binance_futures" : "binance_spot";
}

export function familyFromVenue(id: VenueId): VenueFamily {
  return venueMeta(id)!.family;
}

export function labelForVenue(id: string) {
  return venueMeta(id)?.label || id;
}

/** Convert BTC/USDT style asset to venue symbol. */
export function toVenueSymbol(venue: VenueId, asset: string) {
  const compact = asset.replace("/", "").toUpperCase();
  if (venue.startsWith("okx")) {
    const base = compact.replace(/USDT$/, "");
    return venue === "okx_swap" ? `${base}-USDT-SWAP` : `${base}-USDT`;
  }
  return compact;
}

export function makeClientOrderId(prefix: string, tradeId: string) {
  const raw = `${prefix}-${tradeId}`.replace(/[^a-zA-Z0-9-_]/g, "");
  return raw.slice(0, 32);
}
