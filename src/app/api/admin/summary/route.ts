import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await readUser();
  if (user?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { email: true, plan: true, role: true, expiresAt: true, createdAt: true },
  });
  const invoices = await prisma.invoice.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      email: true,
      plan: true,
      status: true,
      method: true,
      amountUsd: true,
      cryptoRef: true,
      txHash: true,
    },
  });
  const runs = await prisma.pipelineRun.findMany({ orderBy: { ranAt: "desc" }, take: 5 });
  const tickets = await prisma.supportTicket.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, email: true, subject: true, status: true, txHash: true },
  });
  return NextResponse.json({ users, invoices, runs, tickets });
}
