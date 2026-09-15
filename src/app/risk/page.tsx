import { LegalLayout } from "@/components/LegalLayout";

export default function RiskPage() {
  return (
    <LegalLayout title="Risk Disclosure">
      <p>Last updated: September 2026.</p>
      <p>
        Cryptocurrency trading involves substantial risk of loss and is not suitable for every investor. Prices move quickly.
        You can lose some or all of the capital you commit.
      </p>
      <p>
        Botee provides trading tools and optional automation. It is not a broker, bank, or investment adviser. Nothing
        on this site is a guarantee of profit or future performance.
      </p>
      <p>
        If you enable auto-trading, orders are placed through your own exchange account. Exchange outages, slippage, and
        unexpected market moves can still produce losses. Use position limits and only trade capital you can afford to lose.
      </p>
      <p>If you are unsure, keep auto-trade off and seek independent advice.</p>
    </LegalLayout>
  );
}
