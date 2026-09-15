/**
 * Botee smoke test — run with: npm run smoke
 * Checks env, DB, core libs, public market APIs, and local HTTP routes.
 * Does NOT place live Binance orders (needs real keys + LIVE_TRADING_ENABLED).
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

type Result = { name: string; ok: boolean; detail: string; warn?: boolean };

const results: Result[] = [];
const ROOT = process.cwd();
const BASE = process.env.SMOKE_BASE_URL || process.env.APP_URL || "http://localhost:3000";

function loadEnvFile() {
  const p = resolve(ROOT, ".env");
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name} — ${detail}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name} — ${detail}`);
}

function warn(name: string, detail: string) {
  results.push({ name, ok: true, detail, warn: true });
  console.warn(`  ! ${name} — ${detail}`);
}

async function check(name: string, fn: () => Promise<string> | string) {
  try {
    const detail = await fn();
    pass(name, detail);
  } catch (e) {
    fail(name, e instanceof Error ? e.message : String(e));
  }
}

async function httpGet(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...(init?.headers || {}) },
    signal: AbortSignal.timeout(25_000),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html ok for some pages */
  }
  return { res, text, json };
}

async function main() {
  console.log("\nBotee smoke test");
  console.log(`Base URL: ${BASE}\n`);
  loadEnvFile();

  // —— Env ——
  await check("env: DATABASE_URL", () => {
    if (!process.env.DATABASE_URL) throw new Error("missing DATABASE_URL");
    return process.env.DATABASE_URL.startsWith("file:") ? "sqlite file ok" : "set";
  });
  await check("env: AUTH_SECRET", () => {
    if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) throw new Error("AUTH_SECRET too short");
    return "present";
  });
  await check("env: CREDENTIALS_ENCRYPTION_KEY", () => {
    if (!process.env.CREDENTIALS_ENCRYPTION_KEY || process.env.CREDENTIALS_ENCRYPTION_KEY.length < 16) {
      throw new Error("CREDENTIALS_ENCRYPTION_KEY too short");
    }
    return "present";
  });
  await check("env: trading safety flags", () => {
    const testnet = process.env.BINANCE_TESTNET === "1" || process.env.BINANCE_TESTNET === "true";
    const live = process.env.LIVE_TRADING_ENABLED === "1" || process.env.LIVE_TRADING_ENABLED === "true";
    if (!testnet && live) return "LIVE mainnet enabled — be careful";
    if (testnet) return "BINANCE_TESTNET=1 (safe default)";
    return "testnet off, LIVE_TRADING_ENABLED off — auto-trade blocked on mainnet";
  });

  if (!process.env.TELEGRAM_BOT_TOKEN) warn("env: TELEGRAM_BOT_TOKEN", "empty — alerts skipped");
  else pass("env: TELEGRAM_BOT_TOKEN", "set");
  if (!process.env.RESEND_API_KEY) warn("env: RESEND_API_KEY", "empty — emails skipped");
  else pass("env: RESEND_API_KEY", "set");
  if (!process.env.CRYPTO_USDT_ADDRESS || process.env.CRYPTO_USDT_ADDRESS.includes("NotReal")) {
    warn("env: CRYPTO_USDT_ADDRESS", "placeholder — live USDT matching disabled");
  } else pass("env: CRYPTO_USDT_ADDRESS", "set");

  // —— Prisma ——
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  await check("db: connect", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return "connected";
  });
  await check("db: core tables", async () => {
    const [users, signals, strategies, lessons] = await Promise.all([
      prisma.user.count(),
      prisma.marketSignal.count(),
      prisma.strategyVersion.count(),
      prisma.lesson.count(),
    ]);
    return `users=${users} signals=${signals} strategies=${strategies} lessons=${lessons}`;
  });
  await check("db: trading tables", async () => {
    const [trades, jobs, locks] = await Promise.all([
      prisma.managedTrade.count(),
      prisma.tradeJob.count(),
      prisma.cronLock.count(),
    ]);
    return `managedTrades=${trades} jobs=${jobs} cronLocks=${locks}`;
  });

  // —— Libs ——
  await check("lib: strategy resolve", async () => {
    const { resolveActiveStrategy, STRATEGIES } = await import("../src/lib/market/backtest");
    const s = await resolveActiveStrategy();
    if (!STRATEGIES.some((x) => x.key === s.key) && !s.key) throw new Error("no strategy");
    return `active=${s.key} publish≥${s.minPublishConfidence} max=${s.maxSignalsPerRun}`;
  });

  await check("lib: indicators + backtest", async () => {
    const { ema, rsi, atr } = await import("../src/lib/market/indicators");
    const { getStrategy, runBacktest } = await import("../src/lib/market/backtest");
    const candles = Array.from({ length: 120 }, (_, i) => {
      const close = 100 + Math.sin(i / 8) * 3 + i * 0.05;
      return {
        openTime: Date.now() - (120 - i) * 3_600_000,
        open: close - 0.2,
        high: close + 0.5,
        low: close - 0.5,
        close,
        volume: 1000 + (i % 7) * 50,
      };
    });
    const closes = candles.map((c) => c.close);
    const e = ema(closes, 21);
    const r = rsi(closes, 14);
    const a = atr(candles, 14);
    if (!Number.isFinite(e) || !Number.isFinite(r) || !Number.isFinite(a)) throw new Error("indicator NaN");
    const bt = runBacktest(candles, getStrategy("v3-quality-mtf"));
    return `ema=${e.toFixed(2)} rsi=${r.toFixed(1)} atr=${a.toFixed(2)} bt.trades=${bt.trades} pf=${bt.profitFactor}`;
  });

  await check("lib: secrets roundtrip", async () => {
    const { encryptSecret, decryptSecret } = await import("../src/lib/crypto/secrets");
    const sample = "smoke-secret-value-123";
    const enc = encryptSecret(sample);
    const dec = decryptSecret(enc);
    if (dec !== sample) throw new Error("decrypt mismatch");
    return "encrypt/decrypt ok";
  });

  await check("lib: clientOrderId helper", async () => {
    const { makeClientOrderId } = await import("../src/lib/exchange/binance");
    const id = makeClientOrderId("en", "clxxxxxxxxsmoke01");
    if (id.length > 36) throw new Error(`too long: ${id.length}`);
    return id;
  });

  await check("market: public klines", async () => {
    const res = await fetch("https://data-api.binance.vision/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=5", {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`klines HTTP ${res.status}`);
    const j = (await res.json()) as unknown[];
    if (!Array.isArray(j) || j.length < 1) throw new Error("empty klines");
    return `${j.length} bars BTCUSDT 1h`;
  });

  await check("market: exchange filters", async () => {
    const { normalizeOrder } = await import("../src/lib/exchange/filters");
    const n = await normalizeOrder("spot", "BTCUSDT", 0.00123456, 65000);
    if (!(n.qty > 0)) throw new Error("qty invalid");
    return `BTCUSDT qty=${n.qty} tick=${n.tick} minNotional=${n.minNotional}`;
  });

  // —— HTTP (dev server) ——
  let serverUp = false;
  await check("http: server reachable", async () => {
    const { res, text } = await httpGet("/");
    if (!res.ok) throw new Error(`home ${res.status}`);
    if (!text.toLowerCase().includes("botee")) throw new Error("home HTML missing Botee brand");
    serverUp = true;
    return `GET / → ${res.status}`;
  });

  if (serverUp) {
    await check("http: pricing page", async () => {
      const { res } = await httpGet("/pricing");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return `GET /pricing → ${res.status}`;
    });
    await check("http: risk page", async () => {
      const { res } = await httpGet("/risk");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return `GET /risk → ${res.status}`;
    });
    await check("http: GET /api/signals", async () => {
      const { res, json } = await httpGet("/api/signals");
      if (!res.ok) throw new Error(`status ${res.status}`);
      const signals = (json as { signals?: unknown[] })?.signals;
      if (!Array.isArray(signals)) throw new Error("signals missing");
      return `${signals.length} signals · refreshing=${Boolean((json as { refreshing?: boolean }).refreshing)}`;
    });

    // Heavy pipeline is cron-owned; smoke only checks the route responds with auth
    if (process.env.CRON_SECRET) {
      await check("http: cron signals auth gate", async () => {
        const bad = await httpGet("/api/cron/signals");
        if (bad.res.status !== 403) throw new Error(`expected 403, got ${bad.res.status}`);
        return "403 without secret; full pipeline left to cron (too heavy for smoke)";
      });
    }
    await check("http: GET /api/scanner", async () => {
      const { res, json } = await httpGet("/api/scanner");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return json ? "scanner payload ok" : "empty ok";
    });
    await check("http: GET /api/news", async () => {
      const { res } = await httpGet("/api/news");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return `status ${res.status}`;
    });
    await check("http: auth guard /api/me", async () => {
      const { res, json } = await httpGet("/api/me");
      // unauthenticated should be 401 or user:null depending on implementation
      if (res.status === 401) return "401 unauthorized (expected)";
      if (res.ok && (json as { user?: unknown })?.user === null) return "user null (expected)";
      if (res.ok) return "session present (dev already logged in?)";
      throw new Error(`unexpected ${res.status}`);
    });
    await check("http: auth guard exchange-keys", async () => {
      const { res } = await httpGet("/api/me/exchange-keys");
      if (res.status === 401 || res.status === 403) return `${res.status} (expected without session/plan)`;
      if (res.ok) return "ok with session";
      throw new Error(`unexpected ${res.status}`);
    });
    await check("http: cron trades unauthorized", async () => {
      const { res } = await httpGet("/api/cron/trades");
      if (res.status !== 403) throw new Error(`expected 403, got ${res.status}`);
      return "403 without CRON_SECRET";
    });
    await check("http: telegram webhook health", async () => {
      const { res, json } = await httpGet("/api/telegram/webhook?health=1");
      if (!res.ok) throw new Error(`status ${res.status}`);
      return `bot=${(json as { bot?: string }).bot || "unset"}`;
    });
  }

  // Optional: authorized trades cron (does not require pipeline). Signals cron is intentionally not smoked end-to-end (universe scan is slow).
  if (serverUp && process.env.CRON_SECRET) {
    await check("http: cron trades authorized (dry)", async () => {
      const { res, json } = await httpGet(`/api/cron/trades?secret=${encodeURIComponent(process.env.CRON_SECRET!)}`);
      if (!res.ok) throw new Error(`status ${res.status} ${JSON.stringify(json)}`);
      const blocked = (json as { result?: { executed?: { blocked?: string } } })?.result?.executed?.blocked;
      return blocked ? `ok (auto-trade blocked: ${blocked})` : `ok ${JSON.stringify(json).slice(0, 120)}`;
    });
  }

  await prisma.$disconnect();

  const failed = results.filter((r) => !r.ok);
  const warnings = results.filter((r) => r.warn);
  console.log("\n—— Summary ——");
  console.log(`Passed: ${results.filter((r) => r.ok && !r.warn).length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length) {
    console.error("\nSmoke test FAILED. Fix the items above before calling this production-ready.");
    process.exit(1);
  }

  console.log("\nSmoke test PASSED.");
  console.log("Note: this does not place live Binance orders. Prove that on testnet keys before LIVE_TRADING_ENABLED=1.\n");
  process.exit(0);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(1);
});
