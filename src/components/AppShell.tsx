"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { saveProfile } from "@/lib/session";
import type { UserProfile } from "@/lib/types";
import { LocaleProvider, useLocale } from "@/components/LocaleProvider";
import { MarketTicker } from "@/components/MarketTicker";
import { NoticeBanner } from "@/components/NoticeBanner";

const NAV_KEYS = [
  ["overview", "/app"],
  ["signals", "/app/signals"],
  ["scanner", "/app/scanner"],
  ["risk", "/app/risk"],
  ["trades", "/app/trades"],
  ["futures", "/app/futures"],
  ["news", "/app/news"],
  ["assistant", "/app/assistant"],
  ["performance", "/app/performance"],
  ["paper", "/app/paper"],
  ["portfolio", "/app/portfolio"],
  ["journal", "/app/journal"],
  ["community", "/app/community"],
  ["learn", "/app/learn"],
  ["support", "/app/support"],
  ["settings", "/app/settings"],
] as const;

function ShellInner({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { c, locale, setLocale } = useLocale();
  const [user, setUser] = useState<UserProfile | null>(null);

  useEffect(() => {
    api<{ user: UserProfile | null }>("/api/me")
      .then((d) => {
        if (!d.user) {
          router.replace("/login");
          return;
        }
        saveProfile(d.user);
        if (d.user.locale === "hi" || d.user.locale === "en") setLocale(d.user.locale);
        if (!d.user.onboardingComplete && path !== "/onboarding") {
          router.replace("/onboarding");
          return;
        }
        setUser(d.user);
      })
      .catch(() => router.replace("/login"));
  }, [path, router, setLocale]);

  if (!user) {
    return (
      <div className="grid min-h-screen place-items-center text-[var(--muted)]">
        <div className="text-center">
          <div className="font-display text-2xl tracking-tight">
            Bo<span className="text-[var(--accent)]">tee</span>
          </div>
          <p className="mt-2 text-sm">Opening workspace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="sticky top-0 z-50 site-chrome">
        <MarketTicker />
      </div>
      <div className="lg:grid lg:grid-cols-[240px_1fr]">
        <aside className="border-b border-[var(--line)] bg-[rgba(6,12,14,0.92)] backdrop-blur-md lg:border-b-0 lg:border-r lg:min-h-[calc(100vh-32px)]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 sm:py-4">
            <Link href="/app" className="font-display text-lg tracking-tight sm:text-xl">
              Bo<span className="text-[var(--accent)]">tee</span>
            </Link>
            <span className="chip capitalize text-[var(--accent)]">{user.plan}</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-3 [-ms-overflow-style:none] [scrollbar-width:none] lg:flex-col lg:overflow-visible [&::-webkit-scrollbar]:hidden">
            {NAV_KEYS.map(([key, href]) => (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-xl px-3 py-2 text-sm transition ${
                  path === href
                    ? "bg-[rgba(61,245,168,0.12)] text-[var(--accent)]"
                    : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
                }`}
              >
                {c.nav[key]}
              </Link>
            ))}
          </nav>
          <div className="hidden px-4 pb-6 text-xs text-[var(--muted)] lg:block">
            <div>
              {user.name} · {user.experience}
            </div>
            <div className="mt-3 flex gap-2">
              <button className={locale === "en" ? "text-[var(--accent)]" : ""} onClick={() => setLocale("en")}>
                EN
              </button>
              <button className={locale === "hi" ? "text-[var(--accent)]" : ""} onClick={() => setLocale("hi")}>
                HI
              </button>
            </div>
            <button
              className="mt-3 text-rose-300/90"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" });
                router.push("/");
              }}
            >
              Sign out
            </button>
          </div>
        </aside>
        <main className="px-4 py-5 lg:px-8 lg:py-6">
          <NoticeBanner />
          {children}
        </main>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider>
      <ShellInner>{children}</ShellInner>
    </LocaleProvider>
  );
}
