"use client";

import { api } from "@/lib/api";
import { Badge } from "@/components/ui";
import { useEffect, useState } from "react";
import Link from "next/link";

type Trade = {
  id: string;
  asset: string;
  side: string;
  status: string;
  qty: number;
  entry: number;
  filledEntry: number | null;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  realizedPnl: number;
  errorMessage: string | null;
  hitT1: boolean;
  hitT2: boolean;
  hitT3: boolean;
  events: { id: string; message: string; createdAt: string }[];
};

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ trades: Trade[] }>("/api/trades")
      .then((d) => setTrades(d.trades))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load trades"));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">Your trades</h1>
        <p className="mt-2 text-[var(--muted)]">
          Open and recent positions. Enable auto-trade in{" "}
          <Link className="text-[var(--accent)]" href="/app/settings">
            Settings
          </Link>{" "}
          when you’re ready.
        </p>
      </div>
      {error ? <p className="text-[var(--danger)]">{error}</p> : null}
      {!trades.length && !error ? <p className="text-[var(--muted)]">No managed trades yet.</p> : null}
      {trades.map((t) => (
        <article key={t.id} className="panel p-5">
          <div className="flex flex-wrap gap-2">
            <Badge tone={t.side === "LONG" ? "up" : "down"}>
              {t.asset} {t.side}
            </Badge>
            <Badge>{t.status}</Badge>
            {t.hitT1 ? <Badge tone="up">T1</Badge> : null}
            {t.hitT2 ? <Badge tone="up">T2</Badge> : null}
            {t.hitT3 ? <Badge tone="up">T3</Badge> : null}
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            <div>Qty: {t.qty}</div>
            <div>Entry: {t.filledEntry ?? t.entry}</div>
            <div>Stop: {t.stopLoss}</div>
            <div>
              Targets: {t.target1} / {t.target2} / {t.target3}
            </div>
            <div>Realized PnL: {t.realizedPnl.toFixed(2)}</div>
          </dl>
          {t.errorMessage ? <p className="mt-2 text-sm text-rose-300">{t.errorMessage}</p> : null}
          <ol className="mt-4 space-y-2 border-l border-white/10 pl-4 text-sm text-[var(--muted)]">
            {t.events.map((e) => (
              <li key={e.id}>
                <span className="text-[var(--muted)]/70">{new Date(e.createdAt).toLocaleString()}</span>
                {" · "}
                {e.message}
              </li>
            ))}
          </ol>
        </article>
      ))}
    </div>
  );
}
