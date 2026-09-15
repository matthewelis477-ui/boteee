import type { ReactNode } from "react";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "up" | "down" | "warn" | "neutral" }) {
  const map = {
    up: "text-[#3dffb5] bg-[rgba(61,255,181,0.1)] border-[rgba(61,255,181,0.28)]",
    down: "text-[#ff8da0] bg-[rgba(255,92,122,0.1)] border-[rgba(255,92,122,0.28)]",
    warn: "text-[#f0b429] bg-[rgba(240,180,41,0.1)] border-[rgba(240,180,41,0.28)]",
    neutral: "text-[var(--muted)] bg-white/5 border-white/10",
  };
  return <span className={`chip ${map[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</div>
      <div className="font-display mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {hint ? <div className="mt-1 text-xs text-[var(--muted)]">{hint}</div> : null}
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[var(--muted)]">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-[var(--line)] bg-[#071512] px-3.5 py-2.5 text-[var(--text)] outline-none transition focus:border-[rgba(61,255,181,0.45)] focus:ring-2 focus:ring-[rgba(61,255,181,0.12)]";
export const btnPrimary =
  "inline-flex items-center justify-center rounded-2xl bg-[var(--accent)] px-4 py-2.5 font-medium text-[#04110d] transition hover:brightness-110 disabled:opacity-50";
export const btnGhost =
  "inline-flex items-center justify-center rounded-2xl border border-[var(--line)] bg-white/[0.03] px-3.5 py-2 text-sm text-[var(--text)] transition hover:bg-white/[0.07] disabled:opacity-50";
