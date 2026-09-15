import { NextResponse } from "next/server";

export async function GET() {
  try {
    const symbols = ["BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT"];
    const url = "https://api.binance.com/api/v3/ticker/24hr?symbols=" + encodeURIComponent(JSON.stringify(symbols));
    const res = await fetch(url, { next: { revalidate: 15 } });
    if (!res.ok) throw new Error("binance");
    const data = await res.json();
    return NextResponse.json({ source: "binance-public", data, live: true });
  } catch (e) {
    return NextResponse.json(
      { source: "binance-public", live: false, error: e instanceof Error ? e.message : "market feed failed", data: [] },
      { status: 502 },
    );
  }
}
