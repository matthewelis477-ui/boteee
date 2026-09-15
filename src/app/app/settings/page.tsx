"use client";

import { btnGhost, btnPrimary, Field, inputClass } from "@/components/ui";
import { api } from "@/lib/api";
import { loadProfile, saveProfile } from "@/lib/session";
import type { UserProfile } from "@/lib/types";
import { useLocale } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";

type Cred = {
  id: string;
  exchange: string;
  label: string;
  canTrade: boolean;
  canWithdraw: boolean;
  enabled: boolean;
  lastValidatedAt: string | null;
};

type Prefs = {
  autoTradeEnabled: boolean;
  preferredVenue: string;
  maxRiskPct: number;
  maxLeverage: number;
  maxOpenTrades: number;
  markets: string;
  killSwitch: boolean;
  capitalUsd: number;
};

type VenueOption = {
  id: string;
  label: string;
  family: string;
  market: string;
  needsPassphrase: boolean;
  docsUrl: string;
  keyHints: string[];
};

export default function SettingsPage() {
  const { c, locale, setLocale } = useLocale();
  const [ready, setReady] = useState(false);
  const [coins, setCoins] = useState("");
  const [minC, setMinC] = useState(80);
  const [maxLev, setMaxLev] = useState(5);
  const [quiet, setQuiet] = useState("23:00–07:00");
  const [format, setFormat] = useState("beginner");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [tgUrl, setTgUrl] = useState("");
  const [saved, setSaved] = useState(false);
  const [creds, setCreds] = useState<Cred[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [exchange, setExchange] = useState("binance_futures");
  const [msg, setMsg] = useState("");

  async function loadTrading() {
    try {
      const data = await api<{ credentials: Cred[]; prefs: Prefs; venues: VenueOption[] }>("/api/me/exchange-keys");
      setCreds(data.credentials);
      setPrefs({ ...data.prefs, preferredVenue: data.prefs.preferredVenue || "binance" });
      setVenues(data.venues || []);
      if (data.venues?.length && !data.venues.find((v) => v.id === exchange)) {
        setExchange(data.venues[0].id);
      }
    } catch {
      /* not logged or plan */
    }
  }

  useEffect(() => {
    const p = loadProfile();
    if (p) {
      setCoins(p.coins.join(", "));
      setMinC(p.minConfidence);
      setMaxLev(p.maxLeverage);
      setQuiet(p.quietHours);
      setFormat(p.signalFormat);
      setTelegramChatId(p.telegramChatId || "");
    }
    setReady(true);
    void loadTrading();
  }, []);

  async function save() {
    const data = await api<{ user: UserProfile }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        coins: coins.split(",").map((x) => x.trim()),
        minConfidence: minC,
        maxLeverage: maxLev,
        quietHours: quiet,
        signalFormat: format,
        locale,
        experience: format === "beginner" ? "beginner" : loadProfile()?.experience,
      }),
    });
    saveProfile(data.user);
    setTelegramChatId(data.user.telegramChatId || "");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{c.settings.title}</h1>
        <p className="mt-2 max-w-2xl text-[var(--muted)] leading-relaxed">
          Alerts, language, and trading preferences.
        </p>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-display text-lg">{c.settings.language}</h2>
        <div className="flex gap-2">
          <button className={locale === "en" ? btnPrimary : btnGhost} onClick={() => setLocale("en")}>
            English
          </button>
          <button className={locale === "hi" ? btnPrimary : btnGhost} onClick={() => setLocale("hi")}>
            हिंदी
          </button>
        </div>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-display text-lg">Personalization</h2>
        <Field label="Favourite markets (optional)">
          <input
            className={inputClass}
            value={coins}
            onChange={(e) => setCoins(e.target.value)}
            placeholder="e.g. BTC/USDT, ETH/USDT (blank = all)"
          />
        </Field>
        <Field label="Minimum confidence">
          <input className={inputClass} type="number" value={minC} onChange={(e) => setMinC(+e.target.value)} />
        </Field>
        <Field label="Maximum leverage (signal filter)">
          <input className={inputClass} type="number" value={maxLev} onChange={(e) => setMaxLev(+e.target.value)} />
        </Field>
        <Field label="Quiet hours">
          <input className={inputClass} value={quiet} onChange={(e) => setQuiet(e.target.value)} />
        </Field>
        <Field label="Signal format">
          <select className={inputClass} value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="advanced">Advanced / Pro</option>
          </select>
        </Field>
        <button className={btnPrimary} onClick={() => void save()}>
          {saved ? "Saved" : "Save filters"}
        </button>
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-display text-lg">Telegram</h2>
        <p className="text-sm text-[var(--muted)]">{c.settings.telegramHint}</p>
        {telegramChatId ? <p className="text-sm text-[var(--accent)]">{c.settings.linked}</p> : null}
        {tgUrl ? (
          <a className={btnPrimary} href={tgUrl} target="_blank" rel="noreferrer">
            Open Telegram and tap Start
          </a>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            className={btnPrimary}
            onClick={async () => {
              try {
                const d = await api<{ url: string; chatId: string | null; configured?: boolean }>("/api/me/telegram", {
                  method: "POST",
                });
                setTgUrl(d.url || "");
                if (d.chatId) setTelegramChatId(d.chatId);
                setMsg(d.url ? "Open the link and tap Start in Telegram." : "Telegram is not available yet.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Could not connect Telegram");
                setTgUrl("");
              }
            }}
          >
            {c.settings.telegramLink}
          </button>
          {telegramChatId ? (
            <button
              className={btnGhost}
              onClick={async () => {
                await api("/api/me/telegram", { method: "DELETE" });
                setTelegramChatId("");
                setTgUrl("");
              }}
            >
              {c.settings.unlink}
            </button>
          ) : null}
        </div>
        {msg ? <p className="text-sm text-[var(--muted)]">{msg}</p> : null}
      </div>

      <div className="panel space-y-4 p-5">
        <h2 className="font-display text-lg">Auto-trading</h2>
        <p className="text-sm text-[var(--muted)]">
          Available on Pro and above. Connect Binance, Bybit, or OKX to execute approved signals automatically.
        </p>
        {prefs ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.autoTradeEnabled}
                onChange={(e) => setPrefs({ ...prefs, autoTradeEnabled: e.target.checked })}
              />
              Enable auto-trade
            </label>
            <label className="flex items-center gap-2 text-sm text-rose-300">
              <input type="checkbox" checked={prefs.killSwitch} onChange={(e) => setPrefs({ ...prefs, killSwitch: e.target.checked })} />
              Emergency stop
            </label>
            <Field label="Preferred exchange">
              <select
                className={inputClass}
                value={prefs.preferredVenue || "binance"}
                onChange={(e) => setPrefs({ ...prefs, preferredVenue: e.target.value })}
              >
                <option value="binance">Binance</option>
                <option value="bybit">Bybit</option>
                <option value="okx">OKX</option>
              </select>
            </Field>
            <Field label="Capital for sizing (USD)">
              <input
                className={inputClass}
                type="number"
                value={prefs.capitalUsd}
                onChange={(e) => setPrefs({ ...prefs, capitalUsd: +e.target.value })}
              />
            </Field>
            <Field label="Max risk %">
              <input
                className={inputClass}
                type="number"
                value={prefs.maxRiskPct}
                onChange={(e) => setPrefs({ ...prefs, maxRiskPct: +e.target.value })}
              />
            </Field>
            <Field label="Max leverage">
              <input
                className={inputClass}
                type="number"
                value={prefs.maxLeverage}
                onChange={(e) => setPrefs({ ...prefs, maxLeverage: +e.target.value })}
              />
            </Field>
            <Field label="Max open trades">
              <input
                className={inputClass}
                type="number"
                value={prefs.maxOpenTrades}
                onChange={(e) => setPrefs({ ...prefs, maxOpenTrades: +e.target.value })}
              />
            </Field>
            <button
              className={btnPrimary}
              onClick={async () => {
                try {
                  await api("/api/me/exchange-keys", { method: "PATCH", body: JSON.stringify({ prefs }) });
                  setMsg("Trading preferences saved.");
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Save failed");
                }
              }}
            >
              Save trading prefs
            </button>
          </div>
        ) : null}

        <div className="border-t border-white/10 pt-4">
          <h3 className="font-medium">Connect exchange</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Use a trade-only API key. Withdrawals must stay off. Keys are encrypted at rest.
          </p>
          <div className="mt-3 grid gap-3">
            <Field label="Venue">
              <select className={inputClass} value={exchange} onChange={(e) => setExchange(e.target.value)}>
                {(venues.length
                  ? venues
                  : [
                      { id: "binance_futures", label: "Binance Futures USD-M" },
                      { id: "binance_spot", label: "Binance Spot" },
                      { id: "bybit_linear", label: "Bybit Linear" },
                      { id: "bybit_spot", label: "Bybit Spot" },
                      { id: "okx_swap", label: "OKX Perpetual Swap" },
                      { id: "okx_spot", label: "OKX Spot" },
                    ]
                ).map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            {venues.find((v) => v.id === exchange)?.keyHints?.length ? (
              <ul className="list-disc pl-5 text-xs text-[var(--muted)]">
                {venues
                  .find((v) => v.id === exchange)!
                  .keyHints.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                {venues.find((v) => v.id === exchange)?.docsUrl ? (
                  <li>
                    <a
                      className="text-[var(--accent)]"
                      href={venues.find((v) => v.id === exchange)!.docsUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official API docs
                    </a>
                  </li>
                ) : null}
              </ul>
            ) : null}
            <Field label="API key">
              <input className={inputClass} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="API secret">
              <input
                className={inputClass}
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                autoComplete="off"
              />
            </Field>
            {venues.find((v) => v.id === exchange)?.needsPassphrase || exchange.startsWith("okx") ? (
              <Field label="Passphrase (OKX)">
                <input
                  className={inputClass}
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="off"
                />
              </Field>
            ) : null}
            <button
              className={btnPrimary}
              onClick={async () => {
                try {
                  await api("/api/me/exchange-keys", {
                    method: "POST",
                    body: JSON.stringify({ exchange, apiKey, apiSecret, passphrase }),
                  });
                  setApiKey("");
                  setApiSecret("");
                  setPassphrase("");
                  setMsg("Exchange connected successfully.");
                  await loadTrading();
                } catch (e) {
                  setMsg(e instanceof Error ? e.message : "Could not connect key");
                }
              }}
            >
              Validate & connect
            </button>
          </div>
          <ul className="mt-4 space-y-2 text-sm text-[var(--muted)]">
            {creds.map((cItem) => (
              <li key={cItem.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  {cItem.label || cItem.exchange}
                  {" · "}
                  {cItem.enabled ? "Active" : "Paused"}
                  {cItem.canWithdraw ? " · Please recreate key without withdrawals" : ""}
                </span>
                <button
                  className={btnGhost}
                  onClick={async () => {
                    await api(`/api/me/exchange-keys?exchange=${cItem.exchange}`, { method: "DELETE" });
                    await loadTrading();
                  }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
