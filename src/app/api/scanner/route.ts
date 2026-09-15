import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const EMPTY_SCANNER = {
  bullish: [] as string[],
  bearish: [] as string[],
  unusualVolume: [] as string[],
  breakouts: [] as string[],
  oversold: [] as string[],
  overbought: [] as string[],
  reversals: [] as string[],
  sr: [] as string[],
  listings: [] as string[],
  highVol: [] as string[],
  pndRisk: [] as string[],
  vsBtc: [] as string[],
  avoid: [] as string[],
  movers: [] as string[],
};

export async function GET() {
  const row = await prisma.scannerSnapshot.findUnique({ where: { id: "latest" } });
  if (!row) {
    return NextResponse.json({
      scanner: EMPTY_SCANNER,
      pauseEvent: null,
      btc: null,
      live: false,
      note: "Scanner updates when the signal pipeline runs (cron).",
    });
  }
  const parsed = JSON.parse(row.json);
  return NextResponse.json({
    ...parsed,
    scanner: { ...EMPTY_SCANNER, ...(parsed.scanner || {}) },
    live: true,
    updatedAt: row.updatedAt,
  });
}
