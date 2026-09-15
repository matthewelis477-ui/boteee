"use client";

import { btnGhost, btnPrimary, Field, inputClass, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type PaperTrade = {
  id: string;
  signalId: string;
  asset: string;
  side: string;
  entry: number;
  stop: number;
  sizeUsd: number;
  status: string;
  pnl: number;
  followedStop: boolean;
  notes: string;
};

type LiveSignal = {
  id: string;
  asset: string;
  side: string;
  entryLow: number;
  entryHigh: number;
  stopLoss: number | null;
  confidence: number;
};

export default function PaperPage() {
  const [equity, setEquity] = useState(10000);
  const [trades, setTrades] = useState<PaperTrade[]>([]);
  const [signals, setSignals] = useState<LiveSignal[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function load() {
    try {
      const [paper, sig] = await Promise.all([
        api<{ equity: number; trades: PaperTrade[] }>("/api/paper"),
        api<{ signals: LiveSignal[] }>("/api/signals"),
      ]);
      setEquity(paper.equity);
      setTrades(paper.trades);
      setSignals((sig.signals || []).filter((s) => s.side !== "NO-TRADE"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load paper book");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function follow(s: LiveSignal) {
    await api("/api/paper", {
      method: "POST",
      body: JSON.stringify({
        action: "follow",
        signalId: s.id,
        asset: s.asset,
        side: s.side,
        entry: (s.entryLow + s.entryHigh) / 2,
        stop: s.stopLoss ?? s.entryLow * 0.98,
        notes,
      }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Paper trading</h1>
      <p className="text-[var(--muted)]">Virtual balance on your account. Follows live published signals — no real orders.</p>
      {error ? <p className="text-[var(--danger)]">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Virtual equity" value={`$${equity.toFixed(0)}`} />
        <Stat label="Open paper trades" value={String(trades.filter((t) => t.status === "open").length)} />
      </div>
      <Field label="Notes for next follow">
        <input className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="grid gap-3">
        {signals.length ? (
          signals.map((s) => (
            <div key={s.id} className="panel flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                {s.asset} {s.side} · {s.confidence}%
              </div>
              <button className={btnPrimary} onClick={() => void follow(s)}>
                Follow without real money
              </button>
            </div>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">No live directional signals to paper-trade yet.</p>
        )}
      </div>
      {trades.map((t) => (
        <div key={t.id} className="panel p-4 text-sm">
          {t.asset} {t.side} · {t.status} · PnL ${t.pnl}
          {t.status === "open" ? (
            <div className="mt-2 flex gap-2">
              <button
                className={btnGhost}
                onClick={async () => {
                  await api("/api/paper", { method: "POST", body: JSON.stringify({ action: "close", id: t.id, win: true }) });
                  await load();
                }}
              >
                Close win
              </button>
              <button
                className={btnGhost}
                onClick={async () => {
                  await api("/api/paper", { method: "POST", body: JSON.stringify({ action: "close", id: t.id, win: false }) });
                  await load();
                }}
              >
                Close loss
              </button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
