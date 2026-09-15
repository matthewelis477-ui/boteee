"use client";

import { api } from "@/lib/api";
import { btnPrimary, Field, inputClass } from "@/components/ui";
import { useLocale } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
};

export default function SupportPage() {
  const { c } = useLocale();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const [txHash, setTxHash] = useState("");
  const [msg, setMsg] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);

  async function load() {
    try {
      const d = await api<{ tickets: Ticket[] }>("/api/support");
      setTickets(d.tickets);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{c.support.title}</h1>
        <p className="mt-2 text-[var(--muted)]">{c.support.subtitle}</p>
      </div>
      <div className="panel space-y-4 p-5">
        <Field label="Subject">
          <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="How can we help?" />
        </Field>
        <Field label="Payment reference (optional)">
          <input className={inputClass} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
        </Field>
        <Field label="Transaction ID (optional)">
          <input className={inputClass} value={txHash} onChange={(e) => setTxHash(e.target.value)} />
        </Field>
        <Field label="Details">
          <textarea className={inputClass} rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <button
          className={btnPrimary}
          onClick={async () => {
            try {
              await api("/api/support", {
                method: "POST",
                body: JSON.stringify({ category: "payment", subject, body, invoiceId: invoiceId || null, txHash: txHash || null }),
              });
              setMsg("Ticket submitted.");
              setSubject("");
              setBody("");
              await load();
            } catch (e) {
              setMsg(e instanceof Error ? e.message : "Failed");
            }
          }}
        >
          {c.support.submit}
        </button>
        {msg ? <p className="text-sm text-[var(--accent)]">{msg}</p> : null}
      </div>
      <div className="panel p-5">
        <h2 className="font-display text-lg">Your tickets</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {tickets.map((t) => (
            <li key={t.id} className="border-t border-white/5 pt-2">
              {t.subject} · <span className="capitalize">{t.status}</span> · {t.category}
            </li>
          ))}
          {!tickets.length ? <li className="text-[var(--muted)]">No tickets yet.</li> : null}
        </ul>
      </div>
    </div>
  );
}
