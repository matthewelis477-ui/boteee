import { prisma } from "./db";
import { planAmount } from "./auth";
import type { User } from "@prisma/client";
import { sendTelegram } from "./telegram";
import { ensurePlatformConfig, getPlatform } from "@/lib/platform-config";

export async function grantPlan(user: User, plan: string, days: number, code: string, provider: string) {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + days);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { plan, activationCode: code, expiresAt },
  });
  await prisma.subscription.create({
    data: { userId: user.id, plan, interval: days >= 360 ? "yearly" : "monthly", status: "active", provider },
  });
  return updated;
}

export async function redeemCode(user: User, raw: string) {
  const code = raw.trim().toUpperCase();
  const row = await prisma.activationCode.findUnique({ where: { code } });
  if (!row || !row.active) return { error: "That activation code is not valid." };
  if (row.redeemedCount >= row.maxRedemptions) return { error: "This code has reached its redemption limit." };
  await prisma.activationCode.update({
    where: { id: row.id },
    data: { redeemedCount: { increment: 1 } },
  });
  const updated = await grantPlan(user, row.plan, row.days, code, "code");
  return { user: updated, label: row.label };
}

export function makeCode(plan: string) {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PAY-${plan.toUpperCase()}-${rand}`;
}

export async function issuePaidCode(plan: string, days: number, label: string) {
  const code = makeCode(plan);
  await prisma.activationCode.create({
    data: { code, plan, days, label, maxRedemptions: 1 },
  });
  return code;
}

export function checkoutDays(interval: string) {
  return interval === "yearly" ? 365 : 30;
}

export async function markInvoicePaid(invoiceId: string, txHash: string | null, source: "watcher" | "admin") {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { error: "Invoice not found" as const };
  if (invoice.status === "paid") {
    const user = invoice.userId ? await prisma.user.findUnique({ where: { id: invoice.userId } }) : null;
    return { invoice, user, alreadyPaid: true as const };
  }
  if (txHash) {
    const clash = await prisma.invoice.findFirst({ where: { txHash, NOT: { id: invoiceId } } });
    if (clash) return { error: "This transaction hash was already used." as const };
  }
  const user = invoice.userId ? await prisma.user.findUnique({ where: { id: invoice.userId } }) : null;
  if (!user) return { error: "User missing" as const };

  const updatedInvoice = await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "paid",
      txHash: txHash || invoice.txHash,
      paidAt: new Date(),
      paidSource: source,
    },
  });

  const updatedUser = await grantPlan(
    user,
    invoice.plan,
    checkoutDays(invoice.interval),
    invoice.activationCode || "USDT",
    "usdt",
  );

  if (updatedUser.telegramChatId) {
    void sendTelegram(
      updatedUser.telegramChatId,
      `<b>Botee access activated</b>\nPlan: ${updatedUser.plan}\nPaid via ${source}. Open your workspace and finish setup.`,
    );
  }

  return { invoice: updatedInvoice, user: updatedUser, alreadyPaid: false as const };
}

export async function requireUsdtAddress() {
  await ensurePlatformConfig();
  const address = getPlatform("crypto_usdt_address") || "";
  if (!address || address.toLowerCase().includes("your")) {
    throw new Error("Deposit address is not configured. Set it in Admin → Launch config.");
  }
  return address;
}

export { planAmount };
