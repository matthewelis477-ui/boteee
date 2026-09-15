/**
 * USDT BEP20 (BSC) payment verification via public RPC.
 * Contract: Binance-Peg USDТ (0x55d3…7955), usually 18 decimals on BSC.
 */
import { prisma } from "@/lib/db";
import { markInvoicePaid } from "@/lib/billing";
import { sendEmail } from "@/lib/email";
import { ensurePlatformConfig, getPlatform } from "@/lib/platform-config";

const USDT_BEP20 = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BSC_RPC = ["https://bsc-dataseed.binance.org", "https://bsc-dataseed1.defibit.io", "https://bsc-dataseed1.ninicoin.io"];

type BepTransfer = {
  txHash: string;
  from: string;
  to: string;
  value: bigint;
  decimals: number;
};

function amountMatches(raw: bigint, decimals: number, expectedUsd: number) {
  const tokens = Number(raw) / 10 ** decimals;
  if (!Number.isFinite(tokens)) return false;
  return Math.abs(tokens - expectedUsd) <= 0.011;
}

function normalizeTx(tx: string) {
  return tx.trim().toLowerCase();
}

function padAddress(addr: string) {
  return "0x" + addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0");
}

async function rpc(method: string, params: unknown[]) {
  let lastErr: Error | null = null;
  for (const url of BSC_RPC) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        cache: "no-store",
      });
      const json = (await res.json()) as { result?: unknown; error?: { message?: string } };
      if (json.error) throw new Error(json.error.message || "rpc error");
      return json.result;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error("BSC RPC unavailable");
}

function decodeTransfers(receipt: {
  transactionHash?: string;
  logs?: { address?: string; topics?: string[]; data?: string }[];
}): BepTransfer[] {
  const out: BepTransfer[] = [];
  const txHash = (receipt.transactionHash || "").toLowerCase();
  for (const log of receipt.logs || []) {
    if ((log.address || "").toLowerCase() !== USDT_BEP20) continue;
    if ((log.topics?.[0] || "").toLowerCase() !== TRANSFER_TOPIC) continue;
    const from = "0x" + (log.topics?.[1] || "").slice(-40);
    const to = "0x" + (log.topics?.[2] || "").slice(-40);
    const value = BigInt(log.data || "0x0");
    out.push({ txHash, from: from.toLowerCase(), to: to.toLowerCase(), value, decimals: 18 });
  }
  return out;
}

export async function fetchBep20TransferByTx(txHash: string): Promise<BepTransfer | null> {
  const hash = normalizeTx(txHash);
  if (!hash.startsWith("0x") || hash.length < 66) return null;
  const receipt = (await rpc("eth_getTransactionReceipt", [hash])) as {
    transactionHash?: string;
    logs?: { address?: string; topics?: string[]; data?: string }[];
    status?: string;
  } | null;
  if (!receipt || receipt.status === "0x0") return null;
  const transfers = decodeTransfers({ ...receipt, transactionHash: hash });
  return transfers[0] || null;
}

/** Recent USDT transfers to deposit address (via tx list is heavy; scan pending invoices by hash instead). */
export async function verifyBep20TxForInvoice(invoiceId: string, txHash: string) {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { ok: false as const, error: "Invoice not found" };
  if (invoice.status === "paid") return { ok: true as const, alreadyPaid: true };

  await ensurePlatformConfig();
  const deposit = (getPlatform("crypto_usdt_address") || "").toLowerCase();
  const hash = normalizeTx(txHash);
  if (!hash.startsWith("0x") || hash.length < 66) {
    return { ok: false as const, error: "That BEP20 transaction hash looks invalid." };
  }

  const used = await prisma.invoice.findFirst({ where: { txHash: hash } });
  if (used && used.id !== invoice.id) {
    return { ok: false as const, error: "This transaction is already linked to another payment." };
  }

  let hit: BepTransfer | null = null;
  try {
    hit = await fetchBep20TransferByTx(hash);
  } catch {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { txHash } });
    return {
      ok: false as const,
      error: "Could not reach BSC right now. Wait a minute and try again.",
      pending: true,
    };
  }

  if (!hit) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { txHash } });
    return {
      ok: false as const,
      error: "We haven’t confirmed this USDT (BEP20) transfer yet. Wait for confirmation and try again.",
      pending: true,
    };
  }

  if (hit.to !== deposit) {
    return { ok: false as const, error: "This transfer was not sent to the Botee deposit address." };
  }
  if (!amountMatches(hit.value, hit.decimals, invoice.amountUsd)) {
    return {
      ok: false as const,
      error: `Amount doesn’t match. Please send exactly ${invoice.amountUsd} USDT on BEP20 (BSC).`,
    };
  }

  const result = await markInvoicePaid(invoice.id, hash, "watcher");
  if ("error" in result && result.error) return { ok: false as const, error: result.error };
  if (result.user) {
    const appUrl = getPlatform("app_url") || "";
    void sendEmail({
      to: result.user.email,
      subject: `Botee payment confirmed · ${invoice.plan}`,
      template: "invoice_paid",
      html: `<p>Hi ${result.user.name},</p><p>Your USDT (BEP20) payment of <b>$${invoice.amountUsd}</b> for <b>${invoice.plan}</b> was confirmed.</p><p>Tx: ${hash}</p><p><a href="${appUrl}/app">Open workspace</a></p>`,
      meta: { invoiceId: invoice.id, txHash: hash },
    });
  }
  return { ok: true as const, user: result.user };
}

export async function scanBep20Pending() {
  await ensurePlatformConfig();
  const address = getPlatform("crypto_usdt_address") || "";
  if (!address.startsWith("0x") || address.length < 40) {
    return { scanned: 0, matched: 0, error: "BEP20 deposit address not configured" };
  }

  const pending = await prisma.invoice.findMany({
    where: { status: "pending", method: "usdt", txHash: { not: null } },
    orderBy: { createdAt: "asc" },
  });
  let matched = 0;
  for (const inv of pending) {
    const result = await verifyBep20TxForInvoice(inv.id, inv.txHash!);
    if (result.ok) matched += 1;
  }
  return { scanned: pending.length, matched };
}

export { USDT_BEP20, padAddress };
