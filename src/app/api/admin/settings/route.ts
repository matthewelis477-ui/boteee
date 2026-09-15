import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import {
  getPlatform,
  getPlatformPublicStatus,
  savePlatformSettings,
  telegramApi,
  ensurePlatformConfig,
  type PlatformSettingsPatch,
} from "@/lib/platform-config";
import { sendTelegram } from "@/lib/telegram";

async function requireAdmin() {
  const user = await readUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await ensurePlatformConfig(true);
  const status = await getPlatformPublicStatus();

  let webhook: { url?: string; pending_update_count?: number; last_error_message?: string } | null = null;
  if (status.telegram.tokenSet) {
    try {
      webhook = (await telegramApi("getWebhookInfo")) as typeof webhook;
    } catch {
      webhook = null;
    }
  }

  return NextResponse.json({ ...status, webhook });
}

export async function PATCH(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as PlatformSettingsPatch & {
    confirmLive?: boolean;
  };

  if (body.live_trading_enabled === true || body.live_trading_enabled === "1" || body.live_trading_enabled === "true") {
    if (!body.confirmLive) {
      return NextResponse.json(
        { error: "Enabling live trading requires confirmLive: true. Keep testnet on until you are ready." },
        { status: 400 },
      );
    }
  }

  if (body.telegram_bot_username) {
    const raw = String(body.telegram_bot_username).trim().replace(/^@/, "");
    const blocked = new Set(["yourbotusername", "boteeassistantbot", "boteebot"]);
    if (blocked.has(raw.toLowerCase()) || !/^[A-Za-z0-9_]{5,32}$/.test(raw)) {
      return NextResponse.json({ error: "Enter a real BotFather username (no @)." }, { status: 400 });
    }
  }

  const status = await savePlatformSettings(body, user.email);
  return NextResponse.json({ ok: true, ...status });
}

export async function POST(req: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { action?: string };
  await ensurePlatformConfig(true);

  if (body.action === "register_webhook") {
    const appUrl = (getPlatform("app_url") || "").replace(/\/$/, "");
    if (!appUrl || appUrl.includes("localhost")) {
      return NextResponse.json(
        {
          error:
            "Set a public App URL first (https://your-domain.com). Telegram cannot reach localhost webhooks.",
        },
        { status: 400 },
      );
    }
    const url = `${appUrl}/api/telegram/webhook`;
    await telegramApi("setWebhook", { url, drop_pending_updates: false });
    const info = await telegramApi("getWebhookInfo");
    return NextResponse.json({ ok: true, url, webhook: info });
  }

  if (body.action === "delete_webhook") {
    await telegramApi("deleteWebhook", { drop_pending_updates: false });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "test_telegram") {
    const chat = getPlatform("telegram_admin_chat_id");
    if (!chat) return NextResponse.json({ error: "Set Admin chat ID first." }, { status: 400 });
    const result = await sendTelegram(chat, "<b>Botee</b>\nAdmin test message. Telegram is connected.");
    if (!result.ok) return NextResponse.json({ error: "Send failed. Check token and chat ID." }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "webhook_info") {
    const info = await telegramApi("getWebhookInfo");
    return NextResponse.json({ ok: true, webhook: info });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
