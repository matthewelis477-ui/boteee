import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function buildCoaching(input: {
  paper: { status: string; pnl: number; followedStop: boolean; side: string; asset: string }[];
  managed: { status: string; realizedPnl: number; asset: string; side: string; marketType: string }[];
  notes: string;
}) {
  const closedPaper = input.paper.filter((t) => t.status !== "open");
  const closedManaged = input.managed.filter((t) => t.status === "closed");
  const parts: string[] = [];

  if (!closedPaper.length && !closedManaged.length) {
    parts.push(
      "No closed paper or auto-trades yet. Log a few disciplined paper trades with stops so coaching can use your real results.",
    );
  } else {
    const paperPnl = closedPaper.reduce((s, t) => s + t.pnl, 0);
    const managedPnl = closedManaged.reduce((s, t) => s + t.realizedPnl, 0);
    const stopFollow = closedPaper.filter((t) => t.followedStop).length;
    const paperWins = closedPaper.filter((t) => t.pnl > 0).length;
    const managedWins = closedManaged.filter((t) => t.realizedPnl > 0).length;

    if (closedPaper.length) {
      parts.push(
        `Paper book: ${closedPaper.length} closed · PnL $${paperPnl.toFixed(0)} · wins ${paperWins}/${closedPaper.length}` +
          (closedPaper.length
            ? ` · stop followed on ${stopFollow}/${closedPaper.length}`
            : ""),
      );
      if (stopFollow < closedPaper.length * 0.7 && closedPaper.length >= 3) {
        parts.push("Stop discipline is slipping on paper trades. Size smaller until you follow the stop every time.");
      }
    }
    if (closedManaged.length) {
      parts.push(
        `Managed auto-trades: ${closedManaged.length} closed · realized $${managedPnl.toFixed(0)} · wins ${managedWins}/${closedManaged.length}.`,
      );
      const futuresLosses = closedManaged.filter((t) => t.marketType === "futures" && t.realizedPnl < 0).length;
      if (futuresLosses >= 3 && futuresLosses > managedWins) {
        parts.push("Futures losses are clustering. Consider lowering leverage or max open trades in Settings.");
      }
    }

    const byAsset = new Map<string, number>();
    for (const t of closedManaged) {
      byAsset.set(t.asset, (byAsset.get(t.asset) || 0) + t.realizedPnl);
    }
    for (const t of closedPaper) {
      byAsset.set(t.asset, (byAsset.get(t.asset) || 0) + t.pnl);
    }
    const ranked = [...byAsset.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked[0] && ranked[0][1] > 0) {
      parts.push(`Strongest asset lately: ${ranked[0][0]} (+$${ranked[0][1].toFixed(0)}).`);
    }
    if (ranked.length > 1 && ranked[ranked.length - 1][1] < 0) {
      parts.push(`Weakest asset lately: ${ranked[ranked.length - 1][0]} ($${ranked[ranked.length - 1][1].toFixed(0)}). Consider skipping it.`);
    }
  }

  if (/revenge|doubled|all in|fomo/i.test(input.notes)) {
    parts.push("Your notes mention emotional language. Pause new risk until the next session checklist is done.");
  } else if (input.notes.trim().length < 20) {
    parts.push("Add a short note after each trade (thesis, stop followed?). Patterns appear faster with honest logs.");
  }

  return parts.join(" ");
}

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [paper, managed, journal] = await Promise.all([
    prisma.paperTrade.findMany({ where: { userId: user.id }, orderBy: { id: "desc" }, take: 50 }),
    prisma.managedTrade.findMany({ where: { userId: user.id }, orderBy: { openedAt: "desc" }, take: 50 }),
    prisma.journalEntry.findUnique({ where: { userId: user.id } }),
  ]);

  const coaching = buildCoaching({
    paper,
    managed,
    notes: journal?.content || "",
  });

  return NextResponse.json({
    coaching,
    stats: {
      paperOpen: paper.filter((t) => t.status === "open").length,
      paperClosed: paper.filter((t) => t.status !== "open").length,
      managedOpen: managed.filter((t) => t.status !== "closed").length,
      managedClosed: managed.filter((t) => t.status === "closed").length,
    },
    updatedAt: new Date().toISOString(),
  });
}
