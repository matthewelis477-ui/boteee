import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trades = await prisma.managedTrade.findMany({
    where: { userId: user.id },
    orderBy: { openedAt: "desc" },
    take: 50,
    include: { events: { orderBy: { createdAt: "asc" }, take: 20 } },
  });
  return NextResponse.json({ trades });
}
