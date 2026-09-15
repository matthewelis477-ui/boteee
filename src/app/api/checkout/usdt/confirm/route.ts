import { NextResponse } from "next/server";
import { readUser, toProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { markInvoicePaid } from "@/lib/billing";
import { verifyUsdtPayment } from "@/lib/payments/usdt";
import { notifyAdmin } from "@/lib/telegram";

export async function POST(req: Request) {
  const actor = await readUser();
  const body = await req.json();
  const invoice = await prisma.invoice.findUnique({ where: { id: String(body.invoiceId || "") } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const isAdmin = actor?.role === "admin";
  const isOwner = actor && invoice.userId === actor.id;

  if (body.txHash && isOwner && invoice.status === "pending") {
    const txHash = String(body.txHash).trim();
    const verified = await verifyUsdtPayment(invoice.id, txHash);
    if (verified.ok) {
      return NextResponse.json({
        ok: true,
        status: "paid",
        user: "user" in verified && verified.user ? toProfile(verified.user) : null,
      });
    }
    void notifyAdmin(
      `<b>USDT tx submitted</b>\n${invoice.email}\n$${invoice.amountUsd} ${invoice.plan}\nTx: ${txHash}\nRef: ${invoice.cryptoRef}\nNote: ${verified.error}`,
    );
    return NextResponse.json({
      ok: true,
      status: "pending_review",
      error: verified.error,
      pending: "pending" in verified ? verified.pending : false,
    });
  }

  if (body.confirm) {
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admin can manually confirm USDT deposits." }, { status: 403 });
    }
    const result = await markInvoicePaid(invoice.id, body.txHash ? String(body.txHash).trim() : invoice.txHash, "admin");
    if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    if (result.user) {
      const { sendEmail } = await import("@/lib/email");
      void sendEmail({
        to: result.user.email,
        subject: `Botee payment confirmed · ${invoice.plan}`,
        template: "invoice_paid_admin",
        html: `<p>Hi ${result.user.name},</p><p>An admin confirmed your USDT payment for <b>${invoice.plan}</b> ($${invoice.amountUsd}).</p>`,
        meta: { invoiceId: invoice.id },
      });
    }
    return NextResponse.json({ ok: true, user: result.user ? toProfile(result.user) : null });
  }

  return NextResponse.json({ ok: true, status: invoice.status });
}
