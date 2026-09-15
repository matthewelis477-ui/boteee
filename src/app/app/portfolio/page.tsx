"use client";

import { btnGhost, btnPrimary, Field, inputClass, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { useCallback, useEffect, useMemo, useState } from "react";

type Valued = {
  id: string;
  asset: string;
  amount: number;
  avgPrice: number;
  mark: number;
  value: number;
  pnl: number;
  live: boolean;
};

export default function PortfolioPage() {
  const [valued, setValued] = useState<Valued[]>([]);
  const [asset, setAsset] = useState("BTC");
  const [amount, setAmount] = useState(0.05);
  const [avg, setAvg] = useState(0);
  const [msg, setMsg] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = useCallback(async () => {
    const data = await api<{ valued: Valued[]; updatedAt?: string }>("/api/portfolio");
    setValued(data.valued || []);
    setUpdatedAt(data.updatedAt || "");
  }, []);

  useEffect(() => {
    void load().catch(() => undefined);
    const id = setInterval(() => void load().catch(() => undefined), 15_000);
    return () => clearInterval(id);
  }, [load]);

  useEffect(() => {
    fetch("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT")
      .then((r) => r.json())
      .then((j: { price?: string }) => {
        if (j.price) setAvg(Number(j.price));
      })
      .catch(() => undefined);
  }, []);

  const total = valued.reduce((s, r) => s + r.value, 0);
  const layer1 = valued.filter((r) => ["BTC", "ETH", "SOL"].includes(r.asset)).reduce((s, r) => s + r.value, 0);
  const conc = total ? layer1 / total : 0;
  const liveCount = useMemo(() => valued.filter((v) => v.live).length, [valued]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Portfolio</h1>
      <p className="text-[var(--muted)]">
        Marks from live Binance prices{updatedAt ? ` · ${new Date(updatedAt).toLocaleTimeString()}` : ""}. Sync spot
        balances with a trade-only Binance Spot key. Never enable withdrawals.
      </p>
      {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button
          className={btnGhost}
          onClick={async () => {
            try {
              const d = await api<{ upserted: number }>("/api/portfolio", {
                method: "POST",
                body: JSON.stringify({ syncExchange: true }),
              });
              setMsg(`Synced ${d.upserted} balances from Binance Spot.`);
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Sync failed");
            }
          }}
        >
          Sync Binance Spot
        </button>
        <button className={btnGhost} onClick={() => void load()}>
          Refresh marks
        </button>
      </div>
      <form
        className="panel grid gap-3 p-5 md:grid-cols-4"
        onSubmit={async (e) => {
          e.preventDefault();
          await api("/api/portfolio", { method: "POST", body: JSON.stringify({ holding: { asset, amount, avgPrice: avg } }) });
          await load();
        }}
      >
        <Field label="Asset">
          <input className={inputClass} value={asset} onChange={(e) => setAsset(e.target.value.toUpperCase())} />
        </Field>
        <Field label="Amount">
          <input className={inputClass} type="number" step="any" value={amount} onChange={(e) => setAmount(+e.target.value)} />
        </Field>
        <Field label="Avg price">
          <input className={inputClass} type="number" value={avg} onChange={(e) => setAvg(+e.target.value)} />
        </Field>
        <button className={`${btnPrimary} self-end`}>Add</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Live value" value={`$${total.toFixed(0)}`} hint={`${liveCount}/${valued.length} live marks`} />
        <Stat label="Unrealized P/L" value={`$${valued.reduce((s, r) => s + r.pnl, 0).toFixed(0)}`} />
        <Stat label="Concentration" value={`${Math.round(conc * 100)}% L1`} hint={conc > 0.7 ? "High correlated Layer-1 risk" : "OK"} />
      </div>
      {conc > 0.7 ? (
        <p className="text-amber-200">{Math.round(conc * 100)}% in correlated large-cap assets. Portfolio risk is High.</p>
      ) : null}
      <div className="panel overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="text-left">Asset</th>
              <th>Mark</th>
              <th>Alloc</th>
              <th>P/L</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {valued.map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="py-2">
                  {r.asset} · {r.amount}
                  {!r.live ? <span className="ml-2 text-xs text-amber-200">avg</span> : null}
                </td>
                <td className="text-center">${r.mark.toLocaleString()}</td>
                <td className="text-center">{total ? Math.round((r.value / total) * 100) : 0}%</td>
                <td className="text-center">${r.pnl.toFixed(0)}</td>
                <td className="text-right">
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      await api("/api/portfolio", { method: "POST", body: JSON.stringify({ deleteHoldingId: r.id }) });
                      await load();
                    }}
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!valued.length ? <p className="mt-2 text-sm text-[var(--muted)]">No holdings yet. Add manually or sync from Binance Spot.</p> : null}
      </div>
    </div>
  );
}
