import { NextResponse } from "next/server";
import { hashPassword, planAmount, readUser, setSessionCookie, signToken, toProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkoutDays, grantPlan, issuePaidCode, requireUsdtAddress } from "@/lib/billing";
import { invoiceCreatedEmail, sendEmail } from "@/lib/email";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { notifyAdmin } from "@/lib/telegram";

async function ensureUser(body: { email?: string; password?: string; name?: string }) {
  let user = await readUser();
  if (user) return user;
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "Trader").trim();
  if (!email || password.length < 8) {
    throw new Error("Sign in or provide email and password (8+ characters) to checkout.");
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw new Error("That email already has an account. Log in first.");
  user = await prisma.user.create({ data: { email, passwordHash: await hashPassword(password), name } });
  await setSessionCookie(await signToken(user));
  try {
    const { notifyWelcome } = await import("@/lib/notices");
    await notifyWelcome(user.id, user.name);
  } catch {
    /* non-blocking */
  }
  return user;
}

export async function POST(req: Request) {
  try {
    const rl = rateLimit(clientKey(req, "checkout"), 10, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many checkout attempts." }, { status: 429 });

    const body = await req.json();
    const plan = String(body.plan || "pro");
    const interval = body.interval === "yearly" ? "yearly" : "monthly";
    const { ensurePlatformConfig, getPlatform } = await import("@/lib/platform-config");
    await ensurePlatformConfig();
    const network = String(body.network || getPlatform("crypto_usdt_network") || "TRC20");

    if (plan === "free") {
      const user = await ensureUser(body);
      const updated = await grantPlan(user, "free", 365, "BOTEE-FREE", "code");
      return NextResponse.json({ ok: true, user: toProfile(updated) });
    }

    const address = await requireUsdtAddress();
    const user = await ensureUser(body);
    const amount = planAmount(plan, interval);
    const days = checkoutDays(interval);
    const code = await issuePaidCode(plan, days, `${plan} ${interval} usdt`);
    const cryptoRef = `BOTEE-${code.slice(-6)}`;

    const invoice = await prisma.invoice.create({
      data: {
        userId: user.id,
        email: user.email,
        plan,
        interval,
        amountUsd: amount,
        method: "usdt",
        network,
        status: "pending",
        activationCode: code,
        cryptoRef,
      },
    });

    void notifyAdmin(
      `<b>New USDT invoice</b>\n${user.email}\n${plan} ${interval} · $${amount}\nRef: ${cryptoRef}\nInvoice: ${invoice.id}`,
    );

    const payUrl = `${getPlatform("app_url") || ""}/checkout/usdt?id=${invoice.id}`;
    const mail = invoiceCreatedEmail({
      name: user.name,
      plan,
      amount,
      ref: cryptoRef,
      payUrl,
    });
    void sendEmail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      template: "invoice_created",
      meta: { invoiceId: invoice.id },
    });

    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      cryptoRef,
      amountUsd: amount,
      network,
      address,
      payUrl: `/checkout/usdt?id=${invoice.id}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Checkout failed" }, { status: 400 });
  }
}
