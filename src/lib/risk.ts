export function positionPlan(input: {
  capital: number;
  riskPct: number;
  entry: number;
  stop: number;
  leverage: number;
  targets: number[];
  feePct?: number;
}) {
  const feePct = input.feePct ?? 0.08;
  const riskBudget = input.capital * (input.riskPct / 100);
  const stopDistance = Math.abs(input.entry - input.stop);
  if (!input.capital || !input.entry || !stopDistance) {
    return null;
  }
  const rawQty = riskBudget / stopDistance;
  const notional = rawQty * input.entry;
  const maxLoss = riskBudget + (notional * feePct) / 100;
  const suggestedLev = Math.min(input.leverage, Math.max(1, Math.ceil(notional / input.capital)));
  const margin = notional / Math.max(1, input.leverage);
  const rr = input.targets[0] ? Math.abs(input.targets[0] - input.entry) / stopDistance : 0;
  const profits = input.targets.map((t) => {
    const move = Math.abs(t - input.entry) * rawQty;
    const fees = (notional * feePct) / 100;
    return move - fees;
  });
  return {
    riskBudget,
    maxLoss,
    qty: rawQty,
    notional,
    margin,
    suggestedLev,
    recommendedInvestment: Math.min(notional, input.capital * 0.25),
    rr,
    profits,
    fees: (notional * feePct) / 100,
  };
}
