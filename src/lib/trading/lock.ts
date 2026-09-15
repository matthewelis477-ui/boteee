import { prisma } from "@/lib/db";
import { randomBytes } from "node:crypto";

/** Acquire a short-lived exclusive cron lock (SQLite/Postgres safe enough for single-region). */
export async function withCronLock<T>(name: string, ttlMs: number, fn: () => Promise<T>): Promise<T | { skipped: true; reason: string }> {
  const holder = `${process.pid}-${randomBytes(4).toString("hex")}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const existing = await prisma.cronLock.findUnique({ where: { id: name } });
  if (existing && existing.expiresAt > now) {
    return { skipped: true, reason: `lock held by ${existing.holder}` };
  }

  try {
    if (!existing) {
      await prisma.cronLock.create({ data: { id: name, holder, expiresAt } });
    } else {
      const updated = await prisma.cronLock.updateMany({
        where: { id: name, expiresAt: { lte: now } },
        data: { holder, expiresAt },
      });
      if (updated.count === 0) return { skipped: true, reason: "lost race for lock" };
    }
  } catch {
    return { skipped: true, reason: "lock contention" };
  }

  try {
    return await fn();
  } finally {
    await prisma.cronLock.updateMany({
      where: { id: name, holder },
      data: { expiresAt: new Date(0) },
    });
  }
}
