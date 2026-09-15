"use client";

import { Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type FuturesPayload = {
  insight: string;
  openInterest: string;
  funding: string;
  longShort: string;
  liq: string;
  longSqueeze: string;
  shortSqueeze: string;
  book: string;
  whales: string;
  premium: string;
  leverageAlert: string;
  updatedAt?: string;
};

export default function FuturesPage() {
  const [data, setData] = useState<FuturesPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<FuturesPayload>("/api/futures")
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Futures-market intelligence</h1>
      {error ? <p className="text-[var(--danger)]">{error}</p> : null}
      {data ? (
        <>
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">{data.insight}</div>
          <div className="grid gap-3 md:grid-cols-2">
            <Stat label="Open interest" value="Live" hint={data.openInterest} />
            <Stat label="Funding" value="Live" hint={data.funding} />
            <Stat label="Long/short" value="Live" hint={data.longShort} />
            <Stat label="Force liquidations" value="Live" hint={data.liq} />
            <Stat label="Long squeeze" value={data.longSqueeze} />
            <Stat label="Short squeeze" value={data.shortSqueeze} />
            <Stat label="Order-book depth" value="Live" hint={data.book} />
            <Stat label="Depth note" value="Live" hint={data.whales} />
            <Stat label="Futures premium" value="Live" hint={data.premium} />
            <Stat label="High-leverage alert" value="Policy" hint={data.leverageAlert} />
          </div>
          {data.updatedAt ? <p className="text-xs text-[var(--muted)]">Updated {data.updatedAt}</p> : null}
        </>
      ) : (
        <p className="text-[var(--muted)]">Loading live derivatives data…</p>
      )}
    </div>
  );
}
