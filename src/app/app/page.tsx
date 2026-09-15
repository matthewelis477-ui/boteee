"use client";

import { SignalCard } from "@/components/SignalCard";
import { Stat, btnPrimary } from "@/components/ui";
import { api } from "@/lib/api";
import { loadProfile } from "@/lib/session";
import type { Experience, Signal } from "@/lib/types";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function OverviewPage() {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("free");
  const [exp, setExp] = useState<Experience>("beginner");
  const [live, setLive] = useState<Signal[]>([]);
  const [marketNote, setMarketNote] = useState("");

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setName(p.name || "");
      setPlan(p.plan);
      setExp(p.experience);
    }
    api<{ signals: Signal[] }>("/api/signals")
      .then((d) => setLive(d.signals.filter((s) => s.side !== "NO-TRADE").slice(0, 3)))
      .catch(() => undefined);
    api<{ pauseEvent?: { protection: string } | null }>("/api/scanner")
      .then((d) => {
        if (d.pauseEvent?.protection) setMarketNote(d.pauseEvent.protection);
      })
      .catch(() => undefined);
  }, []);

  const canAuto = ["pro", "elite", "institutional"].includes(plan);

  return (
    <div className="space-y-8">
      <div className="panel p-6 sm:p-8">
        <p className="text-[11px] uppercase tracking-[0.16em] text-[var(--accent)]">Overview</p>
        <h1 className="font-display mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          Welcome{name ? `, ${name}` : ""}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)]">
          Your <span className="capitalize text-[var(--text)]">{plan}</span> plan is active.
          {canAuto ? " Review signals and manage trades from here." : " Upgrade to Pro for Binance auto-trade."}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link className={btnPrimary} href="/app/signals">
            View signals
          </Link>
          <Link className="text-sm text-[var(--accent)] underline-offset-4 hover:underline" href="/app/risk">
            Risk calculator
          </Link>
          {canAuto ? (
            <Link className="text-sm text-[var(--accent)] underline-offset-4 hover:underline" href="/app/settings">
              Trading settings
            </Link>
          ) : (
            <Link className="text-sm text-[var(--accent)] underline-offset-4 hover:underline" href="/pricing">
              Upgrade plan
            </Link>
          )}
        </div>
      </div>

      {marketNote ? (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/10 px-5 py-4 text-sm text-amber-50/95">
          {marketNote}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Plan" value={plan} hint="Manage billing from pricing" />
        <Stat label="Signal view" value={exp === "beginner" ? "Simple" : "Detailed"} hint="Change in Settings" />
        <Stat label="Auto-trade" value={canAuto ? "Available" : "Pro plans"} hint={canAuto ? "Enable in Settings" : "Manual trading"} />
        <Stat label="Practice" value="Paper" hint="Try ideas risk-free" />
      </div>

      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Today’s signals</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">Ready for your review.</p>
          </div>
          <Link href="/app/paper" className="text-sm text-[var(--accent)]">
            Paper trade →
          </Link>
        </div>
        <div className="mt-4 grid gap-4">
          {live.length ? (
            live.map((s) => <SignalCard key={s.id} signal={s} experience={exp} />)
          ) : (
            <div className="panel p-6 text-sm text-[var(--muted)]">
              No active signals right now. Check back soon, or explore the scanner.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
