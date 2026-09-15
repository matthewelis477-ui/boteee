import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mx-auto mt-12 max-w-6xl border-t border-[var(--line)] px-4 py-8 text-xs text-[var(--muted)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/" className="brand-mark text-lg">
          Bo<span>tee</span>
        </Link>
        <div className="flex flex-wrap gap-5">
          <Link href="/terms" className="hover:text-[var(--accent)]">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-[var(--accent)]">
            Privacy
          </Link>
          <Link href="/risk" className="hover:text-[var(--accent)]">
            Risk
          </Link>
          <Link href="/pricing" className="hover:text-[var(--accent)]">
            Plans
          </Link>
        </div>
      </div>
      <p className="mt-5 max-w-xl leading-relaxed">© {new Date().getFullYear()} Botee. All rights reserved.</p>
    </footer>
  );
}
