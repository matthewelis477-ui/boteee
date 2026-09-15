import Link from "next/link";
import { PLANS } from "@/lib/data";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { btnGhost, btnPrimary } from "@/components/ui";

export default function HomePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader active="home" />
      <main className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:pt-6">
        <section className="relative overflow-hidden rounded-2xl border border-[var(--line)]">
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(125deg, rgba(5,14,12,0.4) 0%, rgba(5,14,12,0.92) 55%), radial-gradient(ellipse at 85% 20%, rgba(61,255,181,0.18), transparent 50%)",
            }}
          />
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                "linear-gradient(rgba(61,255,181,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(61,255,181,0.07) 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
          <div className="hero-signal absolute inset-0 opacity-40" aria-hidden />
          <div className="relative z-10 px-5 py-7 sm:px-8 sm:py-9 md:py-11 lg:max-w-[65%]">
            <p className="rise-in brand-mark text-4xl leading-none sm:text-5xl md:text-6xl">
              Bo<span>tee</span>
            </p>
            <h1 className="rise-in-delay font-display mt-4 text-xl font-semibold leading-snug tracking-tight text-[var(--text)] sm:text-2xl md:text-3xl">
              Clear crypto setups for every trade
            </h1>
            <p className="rise-in-delay-2 mt-3 max-w-md text-sm leading-relaxed text-[var(--muted)] sm:text-base">
              Signals, risk sizing, and trade management in one place.
            </p>
            <div className="rise-in-delay-2 mt-6 flex flex-wrap gap-3">
              <Link className={`${btnPrimary} min-h-11 px-5`} href="/pricing">
                View plans
              </Link>
              <Link className={`${btnGhost} min-h-11 px-5`} href="/activate">
                I have a code
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-10 sm:mt-12">
          <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">What you get</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            {[
              ["Signals", "Ranked ideas across major markets."],
              ["Risk sizing", "Know your size before you enter."],
              ["Live updates", "Stops, targets, and market tone."],
              ["Auto-trade", "Optional execution on Binance, Bybit, or OKX."],
            ].map(([t, d], i) => (
              <div key={t} className={`panel p-4 sm:p-5 ${i % 2 === 0 ? "rise-in" : "rise-in-delay"}`}>
                <div className="font-display text-base font-semibold tracking-tight sm:text-lg">{t}</div>
                <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10 sm:mt-12">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">Plans</h2>
            <Link className="text-sm text-[var(--accent)]" href="/pricing">
              See all plans →
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:gap-4 md:grid-cols-3">
            {PLANS.slice(0, 3).map((p) => (
              <div key={p.id} className={`panel p-4 sm:p-5 ${p.id === "pro" ? "ring-1 ring-[rgba(61,255,181,0.28)]" : ""}`}>
                <div className="text-[11px] uppercase tracking-[0.14em] text-[var(--muted)]">{p.for}</div>
                <div className="font-display mt-1 text-xl font-semibold sm:text-2xl">{p.name}</div>
                <div className="mt-2 text-[var(--accent)]">
                  {p.priceMonthly === 0 ? "Free" : `$${p.priceMonthly}/mo`}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{p.access}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
