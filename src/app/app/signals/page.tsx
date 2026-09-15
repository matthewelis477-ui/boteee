"use client";

import { SignalCard } from "@/components/SignalCard";
import { btnGhost } from "@/components/ui";
import { api } from "@/lib/api";
import { loadProfile } from "@/lib/session";
import type { Experience, Signal } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export default function SignalsPage() {
  const [exp, setExp] = useState<Experience>("beginner");
  const [rows, setRows] = useState<Signal[]>([]);
  const [meta, setMeta] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    const p = loadProfile();
    if (p) {
      setExp(p.experience);
    }
    try {
      const data = await api<{ signals: Signal[]; note: string | null; generatedAt: string | null }>("/api/signals");
      setRows(data.signals.filter((s) => s.confidence >= (p?.minConfidence || 0)));
      const when = data.generatedAt ? new Date(data.generatedAt).toLocaleString() : "";
      setMeta([data.note, when].filter(Boolean).join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load signals");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Signals</h1>
      <p className="text-[var(--muted)]">Live trade ideas with entry, stop, and targets. Review each one before you act.</p>
      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--muted)]">
        <span>{meta}</span>
        <button className={btnGhost} onClick={() => void load()}>
          Refresh
        </button>
      </div>
      {error ? <p className="text-rose-300">{error}</p> : null}
      {rows.map((s) => (
        <SignalCard key={s.id} signal={s} experience={exp} />
      ))}
    </div>
  );
}
