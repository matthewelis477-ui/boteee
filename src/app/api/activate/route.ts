import { NextResponse } from "next/server";
import { hashPassword, readUser, setSessionCookie, signToken, toProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redeemCode } from "@/lib/billing";

export async function POST(req: Request) {
  const body = await req.json();
  const code = String(body.code || "");
  let user = await readUser();
  if (!user) {
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const name = String(body.name || "Trader").trim();
    if (!email || password.length < 8) {
      return NextResponse.json({ error: "Create an account with email and an 8+ character password, then activate." }, { status: 400 });
    }
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "That email already exists. Log in, then activate." }, { status: 409 });
    }
    user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), name },
    });
    await setSessionCookie(await signToken(user));
  }
  const result = await redeemCode(user, code);
  if ("error" in result && result.error) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ user: toProfile(result.user!), label: result.label });
}
