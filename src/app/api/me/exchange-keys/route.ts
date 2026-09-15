import { NextResponse } from "next/server";
import { readUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto/secrets";
import { validateVenueKey } from "@/lib/exchange/broker";
import { isVenueId, labelForVenue, venueMeta, VENUES, type VenueId } from "@/lib/exchange/venues";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await prisma.exchangeCredential.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      exchange: true,
      label: true,
      canTrade: true,
      canWithdraw: true,
      enabled: true,
      lastValidatedAt: true,
      createdAt: true,
    },
  });
  const prefs =
    (await prisma.tradingPrefs.findUnique({ where: { userId: user.id } })) ||
    (await prisma.tradingPrefs.create({
      data: { userId: user.id },
    }));
  return NextResponse.json({
    credentials: rows,
    prefs,
    venues: VENUES.map((v) => ({
      id: v.id,
      label: v.label,
      family: v.family,
      market: v.market,
      needsPassphrase: v.needsPassphrase,
      docsUrl: v.docsUrl,
      keyHints: v.keyHints,
    })),
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["pro", "elite", "institutional"].includes(user.plan)) {
    return NextResponse.json({ error: "Auto-trading credentials require Pro, Elite, or Institutional." }, { status: 403 });
  }

  const body = await req.json();
  const exchange = String(body.exchange || "");
  if (!isVenueId(exchange)) {
    return NextResponse.json({ error: "Unsupported exchange. Choose Binance, Bybit, or OKX." }, { status: 400 });
  }
  const venue = exchange as VenueId;
  const meta = venueMeta(venue)!;
  const apiKey = String(body.apiKey || "").trim();
  const apiSecret = String(body.apiSecret || "").trim();
  const passphrase = String(body.passphrase || "").trim();
  if (!apiKey || !apiSecret) return NextResponse.json({ error: "API key and secret required." }, { status: 400 });
  if (meta.needsPassphrase && !passphrase) {
    return NextResponse.json({ error: "OKX requires an API passphrase." }, { status: 400 });
  }

  try {
    const perms = await validateVenueKey(venue, { apiKey, apiSecret, passphrase: passphrase || undefined });
    const row = await prisma.exchangeCredential.upsert({
      where: { userId_exchange: { userId: user.id, exchange: venue } },
      create: {
        userId: user.id,
        exchange: venue,
        apiKeyEnc: encryptSecret(apiKey),
        apiSecretEnc: encryptSecret(apiSecret),
        passphraseEnc: passphrase ? encryptSecret(passphrase) : "",
        label: String(body.label || labelForVenue(venue)),
        canTrade: perms.canTrade,
        canWithdraw: perms.canWithdraw,
        enabled: true,
        lastValidatedAt: new Date(),
      },
      update: {
        apiKeyEnc: encryptSecret(apiKey),
        apiSecretEnc: encryptSecret(apiSecret),
        passphraseEnc: passphrase ? encryptSecret(passphrase) : "",
        label: String(body.label || labelForVenue(venue)),
        canTrade: perms.canTrade,
        canWithdraw: perms.canWithdraw,
        enabled: true,
        lastValidatedAt: new Date(),
      },
      select: { id: true, exchange: true, enabled: true, canTrade: true, canWithdraw: true, lastValidatedAt: true, label: true },
    });
    return NextResponse.json({ ok: true, credential: row });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Validation failed" }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.prefs) {
    const preferredVenue = String(body.prefs.preferredVenue || "binance").toLowerCase();
    if (!["binance", "bybit", "okx"].includes(preferredVenue)) {
      return NextResponse.json({ error: "preferredVenue must be binance, bybit, or okx" }, { status: 400 });
    }
    const prefs = await prisma.tradingPrefs.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        autoTradeEnabled: Boolean(body.prefs.autoTradeEnabled),
        preferredVenue,
        maxRiskPct: Number(body.prefs.maxRiskPct ?? 1),
        maxLeverage: Number(body.prefs.maxLeverage ?? 3),
        maxOpenTrades: Number(body.prefs.maxOpenTrades ?? 3),
        markets: String(body.prefs.markets || "spot,futures"),
        killSwitch: Boolean(body.prefs.killSwitch),
        capitalUsd: Number(body.prefs.capitalUsd ?? 1000),
      },
      update: {
        autoTradeEnabled: body.prefs.autoTradeEnabled ?? undefined,
        preferredVenue,
        maxRiskPct: body.prefs.maxRiskPct ?? undefined,
        maxLeverage: body.prefs.maxLeverage ?? undefined,
        maxOpenTrades: body.prefs.maxOpenTrades ?? undefined,
        markets: body.prefs.markets ?? undefined,
        killSwitch: body.prefs.killSwitch ?? undefined,
        capitalUsd: body.prefs.capitalUsd ?? undefined,
      },
    });
    return NextResponse.json({ prefs });
  }

  if (body.disableExchange) {
    await prisma.exchangeCredential.updateMany({
      where: { userId: user.id, exchange: String(body.disableExchange) },
      data: { enabled: false },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
}

export async function DELETE(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const exchange = new URL(req.url).searchParams.get("exchange");
  if (!exchange) return NextResponse.json({ error: "exchange required" }, { status: 400 });
  await prisma.exchangeCredential.deleteMany({ where: { userId: user.id, exchange } });
  return NextResponse.json({ ok: true });
}
