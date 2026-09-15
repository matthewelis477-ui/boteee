import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function fetchTickers() {
  const res = await fetch("https://data-api.binance.vision/api/v3/ticker/24hr", { cache: "no-store" });
  if (!res.ok) throw new Error("binance");
  const rows = (await res.json()) as {
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
    quoteVolume: string;
  }[];
  const SKIP = /UP|DOWN|BULL|BEAR|3L|3S|2L|2S/;
  function formatPrice(n: number) {
    if (!Number.isFinite(n) || n <= 0) return "-";
    if (n >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (n >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  }
  return rows
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
}

/** Server-Sent Events — fresh marks about every 5s. */
export async function GET() {
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const push = async () => {
        try {
          const tickers = await fetchTickers();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ tickers, updatedAt: new Date().toISOString() })}\n\n`),
          );
        } catch {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ tickers: [], error: true })}\n\n`));
        }
      };
      void push();
      timer = setInterval(() => void push(), 5_000);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
