"use client";

import { api } from "@/lib/api";
import { saveProfile } from "@/lib/session";
import { TUTORIALS } from "@/lib/data";
import { btnGhost, btnPrimary, Field, inputClass } from "@/components/ui";
import type { Experience, Locale, MarketType, RiskLevel, Style, UserProfile } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [experience, setExperience] = useState<Experience>("beginner");
  const [marketType, setMarketType] = useState<MarketType>("spot");
  const [style, setStyle] = useState<Style>("intraday");
  const [coins, setCoins] = useState("BTC/USDT, ETH/USDT");
  const [timeframes, setTimeframes] = useState("1 Hour");
  const [risk, setRisk] = useState<RiskLevel>("low");
  const [locale, setLocale] = useState<Locale>("en");

  useEffect(() => {
    api<{ user: UserProfile | null }>("/api/me")
      .then((d) => {
        if (!d.user) router.replace("/login");
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function finish() {
    const data = await api<{ user: UserProfile }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({
        experience,
        marketType,
        style,
        coins: coins.split(",").map((x) => x.trim()).filter(Boolean),
        timeframes: timeframes.split(",").map((x) => x.trim()).filter(Boolean),
        risk,
        locale,
        onboardingComplete: true,
        signalFormat: experience === "beginner" ? "beginner" : "advanced",
      }),
    });
    saveProfile(data.user);
    try {
      await api("/api/me/notices", {
        method: "POST",
        body: JSON.stringify({ action: "welcome" }),
      });
    } catch {
      /* welcome may already exist */
    }
    router.push("/app");
  }

  const steps = [
    {
      title: locale === "hi" ? "अनुभव स्तर" : "How experienced are you?",
      body: (
        <select className={inputClass} value={experience} onChange={(e) => setExperience(e.target.value as Experience)}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="pro">Pro</option>
        </select>
      ),
    },
    {
      title: "Spot or Futures?",
      body: (
        <select className={inputClass} value={marketType} onChange={(e) => setMarketType(e.target.value as MarketType)}>
          <option value="spot">Spot</option>
          <option value="futures">Futures</option>
        </select>
      ),
    },
    {
      title: "Scalping, Intraday or Swing?",
      body: (
        <select className={inputClass} value={style} onChange={(e) => setStyle(e.target.value as Style)}>
          <option value="scalping">Scalping</option>
          <option value="intraday">Intraday</option>
          <option value="swing">Swing</option>
        </select>
      ),
    },
    {
      title: "Preferred coins and timeframes",
      body: (
        <div className="space-y-3">
          <Field label="Coins">
            <input className={inputClass} value={coins} onChange={(e) => setCoins(e.target.value)} />
          </Field>
          <Field label="Timeframes">
            <input className={inputClass} value={timeframes} onChange={(e) => setTimeframes(e.target.value)} />
          </Field>
        </div>
      ),
    },
    {
      title: "Personal risk level",
      body: (
        <select className={inputClass} value={risk} onChange={(e) => setRisk(e.target.value as RiskLevel)}>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      ),
    },
    {
      title: "Language",
      body: (
        <select className={inputClass} value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
      ),
    },
    {
      title: "Entry, stop-loss, targets",
      body: (
        <ul className="space-y-2 text-sm text-slate-300">
          {TUTORIALS.map((t) => (
            <li key={t.id}>
              <strong>{t.title}:</strong> {t.text}
            </li>
          ))}
        </ul>
      ),
    },
  ];

  const current = steps[step];

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <p className="font-display text-sm tracking-tight">
        Bo<span className="text-[var(--accent)]">tee</span>
        <span className="ml-3 text-[var(--muted)]">
          Guided setup {step + 1}/{steps.length}
        </span>
      </p>
      <h1 className="font-display mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{current.title}</h1>
      <div className="panel mt-6 p-5 sm:p-6">{current.body}</div>
      <div className="mt-4 flex flex-wrap gap-3">
        {step > 0 ? (
          <button className={`${btnGhost} min-h-11`} onClick={() => setStep((s) => s - 1)}>
            Back
          </button>
        ) : null}
        {step < steps.length - 1 ? (
          <button className={`${btnPrimary} min-h-11`} onClick={() => setStep((s) => s + 1)}>
            Next
          </button>
        ) : (
          <button className={`${btnPrimary} min-h-11`} onClick={() => void finish()}>
            Enter Botee
          </button>
        )}
      </div>
    </div>
  );
}
