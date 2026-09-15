"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, btnGhost, btnPrimary } from "./ui";
import type { Experience, Signal } from "@/lib/types";
import { positionPlan } from "@/lib/risk";

function money(n: number) {
  return n >= 1000 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
}

export function SignalCard({ signal, experience }: { signal: Signal; experience: Experience }) {
  const [why, setWhy] = useState(false);
  const [alerted, setAlerted] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [calc, setCalc] = useState(false);

  const sample = useMemo(
    () =>
      positionPlan({
        capital: 1000,
        riskPct: 1,
        entry: (signal.entryLow + signal.entryHigh) / 2,
        stop: signal.stopLoss || signal.entryLow * 0.99,
        leverage: 3,
        targets: signal.targets,
      }),
    [signal],
  );

  const tone = signal.side === "LONG" ? "up" : signal.side === "SHORT" ? "down" : "warn";

  return (
    <article className="panel overflow-hidden p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>
          {signal.side === "LONG" ? "●" : signal.side === "SHORT" ? "●" : "○"} {signal.side}
        </Badge>
        {signal.delayed ? <Badge>Delayed (Free)</Badge> : null}
        <Badge>{signal.status}</Badge>
        <Badge>
          {signal.confidence}% confidence
        </Badge>
      </div>
      <h3 className="font-display mt-3 text-2xl font-semibold tracking-tight">{signal.asset}</h3>
      <p className="text-sm text-[var(--muted)]">
        {signal.exchange} · {signal.style} · {signal.timeframe}
      </p>

      {signal.side === "NO-TRADE" ? (
        <p className="mt-4 leading-relaxed text-amber-100/90">{signal.why.summary}</p>
      ) : (
        <dl className="mt-4 grid gap-2.5 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-black/20 px-3 py-2">Entry Zone: {money(signal.entryLow)}–{money(signal.entryHigh)}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Stop-Loss: {money(signal.stopLoss)}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Target 1: {money(signal.targets[0])}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Target 2: {money(signal.targets[1])}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Target 3: {money(signal.targets[2])}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Suggested Leverage: {signal.leverage}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2">Risk/Reward: 1:{signal.rr}</div>
          <div className="rounded-xl bg-black/20 px-3 py-2 capitalize">Risk: {signal.risk}</div>
          {experience !== "beginner" ? (
            <>
              <div className="rounded-xl bg-black/20 px-3 py-2">Valid For: {signal.validForMinutes} min</div>
              <div className="rounded-xl bg-black/20 px-3 py-2">Market: {signal.marketCondition}</div>
            </>
          ) : (
            <div className="sm:col-span-2 rounded-xl border border-[var(--line)] px-3 py-2 text-[var(--muted)]">
              Beginner view: enter in the zone, protect with the stop, take profit in three steps.
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a className={btnGhost} href={`https://www.binance.com/en/trade/${signal.asset.replace("/", "_")}`} target="_blank" rel="noreferrer">
          Open Chart
        </a>
        <button className={btnGhost} onClick={() => setCalc((v) => !v)}>
          Calculate My Position
        </button>
        <button className={btnGhost} onClick={() => setWhy((v) => !v)}>
          Why This Signal?
        </button>
        <button className={btnGhost} onClick={() => setAlerted(true)}>
          {alerted ? "Alert on" : "Set Alert"}
        </button>
        <button className={btnGhost} onClick={() => setFollowed(true)}>
          {followed ? "Following" : "Follow This Trade"}
        </button>
        <a className={btnPrimary} href="https://www.binance.com" target="_blank" rel="noreferrer">
          Buy on Exchange
        </a>
      </div>

      {calc && sample ? (
        <div className="mt-4 rounded-2xl bg-black/30 p-4 text-sm leading-relaxed">
          Example with $1,000 and 1% risk: max risk ${sample.riskBudget.toFixed(2)}, recommended ~
          ${sample.recommendedInvestment.toFixed(0)}, fees ${sample.fees.toFixed(2)}.
          <Link className="ml-2 text-[var(--accent)]" href="/app/risk">
            Open calculator
          </Link>
        </div>
      ) : null}

      {why ? (
        <div className="mt-4 space-y-2 rounded-2xl bg-black/30 p-4 text-sm leading-7 text-[var(--text)]/90">
          <p>{signal.why.summary}</p>
          <p>Trend: {signal.why.trend}</p>
          <p>Support / resistance: {signal.why.supportResistance}</p>
          <p>Volume: {signal.why.volume}</p>
          <p>RSI / MACD: {signal.why.rsiMacd}</p>
          <p>Moving averages: {signal.why.maStructure}</p>
          <p>Setup: {signal.why.setup}</p>
          <p>Bitcoin: {signal.why.btcDirection}</p>
          <p>Sentiment: {signal.why.sentiment}</p>
          <p>Risks: {signal.why.risks.join(" · ")}</p>
        </div>
      ) : null}
    </article>
  );
}
