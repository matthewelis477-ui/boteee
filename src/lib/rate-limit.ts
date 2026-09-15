import { createHash } from "node:crypto";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit = 20, windowMs = 60_000) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }
  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count };
}

export function clientKey(req: Request, suffix: string) {
  const fwd = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "local";
  const ip = fwd.split(",")[0]?.trim() || "local";
  return createHash("sha256").update(`${ip}:${suffix}`).digest("hex").slice(0, 24);
}

export function assertAuthSecret() {
  const s = process.env.AUTH_SECRET || "";
  if (process.env.NODE_ENV === "production") {
    if (!s || s.length < 32 || s.includes("change-me") || s.includes("local-dev")) {
      throw new Error("AUTH_SECRET must be a strong 32+ character secret in production.");
    }
  }
}
