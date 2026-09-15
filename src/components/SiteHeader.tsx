import Link from "next/link";
import { MarketTicker } from "@/components/MarketTicker";

export function SiteHeader({ active }: { active?: "home" | "pricing" | "login" | "activate" | "admin" | "legal" }) {
  const link = (href: string, key: typeof active, label: string) => (
    <Link
      href={href}
      className={`shrink-0 text-sm transition hover:text-[var(--accent)] ${active === key ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="site-chrome sticky top-0 z-50">
      <MarketTicker />
      <header className="site-nav mx-auto max-w-6xl px-4 py-2.5 sm:py-3">
        <Link href="/" className="brand-mark shrink-0 text-lg sm:text-xl">
          Bo<span>tee</span>
        </Link>
        <nav className="flex items-center gap-3 sm:gap-5">
          {link("/pricing", "pricing", "Plans")}
          {link("/activate", "activate", "Activate")}
          {link("/login", "login", "Log in")}
        </nav>
      </header>
    </div>
  );
}
