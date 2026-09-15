import { LegalLayout } from "@/components/LegalLayout";

export default function PrivacyPage() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>Last updated: September 2026.</p>
      <p>
        We collect account data (name, email, hashed password), subscription/invoice records, optional Telegram chat IDs,
        trading preferences, and encrypted exchange API credentials you choose to connect.
      </p>
      <p>
        API secrets are encrypted at rest and are never shown again after submission. We do not request withdrawal
        permissions and will reject keys that allow withdrawals when validation succeeds.
      </p>
      <p>
        We use trusted service providers to operate the product (hosting, messaging, payment confirmation). We do not sell
        personal data.
      </p>
      <p>Contact support through the channels listed on the website to request account deletion or data export.</p>
    </LegalLayout>
  );
}
