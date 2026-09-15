import { NextResponse } from "next/server";
import { answerAssistant, type AssistantContext } from "@/lib/assistant";
import { prisma } from "@/lib/db";
import { refreshLiveNews } from "@/lib/market/news-live";
import { dbToSignal } from "@/lib/signal-map";
import { readUser } from "@/lib/auth";

async function livePrices() {
  try {
    const res = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22%5D", {
      cache: "no-store",
    });
    if (!res.ok) return {} as Record<string, number>;
    const rows = (await res.json()) as { symbol: string; price: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) out[r.symbol] = Number(r.price);
    return out;
  } catch {
    return {} as Record<string, number>;
  }
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { question } = await req.json();

  const [rows, snap, fut, news, prefs, openManaged, recentClosed, prices] = await Promise.all([
    prisma.marketSignal.findMany({
      where: { approved: true },
      orderBy: { publishedAt: "desc" },
      take: 40,
    }),
    prisma.scannerSnapshot.findUnique({ where: { id: "latest" } }),
    prisma.futuresSnapshot.findUnique({ where: { id: "latest" } }),
    refreshLiveNews().catch(() => []),
    prisma.tradingPrefs.findUnique({ where: { userId: user.id } }),
    prisma.managedTrade.findMany({
      where: { userId: user.id, status: { in: ["open", "protecting", "partial"] } },
      take: 10,
      orderBy: { openedAt: "desc" },
    }),
    prisma.managedTrade.findMany({
      where: { userId: user.id, status: "closed" },
      take: 5,
      orderBy: { closedAt: "desc" },
    }),
    livePrices(),
  ]);

  const parsed = snap ? JSON.parse(snap.json) : {};
  const futParsed = fut ? JSON.parse(fut.json) : {};

  const ctx: AssistantContext = {
    signals: rows.map((r) => dbToSignal(r)),
    prices,
    news: news.map((n) => ({
      title: n.title,
      whenLabel: n.whenLabel,
      impact: n.impact,
      protection: n.protection,
      source: n.source,
    })),
    scanner: parsed.scanner || undefined,
    pause: parsed.pauseEvent?.protection,
    futures: {
      funding: futParsed.funding,
      longShort: futParsed.longShort,
      insight: futParsed.insight,
      premium: futParsed.premium,
    },
    user: {
      plan: user.plan,
      name: user.name,
      preferredVenue: prefs?.preferredVenue,
      autoTradeEnabled: prefs?.autoTradeEnabled,
      capitalUsd: prefs?.capitalUsd,
      openManaged: openManaged.map((t) => ({
        asset: t.asset,
        side: t.side,
        status: t.status,
        exchange: t.exchange,
      })),
      recentClosed: recentClosed.map((t) => ({
        asset: t.asset,
        side: t.side,
        realizedPnl: t.realizedPnl || 0,
      })),
    },
    updatedAt: new Date().toISOString(),
  };

  if (!rows.length && !Object.keys(prices).length) {
    return NextResponse.json({
      answer: "Live market data is temporarily unavailable. Please try again shortly.",
      mode: "live",
    });
  }

  const result = await answerAssistant(String(question || ""), ctx);
  return NextResponse.json(result);
}
