"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

export default function JournalPage() {
  const [notes, setNotes] = useState("");
  const [coaching, setCoaching] = useState("Loading coaching from your trades…");
  const [stats, setStats] = useState("");

  async function load() {
    const [port, coach] = await Promise.all([
      api<{ journal: string }>("/api/portfolio"),
      api<{ coaching: string; stats: { paperClosed: number; managedClosed: number } }>("/api/journal/coach"),
    ]);
    setNotes(port.journal || "");
    setCoaching(coach.coaching);
    setStats(
      `Based on ${coach.stats.paperClosed} paper + ${coach.stats.managedClosed} managed closed trades.`,
    );
  }

  useEffect(() => {
    void load().catch(() => setCoaching("Could not load coaching yet."));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Trading journal & coach</h1>
      <div className="panel space-y-2 p-5 text-[var(--text)]">
        <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Live coaching</p>
        <p>{coaching}</p>
        {stats ? <p className="text-xs text-[var(--muted)]">{stats}</p> : null}
      </div>
      <textarea
        className="w-full rounded-2xl border border-[var(--line)] bg-[#071512] p-4"
        rows={6}
        placeholder="Personal notes, mistakes, whether you followed the stop..."
        value={notes}
        onChange={(e) => {
          setNotes(e.target.value);
          void api("/api/portfolio", { method: "POST", body: JSON.stringify({ journal: e.target.value }) });
        }}
        onBlur={() => void load().catch(() => undefined)}
      />
    </div>
  );
}
