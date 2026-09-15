import { NextResponse } from "next/server";

async function fetchJson(url: string) {
  const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`fetch ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [btcPrem, ethPrem, btcOi, ethOi, btcLs, ethLs, btcDepth, ethDepth, btcTaker, ethTaker, btcForce, ethForce] =
      await Promise.all([
        fetchJson("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT"),
        fetchJson("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=ETHUSDT"),
        fetchJson("https://fapi.binance.com/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=2").catch(() => []),
        fetchJson("https://fapi.binance.com/futures/data/openInterestHist?symbol=ETHUSDT&period=1h&limit=2").catch(() => []),
        fetchJson("https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1").catch(() => []),
        fetchJson("https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=ETHUSDT&period=1h&limit=1").catch(() => []),
        fetchJson("https://fapi.binance.com/fapi/v1/depth?symbol=BTCUSDT&limit=20").catch(() => null),
        fetchJson("https://fapi.binance.com/fapi/v1/depth?symbol=ETHUSDT&limit=20").catch(() => null),
        fetchJson("https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=1").catch(() => []),
        fetchJson("https://fapi.binance.com/futures/data/takerlongshortRatio?symbol=ETHUSDT&period=1h&limit=1").catch(() => []),
        fetchJson("https://fapi.binance.com/fapi/v1/allForceOrders?symbol=BTCUSDT&limit=20").catch(() => []),
        fetchJson("https://fapi.binance.com/fapi/v1/allForceOrders?symbol=ETHUSDT&limit=20").catch(() => []),
      ]);

    const btcFund = Number(btcPrem.lastFundingRate || 0);
    const ethFund = Number(ethPrem.lastFundingRate || 0);
    const btcLsRatio = Number(btcLs?.[0]?.longShortRatio || 1);
    const ethLsRatio = Number(ethLs?.[0]?.longShortRatio || 1);
    const btcTakerBuy = Number(btcTaker?.[0]?.buySellRatio || 1);
    const ethTakerBuy = Number(ethTaker?.[0]?.buySellRatio || 1);

    const btcOiNow = Number(btcOi?.[btcOi.length - 1]?.sumOpenInterest || 0);
    const btcOiPrev = Number(btcOi?.[0]?.sumOpenInterest || btcOiNow);
    const btcOiChg = btcOiPrev ? ((btcOiNow - btcOiPrev) / btcOiPrev) * 100 : 0;

    const sumNotional = (levels: [string, string][] | undefined) =>
      (levels || []).reduce((s, [p, q]) => s + Number(p) * Number(q), 0);
    const btcBid = sumNotional(btcDepth?.bids);
    const btcAsk = sumNotional(btcDepth?.asks);
    const ethBid = sumNotional(ethDepth?.bids);
    const ethAsk = sumNotional(ethDepth?.asks);
    const btcImbalance = btcBid + btcAsk ? btcBid / (btcBid + btcAsk) : 0.5;

    const forceNotional = (rows: { side?: string; price?: string; origQty?: string; averagePrice?: string }[]) => {
      let longLiq = 0;
      let shortLiq = 0;
      for (const r of rows || []) {
        const px = Number(r.averagePrice || r.price || 0);
        const qty = Number(r.origQty || 0);
        const n = px * qty;
        // SELL force = long liquidated; BUY force = short liquidated
        if (String(r.side).toUpperCase() === "SELL") longLiq += n;
        else shortLiq += n;
      }
      return { longLiq, shortLiq };
    };
    const btcLiq = forceNotional(btcForce);
    const ethLiq = forceNotional(ethForce);

    const insight =
      ethLsRatio > 1.4
        ? "Avoid opening a new Short on ETH: account longs look crowded and squeeze risk rises if BTC holds."
        : btcFund > 0.0005
          ? "BTC funding is elevated. Long overcrowding risk; size carefully."
          : btcOiChg > 3 && btcFund > 0
            ? "BTC open interest rising with positive funding — leverage longs building."
            : "Derivatives positioning is moderate. Prefer confirmed breakouts over fades.";

    const longSqueeze =
      btcFund < -0.0003 || btcTakerBuy < 0.85
        ? `Elevated on BTC (funding ${(btcFund * 100).toFixed(4)}%, taker buy/sell ${btcTakerBuy.toFixed(2)})`
        : "Moderate on BTC";
    const shortSqueeze =
      ethLsRatio > 1.5 || ethTakerBuy > 1.25
        ? `Elevated on ETH (L/S ${ethLsRatio.toFixed(2)}, taker ${ethTakerBuy.toFixed(2)})`
        : "Low–medium on ETH";

    const payload = {
      insight,
      openInterest: `BTC OI ${btcOiNow ? btcOiNow.toFixed(0) : "n/a"} (${btcOiChg >= 0 ? "+" : ""}${btcOiChg.toFixed(2)}% vs prior) · ETH ${ethOi?.[ethOi.length - 1]?.sumOpenInterest || "n/a"}`,
      funding: `BTC ${(btcFund * 100).toFixed(4)}% · ETH ${(ethFund * 100).toFixed(4)}%`,
      longShort: `Accounts BTC L/S ${btcLsRatio.toFixed(2)} · ETH ${ethLsRatio.toFixed(2)} · Taker buy/sell BTC ${btcTakerBuy.toFixed(2)} ETH ${ethTakerBuy.toFixed(2)}`,
      liq: `Recent force orders — BTC long liq ~$${btcLiq.longLiq.toFixed(0)} / short ~$${btcLiq.shortLiq.toFixed(0)}; ETH long ~$${ethLiq.longLiq.toFixed(0)} / short ~$${ethLiq.shortLiq.toFixed(0)}`,
      longSqueeze,
      shortSqueeze,
      book: `BTC 20-lvl bid $${btcBid.toFixed(0)} ask $${btcAsk.toFixed(0)} (bid share ${(btcImbalance * 100).toFixed(0)}%) · best ${btcDepth?.bids?.[0]?.[0] || "n/a"}/${btcDepth?.asks?.[0]?.[0] || "n/a"}`,
      whales:
        btcBid > 2_000_000 || btcAsk > 2_000_000
          ? `Notable top-20 depth on BTC (bid $${btcBid.toFixed(0)} / ask $${btcAsk.toFixed(0)}); large limits can still be cancelled.`
          : `Moderate BTC depth (bid $${btcBid.toFixed(0)} / ask $${btcAsk.toFixed(0)}).`,
      premium: `BTC mark ${btcPrem.markPrice} vs index ${btcPrem.indexPrice} (basis ${(((Number(btcPrem.markPrice) - Number(btcPrem.indexPrice)) / Number(btcPrem.indexPrice)) * 100).toFixed(3)}%)`,
      leverageAlert: "Keep leverage within your plan limits. You can pause trading anytime in Settings.",
      updatedAt: new Date().toISOString(),
      live: true,
    };

    const { prisma } = await import("@/lib/db");
    await prisma.futuresSnapshot.upsert({
      where: { id: "latest" },
      create: { id: "latest", json: JSON.stringify(payload) },
      update: { json: JSON.stringify(payload) },
    });

    return NextResponse.json(payload);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Futures feed failed" }, { status: 502 });
  }
}
