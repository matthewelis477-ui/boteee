import { NextResponse } from "next/server";
import { hashPassword, setSessionCookie, signToken } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "register"), 8, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many registrations. Try again shortly." }, { status: 429 });

  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const name = String(body.name || "Trader").trim();
  if (!email || !email.includes("@") || password.length < 8) {
    return NextResponse.json({ error: "Use a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return NextResponse.json({ error: "That email already has an account. Log in instead." }, { status: 409 });
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), name, plan: "free" },
  });
  await setSessionCookie(await signToken(user));
  try {
    const { notifyWelcome } = await import("@/lib/notices");
    await notifyWelcome(user.id, user.name);
  } catch {
    /* non-blocking */
  }
  return NextResponse.json({ ok: true, userId: user.id });
}
