import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "./db";
import type { User } from "@prisma/client";
import type { UserProfile } from "./types";

const COOKIE = "botee_token";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "local-dev-botee-auth-secret-change-me");
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function signToken(user: { id: string; email: string }) {
  return new SignJWT({ sub: user.id, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function readUser(): Promise<User | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return prisma.user.findUnique({ where: { id: payload.sub } });
  } catch {
    return null;
  }
}

export function toProfile(user: User): UserProfile {
  return {
    name: user.name,
    email: user.email,
    locale: user.locale as UserProfile["locale"],
    experience: user.experience as UserProfile["experience"],
    marketType: user.marketType as UserProfile["marketType"],
    style: user.style as UserProfile["style"],
    coins: user.coins.split(",").map((x) => x.trim()).filter(Boolean),
    timeframes: user.timeframes.split(",").map((x) => x.trim()).filter(Boolean),
    risk: user.risk as UserProfile["risk"],
    plan: user.plan as UserProfile["plan"],
    activationCode: user.activationCode,
    expiresAt: user.expiresAt?.toISOString() || "",
    paperBalance: user.paperBalance,
    paperEquity: user.paperEquity,
    onboardingComplete: user.onboardingComplete,
    minConfidence: user.minConfidence,
    maxLeverage: user.maxLeverage,
    directions: user.directions.split(",") as UserProfile["directions"],
    quietHours: user.quietHours,
    notify: user.notify.split(",") as UserProfile["notify"],
    signalFormat: user.signalFormat as UserProfile["signalFormat"],
    telegramChatId: user.telegramChatId || "",
  };
}

export function planAmount(plan: string, interval: "monthly" | "yearly") {
  const table: Record<string, { monthly: number; yearly: number }> = {
    free: { monthly: 0, yearly: 0 },
    basic: { monthly: 29, yearly: 290 },
    pro: { monthly: 79, yearly: 790 },
    elite: { monthly: 149, yearly: 1490 },
    institutional: { monthly: 499, yearly: 4990 },
  };
  const row = table[plan] || table.pro;
  return interval === "yearly" ? row.yearly : row.monthly;
}
