import { prisma } from "@/lib/db";

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  template: string;
  meta?: unknown;
}) {
  const key = process.env.RESEND_API_KEY || "";
  const from = process.env.EMAIL_FROM || "Botee <onboarding@resend.dev>";

  if (!key) {
    await prisma.emailLog.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        template: input.template,
        status: "skipped_no_key",
        metaJson: JSON.stringify(input.meta || {}),
      },
    });
    console.info("[email:skipped]", input.to, input.subject);
    return { ok: false as const, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html }),
    });
    const status = res.ok ? "sent" : "failed";
    await prisma.emailLog.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        template: input.template,
        status,
        metaJson: JSON.stringify({ ...(typeof input.meta === "object" ? input.meta : {}), http: res.status }),
      },
    });
    return { ok: res.ok, skipped: false as const };
  } catch (e) {
    await prisma.emailLog.create({
      data: {
        toEmail: input.to,
        subject: input.subject,
        template: input.template,
        status: "failed",
        metaJson: JSON.stringify({ error: e instanceof Error ? e.message : "send failed" }),
      },
    });
    return { ok: false as const, skipped: false };
  }
}

export function invoiceCreatedEmail(opts: { name: string; plan: string; amount: number; ref: string; payUrl: string }) {
  return {
    subject: `Botee invoice · ${opts.plan} $${opts.amount}`,
    html: `<p>Hi ${opts.name},</p>
<p>Your invoice for <b>${opts.plan}</b> is ready.</p>
<p>Amount: <b>$${opts.amount} USDT (TRC20)</b><br/>Reference: <code>${opts.ref}</code></p>
<p><a href="${opts.payUrl}">Open payment page</a></p>
<p>Send the exact amount. After payment, paste your transaction ID on the payment page. If anything looks off, contact support.</p>`,
  };
}
