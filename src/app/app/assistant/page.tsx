"use client";

import { btnPrimary, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { useState } from "react";

const STARTERS = [
  "Should I enter BTC now?",
  "Give me the best three opportunities.",
  "Explain this signal in simple language.",
  "How much should I invest with $500?",
  "Why did the last trade lose?",
  "Show only low-risk Spot signals.",
  "Compare BTC and ETH.",
  "Show today’s completed signals.",
  "What is the current market condition?",
];

export default function AssistantPage() {
  const [q, setQ] = useState(STARTERS[0]);
  const [a, setA] = useState("");
  const [mode, setMode] = useState("");
  const [error, setError] = useState("");

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">Trading assistant</h1>
      <p className="text-[var(--muted)]">
        Answers from live prices, published signals, news, and your trades — not demo copy.
      </p>
      <div className="flex flex-wrap gap-2">
        {STARTERS.map((s) => (
          <button key={s} className="chip" onClick={() => setQ(s)}>
            {s}
          </button>
        ))}
      </div>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          try {
            const data = await api<{ answer: string; mode?: string }>("/api/assistant", {
              method: "POST",
              body: JSON.stringify({ question: q }),
            });
            setA(data.answer);
            setMode(data.mode || "live");
          } catch (err) {
            setError(err instanceof Error ? err.message : "Assistant failed");
          }
        }}
      >
        <textarea className={inputClass} rows={3} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className={btnPrimary}>Ask</button>
      </form>
      {error ? <p className="text-rose-300">{error}</p> : null}
      {a ? (
        <div className="panel space-y-2 p-5 leading-7">
          {mode ? <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Source: {mode === "llm" ? "AI + live data" : "live data"}</p> : null}
          <div className="whitespace-pre-wrap">{a}</div>
        </div>
      ) : null}
    </div>
  );
}
