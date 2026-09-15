"use client";

import { api } from "@/lib/api";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { btnPrimary, Field, inputClass } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email or password");
    }
  }

  return (
    <div>
      <SiteHeader active="login" />
      <div className="mx-auto max-w-lg px-4 pb-20 pt-5 sm:pt-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">Welcome back</h1>
        <p className="mt-2 text-[var(--muted)]">Sign in to your account.</p>
        <form className="panel mt-8 space-y-4 p-6" onSubmit={submit}>
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Password">
            <input className={inputClass} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>
          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <button className={btnPrimary} type="submit">
            Sign in
          </button>
        </form>
        <p className="mt-4 text-sm text-[var(--muted)]">
          New to Botee?{" "}
          <Link className="text-[var(--accent)]" href="/pricing">
            Choose a plan
          </Link>{" "}
          or{" "}
          <Link className="text-[var(--accent)]" href="/activate">
            activate with a code
          </Link>
          .
        </p>
      </div>
      <SiteFooter />
    </div>
  );
}
