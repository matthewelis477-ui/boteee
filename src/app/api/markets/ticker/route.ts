import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Binance24h = {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
};

const SKIP = /UP|DOWN|BULL|BEAR|3L|3S|2L|2S/;

function formatPrice(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "-";
  if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export async function GET() {
  try {
    const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", {
      cache: "no-store",
      next: { revalidate: 0 },
    });
    if (!res.ok) {
      return NextResponse.json({ tickers: [], error: "Market data unavailable" }, { status: 502 });
    }
    const rows = (await res.json()) as Binance24h[];
    const tickers = rows
      .filter((r) => r.symbol.endsWith("USDT") && !SKIP.test(r.symbol))
      .map((r) => ({
        symbol: r.symbol.replace("USDT", ""),
        pair: `${r.symbol.replace("USDT", "")}/USDT`,
        price: Number(r.lastPrice),
        priceText: formatPrice(Number(r.lastPrice)),
        changePct: Number(r.priceChangePercent),
        volume: Number(r.quoteVolume),
      }))
      .filter((t) => t.volume > 0 && t.price > 0)
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 48)
      .map(({ volume: _v, ...rest }) => rest);

    return NextResponse.json(
      { tickers, updatedAt: new Date().toISOString() },
      {
        headers: {
          "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15",
        },
      },
    );
  } catch {
    return NextResponse.json({ tickers: [], error: "Market data unavailable" }, { status: 502 });
  }
}
