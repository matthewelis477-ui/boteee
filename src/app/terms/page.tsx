import { LegalLayout } from "@/components/LegalLayout";

export default function TermsPage() {
  return (
    <LegalLayout title="Terms of Service">
      <p>Last updated: September 2026.</p>
      <p>
        Botee provides educational market research tools, signals, and optional automated trade execution helpers. By using
        the service you agree that you are solely responsible for trading decisions and account risk.
      </p>
      <p>
        Subscriptions are sold in USDT. Access is granted after a confirmed on-chain deposit or a valid activation code.
        Plans renew only when you pay again unless otherwise stated for a specific code.
      </p>
      <p>
        You must not use the platform for illegal activity, share accounts in a way that violates our fair-use rules, or
        attempt to reverse-engineer or abuse our APIs.
      </p>
      <p>
        We may suspend accounts that threaten platform integrity, attempt withdrawal-capable API key use, or abuse payment
        systems.
      </p>
    </LegalLayout>
  );
}
