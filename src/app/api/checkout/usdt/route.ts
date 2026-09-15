import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { requireUsdtAddress } from "@/lib/billing";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing invoice id" }, { status: 400 });
  const invoice = await prisma.invoice.findUnique({ where: { id } });
  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  const user = await readUser();
  const isOwner = user && invoice.userId === user.id;
  const isAdmin = user?.role === "admin";
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let address = "";
  try {
    address = await requireUsdtAddress();
  } catch {
    address = "";
  }

  const { ensurePlatformConfig, getPlatform } = await import("@/lib/platform-config");
  await ensurePlatformConfig();

  return NextResponse.json({
    invoice: {
      id: invoice.id,
      email: invoice.email,
      plan: invoice.plan,
      interval: invoice.interval,
      amountUsd: invoice.amountUsd,
      network: invoice.network,
      status: invoice.status,
      cryptoRef: invoice.cryptoRef,
      txHash: invoice.txHash,
      createdAt: invoice.createdAt,
      paidSource: invoice.paidSource,
    },
    address,
    network: invoice.network || getPlatform("crypto_usdt_network") || "BEP20",
  });
}
