import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { VALID_CODES } from "../src/lib/data";
import { STRATEGIES } from "../src/lib/market/backtest";

const prisma = new PrismaClient();

const LESSONS = [
  {
    slug: "risk-first",
    titleEn: "Risk first",
    titleHi: "पहले जोखिम",
    bodyEn:
      "Size from stop distance and capital. A good signal with oversized risk still ruins accounts. Botee position size uses capital × risk% ÷ stop distance.",
    bodyHi:
      "स्टॉप दूरी और पूंजी से साइज़ करें। अच्छे सिग्नल पर भी ज़्यादा जोखिम खाता खराब करता है। Botee पूंजी × जोखिम% ÷ स्टॉप दूरी से साइज़ करता है।",
    sortOrder: 1,
  },
  {
    slug: "no-trade",
    titleEn: "Respect NO-TRADE",
    titleHi: "NO-TRADE का सम्मान",
    bodyEn:
      "Standing aside is a position. When EMAs conflict or news protection is on, skipping preserves expectancy better than forcing a trade.",
    bodyHi:
      "बाहर रहना भी एक पोज़िशन है। जब EMA उलझे हों या न्यूज़ प्रोटेक्शन हो, जबरदस्ती ट्रेड से बेहतर है इंतज़ार।",
    sortOrder: 2,
  },
  {
    slug: "fees-slippage",
    titleEn: "Fees and slippage",
    titleHi: "फीस और स्लिपेज",
    bodyEn:
      "Backtests on Botee deduct modeled fees and slippage. Live fills can be worse. Prefer setups where T1 R:R survives costs.",
    bodyHi:
      "Botee बैकटेस्ट में मॉडल फीस/स्लिपेज काटता है। लाइव और खराब हो सकता है। ऐसे सेटअप चुनें जहाँ T1 लागत के बाद भी खरा रहे।",
    sortOrder: 3,
  },
  {
    slug: "usdt-txid",
    titleEn: "USDT payments",
    titleHi: "USDT भुगतान",
    bodyEn:
      "Send exact TRC20 USDT. Paste TxID. Matching uses address + amount (±0.01). If it fails, open Support with invoice + TxID.",
    bodyHi:
      "सटीक TRC20 USDT भेजें। TxID पेस्ट करें। मैच पता + राशि (±0.01) से होता है। फेल हो तो Support में इनवॉइस + TxID भेजें।",
    sortOrder: 4,
  },
];

async function main() {
  for (const [code, meta] of Object.entries(VALID_CODES)) {
    await prisma.activationCode.upsert({
      where: { code },
      update: { plan: meta.plan, days: meta.days, label: meta.label, active: true },
      create: { code, plan: meta.plan, days: meta.days, label: meta.label },
    });
  }

  const activeKey = process.env.ACTIVE_STRATEGY || "v3-quality-mtf";
  for (const s of STRATEGIES) {
    await prisma.strategyVersion.upsert({
      where: { key: s.key },
      update: {
        name: s.key,
        description: `EMA ${s.emaFast}/${s.emaSlow} + RSI gates`,
        paramsJson: JSON.stringify(s),
        active: s.key === activeKey,
      },
      create: {
        key: s.key,
        name: s.key,
        description: `EMA ${s.emaFast}/${s.emaSlow} + RSI gates`,
        paramsJson: JSON.stringify(s),
        active: s.key === activeKey,
      },
    });
  }

  for (const lesson of LESSONS) {
    await prisma.lesson.upsert({
      where: { slug: lesson.slug },
      update: lesson,
      create: lesson,
    });
  }

  const email = (process.env.ADMIN_EMAIL || "admin@botee.local").toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "ChangeMeAdmin1";
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { role: "admin", plan: "elite", onboardingComplete: true },
    create: {
      email,
      passwordHash,
      name: "Admin",
      role: "admin",
      plan: "elite",
      onboardingComplete: true,
      expiresAt: new Date(Date.now() + 3650 * 86400000),
    },
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
