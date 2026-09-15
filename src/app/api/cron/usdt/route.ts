import { NextResponse } from "next/server";
import { scanUsdtPayments } from "@/lib/payments/usdt";

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
  try {
    const result = await scanUsdtPayments();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Watcher failed" }, { status: 500 });
  }
}
