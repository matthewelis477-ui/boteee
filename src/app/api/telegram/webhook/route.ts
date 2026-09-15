import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { ensurePlatformConfig } from "@/lib/platform-config";
import { sendTelegram, telegramBotUsername, telegramDeepLink } from "@/lib/telegram";
import { randomBytes } from "node:crypto";

type TgUpdate = {
  message?: {
    chat?: { id: number };
    text?: string;
    from?: { id: number; username?: string };
  };
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "1") {
    await ensurePlatformConfig();
    return NextResponse.json({
      ok: true,
      configured: Boolean(telegramBotUsername()),
      bot: telegramBotUsername() || null,
    });
  }
  return NextResponse.json({ error: "Use POST for webhook" }, { status: 405 });
}

export async function POST(req: Request) {
  await ensurePlatformConfig();
  const url = new URL(req.url);
  if (url.searchParams.get("mint") === "1") {
    const body = await req.json().catch(() => ({}));
    const userId = String((body as { userId?: string }).userId || "");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    const code = randomBytes(8).toString("hex");
    await prisma.user.update({ where: { id: userId }, data: { telegramLinkCode: code } });
    return NextResponse.json({ code, url: telegramDeepLink(code) });
  }

  const update = (await req.json()) as TgUpdate;
  const chatId = update.message?.chat?.id;
  const text = (update.message?.text || "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  if (text.startsWith("/start")) {
    const payload = text.split(/\s+/)[1] || "";
    if (!payload) {
      await sendTelegram(
        String(chatId),
        "Welcome to Botee.\nOpen Settings in the app and tap <b>Connect Telegram</b> to get your personal link, then open that link and tap Start.",
      );
      return NextResponse.json({ ok: true });
    }

    const user = await prisma.user.findFirst({ where: { telegramLinkCode: payload } });
    if (!user) {
      await sendTelegram(String(chatId), "That link is invalid or expired. Generate a new one from Botee Settings.");
      return NextResponse.json({ ok: true });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { telegramChatId: String(chatId), telegramLinkCode: "" },
    });
    await sendTelegram(
      String(chatId),
      `<b>Connected</b>\nHi ${user.name}. Your Botee account is linked. You’ll receive signal and trade alerts here.`,
    );
    return NextResponse.json({ ok: true });
  }

  if (text === "/status") {
    const user = await prisma.user.findFirst({ where: { telegramChatId: String(chatId) } });
    await sendTelegram(
      String(chatId),
      user
        ? `Connected as ${user.email}\nPlan: ${user.plan}\nAlerts: ${user.notify.includes("telegram") ? "on" : "off"}`
        : "Not connected. Use the link from Settings → Connect Telegram.",
    );
    return NextResponse.json({ ok: true });
  }

  if (text === "/help") {
    await sendTelegram(String(chatId), "Commands:\n/start - connect account\n/status - connection status\n/help");
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true });
}
