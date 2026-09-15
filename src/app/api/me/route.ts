import { NextResponse } from "next/server";
import { readUser, toProfile } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const user = await readUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: toProfile(user), role: user.role });
}

export async function PATCH(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      name: body.name ?? user.name,
      locale: body.locale ?? user.locale,
      experience: body.experience ?? user.experience,
      marketType: body.marketType ?? user.marketType,
      style: body.style ?? user.style,
      coins: Array.isArray(body.coins) ? body.coins.join(",") : body.coins ?? user.coins,
      timeframes: Array.isArray(body.timeframes) ? body.timeframes.join(",") : body.timeframes ?? user.timeframes,
      risk: body.risk ?? user.risk,
      onboardingComplete: body.onboardingComplete ?? user.onboardingComplete,
      minConfidence: body.minConfidence ?? user.minConfidence,
      maxLeverage: body.maxLeverage ?? user.maxLeverage,
      quietHours: body.quietHours ?? user.quietHours,
      signalFormat: body.signalFormat ?? user.signalFormat,
      paperEquity: body.paperEquity ?? user.paperEquity,
      telegramChatId: body.telegramChatId ?? user.telegramChatId,
      notify: Array.isArray(body.notify) ? body.notify.join(",") : body.notify ?? user.notify,
    },
  });
  return NextResponse.json({ user: toProfile(updated) });
}
