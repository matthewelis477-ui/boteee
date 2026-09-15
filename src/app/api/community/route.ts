import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { readUser } from "@/lib/auth";

const QUIZ_BANK = {
  en: [
    {
      q: "A high win rate with tiny winners and large losers usually means…",
      options: ["You found edge", "Expectancy may still be negative", "You should raise leverage"],
      answer: 1,
    },
    {
      q: "Best time to increase size is when…",
      options: ["You just had a loss", "Your process is stable and risk is capped", "Funding is extreme"],
      answer: 1,
    },
    {
      q: "A stop-loss is mainly for…",
      options: ["Guaranteeing profit", "Defining when the idea is wrong", "Avoiding all drawdowns"],
      answer: 1,
    },
    {
      q: "Crowded longs + rising funding often means…",
      options: ["Shorts are safe", "Squeeze risk for new shorts, size longs carefully", "Always go all-in long"],
      answer: 1,
    },
    {
      q: "Paper trading is most useful when you…",
      options: ["Ignore stops", "Treat it like real risk rules", "Only log winners"],
      answer: 1,
    },
  ],
  hi: [
    {
      q: "ऊँची विन-रेट लेकिन छोटे मुनाफे और बड़े नुकसान का मतलब अक्सर…",
      options: ["एज मिल गया", "एक्सपेक्टेंसी फिर भी नकारात्मक हो सकती है", "लेवरेज बढ़ाना चाहिए"],
      answer: 1,
    },
    {
      q: "साइज़ बढ़ाने का सही समय…",
      options: ["हाल ही में लॉस हुआ हो", "प्रोसेस स्थिर हो और रिस्क कैप हो", "फंडिंग चरम पर हो"],
      answer: 1,
    },
    {
      q: "स्टॉप-लॉस मुख्य रूप से…",
      options: ["मुनाफा गारंटी", "आइडिया गलत होने की सीमा", "सभी ड्रॉडाउन रोकना"],
      answer: 1,
    },
    {
      q: "भीड़ भरे लॉन्ग + बढ़ती फंडिंग अक्सर…",
      options: ["शॉर्ट सुरक्षित", "नए शॉर्ट पर स्क्वीज़ जोखिम, लॉन्ग सावधानी से", "हमेशा फुल लॉन्ग"],
      answer: 1,
    },
    {
      q: "पेपर ट्रेडिंग तब सबसे उपयोगी है जब आप…",
      options: ["स्टॉप नज़रअंदाज़ करें", "इसे असली रिस्क नियमों जैसा मानें", "केवल विजेता लॉग करें"],
      answer: 1,
    },
  ],
};

function quizOfDay(locale: "en" | "hi") {
  const bank = QUIZ_BANK[locale] || QUIZ_BANK.en;
  const day = Math.floor(Date.now() / 86_400_000);
  return { ...bank[day % bank.length], id: `q-${locale}-${day % bank.length}` };
}

export async function GET(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const locale = (new URL(req.url).searchParams.get("locale") || user.locale || "en") as "en" | "hi";
  const quiz = quizOfDay(locale === "hi" ? "hi" : "en");

  const board = await prisma.quizAttempt.groupBy({
    by: ["userId"],
    _sum: { points: true },
    _count: true,
    orderBy: { _sum: { points: "desc" } },
    take: 10,
  });
  const users = await prisma.user.findMany({
    where: { id: { in: board.map((b) => b.userId) } },
    select: { id: true, name: true },
  });
  const leaderboard = board.map((b) => {
    const u = users.find((x) => x.id === b.userId);
    return {
      name: u?.name || "Trader",
      points: b._sum.points || 0,
      why: "Quiz + discipline points",
    };
  });

  const votes = await prisma.communityVote.groupBy({
    by: ["coin"],
    _count: true,
    orderBy: { _count: { coin: "desc" } },
  });
  const myVote = await prisma.communityVote.findUnique({ where: { userId: user.id } });

  return NextResponse.json({
    quiz,
    leaderboard: leaderboard.length
      ? leaderboard
      : [{ name: "Be first", points: 0, why: "Answer today's quiz with risk discipline" }],
    votes: votes.map((v) => ({ coin: v.coin, count: v._count })),
    myVote: myVote?.coin || null,
  });
}

export async function POST(req: Request) {
  const user = await readUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();

  if (body.vote) {
    const coin = String(body.vote).toUpperCase();
    if (!["BTC", "ETH", "SOL", "BNB"].includes(coin)) {
      return NextResponse.json({ error: "Unsupported coin" }, { status: 400 });
    }
    await prisma.communityVote.upsert({
      where: { userId: user.id },
      create: { userId: user.id, coin },
      update: { coin },
    });
    const votes = await prisma.communityVote.groupBy({
      by: ["coin"],
      _count: true,
      orderBy: { _count: { coin: "desc" } },
    });
    return NextResponse.json({ ok: true, myVote: coin, votes: votes.map((v) => ({ coin: v.coin, count: v._count })) });
  }

  const pick = Number(body.pick);
  const locale = (body.locale === "hi" ? "hi" : "en") as "en" | "hi";
  const quiz = quizOfDay(locale);
  const correct = pick === quiz.answer;
  await prisma.quizAttempt.create({
    data: { userId: user.id, correct, points: correct ? 10 : 2 },
  });
  return NextResponse.json({ correct, points: correct ? 10 : 2, quizId: quiz.id });
}
