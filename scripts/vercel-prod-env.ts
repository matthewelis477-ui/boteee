/**
 * Sync critical env vars to Vercel Production only (removes preview/development copies).
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const p = resolve(process.cwd(), ".env");
  const out: Record<string, string> = {};
  if (!existsSync(p)) throw new Error("Missing .env");
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[k] = v;
  }
  return out;
}

function rm(name: string, target: string) {
  try {
    execSync(`npx vercel env rm ${name} ${target} -y`, { stdio: "ignore" });
  } catch {
    /* none */
  }
}

function addProd(name: string, value: string) {
  if (!value) return;
  rm(name, "production");
  rm(name, "preview");
  rm(name, "development");
  const r = spawnSync(`npx vercel env add ${name} production`, {
    shell: true,
    encoding: "utf8",
    input: value,
  });
  if (r.status !== 0) console.warn(name, r.stderr || r.stdout);
  else console.log("production:", name);
}

const env = loadEnv();
const keys = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "CREDENTIALS_ENCRYPTION_KEY",
  "CRON_SECRET",
  "ADMIN_EMAIL",
  "ADMIN_PASSWORD",
  "ACTIVE_STRATEGY",
  "BINANCE_TESTNET",
  "LIVE_TRADING_ENABLED",
  "CRYPTO_USDT_NETWORK",
  "CRYPTO_USDT_ADDRESS",
  "EMAIL_FROM",
  "APP_URL",
] as const;

for (const k of keys) addProd(k, env[k] || "");
console.log("Done. Deploy with: npx vercel deploy --prod --yes");
