import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadBrokerCreds } from "@/lib/exchange/creds";
import { getSpotBalances } from "@/lib/exchange/binance";
import type { BinanceCreds } from "@/lib/exchange/binance";

async function liveMarks(assets: string[]) {
  const symbols = [...new Set(assets.map((a) => `${a.replace(/USDT$/i, "").toUpperCase()}USDT`))];
  if (!symbols.length) return {} as Record<string, number>;
  try {
    const url =
      "https://data-api.binance.vision/api/v3/ticker/price?symbols=" +
      encodeURIComponent(JSON.stringify(symbols));
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return {} as Record<string, number>;
    const rows = (await res.json()) as { symbol: string; price: string }[];
    const out: Record<string, number> = {};
    for (const r of rows) {
      const base = r.symbol.replace(/USDT$/, "");
      out[base] = Number(r.price);
      out[r.symbol] = Number(r.price);
    }
    return out;
  } catch {
    return {} as Record<string, number>;
  }
}

function valueHoldings(holdings: { id: string; asset: string; amount: number; avgPrice: number }[], marks: Record<string, number>) {
  return holdings.map((r) => {
    const key = r.asset.toUpperCase().replace(/\/USDT$/, "").replace(/USDT$/, "");
    const px = marks[key] ?? marks[`${key}USDT`] ?? r.avgPrice;
    return {
      ...r,
      mark: px,
      value: r.amount * px,
      pnl: (px - r.avgPrice) * r.amount,
      live: marks[key] != null || marks[`${key}USDT`] != null,
    };
  });
}

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const holdings = await prisma.holding.findMany({ where: { userId: user.id } });
  const journal = await prisma.journalEntry.findUnique({ where: { userId: user.id } });
  const marks = await liveMarks(holdings.map((h) => h.asset));
  const valued = valueHoldings(holdings, marks);
  return NextResponse.json({
    holdings,
    valued,
    marks,
    journal: journal?.content || "",
    updatedAt: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.syncExchange) {
    const creds = await loadBrokerCreds(user.id, "binance_spot");
    if (!creds) {
      return NextResponse.json(
        { error: "Connect Binance Spot (trade-only key) in Settings to sync balances." },
        { status: 400 },
      );
    }
    const balances = await getSpotBalances(creds as BinanceCreds);
    const marks = await liveMarks(balances.map((b) => b.asset));
    let upserted = 0;
    for (const b of balances) {
      if (b.asset === "USDT" || b.free + b.locked < 1e-8) continue;
      const amount = b.free + b.locked;
      const mark = marks[b.asset] ?? 0;
      if (mark * amount < 5) continue; // dust
      const existing = await prisma.holding.findFirst({
        where: { userId: user.id, asset: b.asset },
      });
      if (existing) {
        await prisma.holding.update({
          where: { id: existing.id },
          data: { amount, avgPrice: existing.avgPrice || mark },
        });
      } else {
        await prisma.holding.create({
          data: { userId: user.id, asset: b.asset, amount, avgPrice: mark || 0 },
        });
      }
      upserted += 1;
    }
    const holdings = await prisma.holding.findMany({ where: { userId: user.id } });
    const valued = valueHoldings(holdings, await liveMarks(holdings.map((h) => h.asset)));
    return NextResponse.json({ ok: true, upserted, holdings, valued });
  }

  if (body.holding) {
    const holding = await prisma.holding.create({
      data: {
        userId: user.id,
        asset: String(body.holding.asset).toUpperCase().replace(/\/USDT$/, ""),
        amount: Number(body.holding.amount),
        avgPrice: Number(body.holding.avgPrice),
      },
    });
    return NextResponse.json({ holding });
  }

  if (typeof body.journal === "string") {
    const journal = await prisma.journalEntry.upsert({
      where: { userId: user.id },
      create: { userId: user.id, content: body.journal },
      update: { content: body.journal },
    });
    return NextResponse.json({ journal: journal.content });
  }

  if (body.deleteHoldingId) {
    await prisma.holding.deleteMany({ where: { id: String(body.deleteHoldingId), userId: user.id } });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
