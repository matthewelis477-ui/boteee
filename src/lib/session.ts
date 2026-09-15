import type { UserProfile } from "./types";

const KEY = "botee-session";

export const defaultProfile = (): UserProfile => ({
  name: "Trader",
  email: "",
  locale: "en",
  experience: "beginner",
  marketType: "spot",
  style: "intraday",
  coins: [],
  timeframes: ["1 Hour", "4 Hour"],
  risk: "low",
  plan: "free",
  activationCode: "",
  expiresAt: "",
  paperBalance: 10000,
  paperEquity: 10000,
  onboardingComplete: false,
  minConfidence: 74,
  maxLeverage: 3,
  directions: ["LONG", "SHORT"],
  quietHours: "23:00–07:00",
  notify: ["app", "telegram"],
  signalFormat: "beginner",
  telegramChatId: "",
});

export function loadProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserProfile;
  } catch {
    return null;
  }
}

export function saveProfile(p: UserProfile) {
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function clearProfile() {
  localStorage.removeItem(KEY);
  localStorage.removeItem("botee-paper");
  localStorage.removeItem("botee-holdings");
  localStorage.removeItem("botee-journal");
}
