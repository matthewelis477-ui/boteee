"use client";

import { api } from "@/lib/api";
import { useCallback, useEffect, useState } from "react";

type Notice = {
  id: string;
  kind: string;
  title: string;
  body: string;
  createdAt: string;
};

function tone(kind: string) {
  if (kind === "stop_hit" || kind === "trade_issue") return "border-rose-500/30 bg-rose-500/10 text-rose-50";
  if (kind === "trade_opened" || kind === "welcome" || kind === "target_hit") {
    return "border-[rgba(61,255,181,0.28)] bg-[rgba(61,255,181,0.08)] text-[var(--text)]";
  }
  return "border-[var(--line)] bg-[rgba(12,28,24,0.9)] text-[var(--text)]";
}

export function NoticeBanner() {
  const [notices, setNotices] = useState<Notice[]>([]);

  const load = useCallback(async () => {
    try {
      const data = await api<{ notices: Notice[] }>("/api/me/notices");
      setNotices(data.notices || []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 25_000);
    return () => clearInterval(id);
  }, [load]);

  if (!notices.length) return null;

  return (
    <div className="mb-5 space-y-2">
      {notices.slice(0, 3).map((n) => (
        <div
          key={n.id}
          className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${tone(n.kind)}`}
        >
          <div>
            <div className="font-medium">{n.title}</div>
            {n.body ? <p className="mt-1 text-[var(--muted)]">{n.body}</p> : null}
          </div>
          <button
            className="shrink-0 text-xs text-[var(--accent)]"
            onClick={async () => {
              await api("/api/me/notices", { method: "PATCH", body: JSON.stringify({ id: n.id }) });
              setNotices((prev) => prev.filter((x) => x.id !== n.id));
            }}
          >
            Dismiss
          </button>
        </div>
      ))}
      {notices.length > 3 ? (
        <button
          className="text-xs text-[var(--muted)]"
          onClick={async () => {
            await api("/api/me/notices", { method: "PATCH", body: JSON.stringify({ all: true }) });
            setNotices([]);
          }}
        >
          Dismiss all
        </button>
      ) : null}
    </div>
  );
}
