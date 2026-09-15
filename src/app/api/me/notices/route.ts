import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { notifyWelcome } from "@/lib/notices";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const notices = await prisma.userNotice.findMany({
    where: { userId: user.id, read: false },
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  return NextResponse.json({ notices });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.action === "welcome") {
    const existing = await prisma.userNotice.findFirst({
      where: { userId: user.id, kind: "welcome" },
    });
    if (!existing) {
      await notifyWelcome(user.id, user.name, user.telegramChatId);
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (body.all) {
    await prisma.userNotice.updateMany({ where: { userId: user.id, read: false }, data: { read: true } });
    return NextResponse.json({ ok: true });
  }

  const id = String(body.id || "");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  await prisma.userNotice.updateMany({
    where: { id, userId: user.id },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
