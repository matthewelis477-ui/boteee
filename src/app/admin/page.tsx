"use client";

import { api } from "@/lib/api";
import { btnGhost, btnPrimary, Field, inputClass } from "@/components/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Signal } from "@/lib/types";

type Summary = {
  users: { email: string; plan: string; role: string; expiresAt: string | null }[];
  invoices: {
    id: string;
    email: string;
    plan: string;
    status: string;
    method: string;
    amountUsd: number;
    cryptoRef?: string | null;
    txHash?: string | null;
  }[];
  runs: { ranAt: string; count: number; note: string }[];
  tickets?: { id: string; email: string; subject: string; status: string; txHash: string | null }[];
};

type StrategyPayload = {
  active: string;
  strategies: {
    key: string;
    active: boolean;
    backtests: {
      id: string;
      symbol: string;
      trades: number;
      winRate: number;
      profitFactor: number;
      maxDrawdownPct: number;
      notes: string;
    }[];
  }[];
  qa: { signalId: string; decision: string; note: string; createdAt: string }[];
};

export default function AdminPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [queue, setQueue] = useState<Signal[]>([]);
  const [strategy, setStrategy] = useState<StrategyPayload | null>(null);
  const [qaNote, setQaNote] = useState("");
  const [msg, setMsg] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [launch, setLaunch] = useState<{
    appUrl: string;
    telegram: {
      tokenSet: boolean;
      tokenMasked: string;
      username: string;
      usernameConfigured: boolean;
      adminChatId: string;
      ready: boolean;
    };
    payments: {
      address: string;
      addressConfigured: boolean;
      network: string;
      trongridKeySet: boolean;
      trongridKeyMasked: string;
      ready: boolean;
    };
    trading: { testnet: boolean; liveEnabled: boolean };
    webhook: { url?: string; pending_update_count?: number; last_error_message?: string } | null;
  } | null>(null);
  const [cfg, setCfg] = useState({
    app_url: "",
    telegram_bot_token: "",
    telegram_bot_username: "",
    telegram_admin_chat_id: "",
    crypto_usdt_address: "",
    crypto_usdt_network: "BEP20",
    trongrid_api_key: "",
    binance_testnet: true,
    live_trading_enabled: false,
  });

  async function load() {
    try {
      setSummary(await api<Summary>("/api/admin/summary"));
      const sig = await api<{ signals: Signal[] }>("/api/signals");
      setQueue(sig.signals);
      setStrategy(await api<StrategyPayload>("/api/admin/strategy"));
      const settings = await api<NonNullable<typeof launch>>("/api/admin/settings");
      setLaunch(settings);
      setCfg((c) => ({
        ...c,
        app_url: settings.appUrl || "",
        telegram_bot_username: settings.telegram.username || "",
        telegram_admin_chat_id: settings.telegram.adminChatId || "",
        crypto_usdt_address: settings.payments.address || "",
        crypto_usdt_network: settings.payments.network || "BEP20",
        binance_testnet: settings.trading.testnet,
        live_trading_enabled: settings.trading.liveEnabled,
        telegram_bot_token: "",
        trongrid_api_key: "",
      }));
      setMsg("");
    } catch {
      setMsg("Admin session required.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function confirmInvoice(invoiceId: string) {
    setBusyId(invoiceId);
    try {
      await api("/api/checkout/usdt/confirm", {
        method: "POST",
        body: JSON.stringify({ invoiceId, confirm: true }),
      });
      setMsg("USDT invoice marked paid.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Confirm failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/" className="font-display text-xl tracking-tight">
            Bo<span className="text-[var(--accent)]">tee</span>
          </Link>
          <h1 className="mt-2 font-display text-3xl tracking-tight">Admin</h1>
        </div>
        <Link href="/" className="text-sm text-[var(--muted)]">
          Public site
        </Link>
      </div>
      {msg ? <p className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-amber-100">{msg}</p> : null}

      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg">Launch config</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Configure Telegram, USDT deposits, and trading mode. Secrets stay encrypted; leave blank to keep current values.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className={`chip ${launch?.telegram.ready ? "text-[var(--accent)]" : ""}`}>
              Telegram {launch?.telegram.ready ? "ready" : "needs setup"}
            </span>
            <span className={`chip ${launch?.payments.ready ? "text-[var(--accent)]" : ""}`}>
              Payments {launch?.payments.ready ? "ready" : "needs setup"}
            </span>
            <span className="chip">
              Trading {launch?.trading.testnet ? "testnet" : launch?.trading.liveEnabled ? "LIVE" : "paused"}
            </span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Field label="App URL (public https)">
            <input
              className={inputClass}
              value={cfg.app_url}
              onChange={(e) => setCfg({ ...cfg, app_url: e.target.value })}
              placeholder="https://your-domain.com"
            />
          </Field>
          <Field label="USDT network">
            <select
              className={inputClass}
              value={cfg.crypto_usdt_network}
              onChange={(e) => setCfg({ ...cfg, crypto_usdt_network: e.target.value })}
            >
              <option value="BEP20">BEP20 (BSC)</option>
              <option value="TRC20">TRC20 (Tron)</option>
            </select>
          </Field>
          <Field label="Telegram bot token">
            <input
              className={inputClass}
              value={cfg.telegram_bot_token}
              onChange={(e) => setCfg({ ...cfg, telegram_bot_token: e.target.value })}
              placeholder={launch?.telegram.tokenSet ? launch.telegram.tokenMasked : "From BotFather"}
              autoComplete="off"
            />
          </Field>
          <Field label="Telegram bot username (no @)">
            <input
              className={inputClass}
              value={cfg.telegram_bot_username}
              onChange={(e) => setCfg({ ...cfg, telegram_bot_username: e.target.value })}
              placeholder="YourRealBot"
            />
          </Field>
          <Field label="Admin Telegram chat ID">
            <input
              className={inputClass}
              value={cfg.telegram_admin_chat_id}
              onChange={(e) => setCfg({ ...cfg, telegram_admin_chat_id: e.target.value })}
              placeholder="For ops alerts"
            />
          </Field>
          <Field label="USDT deposit address">
            <input
              className={inputClass}
              value={cfg.crypto_usdt_address}
              onChange={(e) => setCfg({ ...cfg, crypto_usdt_address: e.target.value })}
              placeholder="0x… for BEP20"
            />
          </Field>
          {String(cfg.crypto_usdt_network).toUpperCase().includes("TRC") ? (
            <Field label="TronGrid API key (optional)">
              <input
                className={inputClass}
                value={cfg.trongrid_api_key}
                onChange={(e) => setCfg({ ...cfg, trongrid_api_key: e.target.value })}
                placeholder={launch?.payments.trongridKeySet ? launch.payments.trongridKeyMasked : "Optional"}
                autoComplete="off"
              />
            </Field>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cfg.binance_testnet}
              onChange={(e) => setCfg({ ...cfg, binance_testnet: e.target.checked, live_trading_enabled: e.target.checked ? false : cfg.live_trading_enabled })}
            />
            Exchange testnet (Binance / Bybit / OKX simulated)
          </label>
          <label className="flex items-center gap-2 text-rose-300">
            <input
              type="checkbox"
              checked={cfg.live_trading_enabled}
              onChange={(e) =>
                setCfg({
                  ...cfg,
                  live_trading_enabled: e.target.checked,
                  binance_testnet: e.target.checked ? false : cfg.binance_testnet,
                })
              }
            />
            Enable live auto-trade
          </label>
        </div>

        {launch?.webhook?.url ? (
          <p className="text-xs text-[var(--muted)]">
            Webhook: {launch.webhook.url}
            {launch.webhook.last_error_message ? ` · last error: ${launch.webhook.last_error_message}` : ""}
          </p>
        ) : (
          <p className="text-xs text-[var(--muted)]">Webhook not registered yet.</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            className={btnPrimary}
            onClick={async () => {
              try {
                const body: Record<string, unknown> = {
                  app_url: cfg.app_url,
                  telegram_bot_username: cfg.telegram_bot_username,
                  telegram_admin_chat_id: cfg.telegram_admin_chat_id,
                  crypto_usdt_address: cfg.crypto_usdt_address,
                  crypto_usdt_network: cfg.crypto_usdt_network,
                  binance_testnet: cfg.binance_testnet,
                  live_trading_enabled: cfg.live_trading_enabled,
                };
                if (cfg.telegram_bot_token) body.telegram_bot_token = cfg.telegram_bot_token;
                if (cfg.trongrid_api_key) body.trongrid_api_key = cfg.trongrid_api_key;
                if (cfg.live_trading_enabled) body.confirmLive = true;
                await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) });
                setMsg("Launch config saved.");
                await load();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Save failed");
              }
            }}
          >
            Save config
          </button>
          <button
            className={btnGhost}
            onClick={async () => {
              try {
                const d = await api<{ url: string }>("/api/admin/settings", {
                  method: "POST",
                  body: JSON.stringify({ action: "register_webhook" }),
                });
                setMsg(`Telegram webhook registered: ${d.url}`);
                await load();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Webhook register failed");
              }
            }}
          >
            Register Telegram webhook
          </button>
          <button
            className={btnGhost}
            onClick={async () => {
              try {
                await api("/api/admin/settings", { method: "POST", body: JSON.stringify({ action: "test_telegram" }) });
                setMsg("Test message sent to admin chat.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Telegram test failed");
              }
            }}
          >
            Send test alert
          </button>
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        <button className={btnPrimary} onClick={() => void load()}>
          Reload
        </button>
        <button
          className={btnGhost}
          onClick={async () => {
            try {
              await api("/api/signals", { method: "POST", body: JSON.stringify({}) });
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Pipeline refresh failed");
            }
          }}
        >
          Run signal pipeline
        </button>
        <button
          className={btnGhost}
          onClick={async () => {
            try {
              const d = await api<{ result: { profitFactor: number; winRate: number; notes: string } }>("/api/admin/strategy", {
                method: "POST",
                body: JSON.stringify({ action: "backtest", key: strategy?.active || "v2-ema-rsi-atr", symbol: "BTCUSDT" }),
              });
              setMsg(
                `Backtest PF ${d.result.profitFactor} · WR ${(d.result.winRate * 100).toFixed(0)}% — ${d.result.notes}`,
              );
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Backtest failed");
            }
          }}
        >
          Run BTC backtest
        </button>
      </div>

      <section className="panel p-5">
        <h2 className="font-display text-lg">Strategy quality</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Active: {strategy?.active || "—"}. Backtests include fees/slippage model. Not a guarantee of future profit.
        </p>
        <ul className="mt-3 space-y-3 text-sm">
          {(strategy?.strategies || []).map((s) => (
            <li key={s.key} className="border-t border-white/5 pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {s.key} {s.active ? "· ACTIVE" : ""}
                </span>
                {!s.active ? (
                  <button
                    className={btnGhost}
                    onClick={async () => {
                      await api("/api/admin/strategy", { method: "POST", body: JSON.stringify({ action: "activate", key: s.key }) });
                      await load();
                    }}
                  >
                    Mark active in DB
                  </button>
                ) : null}
              </div>
              {(s.backtests || []).slice(0, 2).map((b) => (
                <div key={b.id} className="mt-1 text-[var(--muted)]">
                  {b.symbol}: {b.trades} trades · WR {(b.winRate * 100).toFixed(0)}% · PF {b.profitFactor} · DD {b.maxDrawdownPct}%
                </div>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-lg">USDT invoices</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {(summary?.invoices || []).map((i) => (
            <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3">
              <span>
                {i.email} · {i.plan} · <span className="capitalize">{i.status}</span> · ${i.amountUsd}
                {i.cryptoRef ? ` · ${i.cryptoRef}` : ""}
                {i.txHash ? ` · tx ${i.txHash.slice(0, 10)}…` : ""}
              </span>
              {i.status === "pending" ? (
                <button className={btnPrimary} disabled={busyId === i.id} onClick={() => void confirmInvoice(i.id)}>
                  Confirm USDT
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-lg">Support tickets</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {(summary?.tickets || []).map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-2">
              <span>
                {t.email} · {t.subject} · {t.status}
                {t.txHash ? ` · ${t.txHash.slice(0, 12)}…` : ""}
              </span>
              {t.status === "open" ? (
                <button
                  className={btnGhost}
                  onClick={async () => {
                    await api("/api/support", { method: "PATCH", body: JSON.stringify({ id: t.id, status: "resolved" }) });
                    await load();
                  }}
                >
                  Resolve
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-lg">Live signals</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Directional signals are auto-approved when published. Telegram and auto-trade use them immediately. You can still reject a bad one.
        </p>
        <Field label="Note (required to reject)">
          <input className={inputClass} value={qaNote} onChange={(e) => setQaNote(e.target.value)} placeholder="Why this setup is invalid" />
        </Field>
        {queue.map((s) => (
          <div key={s.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/5 pt-3 text-sm">
            <span>
              {s.asset} {s.side} · {s.confidence}% · {s.approved ? "Live" : "Held"}
            </span>
            <div className="flex gap-2">
              {s.approved && s.side !== "NO-TRADE" ? (
                <button
                  className={btnGhost}
                  onClick={async () => {
                    if (!qaNote.trim()) {
                      setMsg("Add a short reject note.");
                      return;
                    }
                    try {
                      await api("/api/admin/strategy", {
                        method: "POST",
                        body: JSON.stringify({ action: "qa", signalId: s.id, decision: "reject", note: qaNote }),
                      });
                      await load();
                    } catch (e) {
                      setMsg(e instanceof Error ? e.message : "Reject failed");
                    }
                  }}
                >
                  Reject
                </button>
              ) : null}
            </div>
          </div>
        ))}
        <div className="mt-4 text-xs text-[var(--muted)]">
          Recent overrides: {(strategy?.qa || []).slice(0, 5).map((q) => `${q.decision}:${q.note}`).join(" · ") || "—"}
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="font-display text-lg">Users</h2>
        <table className="mt-3 w-full text-sm">
          <thead className="text-[var(--muted)]">
            <tr>
              <th className="text-left">Email</th>
              <th>Plan</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {(summary?.users || []).map((u) => (
              <tr key={u.email} className="border-t border-white/5">
                <td className="py-2">{u.email}</td>
                <td className="text-center">{u.plan}</td>
                <td className="text-center">{u.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel p-5 text-sm text-[var(--muted)]">
        <h2 className="font-display text-lg text-[var(--text)]">Activation codes</h2>
        <p className="mt-2">Managed in the database. Seeded codes: BOTEE-TRIAL-7, BOTEE-FREE, BOTEE-BASIC, BOTEE-PRO, BOTEE-ELITE, FOUNDER-LIFE.</p>
      </section>
    </div>
  );
}
