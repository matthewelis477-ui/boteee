import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trades = await prisma.paperTrade.findMany({ where: { userId: user.id }, orderBy: { openedAt: "desc" } });
  return NextResponse.json({ equity: user.paperEquity, trades });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  if (body.action === "follow") {
    const trade = await prisma.paperTrade.create({
      data: {
        userId: user.id,
        signalId: String(body.signalId),
        asset: String(body.asset),
        side: String(body.side),
        entry: Number(body.entry),
        stop: Number(body.stop),
        sizeUsd: Number(body.sizeUsd || 250),
        status: "open",
        notes: String(body.notes || ""),
      },
    });
    return NextResponse.json({ trade });
  }
  if (body.action === "close") {
    const trade = await prisma.paperTrade.findFirst({ where: { id: String(body.id), userId: user.id } });
    if (!trade || trade.status !== "open") return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    const pnl = body.win ? 42 : -10;
    const updated = await prisma.paperTrade.update({
      where: { id: trade.id },
      data: { status: "closed", pnl, closedAt: new Date() },
    });
    await prisma.user.update({ where: { id: user.id }, data: { paperEquity: user.paperEquity + pnl } });
    return NextResponse.json({ trade: updated, equity: user.paperEquity + pnl });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
