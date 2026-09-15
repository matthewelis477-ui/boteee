"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { copy, type Locale } from "@/lib/i18n";
import { loadProfile } from "@/lib/session";

type CopyBag = (typeof copy)[Locale];

const LocaleCtx = createContext<{
  locale: Locale;
  setLocale: (l: Locale) => void;
  c: CopyBag;
}>({
  locale: "en",
  setLocale: () => undefined,
  c: copy.en,
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const p = loadProfile();
    if (p?.locale === "hi" || p?.locale === "en") setLocaleState(p.locale);
    else if (typeof window !== "undefined") {
      const saved = localStorage.getItem("botee_locale");
      if (saved === "hi" || saved === "en") setLocaleState(saved);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    if (typeof window !== "undefined") localStorage.setItem("botee_locale", l);
  };

  const value = useMemo(() => ({ locale, setLocale, c: copy[locale] as CopyBag }), [locale]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export function useLocale() {
  return useContext(LocaleCtx);
}
