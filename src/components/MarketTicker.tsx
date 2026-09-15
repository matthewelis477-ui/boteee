"use client";

import { useEffect, useState } from "react";

type TickerRow = {
  symbol: string;
  pair: string;
  price: number;
  priceText: string;
  changePct: number;
};

export function MarketTicker({ className = "" }: { className?: string }) {
  const [rows, setRows] = useState<TickerRow[]>([]);

  useEffect(() => {
    let alive = true;
    let es: EventSource | null = null;
    let pollId: ReturnType<typeof setInterval> | null = null;

    async function pollOnce() {
      try {
        const res = await fetch("/api/markets/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tickers?: TickerRow[] };
        if (alive && data.tickers?.length) setRows(data.tickers);
      } catch {
        /* keep last */
      }
    }

    try {
      es = new EventSource("/api/markets/ticker/stream");
      es.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data) as { tickers?: TickerRow[] };
          if (alive && data.tickers?.length) setRows(data.tickers);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        es?.close();
        es = null;
        if (!pollId) {
          void pollOnce();
          pollId = setInterval(() => void pollOnce(), 5_000);
        }
      };
    } catch {
      void pollOnce();
      pollId = setInterval(() => void pollOnce(), 5_000);
    }

    // Immediate fill before SSE first event
    void pollOnce();

    return () => {
      alive = false;
      es?.close();
      if (pollId) clearInterval(pollId);
    };
  }, []);

  if (!rows.length) {
    return (
      <div className={`market-ticker market-ticker--empty ${className}`} aria-hidden>
        <span className="text-[var(--muted)]">Loading markets…</span>
      </div>
    );
  }

  const track = [...rows, ...rows];

  return (
    <div className={`market-ticker ${className}`} role="region" aria-label="Live market prices">
      <div className="market-ticker__fade market-ticker__fade--left" aria-hidden />
      <div className="market-ticker__fade market-ticker__fade--right" aria-hidden />
      <div className="market-ticker__track">
        {track.map((t, i) => {
          const up = t.changePct >= 0;
          return (
            <span key={`${t.symbol}-${i}`} className="market-ticker__item">
              <span className="market-ticker__sym">{t.symbol}</span>
              <span className="market-ticker__px">${t.priceText}</span>
              <span className={up ? "market-ticker__chg up" : "market-ticker__chg down"}>
                {up ? "+" : ""}
                {t.changePct.toFixed(2)}%
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
