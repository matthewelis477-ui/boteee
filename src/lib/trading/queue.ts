import { prisma } from "@/lib/db";
import { notifyAdmin } from "@/lib/telegram";

export async function enqueueTradeJob(input: {
  kind: string;
  userId: string;
  tradeId?: string;
  signalId?: string;
  payload: unknown;
  delayMs?: number;
}) {
  // Dedupe: avoid stacking identical pending jobs for same trade+kind
  if (input.tradeId) {
    const existing = await prisma.tradeJob.findFirst({
      where: {
        tradeId: input.tradeId,
        kind: input.kind,
        status: { in: ["pending", "running"] },
      },
    });
    if (existing) return existing;
  }

  return prisma.tradeJob.create({
    data: {
      kind: input.kind,
      userId: input.userId,
      tradeId: input.tradeId,
      signalId: input.signalId,
      payloadJson: JSON.stringify(input.payload),
      runAfter: new Date(Date.now() + (input.delayMs || 0)),
      status: "pending",
    },
  });
}

export async function processTradeJobs(handler: (job: {
  id: string;
  kind: string;
  userId: string;
  tradeId: string | null;
  signalId: string | null;
  payload: unknown;
  attempts: number;
}) => Promise<void>) {
  const due = await prisma.tradeJob.findMany({
    where: { status: "pending", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 25,
  });

  let ok = 0;
  let failed = 0;
  for (const job of due) {
    await prisma.tradeJob.update({ where: { id: job.id }, data: { status: "running", attempts: { increment: 1 } } });
    try {
      await handler({
        id: job.id,
        kind: job.kind,
        userId: job.userId,
        tradeId: job.tradeId,
        signalId: job.signalId,
        payload: JSON.parse(job.payloadJson),
        attempts: job.attempts + 1,
      });
      await prisma.tradeJob.update({ where: { id: job.id }, data: { status: "done", lastError: null } });
      ok += 1;
    } catch (e) {
      const message = e instanceof Error ? e.message : "job failed";
      const attempts = job.attempts + 1;
      const retry = attempts < job.maxAttempts;
      await prisma.tradeJob.update({
        where: { id: job.id },
        data: {
          status: retry ? "pending" : "failed",
          lastError: message,
          runAfter: new Date(Date.now() + Math.min(60_000, 2000 * 2 ** attempts)),
        },
      });
      failed += 1;
      if (!retry) {
        void notifyAdmin(
          `<b>Trade job FAILED</b>\n${job.kind}\ntrade=${job.tradeId || "—"}\n${message}\nAttempts ${attempts}`,
        );
      }
    }
  }
  return { processed: due.length, ok, failed };
}

export async function alertFailedJobs() {
  const failed = await prisma.tradeJob.count({
    where: { status: "failed", updatedAt: { gte: new Date(Date.now() - 15 * 60_000) } },
  });
  const unprotected = await prisma.managedTrade.count({
    where: { status: { in: ["open", "partial"] }, protectStatus: "unprotected" },
  });
  if (failed || unprotected) {
    void notifyAdmin(`<b>Trade health</b>\nFailed jobs (15m): ${failed}\nUnprotected open: ${unprotected}`);
  }
  return { failed, unprotected };
}
