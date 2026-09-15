"use client";

import { Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type Perf = {
  totalSignals: number;
  closedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  profitFactor: number;
  maxDrawdownUsd: number;
  avgGain: number;
  avgLoss: number;
  feesNote: string;
  byCoin: { coin: string; n: number; wr: number; pnl: number }[];
};

export default function PerformancePage() {
  const [p, setP] = useState<Perf | null>(null);

  useEffect(() => {
    api<Perf>("/api/performance").then(setP).catch(() => setP(null));
  }, []);

  if (!p) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-semibold tracking-tight">Transparent performance</h1>
        <p className="text-[var(--muted)]">Loading verified managed-trade book…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Transparent performance</h1>
      <p className="max-w-3xl text-[var(--muted)]">{p.feesNote} Win rate alone is not enough. Watch profit factor and drawdown.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Published signals" value={String(p.totalSignals)} />
        <Stat label="Closed managed trades" value={String(p.closedTrades)} />
        <Stat label="Wins / losses" value={`${p.wins} / ${p.losses}`} />
        <Stat label="Win rate" value={`${Math.round(p.winRate * 100)}%`} hint="Incomplete without PF" />
        <Stat label="Profit factor" value={String(p.profitFactor)} />
        <Stat label="Max drawdown (USD)" value={`$${p.maxDrawdownUsd}`} />
        <Stat label="Avg gain" value={`$${p.avgGain}`} />
        <Stat label="Avg loss" value={`$${p.avgLoss}`} />
      </div>
      <div className="panel p-5">
        <h2 className="font-display text-lg">By coin</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="text-left">Coin</th>
              <th>N</th>
              <th>Win %</th>
              <th>PnL</th>
            </tr>
          </thead>
          <tbody>
            {p.byCoin.map((r) => (
              <tr key={r.coin} className="border-t border-white/5">
                <td className="py-2">{r.coin}</td>
                <td className="text-center">{r.n}</td>
                <td className="text-center">{r.wr}</td>
                <td className="text-center">${r.pnl}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!p.byCoin.length ? <p className="mt-3 text-sm text-[var(--muted)]">No closed managed trades yet.</p> : null}
      </div>
    </div>
  );
}
