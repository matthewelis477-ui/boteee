/**
 * One-shot admin/payment updater.
 * Usage:
 *   set ADMIN_EMAIL=... ADMIN_PASSWORD=... CRYPTO_USDT_ADDRESS=... CRYPTO_USDT_NETWORK=BEP20
 *   npx tsx scripts/update-admin.ts
 *
 * Reads values from env / .env — does not hardcode secrets.
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const p = resolve(process.cwd(), ".env");
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

function setEnv(key: string, value: string) {
  const p = resolve(process.cwd(), ".env");
  let t = existsSync(p) ? readFileSync(p, "utf8") : "";
  const line = `${key}="${value}"`;
  const re = new RegExp(`^${key}=.*$`, "m");
  t = re.test(t) ? t.replace(re, line) : `${t.trimEnd()}\n${line}\n`;
  writeFileSync(p, t);
  process.env[key] = value;
}

async function main() {
  loadEnv();
  const email = (process.env.ADMIN_EMAIL || "").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  const address = process.env.CRYPTO_USDT_ADDRESS || "";
  const network = process.env.CRYPTO_USDT_NETWORK || "BEP20";
  const appUrl = process.env.APP_URL || "https://boteee-six.vercel.app";

  if (!email || !password || !address) {
    throw new Error("Set ADMIN_EMAIL, ADMIN_PASSWORD, CRYPTO_USDT_ADDRESS in .env first");
  }

  setEnv("APP_URL", appUrl);
  setEnv("CRYPTO_USDT_NETWORK", network);

  const prisma = new PrismaClient();
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.updateMany({
    where: { email: "admin@botee.local" },
    data: { role: "user" },
  });

  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      name: "Admin",
      role: "admin",
      plan: "elite",
      onboardingComplete: true,
      expiresAt: new Date(Date.now() + 3650 * 86400000),
    },
    update: {
      passwordHash,
      role: "admin",
      plan: "elite",
      onboardingComplete: true,
      name: "Admin",
    },
  });

  const settings: Record<string, string> = {
    app_url: appUrl,
    crypto_usdt_address: address,
    crypto_usdt_network: network,
    binance_testnet: "1",
    live_trading_enabled: "0",
  };
  for (const [key, value] of Object.entries(settings)) {
    await prisma.platformSetting.upsert({
      where: { key },
      create: { key, value, secret: false },
      update: { value },
    });
  }

  console.log("Admin updated:", email);
  console.log("Payments:", network, address.slice(0, 10) + "…");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
