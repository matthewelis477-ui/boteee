export type Locale = "en" | "hi";
export type Experience = "beginner" | "intermediate" | "pro";
export type MarketType = "spot" | "futures";
export type Style = "scalping" | "intraday" | "swing";
export type RiskLevel = "low" | "medium" | "high";
export type Side = "LONG" | "SHORT" | "NO-TRADE";
export type PlanId = "free" | "basic" | "pro" | "elite" | "institutional";
export type SignalStatus = "active" | "monitoring" | "completed" | "invalidated" | "paused";

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthly: number;
  priceYearly: number;
  for: string;
  access: string;
  features: string[];
};

export type Signal = {
  id: string;
  side: Side;
  asset: string;
  exchange: string;
  marketType: MarketType;
  entryLow: number;
  entryHigh: number;
  targets: [number, number, number];
  stopLoss: number;
  leverage: string;
  rr: number;
  confidence: number;
  style: Style;
  timeframe: string;
  validForMinutes: number;
  marketCondition: string;
  risk: RiskLevel;
  publishedAt: string;
  status: SignalStatus;
  delayed?: boolean;
  approved?: boolean;
  why: {
    summary: string;
    trend: string;
    supportResistance: string;
    volume: string;
    rsiMacd: string;
    maStructure: string;
    setup: string;
    btcDirection: string;
    sentiment: string;
    risks: string[];
  };
  updates: { time: string; message: string }[];
};

export type UserProfile = {
  name: string;
  email: string;
  locale: Locale;
  experience: Experience;
  marketType: MarketType;
  style: Style;
  coins: string[];
  timeframes: string[];
  risk: RiskLevel;
  plan: PlanId;
  activationCode: string;
  expiresAt: string;
  paperBalance: number;
  paperEquity: number;
  onboardingComplete: boolean;
  minConfidence: number;
  maxLeverage: number;
  directions: ("LONG" | "SHORT")[];
  quietHours: string;
  notify: ("telegram" | "email" | "push" | "app")[];
  signalFormat: "beginner" | "advanced";
  telegramChatId: string;
};

export type PaperTrade = {
  id: string;
  signalId: string;
  asset: string;
  side: Side;
  entry: number;
  stop: number;
  sizeUsd: number;
  status: "open" | "closed";
  pnl: number;
  followedStop: boolean;
  notes: string;
  openedAt: string;
};

export type Holding = {
  asset: string;
  amount: number;
  avgPrice: number;
};
