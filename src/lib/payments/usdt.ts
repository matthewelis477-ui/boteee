import { ensurePlatformConfig, getPlatform } from "@/lib/platform-config";
import { scanUsdtPayments as scanTrc20, verifyTxForInvoice as verifyTrc20 } from "@/lib/payments/trc20";
import { scanBep20Pending, verifyBep20TxForInvoice } from "@/lib/payments/bep20";

export async function verifyUsdtPayment(invoiceId: string, txHash: string) {
  await ensurePlatformConfig();
  const network = (getPlatform("crypto_usdt_network") || "BEP20").toUpperCase();
  if (network.includes("BEP") || network.includes("BSC")) {
    return verifyBep20TxForInvoice(invoiceId, txHash);
  }
  return verifyTrc20(invoiceId, txHash);
}

export async function scanUsdtPayments() {
  await ensurePlatformConfig();
  const network = (getPlatform("crypto_usdt_network") || "BEP20").toUpperCase();
  if (network.includes("BEP") || network.includes("BSC")) {
    return scanBep20Pending();
  }
  return scanTrc20();
}
