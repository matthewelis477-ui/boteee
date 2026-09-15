"use client";

import { api } from "@/lib/api";
import { saveProfile } from "@/lib/session";
import { SiteHeader } from "@/components/SiteHeader";
import { btnPrimary, Field, inputClass } from "@/components/ui";
import type { UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ActivatePage() {
  const router = useRouter();
  const [code, setCode] = useState("BOTEE-TRIAL-7");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const data = await api<{ user: UserProfile }>("/api/activate", {
        method: "POST",
        body: JSON.stringify({ code, name, email, password }),
      });
      saveProfile(data.user);
      router.push(data.user.onboardingComplete ? "/app" : "/onboarding");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Activation failed");
    }
  }

  return (
    <div>
      <SiteHeader active="activate" />
      <div className="mx-auto max-w-lg px-4 pb-20 pt-5 sm:pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Activate</h1>
        <p className="mt-2 text-[var(--muted)]">
          Enter your access code. Or{" "}
          <Link className="text-[var(--accent)]" href="/pricing">
            choose a plan
          </Link>
          .
        </p>
        <form className="panel mt-8 space-y-4 p-6" onSubmit={submit}>
          <Field label="Name">
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
          </Field>
          <Field label="Password (8+, for new accounts)">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Field label="Activation code">
            <input className={inputClass} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button className={btnPrimary} type="submit">
            Activate & continue
          </button>
        </form>
      </div>
    </div>
  );
}
