"use client";

import { api } from "@/lib/api";
import { useLocale } from "@/components/LocaleProvider";
import { useEffect, useState } from "react";

type Lesson = { id: string; slug: string; title: string; body: string };

export default function LearnPage() {
  const { c, locale } = useLocale();
  const [lessons, setLessons] = useState<Lesson[]>([]);

  useEffect(() => {
    api<{ lessons: Lesson[] }>(`/api/learn?locale=${locale}`)
      .then((d) => setLessons(d.lessons))
      .catch(() => setLessons([]));
  }, [locale]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold tracking-tight">{c.learn.title}</h1>
        <p className="mt-2 text-[var(--muted)]">{c.learn.subtitle}</p>
      </div>
      {lessons.map((t) => (
        <div key={t.id} className="panel p-5">
          <h2 className="font-display text-xl">{t.title}</h2>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--muted)]">{t.body}</p>
        </div>
      ))}
      {!lessons.length ? <p className="text-[var(--muted)]">Loading lessons…</p> : null}
    </div>
  );
}
