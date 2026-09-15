import { prisma } from "@/lib/db";
import { markInvoicePaid } from "@/lib/billing";
import { sendEmail } from "@/lib/email";
import { ensurePlatformConfig, getPlatform } from "@/lib/platform-config";

const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

type Trc20Tx = {
  transaction_id?: string;
  from?: string;
  to?: string;
  value?: string;
  token_info?: { decimals?: number; symbol?: string };
  block_timestamp?: number;
};

function amountMatches(value: string, decimals: number, expectedUsd: number) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return false;
  const tokens = raw / 10 ** decimals;
  // Exact to 0.01 USDT (1 cent). Reject over/under payments outside tolerance.
  return Math.abs(tokens - expectedUsd) <= 0.011;
}

function normalizeTx(tx: string) {
  return tx.trim().toLowerCase();
}

async function trongridKey() {
  await ensurePlatformConfig();
  return getPlatform("trongrid_api_key") || "";
}

export async function fetchTxById(txHash: string) {
  const key = await trongridKey();
  const url = `https://api.trongrid.io/v1/transactions/${txHash}/events`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(key ? { "TRON-PRO-API-KEY": key } : {}) },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

export async function fetchRecentUsdtTransfers(address: string) {
  const key = await trongridKey();
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?only_to=true&limit=80&contract_address=${USDT_TRC20}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(key ? { "TRON-PRO-API-KEY": key } : {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`TronGrid error ${res.status}`);
  const json = (await res.json()) as { data?: Trc20Tx[] };
  return json.data || [];
}

export async function verifyTxForInvoice(invoiceId: string, txHash: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };
  if (invoice.status === "paid") return { ok: true as const, alreadyPaid: true };

  await ensurePlatformConfig();
  const deposit = getPlatform("crypto_usdt_address") || "";
  const address = deposit.toLowerCase();
  const hash = normalizeTx(txHash);
  if (hash.length < 40) return { ok: false as const, error: "That transaction ID looks invalid. Please double-check and try again." };

  const used = await prisma.invoice.findFirst({ where: { txHash: { equals: txHash } } });
  if (used && used.id !== invoice.id) return { ok: false as const, error: "This transaction is already linked to another payment." };

  const transfers = await fetchRecentUsdtTransfers(deposit);
  const hit = transfers.find((t) => normalizeTx(t.transaction_id || "") === hash);
  if (!hit) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { txHash } });
    return {
      ok: false as const,
      error: "We haven’t seen this payment yet. If you just sent it, wait a minute and try again, or contact support.",
      pending: true,
    };
  }

  if ((hit.to || "").toLowerCase() !== address) {
    return { ok: false as const, error: "This transfer was not sent to the Botee deposit address." };
  }

  const decimals = hit.token_info?.decimals ?? 6;
  if (!amountMatches(String(hit.value || "0"), decimals, invoice.amountUsd)) {
    return {
      ok: false as const,
      error: `Amount doesn’t match. Please send exactly ${invoice.amountUsd} USDT, then contact support with your transaction ID.`,
    };
  }

  const result = await markInvoicePaid(invoice.id, txHash, "watcher");
  if ("error" in result && result.error) return { ok: false as const, error: result.error };
  if (result.user) {
    const appUrl = getPlatform("app_url") || "";
    void sendEmail({
      to: result.user.email,
      subject: `Botee payment confirmed · ${invoice.plan}`,
      template: "invoice_paid",
      html: `<p>Hi ${result.user.name},</p><p>Your USDT payment of <b>$${invoice.amountUsd}</b> for <b>${invoice.plan}</b> (${invoice.interval}) was confirmed.</p><p>Tx: ${txHash}</p><p><a href="${appUrl}/app">Open workspace</a></p>`,
      meta: { invoiceId: invoice.id, txHash },
    });
  }
  return { ok: true as const, user: result.user };
}

export async function scanUsdtPayments() {
  await ensurePlatformConfig();
  const address = getPlatform("crypto_usdt_address") || "";
  if (!address || address.toLowerCase().includes("your") || address.includes("NotReal")) {
    return { scanned: 0, matched: 0, error: "Deposit address not configured for live matching" };
  }

  const transfers = await fetchRecentUsdtTransfers(address);
  const pending = await prisma.invoice.findMany({ where: { status: "pending", method: "usdt" }, orderBy: { createdAt: "asc" } });
  let matched = 0;

  for (const inv of pending.filter((p) => p.txHash)) {
    const result = await verifyTxForInvoice(inv.id, inv.txHash!);
    if (result.ok) matched += 1;
  }

  const remaining = await prisma.invoice.findMany({ where: { status: "pending", method: "usdt", txHash: null }, orderBy: { createdAt: "asc" } });
  for (const tx of transfers) {
    const txHash = tx.transaction_id;
    if (!txHash) continue;
    if (await prisma.invoice.findFirst({ where: { txHash } })) continue;
    const decimals = tx.token_info?.decimals ?? 6;
    const candidates = remaining.filter((inv) => amountMatches(String(tx.value || "0"), decimals, inv.amountUsd));
    if (candidates.length !== 1) continue;
    const invoice = candidates[0];
    const result = await markInvoicePaid(invoice.id, txHash, "watcher");
    if (!("error" in result && result.error)) {
      matched += 1;
      if (result.user) {
        void sendEmail({
          to: result.user.email,
          subject: `Botee payment confirmed · ${invoice.plan}`,
          template: "invoice_paid",
          html: `<p>Payment of $${invoice.amountUsd} USDT confirmed.</p><p>Tx: ${txHash}</p>`,
          meta: { invoiceId: invoice.id, txHash },
        });
      }
      const idx = remaining.findIndex((r) => r.id === invoice.id);
      if (idx >= 0) remaining.splice(idx, 1);
    }
  }

  return { scanned: transfers.length, matched };
}
