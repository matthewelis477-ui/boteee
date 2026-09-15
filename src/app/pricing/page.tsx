"use client";

import { PLANS } from "@/lib/data";
import { api } from "@/lib/api";
import { saveProfile } from "@/lib/session";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { btnGhost, btnPrimary, Field, inputClass } from "@/components/ui";
import type { PlanId, UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PricingPage() {
  const router = useRouter();
  const [interval, setInterval] = useState<"monthly" | "yearly">("monthly");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function checkout(plan: PlanId) {
    setError("");
    setBusy(plan);
    try {
      const data = await api<{
        payUrl?: string;
        user?: UserProfile;
      }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ plan, interval, email, password, name }),
      });
      if (data.payUrl) {
        router.push(data.payUrl);
        return;
      }
      if (data.user) saveProfile(data.user);
      router.push("/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <SiteHeader active="pricing" />
      <div className="mx-auto max-w-5xl px-4 pb-20 pt-5 sm:pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">Choose your plan</h1>
        <p className="mt-4 max-w-2xl text-[var(--muted)] leading-relaxed">
          Create your account, choose a plan, and unlock access after payment.
        </p>

        <div className="mt-8 flex gap-2">
          <button className={interval === "monthly" ? btnPrimary : btnGhost} onClick={() => setInterval("monthly")}>
            Monthly
          </button>
          <button className={interval === "yearly" ? btnPrimary : btnGhost} onClick={() => setInterval("yearly")}>
            Yearly · save more
          </button>
        </div>

        <div className="panel mt-6 grid gap-3 p-5 md:grid-cols-3">
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </Field>
          <Field label="Password (8+)">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {PLANS.map((p) => {
            const price = interval === "yearly" ? p.priceYearly : p.priceMonthly;
            const featured = p.id === "pro";
            return (
              <div
                key={p.id}
                className={`panel relative overflow-hidden p-6 ${featured ? "border-[rgba(61,255,181,0.4)]" : ""}`}
              >
                {featured ? <div className="absolute right-4 top-4 chip text-[var(--accent)]">Popular</div> : null}
                <div className="text-xs uppercase tracking-[0.14em] text-[var(--muted)]">{p.for}</div>
                <h2 className="font-display mt-2 text-3xl font-semibold">{p.name}</h2>
                <p className="mt-3 text-2xl text-[var(--accent)]">
                  {price === 0 ? (
                    "Free"
                  ) : (
                    <>
                      ${price}{" "}
                      <span className="text-sm text-[var(--muted)]">/ {interval === "yearly" ? "year" : "month"}</span>
                    </>
                  )}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text)]/90">{p.access}</p>
                <ul className="mt-5 space-y-2.5 text-sm text-[var(--muted)]">
                  {p.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <span className="mt-0.5 text-[var(--accent)]">▹</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <button
                  className={`${btnPrimary} mt-6 w-full justify-center`}
                  disabled={busy === p.id}
                  onClick={() => void checkout(p.id)}
                >
                  {busy === p.id ? "Please wait…" : p.id === "free" ? "Start free" : "Continue to payment"}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-10 text-center text-xs text-[var(--muted)]">
          Already have a code?{" "}
          <Link href="/activate" className="text-[var(--accent)]">
            Activate access
          </Link>
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
