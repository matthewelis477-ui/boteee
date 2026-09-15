"use client";

import { api } from "@/lib/api";
import { saveProfile } from "@/lib/session";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { btnGhost, btnPrimary, Field, inputClass } from "@/components/ui";
import { copy } from "@/lib/i18n";
import type { UserProfile } from "@/lib/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

type InvoicePayload = {
  invoice: {
    id: string;
    email: string;
    plan: string;
    interval: string;
    amountUsd: number;
    network: string;
    status: string;
    cryptoRef: string | null;
    txHash: string | null;
  };
  address: string;
  network: string;
};

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[#061411] p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <code className="break-all text-sm text-[var(--text)]">{value || "—"}</code>
        <button
          className={btnGhost}
          type="button"
          onClick={async () => {
            if (!value) return;
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

function Inner() {
  const id = useSearchParams().get("id") || "";
  const router = useRouter();
  const [lang, setLang] = useState<"en" | "hi">("en");
  const c = copy[lang].checkout;
  const [data, setData] = useState<InvoicePayload | null>(null);
  const [txHash, setTxHash] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setData(await api<InvoicePayload>(`/api/checkout/usdt?id=${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load payment details");
    }
  }, [id]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (data?.invoice.status === "paid") {
      api<{ user: UserProfile | null }>("/api/me")
        .then((d) => {
          if (d.user) saveProfile(d.user);
        })
        .catch(() => undefined);
    }
  }, [data?.invoice.status]);

  async function submitTx() {
    setBusy(true);
    setError("");
    setMsg("");
    try {
      const res = await api<{ ok: boolean; status?: string; error?: string }>("/api/checkout/usdt/confirm", {
        method: "POST",
        body: JSON.stringify({ invoiceId: id, txHash }),
      });
      if (res.status === "paid") setMsg("Payment confirmed. Your access is ready.");
      else setMsg(res.error || "Payment received. Confirmation usually takes a minute.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit payment");
    } finally {
      setBusy(false);
    }
  }

  const invoice = data?.invoice;
  const paid = invoice?.status === "paid";

  return (
    <div>
      <SiteHeader active="pricing" />
      <div className="mx-auto max-w-xl px-4 pb-8 pt-5 sm:pt-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/pricing" className="text-sm text-[var(--muted)]">
            ← Plans
          </Link>
          <div className="flex gap-2 text-xs">
            <button className={lang === "en" ? "text-[var(--accent)]" : "text-[var(--muted)]"} onClick={() => setLang("en")}>
              EN
            </button>
            <button className={lang === "hi" ? "text-[var(--accent)]" : "text-[var(--muted)]"} onClick={() => setLang("hi")}>
              HI
            </button>
          </div>
        </div>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight">{c.title}</h1>
        <p className="mt-3 text-[var(--muted)]">{c.exactAmount}</p>

        {!invoice && !error ? <p className="mt-8 text-[var(--muted)]">Loading…</p> : null}
        {error ? <p className="mt-6 text-[var(--danger)]">{error}</p> : null}

        {invoice ? (
          <div className="mt-8 space-y-3">
            <div className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-display text-2xl capitalize">{invoice.plan}</div>
                  <div className="text-sm text-[var(--muted)]">
                    {invoice.interval} · {invoice.email}
                  </div>
                </div>
                <span className={`chip capitalize ${paid ? "text-[var(--accent)]" : "text-[var(--warn)]"}`}>
                  {invoice.status.replace("_", " ")}
                </span>
              </div>
              <div className="font-display mt-5 text-4xl text-[var(--accent)]">${invoice.amountUsd} USDT</div>
              <div className="mt-1 text-sm text-[var(--muted)]">Network: {data?.network || invoice.network}</div>
            </div>

            <CopyRow label="Deposit address" value={data?.address || ""} />
            <CopyRow label="Reference" value={invoice.cryptoRef || ""} />
            <CopyRow label="Amount (USDT)" value={String(invoice.amountUsd)} />

            {!paid ? (
              <div className="panel space-y-4 p-5">
                <Field label="Transaction ID">
                  <input
                    className={inputClass}
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Paste your transaction ID"
                  />
                </Field>
                <button className={btnPrimary} disabled={busy || !txHash} onClick={() => void submitTx()}>
                  {c.submitTx}
                </button>
                {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
                <Link href="/app/support" className="block text-sm text-[var(--accent)]">
                  {c.openTicket}
                </Link>
              </div>
            ) : (
              <button className={btnPrimary} onClick={() => router.push("/onboarding")}>
                Continue to workspace
              </button>
            )}
          </div>
        ) : null}
      </div>
      <SiteFooter />
    </div>
  );
}

export default function UsdtCheckoutPage() {
  return (
    <Suspense>
      <Inner />
    </Suspense>
  );
}
