import { NextResponse } from "next/server";
import { setSessionCookie, signToken, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertAuthSecret, clientKey, rateLimit } from "@/lib/rate-limit";

export async function POST(req: Request) {
  try {
    assertAuthSecret();
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Misconfigured" }, { status: 500 });
  }
  const rl = rateLimit(clientKey(req, "login"), 15, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many login attempts. Try again shortly." }, { status: 429 });

  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  }
  await setSessionCookie(await signToken(user));
  return NextResponse.json({ ok: true });
}
