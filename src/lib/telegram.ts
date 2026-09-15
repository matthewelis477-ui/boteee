import type { Signal } from "./types";
import { ensurePlatformConfig, getPlatform } from "@/lib/platform-config";

/** Shared Telegram bot username validation for deep links. */
export function telegramBotUsername() {
  const raw = (getPlatform("telegram_bot_username") || "").trim().replace(/^@/, "");
  const blocked = new Set(["", "yourbotusername", "boteeassistantbot", "boteebot"]);
  if (!raw || blocked.has(raw.toLowerCase())) return "";
  if (!/^[A-Za-z0-9_]{5,32}$/.test(raw)) return "";
  return raw;
}

export function telegramDeepLink(code: string) {
  const bot = telegramBotUsername();
  if (!bot) return "";
  return `https://t.me/${bot}?start=${code}`;
}

export async function sendTelegram(chatId: string, text: string) {
  await ensurePlatformConfig();
  const token = getPlatform("telegram_bot_token");
  if (!token || !chatId) return { ok: false as const, skipped: true };
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error("telegram", body);
    return { ok: false as const, skipped: false };
  }
  return { ok: true as const, skipped: false };
}

export function formatSignalTelegram(s: Signal) {
  if (s.side === "NO-TRADE") {
    return `<b>Botee · NO TRADE</b>\n${s.asset}\n${s.why.summary}`;
  }
  return [
    `<b>Botee · ${s.side}</b>`,
    `${s.asset} · ${s.exchange}`,
    `Entry: ${s.entryLow} – ${s.entryHigh}`,
    `Stop: ${s.stopLoss} · Targets: ${s.targets.join(" / ")}`,
    `Confidence ${s.confidence}% · Risk ${s.risk}`,
    s.why.summary,
  ].join("\n");
}

export async function notifyAdmin(text: string) {
  await ensurePlatformConfig();
  const chat = getPlatform("telegram_admin_chat_id") || "";
  return sendTelegram(chat, text);
}
