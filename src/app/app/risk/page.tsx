"use client";

import { btnPrimary, Field, inputClass, Stat } from "@/components/ui";
import { positionPlan } from "@/lib/risk";
import { useEffect, useMemo, useState } from "react";

export default function RiskPage() {
  const [capital, setCapital] = useState(1000);
  const [riskPct, setRiskPct] = useState(1);
  const [entry, setEntry] = useState(0);
  const [stop, setStop] = useState(0);
  const [leverage, setLeverage] = useState(3);
  const [t1, setT1] = useState(0);
  const [t2, setT2] = useState(0);
  const [t3, setT3] = useState(0);
  const [livePx, setLivePx] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const res = await fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT", {
          cache: "no-store",
        });
        const j = (await res.json()) as { price?: string };
        const px = Number(j.price);
        if (!alive || !Number.isFinite(px) || px <= 0) return;
        setLivePx(px);
        setEntry((e) => (e ? e : px));
        setStop((s) => (s ? s : Number((px * 0.992).toFixed(2))));
        setT1((t) => (t ? t : Number((px * 1.008).toFixed(2))));
        setT2((t) => (t ? t : Number((px * 1.016).toFixed(2))));
        setT3((t) => (t ? t : Number((px * 1.028).toFixed(2))));
      } catch {
        /* keep */
      }
    }
    void load();
    const id = setInterval(() => void load(), 15_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const plan = useMemo(
    () => positionPlan({ capital, riskPct, entry, stop, leverage, targets: [t1, t2, t3] }),
    [capital, riskPct, entry, stop, leverage, t1, t2, t3],
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Personalized risk calculator</h1>
      <p className="text-slate-400">
        Defaults seed from live BTC{livePx ? ` ($${livePx.toLocaleString()})` : ""}. Fees are included in the model.
      </p>
      <form className="panel grid gap-4 p-5 md:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
        <Field label="Available capital ($)">
          <input className={inputClass} type="number" value={capital} onChange={(e) => setCapital(+e.target.value)} />
        </Field>
        <Field label="Max risk %">
          <input className={inputClass} type="number" value={riskPct} onChange={(e) => setRiskPct(+e.target.value)} />
        </Field>
        <Field label="Entry">
          <input className={inputClass} type="number" value={entry} onChange={(e) => setEntry(+e.target.value)} />
        </Field>
        <Field label="Stop-loss">
          <input className={inputClass} type="number" value={stop} onChange={(e) => setStop(+e.target.value)} />
        </Field>
        <Field label="Leverage">
          <input className={inputClass} type="number" value={leverage} onChange={(e) => setLeverage(+e.target.value)} />
        </Field>
        <Field label="Target 1">
          <input className={inputClass} type="number" value={t1} onChange={(e) => setT1(+e.target.value)} />
        </Field>
        <Field label="Target 2">
          <input className={inputClass} type="number" value={t2} onChange={(e) => setT2(+e.target.value)} />
        </Field>
        <Field label="Target 3">
          <input className={inputClass} type="number" value={t3} onChange={(e) => setT3(+e.target.value)} />
        </Field>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            if (!livePx) return;
            setEntry(livePx);
            setStop(Number((livePx * 0.992).toFixed(2)));
            setT1(Number((livePx * 1.008).toFixed(2)));
            setT2(Number((livePx * 1.016).toFixed(2)));
            setT3(Number((livePx * 1.028).toFixed(2)));
          }}
        >
          Reset from live BTC
        </button>
      </form>
      {plan ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Risk budget" value={`$${plan.riskBudget.toFixed(2)}`} />
          <Stat label="Suggested notional" value={`$${plan.recommendedInvestment.toFixed(0)}`} />
          <Stat label="Suggested leverage" value={`${plan.suggestedLev}×`} hint={`Fees ~$${plan.fees.toFixed(2)}`} />
        </div>
      ) : (
        <p className="text-[var(--muted)]">Enter entry and stop to size the position.</p>
      )}
    </div>
  );
}
