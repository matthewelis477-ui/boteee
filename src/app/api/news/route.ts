import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { refreshLiveNews } from "@/lib/market/news-live";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const events = await refreshLiveNews();
    if (events.length) return NextResponse.json({ events, live: true, updatedAt: new Date().toISOString() });
  } catch {
    /* fall through */
  }

  const cached = await prisma.newsEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
  if (cached.length) {
    return NextResponse.json({ events: cached, live: false, updatedAt: cached[0].createdAt.toISOString() });
  }

  return NextResponse.json({
    events: [
      {
        id: "fallback",
        title: "News feeds temporarily unavailable",
        whenLabel: new Date().toISOString(),
        impact: "medium",
        protection: "Could not reach live macro/crypto news sources. Prefer confirmed trends until the feed recovers.",
        source: "fallback",
      },
    ],
    live: false,
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  if (body.refresh) {
    const events = await refreshLiveNews(true);
    return NextResponse.json({ events, live: true });
  }
  const row = await prisma.newsEvent.create({
    data: {
      title: String(body.title || "Event"),
      whenLabel: String(body.whenLabel || "Soon"),
      impact: String(body.impact || "medium"),
      protection: String(body.protection || "Volatility risk."),
      source: "admin",
    },
  });
  return NextResponse.json({ event: row });
}
