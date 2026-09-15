import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto/secrets";
import type { BrokerCreds, VenueId } from "@/lib/exchange/venues";
import { isVenueId } from "@/lib/exchange/venues";

export async function loadBrokerCreds(userId: string, exchange: string): Promise<BrokerCreds | null> {
  if (!isVenueId(exchange)) return null;
  const row = await prisma.exchangeCredential.findUnique({
    where: { userId_exchange: { userId, exchange } },
  });
  if (!row || !row.enabled || !row.canTrade || row.canWithdraw) return null;
  return {
    apiKey: decryptSecret(row.apiKeyEnc),
    apiSecret: decryptSecret(row.apiSecretEnc),
    passphrase: row.passphraseEnc ? decryptSecret(row.passphraseEnc) : undefined,
  };
}

export function asVenueId(exchange: string): VenueId | null {
  return isVenueId(exchange) ? exchange : null;
}
