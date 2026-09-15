import { NextResponse } from "next/server";
import { runSignalPipeline } from "@/lib/market/engine";
import { prisma } from "@/lib/db";
import { dbToSignal } from "@/lib/signal-map";
import { formatSignalTelegram, sendTelegram } from "@/lib/telegram";
import { withCronLock } from "@/lib/trading/lock";

function authorized(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && (q === secret || bearer === secret));
}

async function broadcastApproved() {
  const rows = await prisma.marketSignal.findMany({
    where: { approved: true, side: { not: "NO-TRADE" }, status: { in: ["active", "monitoring"] } },
    orderBy: { confidence: "desc" },
    take: 5,
  });
  if (!rows.length) return 0;
  const fresh = rows.filter((r) => Date.now() - r.publishedAt.getTime() <= r.validForMinutes * 60_000);
  const users = await prisma.user.findMany({
    where: { telegramChatId: { not: "" }, plan: { not: "free" }, notify: { contains: "telegram" } },
  });
  for (const user of users) {
    const filtered = fresh.filter((r) => r.confidence >= user.minConfidence).slice(0, 3).map((r) => dbToSignal(r));
    if (!filtered.length) continue;
    await sendTelegram(user.telegramChatId, filtered.map(formatSignalTelegram).join("\n\n———\n\n"));
  }
  return users.length;
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await withCronLock("cron-signals", 120_000, async () => {
    const pipeline = await runSignalPipeline();
    const telegram = await broadcastApproved();
    // Execution stays on /api/cron/trades to avoid double-entry races
    return { count: pipeline.signals.length, telegram, btc: pipeline.btcClose };
  });
  return NextResponse.json({ ok: true, result });
}
