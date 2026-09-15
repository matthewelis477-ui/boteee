import type { Plan } from "./types";

/** Activation bootstrap codes (also seeded in DB). */
export const VALID_CODES: Record<string, { plan: Plan["id"]; days: number; label: string }> = {
  "BOTEE-TRIAL-7": { plan: "pro", days: 7, label: "7-day Pro trial" },
  "BOTEE-FREE": { plan: "free", days: 365, label: "Free access" },
  "BOTEE-BASIC": { plan: "basic", days: 30, label: "Basic monthly" },
  "BOTEE-PRO": { plan: "pro", days: 30, label: "Pro monthly" },
  "BOTEE-ELITE": { plan: "elite", days: 30, label: "Elite monthly" },
  "FOUNDER-LIFE": { plan: "elite", days: 3650, label: "Lifetime founder" },
  "INST-ACCESS": { plan: "institutional", days: 90, label: "Institutional access" },
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    priceYearly: 0,
    for: "Getting started",
    access: "Explore Botee before you subscribe",
    features: ["Delayed futures signals", "Paper trading", "Learning lessons", "Scanner preview"],
  },
  {
    id: "basic",
    name: "Basic",
    priceMonthly: 29,
    priceYearly: 290,
    for: "Active traders",
    access: "Live signals you trade yourself",
    features: ["Live approved signals", "Telegram alerts", "Risk calculator", "Clear trade rationale"],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 79,
    priceYearly: 790,
    for: "Automation ready",
    access: "Signals plus optional multi-exchange auto-trade",
    features: ["Everything in Basic", "Futures setups", "Binance / Bybit / OKX", "Automatic entry with stops & targets"],
  },
  {
    id: "elite",
    name: "Elite",
    priceMonthly: 149,
    priceYearly: 1490,
    for: "Full-time traders",
    access: "Complete workspace for daily trading",
    features: ["Everything in Pro", "Full scanner", "Journal & performance", "Priority support"],
  },
  {
    id: "institutional",
    name: "Institutional",
    priceMonthly: 499,
    priceYearly: 4990,
    for: "Power users & desks",
    access: "Highest plan with priority support and onboarding help",
    features: ["Everything in Elite", "Priority support", "Onboarding assistance", "Higher capacity defaults"],
  },
];

export const TUTORIALS = [
  { id: "sl", title: "What is a stop-loss?", text: "A stop-loss automatically limits your loss if the trade moves against you." },
  { id: "entry", title: "Entry zone", text: "Buy or sell only inside the zone. Chasing outside the zone changes the risk math." },
  { id: "tp", title: "Targets", text: "Scale out at T1/T2/T3. Moving stop to entry after T1 is a discipline habit we reward." },
  { id: "rr", title: "Risk / reward", text: "Win rate alone is not enough. Profit factor and drawdown show if the edge is real." },
];
