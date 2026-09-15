import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ensurePlatformConfig } from "@/lib/platform-config";
import { telegramBotUsername, telegramDeepLink } from "@/lib/telegram";

export async function POST() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensurePlatformConfig();
  const bot = telegramBotUsername();
  if (!bot) {
    return NextResponse.json(
      {
        error: "Telegram is not connected yet. Please try again later or contact support.",
        configured: false,
      },
      { status: 503 },
    );
  }

  const code = randomBytes(8).toString("hex");
  await prisma.user.update({ where: { id: user.id }, data: { telegramLinkCode: code } });
  return NextResponse.json({
    code,
    url: telegramDeepLink(code),
    configured: true,
    linked: Boolean(user.telegramChatId),
    chatId: user.telegramChatId || null,
  });
}

export async function DELETE() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await prisma.user.update({ where: { id: user.id }, data: { telegramChatId: "", telegramLinkCode: "" } });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensurePlatformConfig();
  const bot = telegramBotUsername();
  return NextResponse.json({
    configured: Boolean(bot),
    linked: Boolean(user.telegramChatId),
    bot: bot || null,
  });
}
