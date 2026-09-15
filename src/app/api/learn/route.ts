import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUser } from "@/lib/auth";

export async function GET(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locale = new URL(req.url).searchParams.get("locale") || user.locale || "en";
  const lessons = await prisma.lesson.findMany({
    where: { published: true },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({
    locale,
    lessons: lessons.map((l) => ({
      id: l.id,
      slug: l.slug,
      title: locale === "hi" ? l.titleHi : l.titleEn,
      body: locale === "hi" ? l.bodyHi : l.bodyEn,
    })),
  });
}
