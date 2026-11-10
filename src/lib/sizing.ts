/**
 * Week 8: how much to bet — Carver's Starter System sizing and stop, adapted
 * to an unleveraged cash-equities paper account (decision 18; the week-8
 * choices are decision 19). One table, SIZING, drives the calculator, the
 * ticket route and the nightly stop tracker, so a page and a ticket cannot
 * disagree.
 *
 * The arithmetic, in full (Leveraged Trading, the Starter System):
 *
 *   target exposure  = capital × (risk target ÷ instrument risk)
 *                      — a 12% target on a share that moves 24% a year means
 *                        holding half the capital in it; a share that moves
 *                        6% would need twice the capital, which a cash account
 *                        cannot do: the exposure is capped at the capital
 *                        (leverage factor 1) and the achieved risk is lower.
 *   units            = whole shares that fit in the target exposure
 *                      — the full size whenever the rule is long: the Starter
 *                        System holds a fixed position while its rule is on.
 *                        Carver's full system scales the size by forecast ÷ 10,
 *                        a later refinement the course does not use (review N1).
 *   stop gap         = ½ × instrument risk × entry price   (price units, fixed at entry)
 *   stop level       = the high since entry − the stop gap  (trails up, never down)
 *
 * The course's own numbers (decision 19, not Carver's): the paper account is
 * in dollars (the shares' currency); a trade costs $2 plus 0.25% of its value
 * for the currency conversion an Irish student would pay; a position whose
 * round trip would cost more than 1% of it is too small to trade honestly —
 * Carver's principle (costs must stay a small fraction of the return the
 * rule can earn), the course's threshold.
 *
 * Week 9 (decision 20): a student may run N instruments; each position is
 * then sized at (risk target ÷ N) — Carver's equal instrument weights with
 * the diversification multiplier left at 1 (the conservative choice: it
 * assumes the shares move together), so the account carries the 12% whatever
 * N is. `targetPct` on the input carries that share; the default is the whole
 * target, the Starter System's one instrument. Capital is the account's
 * current value (cash plus the open positions at the latest close), not the
 * amount enrolled.
 *
 * Education, not advice: the calculator says what the rule would hold; it
 * does not say whether to hold anything.
 */

export const SIZING = {
  /** Carver's Starter System target: annual volatility of the account, percent. */
  riskTargetPct: 12,
  /** Cash equities: exposure can never exceed the capital. */
  leverageFactor: 1,
  /** Stop gap as a fraction of the annual instrument risk, in price units, fixed at entry. */
  stopFraction: 0.5,
  /** Per trade, in the account's currency (decision 18's €2, modelled as $2). */
  costPerTrade: 2,
  /** Currency conversion, percent of the trade's value, each way. */
  fxPct: 0.25,
  /** Course rule: a round trip (open + close) costing more than this share of the position is too small to trade. */
  maxRoundTripCostPct: 1,
  /** Whole shares only; fewer than this and the position cannot be sized. */
  minUnits: 1,
  /** Week 9: the most instruments a student may run; each is sized at riskTargetPct ÷ N (decision 20). */
  maxInstruments: 4,
  /** Week 9: the account's risk may exceed the target by this much (percentage points) before the report flags "over budget" — whole shares and a volatility that rose since entry. */
  budgetTolerancePct: 1,
  /** Week 9: the drawdown (percent from the high-water mark) at which the report says so in words — a statement, not an alarm. */
  drawdownNotePct: 10,
  /** The paper account's currency: the shares' own. */
  currency: "USD",
} as const;

export type SizeInput = {
  /** The account's capital (cash + positions at the last close), dollars. */
  capital: number;
  /** The latest (adjusted) close, dollars. */
  price: number;
  /** Annualised volatility, percent (the signals page's "instrument risk"). */
  instrumentRiskPct: number;
  /** The risk this position may carry, percent of the account a year: the whole target (default), or target ÷ instruments (week 9). */
  targetPct?: number;
};

export type SizeCheck = { code: "one_share" | "cost"; ok: boolean; message: string };

export type Sizing = {
  input: SizeInput;
  /** capital × τ ÷ σ, capped at capital × leverage factor. */
  targetExposure: number;
  /** True when the target exposure hit the cap: the risk target cannot be reached without leverage. */
  capped: boolean;
  units: number;
  exposure: number;
  /** exposure ÷ capital, percent. */
  weightPct: number;
  /** weight × instrument risk, percent — the risk the position actually carries. */
  achievedRiskPct: number;
  stopGap: number;
  stopLevel: number;
  costs: { open: number; close: number; roundTrip: number; roundTripPct: number };
  /** The smallest capital at which this instrument clears both checks at this price and risk. */
  minimumCapital: number;
  checks: SizeCheck[];
  ok: boolean;
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class SizeInputError extends Error {}

function check(input: SizeInput): void {
  const bad = (what: string) => new SizeInputError(what);
  if (!Number.isFinite(input.capital) || input.capital <= 0) throw bad("capital must be a positive number of dollars");
  if (!Number.isFinite(input.price) || input.price <= 0) throw bad("price must be a positive number");
  if (!Number.isFinite(input.instrumentRiskPct) || input.instrumentRiskPct <= 0) throw bad("instrument risk must be a positive percentage");
  if (input.capital > 1e9) throw bad("capital must be below $1,000,000,000");
  if (input.targetPct !== undefined && !(Number.isFinite(input.targetPct) && input.targetPct > 0 && input.targetPct <= SIZING.riskTargetPct)) throw bad(`targetPct must be between 0 and ${SIZING.riskTargetPct}`);
}

/** The risk one position may carry when the account runs `instruments` of them: the target split equally (decision 20). */
export function targetFor(instruments: number): number {
  const n = Number.isInteger(instruments) && instruments >= 1 ? Math.min(instruments, SIZING.maxInstruments) : 1;
  return SIZING.riskTargetPct / n;
}

/** Cost of one trade of `value` dollars: the flat fee plus the conversion. */
export function tradeCost(value: number): number {
  return SIZING.costPerTrade + (SIZING.fxPct / 100) * value;
}

/**
 * The smallest capital that clears both checks for a given price and risk:
 * the target exposure must hold one share and cover a round trip at 1%.
 * Round trip = 2 × fee + 2 × fx% × E ≤ max% × E  ⇒  E ≥ 2 × fee ÷ (max% − 2 × fx%),
 * and because the cost check runs on the WHOLE-SHARE exposure, the floor is
 * the first whole number of shares worth at least that (review F1: the $800
 * floor alone named a capital the calculator then refused whenever the
 * price did not divide $800). The result is minimal to the dollar: one
 * dollar less sizes one share fewer, which fails one of the two checks.
 */
export function minimumCapital(price: number, instrumentRiskPct: number, targetPct: number = SIZING.riskTargetPct): number {
  const maxPct = SIZING.maxRoundTripCostPct / 100;
  const fx = SIZING.fxPct / 100;
  const costFloor = maxPct > 2 * fx ? (2 * SIZING.costPerTrade) / (maxPct - 2 * fx) : Infinity;
  const sharesNeeded = Math.max(SIZING.minUnits, Math.ceil(costFloor / price - 1e-9));
  const exposureFloor = sharesNeeded * price;
  const ratio = Math.max(1 / SIZING.leverageFactor, instrumentRiskPct / targetPct);
  return Math.ceil(exposureFloor * ratio - 1e-9);
}

export function sizePosition(input: SizeInput): Sizing {
  check(input);
  const { capital, price, instrumentRiskPct: sigma } = input;
  const target = input.targetPct ?? SIZING.riskTargetPct;
  const uncapped = (capital * target) / sigma;
  const cap = capital * SIZING.leverageFactor;
  const capped = uncapped > cap;
  const targetExposure = capped ? cap : uncapped;
  const units = Math.floor(targetExposure / price + 1e-9);   // 6978.2 ÷ 348.91 = 19.999999999999996 → 20 (review F1)
  const exposure = units * price;
  const weightPct = (exposure / capital) * 100;
  const achievedRiskPct = (weightPct / 100) * sigma;
  const stopGap = SIZING.stopFraction * (sigma / 100) * price;
  const stopLevel = price - stopGap;
  const open = tradeCost(exposure);
  const close = tradeCost(exposure);
  const roundTrip = open + close;
  const roundTripPct = exposure > 0 ? (roundTrip / exposure) * 100 : Infinity;
  const minCap = minimumCapital(price, sigma, target);

  const checks: SizeCheck[] = [];
  const oneShare = units >= SIZING.minUnits;
  checks.push({
    code: "one_share",
    ok: oneShare,
    message: oneShare
      ? `${units} whole share${units === 1 ? "" : "s"} fit in the target exposure of ${money(targetExposure)}.`
      : `One share at ${money(price)} is more than the ${money(targetExposure)} this rule would put in it — the position cannot be sized. At ${sigma.toFixed(1)}% instrument risk this share needs a paper account of at least ${money(minCap)}.`,
  });
  const costOk = oneShare && roundTripPct <= SIZING.maxRoundTripCostPct;
  checks.push({
    code: "cost",
    ok: costOk,
    message: !oneShare
      ? "Not checked — no position to cost."
      : costOk
        ? `A round trip (two trades at $${SIZING.costPerTrade} + ${SIZING.fxPct}% conversion each way) costs ${money(roundTrip)}, ${roundTripPct.toFixed(2)}% of the ${money(exposure)} position — under the course's ${SIZING.maxRoundTripCostPct}% limit.`
        : `A round trip would cost ${money(roundTrip)}, ${roundTripPct.toFixed(2)}% of a ${money(exposure)} position — over the course's ${SIZING.maxRoundTripCostPct}% limit, so the costs would eat what the rule can earn. At ${sigma.toFixed(1)}% instrument risk this share needs a paper account of at least ${money(minCap)}.`,
  });

  return {
    input,
    targetExposure: r2(targetExposure),
    capped,
    units,
    exposure: r2(exposure),
    weightPct: r2(weightPct),
    achievedRiskPct: r2(achievedRiskPct),
    stopGap: r2(stopGap),
    stopLevel: r2(stopLevel),
    costs: { open: r2(open), close: r2(close), roundTrip: r2(roundTrip), roundTripPct: Number.isFinite(roundTripPct) ? r2(roundTripPct) : Infinity },
    minimumCapital: minCap,
    checks,
    ok: checks.every((c) => c.ok),
  };
}

/** The trailing stop: the high since entry less the gap fixed at entry. */
export function stopLevel(highSinceEntry: number, stopGap: number): number {
  return r2(highSinceEntry - stopGap);
}

/** Has the close breached the stop? At or below counts (a close exactly at the stop is a close). */
export function stopHit(adjClose: number, level: number): boolean {
  return adjClose <= level;
}

/** The sizing in words, for the calculator page and the ticket. */
export function describeSizing(s: Sizing, symbol: string): string {
  const { capital, price, instrumentRiskPct: sigma } = s.input;
  const target = s.input.targetPct ?? SIZING.riskTargetPct;
  const share = target < SIZING.riskTargetPct ? ` (${SIZING.riskTargetPct}% ÷ ${Math.round(SIZING.riskTargetPct / target)} instruments)` : "";
  const cap = s.capped
    ? ` ${symbol} moves less than the ${fmtPct(target)}% target, so without leverage the whole account is the most it can hold — the achieved risk is ${s.achievedRiskPct.toFixed(1)}%, under target.`
    : "";
  return `At ${sigma.toFixed(2)}% instrument risk and a ${fmtPct(target)}% target${share}, ${money(capital)} supports ${money(s.targetExposure)} of ${symbol}: ${s.units} shares at ${money(price)} = ${money(s.exposure)} (${s.weightPct.toFixed(0)}% of the account, carrying ${s.achievedRiskPct.toFixed(1)}% a year).${cap} The stop starts ${money(s.stopGap)} below the entry, at ${money(s.stopLevel)}, and follows the high.`;
}

/** 12 → "12", 6 → "6", 4 → "4", 3 → "3"; a third of 12 is exactly 4, a quarter 3 — the shares print cleanly. */
export const fmtPct = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, ""));
