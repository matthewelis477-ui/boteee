/**
 * Deploy Botee to Vercel with env from local .env
 * Run: npx tsx scripts/vercel-deploy.ts
 */
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(process.cwd());

function loadEnv() {
  const p = resolve(ROOT, ".env");
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

function run(cmd: string, opts?: { input?: string }) {
  console.log(`> ${cmd}`);
  const r = spawnSync(cmd, {
    shell: true,
    cwd: ROOT,
    encoding: "utf8",
    input: opts?.input,
    env: process.env,
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`Command failed (${r.status}): ${cmd}`);
  return r.stdout || "";
}

function envExists(name: string) {
  try {
    const out = execSync("npx vercel env ls", { cwd: ROOT, encoding: "utf8" });
    return out.includes(name);
  } catch {
    return false;
  }
}

function upsertEnv(name: string, value: string, targets = ["production"]) {
  if (!value) {
    console.log(`skip empty ${name}`);
    return;
  }
  // Remove existing to avoid interactive conflict
  for (const t of targets) {
    try {
      execSync(`npx vercel env rm ${name} ${t} -y`, { cwd: ROOT, stdio: "ignore" });
    } catch {
      /* none */
    }
  }
  for (const t of targets) {
    const r = spawnSync(`npx vercel env add ${name} ${t}`, {
      shell: true,
      cwd: ROOT,
      encoding: "utf8",
      input: `${value}\n`,
    });
    if (r.status !== 0) {
      console.warn(`warn: env add ${name} ${t}:`, r.stderr || r.stdout);
    } else {
      console.log(`set ${name} → ${t}`);
    }
  }
}

async function main() {
  const env = loadEnv();
  console.log("Linking project…");
  run("npx vercel link --yes --project boteee");

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

  for (const k of keys) {
    upsertEnv(k, env[k] || "");
  }

  console.log("Deploying production…");
  const out = run("npx vercel deploy --prod --yes");
  const urlMatch = out.match(/https:\/\/[^\s]+\.vercel\.app/);
  const url = urlMatch?.[0];
  if (url) {
    console.log(`Production URL: ${url}`);
    upsertEnv("APP_URL", url);
    console.log("Redeploying with APP_URL…");
    run("npx vercel deploy --prod --yes");
  }
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
