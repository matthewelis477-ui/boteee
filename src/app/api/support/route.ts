import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyAdmin } from "@/lib/telegram";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role === "admin") {
    const tickets = await prisma.supportTicket.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
    return NextResponse.json({ tickets });
  }
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ tickets });
}

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "support"), 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many tickets." }, { status: 429 });

  const user = await readUser();
  const body = await req.json();
  const email = String(body.email || user?.email || "").trim().toLowerCase();
  const category = String(body.category || "payment");
  const subject = String(body.subject || "").trim();
  const ticketBody = String(body.body || "").trim();
  const invoiceId = body.invoiceId ? String(body.invoiceId) : null;
  const txHash = body.txHash ? String(body.txHash).trim() : null;

  if (!email || !subject || ticketBody.length < 10) {
    return NextResponse.json({ error: "Email, subject, and details (10+ chars) required." }, { status: 400 });
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user?.id,
      email,
      category,
      subject,
      body: ticketBody,
      invoiceId,
      txHash,
    },
  });

  void notifyAdmin(
    `<b>Support ticket</b>\n${email}\n${category}: ${subject}\nInvoice: ${invoiceId || "—"}\nTx: ${txHash || "—"}\n${ticketBody.slice(0, 280)}`,
  );

  return NextResponse.json({ ok: true, ticket });
}

export async function PATCH(req: Request) {
  const user = await readUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const id = String(body.id || "");
  const status = String(body.status || "resolved");
  const ticket = await prisma.supportTicket.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true, ticket });
}
