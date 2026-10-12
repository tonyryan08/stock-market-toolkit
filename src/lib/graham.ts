/**
 * Week 5: the Graham defensive-investor screen — pure functions, tested.
 *
 * Source: Benjamin Graham, The Intelligent Investor, ch. 14, "Stock
 * Selection for the Defensive Investor" (course copy, 2003 revised ed.,
 * p. 347). Seven criteria. Graham's text is unchanged in every edition.
 *
 * ONE source of truth: the CRITERIA table below drives the screen, the
 * screen page's column headers AND the printable checklist card (/card).
 * Change a threshold here and all three change together — the card and
 * the code cannot disagree.
 *
 * Where free data can't support Graham's exact test, the rule is adapted
 * openly, and the adaptation is printed on the card (decision log #8, #11).
 *
 * Independently reviewed 12 Oct 2026 against the source text
 * (docs/reviews/week-05-independent-review.md). Documented limits:
 *   - Utilities: Graham gives them separate size and debt rules (p. 348:
 *     $50m total assets; debt ≤ 2× equity). Not implemented — none in the
 *     universe. A utility added to the candidates file would be mis-scored.
 *   - Financial companies: Graham's financial-strength test is written
 *     "for industrial companies"; for financials he applied only the price
 *     tests (p. 361). Test 2 is therefore SKIPPED (not failed) for the
 *     Financial Services sector and does not count against the company.
 *   - Dividend record depends on the stored window: the nightly job keeps
 *     the newest 60 payments per symbol = 15 years for a quarterly payer.
 *   - Book value per share uses weighted-average diluted shares (the
 *     income-statement figure), not period-end shares outstanding.
 *   - Dividend streak is by calendar year of ex-date: a suspension inside
 *     the last ~12 months can still read as unbroken until the year turns.
 */

import type { FundamentalsYear } from "./ratios";

// ---------------------------------------------------------------------------
// Thresholds — every number on the card lives here and only here.
// ---------------------------------------------------------------------------
export const T = {
  /** Graham (1971): sales ≥ $100m. US CPI-U annual average 1971 = 40.5,
   *  2025 ≈ 322 → ×7.95 (BLS). Rounded: $800m. Zweig's 2003 update used
   *  market value ≥ $2bn instead; we stay with Graham's sales basis. */
  minRevenue: 800e6,
  /** Current assets ≥ 2× current liabilities. */
  minCurrentRatio: 2,
  /** Long-term debt ≤ working capital (net current assets). */
  maxLtDebtToWc: 1,
  /** Graham: earnings in each of 10 years. Free data: 5 (decision #8). */
  earningsYears: 5,
  /** Graham: 20 years of dividends. The stored record is the newest 60
   *  payments (~15 years for a quarterly payer) → we ask 10. */
  dividendYears: 10,
  /** Graham: +1/3 EPS over 10 years. */
  grahamGrowth10y: 1 / 3,
  /** Our window: 2-year averages, 3 years apart (see ratios.epsGrowthPct). */
  growthSpanYears: 3,
  /** Price ≤ 15× average EPS of the last 3 years. */
  maxPe: 15,
  /** Price ≤ 1.5× book value … */
  maxPb: 1.5,
  /** … unless P/E × P/B ≤ 22.5 (15 × 1.5). */
  maxPeTimesPb: 22.5,
} as const;

/**
 * Graham's +1/3 over ten years, pro-rated to our 3-year window:
 * (4/3)^(3/10) − 1 ≈ +9.0%.
 * Review note: Graham's three-year averages have midpoints 7 years apart,
 * so the midpoint-faithful equivalent would be (4/3)^(3/7) − 1 ≈ +13.1%.
 * Decision 12 Oct 2026: keep 9% (decision log #11); the card says
 * "pro-rated", not "same pace".
 */
export const requiredGrowthPct = Math.round(
  (Math.pow(1 + T.grahamGrowth10y, T.growthSpanYears / 10) - 1) * 1000,
) / 10;

export type CriterionId =
  | "size" | "condition" | "stability" | "dividends" | "growth" | "pe" | "price_assets";

export type Criterion = {
  id: CriterionId;
  n: number;
  short: string;
  title: string;
  /** Graham's rule, as he wrote it (paraphrased, ch. 14). */
  graham: string;
  /** The rule the code actually applies. */
  ours: string;
  /** Why it exists — the plain-words reason, for the card. */
  why: string;
  adapted: boolean;
};

export const CRITERIA: Criterion[] = [
  {
    id: "size", n: 1, short: "Size", title: "Adequate size",
    graham: "Annual sales of at least $100 million (1971 dollars). Zweig's 2003 update: market value of at least $2 billion.",
    ours: `Latest annual revenue ≥ $${T.minRevenue / 1e6}m — Graham's $100m × US inflation since 1971 (CPI ≈ ×8).`,
    why: "Small firms are more fragile in bad years.",
    adapted: true,
  },
  {
    id: "condition", n: 2, short: "Strength", title: "Strong financial condition",
    graham: "Current assets at least twice current liabilities; long-term debt no more than net current assets.",
    ours: `Current ratio ≥ ${T.minCurrentRatio} AND long-term debt ≤ working capital. Skipped for financial companies — Graham applied only the price tests to them.`,
    why: "Can pay this year's bills, and the mortgage is smaller than the cushion.",
    adapted: false,
  },
  {
    id: "stability", n: 3, short: "Stability", title: "Earnings stability",
    graham: "Some earnings for the common stock in each of the past 10 years.",
    ours: `Positive EPS in every one of the last ${T.earningsYears} years (free data holds 5).`,
    why: "A business that never loses money has proven it can weather a bad year.",
    adapted: true,
  },
  {
    id: "dividends", n: 4, short: "Dividends", title: "Dividend record",
    graham: "Uninterrupted dividend payments for at least the past 20 years.",
    ours: `A dividend paid in each of the last ${T.dividendYears} calendar years (our record holds ~15).`,
    why: "Cash actually handed to owners is hard to fake for a decade.",
    adapted: true,
  },
  {
    id: "growth", n: 5, short: "Growth", title: "Earnings growth",
    graham: "EPS up at least one-third over 10 years, using 3-year averages at each end.",
    ours: `EPS up ≥ ${requiredGrowthPct}% between the early and late 2-year averages — Graham's +⅓ over ten years, pro-rated to our window.`,
    why: "Modest, real growth — not a promise of it.",
    adapted: true,
  },
  {
    id: "pe", n: 6, short: "P/E", title: "Moderate price/earnings",
    graham: "Price no more than 15× average earnings of the past 3 years.",
    ours: `Price ≤ ${T.maxPe}× the average EPS of the last 3 years.`,
    why: "Don't pay many years of profits up front.",
    adapted: false,
  },
  {
    id: "price_assets", n: 7, short: "P/B", title: "Moderate price to assets",
    graham: "Price no more than 1.5× book value — or P/E × P/B no more than 22.5.",
    ours: `P/B ≤ ${T.maxPb}, OR P/E (3-yr) × P/B ≤ ${T.maxPeTimesPb}.`,
    why: "Something solid behind the price if the earnings disappoint.",
    adapted: false,
  },
];

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------
/** pass/fail: evaluated. skip: structurally inapplicable by Graham's own
 *  rule — not counted. na: data missing — cannot say. */
export type Outcome = "pass" | "fail" | "skip" | "na";
export type CriterionResult = { id: CriterionId; outcome: Outcome; detail: string };
export type Verdict = "survivor" | "near_miss" | "fails" | "insufficient";

export type ScreenInput = {
  symbol: string;
  name: string | null;
  sector: string | null;
  years: FundamentalsYear[];            // NEWEST FIRST
  dividendsPerYear: Record<string, number>;
  lastClose: number | null;
  currentYear: number;                  // calendar year "today" (injected for tests)
};

export type ScreenResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
  results: CriterionResult[];
  passes: number;
  /** Criteria that apply to this company (7, or 6 for financials). */
  applicable: number;
  fails: number;
  verdict: Verdict;
  figures: {
    revenue: number | null; currentRatio: number | null; ltDebtToWc: number | null;
    epsAvg3: number | null; pe3: number | null; pb: number | null; peTimesPb: number | null;
    epsGrowthPct: number | null; dividendYears: number; positiveEpsYears: number;
    bookValuePerShare: number | null;
  };
};

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
const money = (v: number) => (Math.abs(v) >= 1e9 ? `$${r1(v / 1e9)}bn` : `$${Math.round(v / 1e6)}m`);

/** Consecutive calendar years with a dividend, counting back from this year
 *  (or last year, if this year hasn't paid yet — the year isn't over). */
export function consecutiveDividendYears(perYear: Record<string, number>, currentYear: number): number {
  const paid = (y: number) => (perYear[String(y)] ?? 0) > 0;
  let y = paid(currentYear) ? currentYear : currentYear - 1;
  let n = 0;
  while (paid(y)) { n++; y--; }
  return n;
}

export function screenCompany(input: ScreenInput): ScreenResult {
  const { years, lastClose } = input;
  const latest = years[0] ?? null;

  // --- figures ---
  const revenue = latest && ok(latest.revenue) ? latest.revenue : null;

  const ca = latest?.currentAssets, cl = latest?.currentLiabilities;
  const currentRatio = ok(ca) && ok(cl) && cl > 0 ? r2(ca / cl) : null;
  const wc = ok(ca) && ok(cl) ? ca - cl : null;
  const ltd = latest && ok(latest.longTermDebt) ? latest.longTermDebt : null;
  const ltDebtToWc = ok(wc) && ok(ltd) ? (wc > 0 ? r2(ltd / wc) : ltd > 0 ? Infinity : 0) : null;

  const eps = years.map((y) => y.epsDiluted).filter(ok);
  const positiveEpsYears = eps.filter((e) => e > 0).length;

  const recent3 = years.slice(0, 3).map((y) => y.epsDiluted);
  const epsAvg3 = recent3.length === 3 && recent3.every(ok) ? r2((recent3 as number[]).reduce((a, b) => a + b, 0) / 3) : null;
  const pe3 = ok(lastClose) && ok(epsAvg3) && epsAvg3 > 0 ? r1(lastClose / epsAvg3) : null;

  const bvps = latest && ok(latest.equity) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0
    ? latest.equity / latest.sharesDiluted : null;
  const pb = ok(lastClose) && ok(bvps) && bvps > 0 ? r1(lastClose / bvps) : null;
  const peTimesPb = ok(pe3) && ok(pb) ? r1(pe3 * pb) : null;

  let epsGrowthPct: number | null = null;
  if (eps.length >= 4) {
    const late = (eps[0] + eps[1]) / 2;
    const early = (eps[eps.length - 1] + eps[eps.length - 2]) / 2;
    if (early > 0) epsGrowthPct = r1(((late - early) / early) * 100);
  }

  const dividendYears = consecutiveDividendYears(input.dividendsPerYear, input.currentYear);

  // --- criteria ---
  const res: CriterionResult[] = [];
  const add = (id: CriterionId, outcome: Outcome, detail: string) => res.push({ id, outcome, detail });

  add("size", revenue === null ? "na" : revenue >= T.minRevenue ? "pass" : "fail",
    revenue === null ? "No revenue figure." : `Revenue ${money(revenue)}.`);

  if (input.sector === "Financial Services") {
    add("condition", "skip",
      "Not applied: Graham's financial-strength test is written for industrial companies; for financial enterprises he applied only the price tests (ch. 14, p. 361). Not counted.");
  } else if (currentRatio === null || ltDebtToWc === null) {
    add("condition", "na", "Current assets/liabilities or long-term debt not reported.");
  } else {
    const crOk = currentRatio >= T.minCurrentRatio;
    const dOk = ltDebtToWc <= T.maxLtDebtToWc;
    const dTxt = Number.isFinite(ltDebtToWc) ? `${ltDebtToWc}× working capital` : "debt with no working-capital cushion";
    add("condition", crOk && dOk ? "pass" : "fail", `Current ratio ${currentRatio}; long-term debt ${dTxt}.`);
  }

  add("stability", eps.length < T.earningsYears ? "na" : positiveEpsYears === eps.length ? "pass" : "fail",
    eps.length < T.earningsYears ? `Only ${eps.length} years of EPS held.` : `Positive EPS in ${positiveEpsYears} of ${eps.length} years.`);

  add("dividends", dividendYears >= T.dividendYears ? "pass" : "fail",
    dividendYears === 0 ? "No dividend in the record." : `${dividendYears} consecutive years paid.`);

  add("growth", epsGrowthPct === null ? (eps.length < 4 ? "na" : "fail") : epsGrowthPct >= requiredGrowthPct ? "pass" : "fail",
    epsGrowthPct === null
      ? eps.length < 4 ? "Not enough years." : "Early years weren't profitable — no growth base."
      : `EPS ${epsGrowthPct >= 0 ? "+" : ""}${epsGrowthPct}% across the window (need +${requiredGrowthPct}%).`);

  add("pe", !ok(lastClose) || epsAvg3 === null ? "na" : pe3 === null ? "fail" : pe3 <= T.maxPe ? "pass" : "fail",
    !ok(lastClose) || epsAvg3 === null ? "Price or 3-year EPS missing."
      : pe3 === null ? "3-year average earnings not positive — no meaningful P/E." : `P/E on 3-yr EPS ${pe3}.`);

  if (bvps !== null && bvps <= 0) {
    add("price_assets", "fail",
      `Negative book value (${r2(bvps)} per share) — no multiple of assets supports the price.`);
  } else if (pb === null) {
    add("price_assets", "na", "Book value or price not reported.");
  } else {
    const pass = pb <= T.maxPb || (peTimesPb !== null && peTimesPb <= T.maxPeTimesPb);
    add("price_assets", pass ? "pass" : "fail",
      `P/B ${pb}${peTimesPb !== null ? `; P/E × P/B ${peTimesPb}` : ""}.`);
  }

  const passes = res.filter((r) => r.outcome === "pass").length;
  const fails = res.filter((r) => r.outcome === "fail").length;
  const nas = res.filter((r) => r.outcome === "na").length;
  const skips = res.filter((r) => r.outcome === "skip").length;
  const applicable = res.length - skips;
  // Decision 12 Oct 2026: if a company passes every test that applies to it,
  // it passes. Skipped tests never count against it. "insufficient" means
  // data is missing on a test that could still change the answer.
  const verdict: Verdict =
    fails >= 2 ? "fails"
    : nas > 0 ? "insufficient"
    : fails === 1 ? "near_miss"
    : "survivor";

  return {
    symbol: input.symbol, name: input.name, sector: input.sector,
    results: res, passes, applicable, fails, verdict,
    figures: {
      revenue, currentRatio,
      ltDebtToWc: ltDebtToWc !== null && Number.isFinite(ltDebtToWc) ? ltDebtToWc : null,
      epsAvg3, pe3, pb, peTimesPb, epsGrowthPct, dividendYears, positiveEpsYears,
      bookValuePerShare: bvps === null ? null : r2(bvps),
    },
  };
}

const RANK: Record<Verdict, number> = { survivor: 0, near_miss: 1, insufficient: 2, fails: 3 };

export function rankScreen(rows: ScreenResult[]): ScreenResult[] {
  return [...rows].sort((a, b) =>
    RANK[a.verdict] - RANK[b.verdict] || b.passes - a.passes || a.symbol.localeCompare(b.symbol));
}
