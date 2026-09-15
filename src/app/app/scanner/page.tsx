"use client";

import { Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type ScannerShape = {
  bullish?: string[];
  bearish?: string[];
  unusualVolume?: string[];
  breakouts?: string[];
  oversold?: string[];
  overbought?: string[];
  reversals?: string[];
  sr?: string[];
  listings?: string[];
  highVol?: string[];
  pndRisk?: string[];
  vsBtc?: string[];
  avoid?: string[];
  movers?: string[];
};

const EMPTY: ScannerShape = {
  bullish: [],
  bearish: [],
  unusualVolume: [],
  breakouts: [],
  oversold: [],
  overbought: [],
  reversals: [],
  sr: [],
  listings: [],
  highVol: [],
  pndRisk: [],
  vsBtc: [],
  avoid: [],
};

export default function ScannerPage() {
  const [scanner, setScanner] = useState<ScannerShape>(EMPTY);
  const [regime, setRegime] = useState("Loading live scan…");
  const [live, setLive] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const d = await api<{
          scanner?: ScannerShape;
          btc?: { close: number; ema20: number };
          live?: boolean;
          note?: string;
        }>("/api/scanner");
        if (!alive) return;
        setScanner(d.scanner || EMPTY);
        setLive(Boolean(d.live));
        if (d.btc) setRegime(`BTC ${d.btc.close.toLocaleString()} · trend ${d.btc.close >= d.btc.ema20 ? "firm" : "soft"}`);
        else setRegime(d.note || "Waiting for next pipeline run");
      } catch {
        if (alive) setRegime("Temporarily unavailable");
      }
    }
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const groups: [string, string[]][] = [
    ["Top bullish", scanner.bullish || []],
    ["Top bearish", scanner.bearish || []],
    ["Unusual volume", scanner.unusualVolume || []],
    ["Breakout candidates", scanner.breakouts || []],
    ["Oversold", scanner.oversold || []],
    ["Overbought", scanner.overbought || []],
    ["Trend reversals", scanner.reversals || []],
    ["S/R reactions", scanner.sr || []],
    ["New listings", scanner.listings || []],
    ["High volatility", scanner.highVol || []],
    ["Watchlist risks", scanner.pndRisk || []],
    ["Vs BTC", scanner.vsBtc || []],
    ["Avoid now", scanner.avoid || []],
  ];

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Market scanner</h1>
      <p className="text-[var(--muted)]">
        {live ? "Live pipeline snapshot" : "Live when the signal cron has run"} · refreshes every minute.
      </p>
      <Stat label="Market tone" value={regime} />
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map(([title, items]) => (
          <div key={title} className="panel p-5">
            <h2 className="font-medium">{title}</h2>
            {items.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-[var(--muted)]">
                {items.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">No live items in this bucket yet.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
