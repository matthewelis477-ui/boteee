import { NextResponse } from "next/server";
import { executeApprovedSignals, handleTradeJob } from "@/lib/trading/executor";
import { manageOpenTrades } from "@/lib/trading/manager";
import { alertFailedJobs, processTradeJobs } from "@/lib/trading/queue";
import { withCronLock } from "@/lib/trading/lock";
import { isBinanceTestnet } from "@/lib/exchange/binance";

function authorized(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("secret");
  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const secret = process.env.CRON_SECRET;
  return Boolean(secret && (q === secret || bearer === secret));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = await withCronLock("cron-trades", 110_000, async () => {
    const executed = await executeApprovedSignals();
    const jobs = await processTradeJobs(handleTradeJob);
    const managed = await manageOpenTrades();
    const health = await alertFailedJobs();
    return { executed, jobs, managed, health, testnet: isBinanceTestnet() };
  });
  return NextResponse.json({ ok: true, result });
}
