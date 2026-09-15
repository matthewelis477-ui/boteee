/**
 * Live news ingestion — macro calendar + crypto headlines (RSS).
 * Refreshes on a short TTL so the feed does not freeze after first seed.
 */

import { prisma } from "@/lib/db";

const MACRO_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const CRYPTO_RSS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/",
  "https://cointelegraph.com/rss",
];
const REFRESH_MS = 5 * 60 * 1000; // 5 minutes

export type LiveNewsEvent = {
  id: string;
  title: string;
  whenLabel: string;
  impact: string;
  protection: string;
  startsAt: Date | null;
  source: string;
  createdAt: Date;
};

function decodeXml(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function impactFromTitle(title: string) {
  const t = title.toLowerCase();
  if (/sec|etf|hack|exploit|ban|lawsuit|fed |cpi|fomc|regulation|arrest/.test(t)) return "high";
  if (/bitcoin|btc|ethereum|eth|market|rally|crash|liquidat/.test(t)) return "medium";
  return "low";
}

function parseRssItems(xml: string, limit: number) {
  const items: { title: string; link: string; pubDate: string; description: string }[] = [];
  const blocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of blocks) {
    const title = decodeXml((block.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
    const link = decodeXml((block.match(/<link[^>]*>([\s\S]*?)<\/link>/i) || [])[1] || "");
    const pubDate = decodeXml((block.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i) || [])[1] || "");
    const description = decodeXml(
      (block.match(/<description[^>]*>([\s\S]*?)<\/description>/i) || [])[1] || "",
    ).replace(/<[^>]+>/g, " ");
    if (title) items.push({ title, link, pubDate, description });
    if (items.length >= limit) break;
  }
  return items;
}

async function syncMacroCalendar() {
  const res = await fetch(MACRO_URL, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`macro calendar ${res.status}`);
  const events = (await res.json()) as { title?: string; date?: string; impact?: string; country?: string }[];
  const now = Date.now();
  const high = events
    .filter((e) => String(e.impact).toLowerCase() === "high")
    .filter((e) => {
      if (!e.date) return true;
      const t = new Date(e.date).getTime();
      return Number.isFinite(t) ? t > now - 6 * 3600_000 : true;
    })
    .slice(0, 12);

  await prisma.newsEvent.deleteMany({ where: { source: { in: ["faireconomy", "calendar"] } } });

  for (const e of high) {
    const title = e.title || "Macro event";
    const country = e.country ? `${e.country} ` : "";
    await prisma.newsEvent.create({
      data: {
        title: `${country}${title}`.trim(),
        whenLabel: e.date || "Soon",
        impact: "high",
        protection: `${title} may increase volatility. Reduce size or pause new entries around the release.`,
        startsAt: e.date ? new Date(e.date) : null,
        source: "faireconomy",
      },
    });
  }
}

async function syncCryptoHeadlines() {
  const collected: { title: string; link: string; pubDate: string; description: string; feed: string }[] = [];

  await Promise.all(
    CRYPTO_RSS.map(async (url) => {
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: { Accept: "application/rss+xml, application/xml, text/xml, */*" },
        });
        if (!res.ok) return;
        const xml = await res.text();
        const feed = url.includes("coindesk") ? "CoinDesk" : "CoinTelegraph";
        for (const item of parseRssItems(xml, 10)) {
          collected.push({ ...item, feed });
        }
      } catch {
        /* feed optional */
      }
    }),
  );

  if (!collected.length) throw new Error("crypto RSS empty");

  collected.sort((a, b) => new Date(b.pubDate || 0).getTime() - new Date(a.pubDate || 0).getTime());
  const unique = new Map<string, (typeof collected)[0]>();
  for (const item of collected) {
    const key = item.title.toLowerCase().slice(0, 80);
    if (!unique.has(key)) unique.set(key, item);
  }

  await prisma.newsEvent.deleteMany({ where: { source: { in: ["cryptocompare", "rss"] } } });

  for (const item of [...unique.values()].slice(0, 16)) {
    const published = item.pubDate ? new Date(item.pubDate) : new Date();
    const snippet = (item.description || "").replace(/\s+/g, " ").slice(0, 180);
    await prisma.newsEvent.create({
      data: {
        title: item.title,
        whenLabel: published.toISOString(),
        impact: impactFromTitle(item.title),
        protection: snippet
          ? `${snippet}${snippet.length >= 180 ? "…" : ""} · ${item.feed}`
          : `Live headline from ${item.feed}. Cross-check before trading.`,
        startsAt: Number.isFinite(published.getTime()) ? published : new Date(),
        source: "rss",
      },
    });
  }
}

export async function refreshLiveNews(force = false): Promise<LiveNewsEvent[]> {
  const newest = await prisma.newsEvent.findFirst({
    where: { source: { in: ["faireconomy", "rss", "cryptocompare"] } },
    orderBy: { createdAt: "desc" },
  });
  const age = newest ? Date.now() - newest.createdAt.getTime() : Number.POSITIVE_INFINITY;
  const needsRefresh = force || age > REFRESH_MS;

  if (needsRefresh) {
    const results = await Promise.allSettled([syncMacroCalendar(), syncCryptoHeadlines()]);
    if (results.every((r) => r.status === "rejected") && !newest) {
      return [];
    }
  }

  return prisma.newsEvent.findMany({
    orderBy: [{ startsAt: "desc" }, { createdAt: "desc" }],
    take: 30,
  });
}

export async function getLatestNewsProtection(): Promise<string | undefined> {
  const soon = await prisma.newsEvent.findFirst({
    where: {
      impact: "high",
      source: { in: ["faireconomy", "calendar"] },
      startsAt: { gte: new Date(Date.now() - 45 * 60_000), lte: new Date(Date.now() + 45 * 60_000) },
    },
    orderBy: { startsAt: "asc" },
  });
  return soon?.protection;
}
