import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import Link from "next/link";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <article className="mx-auto max-w-3xl px-4 pb-20 pt-5 sm:pt-8">
        <Link href="/" className="text-sm text-[var(--muted)]">
          ← Home
        </Link>
        <h1 className="font-display mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <div className="prose-invert mt-8 space-y-4 text-sm leading-7 text-[var(--muted)]">{children}</div>
      </article>
    </div>
  );
}
