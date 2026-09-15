"use client";

import { api } from "@/lib/api";
import { useEffect, useState } from "react";

type Ev = {
  id: string;
  title: string;
  whenLabel: string;
  impact: string;
  protection: string;
};

export default function NewsPage() {
  const [events, setEvents] = useState<Ev[]>([]);

  useEffect(() => {
    api<{ events: Ev[] }>("/api/news")
      .then((d) => setEvents(d.events))
      .catch(() => setEvents([]));
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold tracking-tight">News, sentiment & event protection</h1>
      <p className="text-[var(--muted)]">Live macro calendar when available. High-impact windows can pause new directional signals.</p>
      {events.map((e) => (
        <div key={e.id} className="panel p-5">
          <div className="flex gap-2 text-sm">
            <span className="capitalize text-amber-200">{e.impact} impact</span>
            <span className="text-[var(--muted)]">{e.whenLabel}</span>
          </div>
          <h2 className="mt-1 font-display text-xl">{e.title}</h2>
          <p className="mt-2 text-[var(--text)]/90">{e.protection}</p>
        </div>
      ))}
    </div>
  );
}
