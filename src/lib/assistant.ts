import { positionPlan } from "./risk";
import type { Signal } from "./types";

export type AssistantContext = {
  signals: Signal[];
  prices: Record<string, number>;
  news: { title: string; whenLabel: string; impact: string; protection: string; source: string }[];
  scanner?: {
    movers?: string[];
    avoid?: string[];
    listings?: string[];
    breakouts?: string[];
  };
  pause?: string;
  futures?: { funding?: string; longShort?: string; insight?: string; premium?: string };
  user?: {
    plan: string;
    name: string;
    preferredVenue?: string;
    autoTradeEnabled?: boolean;
    capitalUsd?: number;
    openManaged?: { asset: string; side: string; status: string; exchange: string }[];
    recentClosed?: { asset: string; side: string; realizedPnl: number }[];
  };
  updatedAt: string;
};

function compactSignals(signals: Signal[]) {
  return signals
    .filter((s) => s.side !== "NO-TRADE")
    .slice(0, 12)
    .map(
      (s) =>
        `${s.asset} ${s.side} conf ${s.confidence}% entry ${s.entryLow}-${s.entryHigh} stop ${s.stopLoss} risk ${s.risk} · ${s.why.summary}`,
    );
}

function buildLiveBrief(ctx: AssistantContext) {
  const lines: string[] = [
    `As-of ${ctx.updatedAt} (live Botee book).`,
    ctx.prices.BTCUSDT != null ? `BTC ~$${ctx.prices.BTCUSDT}` : "",
    ctx.prices.ETHUSDT != null ? `ETH ~$${ctx.prices.ETHUSDT}` : "",
    ctx.pause ? `News pause: ${ctx.pause}` : "",
    ctx.futures?.funding ? `Funding: ${ctx.futures.funding}` : "",
    ctx.futures?.longShort ? `L/S: ${ctx.futures.longShort}` : "",
    ctx.futures?.insight ? `Derivatives: ${ctx.futures.insight}` : "",
  ].filter(Boolean);

  const tops = compactSignals(ctx.signals);
  if (tops.length) lines.push(`Published signals: ${tops.join(" | ")}`);
  else lines.push("No directional published signals right now.");

  if (ctx.scanner?.avoid?.length) lines.push(`Scanner avoid: ${ctx.scanner.avoid.slice(0, 4).join("; ")}`);
  if (ctx.news.length) {
    lines.push(
      `Headlines: ${ctx.news
        .slice(0, 5)
        .map((n) => `[${n.impact}] ${n.title}`)
        .join(" · ")}`,
    );
  }
  if (ctx.user?.openManaged?.length) {
    lines.push(
      `Your open auto-trades: ${ctx.user.openManaged.map((t) => `${t.asset} ${t.side} on ${t.exchange}`).join("; ")}`,
    );
  }
  if (ctx.user?.recentClosed?.length) {
    lines.push(
      `Your recent closed PnL: ${ctx.user.recentClosed
        .map((t) => `${t.asset} ${t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(2)}`)
        .join("; ")}`,
    );
  }
  return lines.join("\n");
}

/** Deterministic answers from live context only — never demo fixtures. */
export function answerAssistantLive(q: string, ctx: AssistantContext) {
  const query = q.trim().toLowerCase();
  const signals = ctx.signals;
  const btc = signals.find((s) => s.asset.startsWith("BTC")) || signals.find((s) => s.side !== "NO-TRADE");
  const briefPrice =
    ctx.prices.BTCUSDT != null ? ` Live BTC ~$${Number(ctx.prices.BTCUSDT).toLocaleString()}.` : "";

  if (!query) {
    return `Ask about a signal, risk, news, or your open trades. I only use live Botee data.${briefPrice}`;
  }

  if (query.includes("enter btc") || query.includes("should i enter btc")) {
    if (!btc || btc.side === "NO-TRADE") {
      return `No BTC directional signal is published right now.${briefPrice} ${ctx.pause || ""}`.trim();
    }
    return `BTC is ${btc.side} at ${btc.confidence}% confidence. Entry ${btc.entryLow}–${btc.entryHigh}, stop ${btc.stopLoss}. Risk ${btc.risk}.${briefPrice} ${ctx.pause || ""}`.trim();
  }

  if (query.includes("best three") || query.includes("opportunities")) {
    const top = signals.filter((s) => s.side !== "NO-TRADE").sort((a, b) => b.confidence - a.confidence).slice(0, 3);
    if (!top.length) {
      const avoid = ctx.scanner?.avoid?.length ? ` Avoid: ${ctx.scanner.avoid.join("; ")}.` : "";
      return `No directional opportunities in the live book right now.${briefPrice}${avoid}`;
    }
    return `Best live opportunities: ${top.map((s) => `${s.asset} ${s.side} ${s.confidence}%`).join("; ")}.${briefPrice}`;
  }

  if (query.includes("simple language") || query.includes("explain this signal")) {
    const s = btc || signals[0];
    return s ? s.why.summary : "No published signal to explain yet.";
  }

  if (
    query.includes("$500") ||
    query.includes("500") ||
    (query.includes("risk") && /\$?\d{2,6}/.test(query))
  ) {
    const capitalMatch = query.match(/\$?(\d{2,6})/);
    const capital = capitalMatch ? Number(capitalMatch[1]) : ctx.user?.capitalUsd || 500;
    const s = btc || signals.find((x) => x.side !== "NO-TRADE");
    if (!s || !s.stopLoss) return "Need a published entry and stop to size a position.";
    const plan = positionPlan({
      capital,
      riskPct: 1,
      entry: (s.entryLow + s.entryHigh) / 2,
      stop: s.stopLoss,
      leverage: 3,
      targets: s.targets,
    });
    return plan
      ? `With $${capital} and 1% risk on ${s.asset}: max risk ~$${plan.riskBudget.toFixed(2)}. Recommended notional ~$${plan.recommendedInvestment.toFixed(0)}. Suggested leverage ${plan.suggestedLev}×. Fees modeled $${plan.fees.toFixed(2)}.`
      : "Need entry and stop to size a position.";
  }

  if (query.includes("my trade") || query.includes("my open") || query.includes("auto-trade") || query.includes("auto trade")) {
    const open = ctx.user?.openManaged || [];
    if (!open.length) return "You have no open managed auto-trades right now.";
    return `Open managed trades: ${open.map((t) => `${t.asset} ${t.side} (${t.status}) on ${t.exchange}`).join("; ")}.`;
  }

  if (query.includes("news") || query.includes("headline") || query.includes("calendar")) {
    if (!ctx.news.length) return "Live news feed is empty right now. Try again in a minute.";
    return ctx.news
      .slice(0, 6)
      .map((n) => `• [${n.impact}] ${n.title} — ${n.protection.slice(0, 120)}`)
      .join("\n");
  }

  if (query.includes("last trade") || query.includes("why did") || query.includes("performance")) {
    const closed = ctx.user?.recentClosed || [];
    if (closed.length) {
      return `Your recent closed trades: ${closed
        .map((t) => `${t.asset} ${t.side} PnL ${t.realizedPnl >= 0 ? "+" : ""}${t.realizedPnl.toFixed(2)}`)
        .join("; ")}. Check Performance for the full live book.`;
    }
    return "No closed managed trades on your account yet. Performance stays empty until live fills settle — we do not invent demo stats.";
  }

  if (query.includes("low-risk") && query.includes("spot")) {
    const rows = signals.filter((s) => s.marketType === "spot" && s.risk === "low" && s.side !== "NO-TRADE");
    return rows.length
      ? `Low-risk Spot (live): ${rows.map((s) => `${s.asset} ${s.side}`).join(", ")}.`
      : "No low-risk Spot signals in the current live set.";
  }

  if (query.includes("compare btc") || query.includes("btc and eth")) {
    const eth = signals.find((s) => s.asset.startsWith("ETH"));
    const fund = ctx.futures?.funding ? ` ${ctx.futures.funding}.` : "";
    return `BTC: ${btc ? `${btc.side} ${btc.confidence}% — ${btc.why.summary}` : "no live signal"}. ETH: ${
      eth ? `${eth.side} ${eth.confidence}%` : "no live signal"
    }.${briefPrice}${fund}`;
  }

  if (query.includes("completed")) {
    const done = signals.filter((s) => s.status === "completed");
    return done.length
      ? `Completed signals: ${done.map((s) => `${s.asset} ${s.side}`).join(", ")}.`
      : "No completed signals in the current live book.";
  }

  if (query.includes("market condition") || query.includes("regime") || query.includes("price")) {
    const cond = btc ? `${btc.marketCondition} / ${btc.side}` : "n/a";
    const fut = ctx.futures?.insight ? ` ${ctx.futures.insight}` : "";
    const pause = ctx.pause ? ` ${ctx.pause}` : "";
    return `Live regime: ${cond}.${briefPrice}${fut}${pause}`.trim();
  }

  if (query.includes("stop")) {
    return "A stop-loss limits loss if price moves against you. Place it where the setup is invalid, then size so that distance equals your dollar risk.";
  }

  // Default: compact live brief so free-form questions still get realtime context
  return `${buildLiveBrief(ctx)}\n\nAsk specifically: best opportunities, BTC entry, news, my open trades, or size with $500.`;
}

async function answerWithLlm(question: string, ctx: AssistantContext): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const base = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";

  const system = `You are Botee's personal trading assistant. Answer ONLY from the live context below. Do not invent prices, signals, PnL, or news. If data is missing, say so. Be concise. Not financial advice. Remind users to manage risk.

LIVE CONTEXT:
${buildLiveBrief(ctx)}`;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        max_tokens: 500,
        messages: [
          { role: "system", content: system },
          { role: "user", content: question },
        ],
      }),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = json.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

export async function answerAssistant(question: string, ctx: AssistantContext) {
  const llm = await answerWithLlm(question, ctx);
  if (llm) return { answer: llm, mode: "llm" as const };
  return { answer: answerAssistantLive(question, ctx), mode: "live" as const };
}
