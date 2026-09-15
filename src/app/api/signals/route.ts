import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUser } from "@/lib/auth";
import { runSignalPipeline } from "@/lib/market/engine";
import { dbToSignal } from "@/lib/signal-map";
import { formatSignalTelegram, sendTelegram } from "@/lib/telegram";
import { executeApprovedSignals } from "@/lib/trading/executor";

async function broadcastApproved() {
  const rows = await prisma.marketSignal.findMany({
    where: { approved: true, side: { not: "NO-TRADE" }, status: { in: ["active", "monitoring"] } },
    orderBy: { confidence: "desc" },
    take: 5,
  });
  if (!rows.length) return;
  const users = await prisma.user.findMany({
    where: {
      telegramChatId: { not: "" },
      plan: { not: "free" },
      notify: { contains: "telegram" },
    },
  });
  for (const user of users) {
    const filtered = rows
      .filter((r) => !(user.plan === "free" && r.marketType === "futures"))
      .filter((r) => r.confidence >= user.minConfidence)
      .slice(0, 3)
      .map((r) => dbToSignal(r));
    if (!filtered.length) continue;
    await sendTelegram(user.telegramChatId, filtered.map(formatSignalTelegram).join("\n\n———\n\n"));
  }
}

export async function GET() {
  const user = await readUser();
  const latest = await prisma.pipelineRun.findFirst({ orderBy: { ranAt: "desc" } });
  const stale = !latest || Date.now() - latest.ranAt.getTime() > 10 * 60 * 1000;
  // Never block the signals API on a full universe scan — cron owns heavy work.
  if (stale) {
    void runSignalPipeline().catch((e) => console.error("pipeline background", e));
  }

  const isAdmin = user?.role === "admin";
  const rows = await prisma.marketSignal.findMany({
    where: isAdmin ? undefined : { approved: true },
    orderBy: { publishedAt: "desc" },
    take: 40,
  });
  const delayed = !user || user.plan === "free";
  return NextResponse.json({
    source: rows.length ? "live" : "empty",
    generatedAt: latest?.ranAt || null,
    note: stale ? "Updating market ideas…" : "Markets updated",
    refreshing: stale,
    signals: rows.map((r) => dbToSignal(r, delayed && r.marketType === "futures")),
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  const body = await req.json().catch(() => ({}));

  if (body?.action === "approve" && body.signalId) {
    if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const note = String(body.note || "").trim();
    if (note.length < 8) {
      return NextResponse.json({ error: "QA note required (8+ chars) before approval." }, { status: 400 });
    }
    const signal = await prisma.marketSignal.findUnique({ where: { id: String(body.signalId) } });
    if (!signal) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
    if (Date.now() - signal.publishedAt.getTime() > signal.validForMinutes * 60_000) {
      await prisma.marketSignal.update({ where: { id: signal.id }, data: { status: "expired" } });
      return NextResponse.json({ error: "Signal expired (validForMinutes). Generate a fresh one." }, { status: 400 });
    }
    await prisma.signalQaNote.create({
      data: { signalId: signal.id, adminId: user.id, decision: "approve", note },
    });
    const row = await prisma.marketSignal.update({
      where: { id: signal.id },
      data: { approved: true },
    });
    try {
      await broadcastApproved();
      await executeApprovedSignals();
    } catch (e) {
      console.error("post-approve", e);
    }
    return NextResponse.json({ ok: true, signal: dbToSignal(row) });
  }

  if (user?.role !== "admin") {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = await runSignalPipeline();
  return NextResponse.json({ ok: true, count: result.signals.length, btc: result.btcClose, pause: result.pauseEvent });
}
