import { prisma } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";

export const PLATFORM_KEYS = [
  "app_url",
  "telegram_bot_token",
  "telegram_bot_username",
  "telegram_admin_chat_id",
  "crypto_usdt_address",
  "crypto_usdt_network",
  "trongrid_api_key",
  "binance_testnet",
  "live_trading_enabled",
] as const;

export type PlatformKey = (typeof PLATFORM_KEYS)[number];

const SECRET_KEYS = new Set<PlatformKey>(["telegram_bot_token", "trongrid_api_key"]);

type Cache = Record<string, string>;

let cache: Cache | null = null;
let cacheAt = 0;
const TTL_MS = 8_000;

function envDefaults(): Cache {
  return {
    app_url: process.env.APP_URL || "",
    telegram_bot_token: process.env.TELEGRAM_BOT_TOKEN || "",
    telegram_bot_username: process.env.TELEGRAM_BOT_USERNAME || "",
    telegram_admin_chat_id: process.env.TELEGRAM_ADMIN_CHAT_ID || "",
    crypto_usdt_address: process.env.CRYPTO_USDT_ADDRESS || "",
    crypto_usdt_network: process.env.CRYPTO_USDT_NETWORK || "TRC20",
    trongrid_api_key: process.env.TRONGRID_API_KEY || "",
    binance_testnet: process.env.BINANCE_TESTNET === "0" || process.env.BINANCE_TESTNET === "false" ? "0" : "1",
    live_trading_enabled:
      process.env.LIVE_TRADING_ENABLED === "1" || process.env.LIVE_TRADING_ENABLED === "true" ? "1" : "0",
  };
}

function isTruthy(v: string) {
  return v === "1" || v.toLowerCase() === "true" || v.toLowerCase() === "yes" || v.toLowerCase() === "on";
}

/** Sync peek: uses warm cache, else env (until ensurePlatformConfig runs). */
export function getPlatform(key: PlatformKey): string {
  if (cache && Date.now() - cacheAt < TTL_MS * 4) {
    return cache[key] ?? "";
  }
  return envDefaults()[key] ?? "";
}

export function isBinanceTestnetConfig() {
  return isTruthy(getPlatform("binance_testnet"));
}

export function isLiveTradingEnabled() {
  return isTruthy(getPlatform("live_trading_enabled"));
}

export async function ensurePlatformConfig(force = false) {
  if (!force && cache && Date.now() - cacheAt < TTL_MS) return cache;
  const merged: Cache = { ...envDefaults() };
  try {
    const rows = await prisma.platformSetting.findMany();
    for (const row of rows) {
      if (!row.value) continue;
      try {
        merged[row.key] = row.secret ? decryptSecret(row.value) : row.value;
      } catch {
        /* keep env fallback if decrypt fails */
      }
    }
  } catch {
    /* DB not ready — env only */
  }
  cache = merged;
  cacheAt = Date.now();
  return cache;
}

export function invalidatePlatformConfig() {
  cache = null;
  cacheAt = 0;
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export async function getPlatformPublicStatus() {
  const cfg = await ensurePlatformConfig(true);
  const username = (cfg.telegram_bot_username || "").trim().replace(/^@/, "");
  const blocked = new Set(["", "yourbotusername", "boteeassistantbot", "boteebot"]);
  const botOk = Boolean(username && !blocked.has(username.toLowerCase()) && /^[A-Za-z0-9_]{5,32}$/.test(username));
  const tokenOk = Boolean(cfg.telegram_bot_token);
  const address = cfg.crypto_usdt_address || "";
  const addressOk = Boolean(address && !address.toLowerCase().includes("your") && address.length >= 20);

  return {
    appUrl: cfg.app_url || "",
    telegram: {
      tokenSet: tokenOk,
      tokenMasked: tokenOk ? maskSecret(cfg.telegram_bot_token) : "",
      username: botOk ? username : "",
      usernameConfigured: botOk,
      adminChatId: cfg.telegram_admin_chat_id || "",
      ready: tokenOk && botOk,
    },
    payments: {
      address: addressOk ? address : "",
      addressConfigured: addressOk,
      network: cfg.crypto_usdt_network || "TRC20",
      trongridKeySet: Boolean(cfg.trongrid_api_key),
      trongridKeyMasked: cfg.trongrid_api_key ? maskSecret(cfg.trongrid_api_key) : "",
      ready: addressOk,
    },
    trading: {
      testnet: isTruthy(cfg.binance_testnet),
      liveEnabled: isTruthy(cfg.live_trading_enabled),
    },
  };
}

export type PlatformSettingsPatch = Partial<{
  app_url: string;
  telegram_bot_token: string;
  telegram_bot_username: string;
  telegram_admin_chat_id: string;
  crypto_usdt_address: string;
  crypto_usdt_network: string;
  trongrid_api_key: string;
  binance_testnet: boolean | string;
  live_trading_enabled: boolean | string;
}>;

function boolToFlag(v: boolean | string | undefined, fallback: string) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? "1" : "0";
  if (isTruthy(String(v))) return "1";
  if (v === "0" || String(v).toLowerCase() === "false" || String(v).toLowerCase() === "off") return "0";
  return fallback;
}

export async function savePlatformSettings(patch: PlatformSettingsPatch, updatedBy = "") {
  const writes: { key: PlatformKey; value: string; secret: boolean }[] = [];

  const put = (key: PlatformKey, value: string | null | undefined) => {
    if (value === undefined || value === null) return;
    // Empty string clears DB override (fall back to env) except we store empty to clear
    writes.push({ key, value: String(value).trim(), secret: SECRET_KEYS.has(key) });
  };

  put("app_url", patch.app_url);
  if (patch.telegram_bot_token !== undefined && patch.telegram_bot_token !== "") {
    put("telegram_bot_token", patch.telegram_bot_token);
  }
  put("telegram_bot_username", patch.telegram_bot_username?.replace(/^@/, ""));
  put("telegram_admin_chat_id", patch.telegram_admin_chat_id);
  put("crypto_usdt_address", patch.crypto_usdt_address);
  put("crypto_usdt_network", patch.crypto_usdt_network);
  if (patch.trongrid_api_key !== undefined && patch.trongrid_api_key !== "") {
    put("trongrid_api_key", patch.trongrid_api_key);
  }

  const testnet = boolToFlag(patch.binance_testnet, "1");
  if (testnet !== null) put("binance_testnet", testnet);
  const live = boolToFlag(patch.live_trading_enabled, "0");
  if (live !== null) put("live_trading_enabled", live);

  for (const w of writes) {
    const stored = w.secret && w.value ? encryptSecret(w.value) : w.value;
    await prisma.platformSetting.upsert({
      where: { key: w.key },
      create: { key: w.key, value: stored, secret: w.secret, updatedBy },
      update: { value: stored, secret: w.secret, updatedBy },
    });
  }

  invalidatePlatformConfig();
  return getPlatformPublicStatus();
}

export async function telegramApi(method: string, body?: Record<string, unknown>) {
  await ensurePlatformConfig();
  const token = getPlatform("telegram_bot_token");
  if (!token) throw new Error("Telegram bot token is not configured.");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = (await res.json()) as { ok: boolean; description?: string; result?: unknown };
  if (!data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}
