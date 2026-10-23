/**
 * Week 5: the Graham defensive-investor screen — pure functions, tested.
 * Week 5½ (v0.6.0): the enterprising-investor screen, same engine, below.
 *
 * Source: Benjamin Graham, The Intelligent Investor, ch. 14, "Stock
 * Selection for the Defensive Investor" (course copy, 2003 revised ed.,
 * p. 347). Seven criteria. Graham's text is unchanged in every edition.
 * The enterprising screen: ch. 15, pp. 385–386 — six requirements.
 *
 * ONE source of truth: the CRITERIA table below drives the screen, the
 * screen page's column headers AND the printable checklist card (/card);
 * the ENTERPRISING table does the same for /screen/enterprising and the
 * card's second page. Change a threshold here and all three change
 * together — the card and the code cannot disagree.
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
 *   - Dividend streak is by calendar year of ex-date, AND (since v0.6.1,
 *     16 Oct 2026) no gap between consecutive ex-dates may exceed 15 months.
 *     Before the gap rule, Ford's 2020–21 suspension read as unbroken: its
 *     last 2020 dividend went ex in January, the next in late 2021, so every
 *     calendar year had a payment (review finding 9).
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
  /** "Uninterrupted": no gap between ex-dates longer than 15 months (an
   *  annual payer's normal gap is 12; a skipped year shows as ~24). */
  maxDividendGapDays: 456,
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

/** One rule on a card. The same shape serves both screens. */
export type CriterionDef<Id extends string> = {
  id: Id;
  n: number;
  short: string;
  title: string;
  /** Graham's rule, as he wrote it (paraphrased). */
  graham: string;
  /** The rule the code actually applies. */
  ours: string;
  /** Why it exists — the plain-words reason, for the card. */
  why: string;
  adapted: boolean;
};
export type Criterion = CriterionDef<CriterionId>;

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
    ours: `A dividend paid in each of the last ${T.dividendYears} calendar years, with no gap over 15 months between payments (our record holds ~15 years).`,
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
export type CriterionResult<Id extends string = CriterionId> = { id: Id; outcome: Outcome; detail: string };
/** "survivor" is the defensive screen's all-pass; "candidate" the enterprising
 *  screen's (Graham: candidates for a "third selection" by judgment, p. 386). */
export type Verdict = "survivor" | "candidate" | "near_miss" | "fails" | "insufficient";

export type ScreenInput = {
  symbol: string;
  name: string | null;
  sector: string | null;
  years: FundamentalsYear[];            // NEWEST FIRST
  dividendsPerYear: Record<string, number>;
  lastClose: number | null;
  currentYear: number;                  // calendar year "today" (injected for tests)
  /** Every ex-date with a positive amount (ISO dates, any order). When given,
   *  the dividend streak also breaks at any gap over 15 months. */
  exDates?: string[];
  /** Newest ex-dividend date with a positive amount (ISO date), or null.
   *  Used by the enterprising screen's "some current dividend" test. */
  lastExDate?: string | null;
  /** "Today" as an ISO date, injected for tests; defaults to the real date. */
  today?: string;
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
export function consecutiveDividendYears(
  perYear: Record<string, number>, currentYear: number,
  exDates?: string[], today?: string,
): number {
  const paid = (y: number) => (perYear[String(y)] ?? 0) > 0;
  // Gap rule: the streak can reach back no further than the oldest ex-date
  // in an unbroken chain (each step ≤ 15 months), starting from the newest —
  // and the newest itself must be within 15 months of today.
  let floorYear = -Infinity;
  if (exDates && exDates.length) {
    const d = [...exDates].sort().reverse();
    const day = (iso: string) => Date.parse(iso + "T00:00:00Z") / 86_400_000;
    const now = today ? day(today) : day(`${currentYear}-12-31`);
    if (now - day(d[0]) > T.maxDividendGapDays) return 0;
    let start = d[0];
    for (let i = 1; i < d.length; i++) {
      if (day(d[i - 1]) - day(d[i]) > T.maxDividendGapDays) break;
      start = d[i];
    }
    floorYear = Number(start.slice(0, 4));
  }
  let y = paid(currentYear) ? currentYear : currentYear - 1;
  let n = 0;
  while (paid(y) && y >= floorYear) { n++; y--; }
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

  const dividendYears = consecutiveDividendYears(input.dividendsPerYear, input.currentYear, input.exDates, input.today);

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
    dividendYears === 0
      ? (input.exDates?.length ? "No dividend in the last 15 months." : "No dividend in the record.")
      : `${dividendYears} consecutive years paid${input.exDates?.length ? ", no gap over 15 months" : ""}.`);

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

  const { passes, applicable, fails, verdict } = tally(res, "survivor");

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

/** Decision 12 Oct 2026: if a company passes every test that applies to it,
 *  it passes. Skipped tests never count against it. "insufficient" means
 *  data is missing on a test that could still change the answer. */
function tally<Id extends string>(res: CriterionResult<Id>[], allPass: "survivor" | "candidate") {
  const passes = res.filter((r) => r.outcome === "pass").length;
  const fails = res.filter((r) => r.outcome === "fail").length;
  const nas = res.filter((r) => r.outcome === "na").length;
  const skips = res.filter((r) => r.outcome === "skip").length;
  const applicable = res.length - skips;
  const verdict: Verdict =
    fails >= 2 ? "fails"
    : nas > 0 ? "insufficient"
    : fails === 1 ? "near_miss"
    : allPass;
  return { passes, applicable, fails, verdict };
}

const RANK: Record<Verdict, number> = { survivor: 0, candidate: 0, near_miss: 1, insufficient: 2, fails: 3 };

export function rankScreen<R extends { verdict: Verdict; passes: number; symbol: string }>(rows: R[]): R[] {
  return [...rows].sort((a, b) =>
    RANK[a.verdict] - RANK[b.verdict] || b.passes - a.passes || a.symbol.localeCompare(b.symbol));
}

// ---------------------------------------------------------------------------
// The enterprising investor — ch. 15, "A Winnowing of the Stock Guide"
// (course copy pp. 385–386). Graham starts from a prima facie sign of
// cheapness — "a multiple of nine or less" of recent earnings — then applies
// five tests "rather similar to those we suggested for the defensive
// investor, but not so severe", and sets "no lower limit on the size of the
// enterprise": six requirements, no size test. Survivors are not picks: they
// are the list from which "the enterprising investor would then be able to
// follow his judgment … in making a third selection of, say, one out of
// five" (p. 386). The page calls them candidates for that reason.
//
// Same engine, same data, same ONE-source-of-truth rule: the E table drives
// the screen, the column headers and page 2 of the printable card.
// ---------------------------------------------------------------------------
export const E = {
  /** "a multiple of nine or less" (p. 385). The Stock Guide's multiplier was
   *  on the latest 12 months; ours is on the latest fiscal year held. */
  maxPe: 9,
  /** 1(a): current assets at least 1½ times current liabilities (p. 385). */
  minCurrentRatio: 1.5,
  /** 1(b): debt not more than 110% of net current assets, for industrial
   *  companies (p. 385). We read "debt" as long-term debt, the figure held. */
  maxDebtToWc: 1.1,
  /** 2: no deficit in the last five years (p. 386) — our window exactly. */
  earningsYears: 5,
  /** 3: "some current dividend" — an ex-date within the last 12 months. */
  currentDividendDays: 366,
  /** 4: last year's earnings more than those of 1966 (vs 1970: four years
   *  earlier, p. 386). Ours: the newest fiscal year vs the oldest of five. */
  growthYears: 5,
  /** 5: price less than 120% of net tangible assets (p. 386). */
  maxPTangibleBook: 1.2,
} as const;

export type EnterprisingId =
  | "multiplier" | "e_condition" | "e_stability" | "e_dividend" | "e_growth" | "e_tangible";
export type EnterprisingCriterion = CriterionDef<EnterprisingId>;

export const ENTERPRISING: EnterprisingCriterion[] = [
  {
    id: "multiplier", n: 1, short: "P/E ≤ 9", title: "A low multiplier of earnings",
    graham: "Shares selling at a multiple of nine or less of the latest twelve months' earnings — the first cut, before any other test (p. 385).",
    ours: `Price ≤ ${E.maxPe}× the latest fiscal year's diluted EPS. A loss year cannot be cheap on earnings — it fails.`,
    why: "The first clue that a share is cheap: the market is paying little for each dollar it earns.",
    adapted: true,
  },
  {
    id: "e_condition", n: 2, short: "Strength", title: "Financial condition",
    graham: "Current assets at least 1½ times current liabilities, and debt not more than 110% of net current assets (for industrial companies).",
    ours: `Current ratio ≥ ${E.minCurrentRatio} AND long-term debt ≤ ${Math.round(E.maxDebtToWc * 100)}% of working capital. Skipped for financial companies — Graham's parenthesis.`,
    why: "The defensive bars (2× and 100%), relaxed: a cushion, not a fortress.",
    adapted: false,
  },
  {
    id: "e_stability", n: 3, short: "Stability", title: "Earnings stability",
    graham: "No deficit in the last five years covered in the Stock Guide.",
    ours: `Positive EPS in every one of the last ${E.earningsYears} fiscal years — Graham's own window, no adaptation needed.`,
    why: "Five years without a loss — half the defensive investor's ask.",
    adapted: false,
  },
  {
    id: "e_dividend", n: 4, short: "Dividend", title: "Some current dividend",
    graham: "Some current dividend.",
    ours: "A dividend with an ex-date inside the last 12 months. No twenty-year record asked for — just cash being paid now.",
    why: "A company paying cash out today has cash today.",
    adapted: false,
  },
  {
    id: "e_growth", n: 5, short: "Growth", title: "Earnings growth",
    graham: "Last year's earnings more than those of 1966 — four years earlier than the 1970 figures he was reading.",
    ours: `Latest fiscal year's diluted EPS higher than the oldest of the ${E.growthYears} years held — the same span as Graham's.`,
    why: "Not growth at a required pace — just higher than it was.",
    adapted: false,
  },
  {
    id: "e_tangible", n: 6, short: "P/TBV", title: "Price against tangible assets",
    graham: "Price less than 120% of net tangible assets.",
    ours: `Price < ${E.maxPTangibleBook}× tangible book value per share — equity minus goodwill and intangibles, per diluted share. Negative tangible book fails.`,
    why: "Stricter than the defensive 1.5× book: goodwill and brand names don't count. What's left is what you could touch.",
    adapted: false,
  },
];

export type EnterprisingResult = {
  symbol: string;
  name: string | null;
  sector: string | null;
  results: CriterionResult<EnterprisingId>[];
  passes: number;
  /** 6, or 5 for financial companies (condition skipped). */
  applicable: number;
  fails: number;
  verdict: Verdict;
  figures: {
    epsLatest: number | null; pe: number | null;
    currentRatio: number | null; ltDebtToWc: number | null;
    positiveEpsYears: number; epsYears: number;
    lastExDate: string | null; daysSinceDividend: number | null;
    epsOldest: number | null;
    tangibleBookPerShare: number | null; pTangibleBook: number | null;
  };
};

const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000);

export function screenEnterprising(input: ScreenInput): EnterprisingResult {
  const { years, lastClose } = input;
  const latest = years[0] ?? null;
  const today = input.today ?? new Date().toISOString().slice(0, 10);

  // --- figures ---
  const epsLatest = latest && ok(latest.epsDiluted) ? latest.epsDiluted : null;
  const pe = ok(lastClose) && ok(epsLatest) && epsLatest > 0 ? r1(lastClose / epsLatest) : null;

  const ca = latest?.currentAssets, cl = latest?.currentLiabilities;
  const currentRatio = ok(ca) && ok(cl) && cl > 0 ? r2(ca / cl) : null;
  const wc = ok(ca) && ok(cl) ? ca - cl : null;
  const ltd = latest && ok(latest.longTermDebt) ? latest.longTermDebt : null;
  const ltDebtToWc = ok(wc) && ok(ltd) ? (wc > 0 ? r2(ltd / wc) : ltd > 0 ? Infinity : 0) : null;

  const eps = years.map((y) => y.epsDiluted).filter(ok);
  const positiveEpsYears = eps.filter((e) => e > 0).length;
  const epsOldest = eps.length >= E.growthYears ? eps[E.growthYears - 1] : null;

  const lastExDate = input.lastExDate ?? null;
  const daysSinceDividend = lastExDate ? daysBetween(today, lastExDate) : null;

  const tbvps = latest && ok(latest.equity) && ok(latest.goodwillAndIntangibles) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0
    ? (latest.equity - latest.goodwillAndIntangibles) / latest.sharesDiluted : null;
  const pTangibleBook = ok(lastClose) && ok(tbvps) && tbvps > 0 ? r2(lastClose / tbvps) : null;

  // --- the six requirements ---
  const res: CriterionResult<EnterprisingId>[] = [];
  const add = (id: EnterprisingId, outcome: Outcome, detail: string) => res.push({ id, outcome, detail });

  if (!ok(lastClose) || epsLatest === null) {
    add("multiplier", "na", "Price or latest EPS missing.");
  } else if (epsLatest <= 0) {
    add("multiplier", "fail", `Latest EPS ${r2(epsLatest)} — a deficit year has no multiplier to be low.`);
  } else {
    add("multiplier", pe !== null && pe <= E.maxPe ? "pass" : "fail", `P/E on the latest year ${pe}.`);
  }

  if (input.sector === "Financial Services") {
    add("e_condition", "skip",
      "Not applied: Graham wrote this test \"for industrial companies\" (ch. 15, p. 385). Not counted.");
  } else if (currentRatio === null || ltDebtToWc === null) {
    add("e_condition", "na", "Current assets/liabilities or long-term debt not reported.");
  } else {
    const crOk = currentRatio >= E.minCurrentRatio;
    const dOk = ltDebtToWc <= E.maxDebtToWc;
    const dTxt = Number.isFinite(ltDebtToWc) ? `${Math.round(ltDebtToWc * 100)}% of working capital` : "debt with no working-capital cushion";
    add("e_condition", crOk && dOk ? "pass" : "fail", `Current ratio ${currentRatio}; long-term debt ${dTxt}.`);
  }

  add("e_stability", eps.length < E.earningsYears ? "na" : positiveEpsYears === eps.length ? "pass" : "fail",
    eps.length < E.earningsYears ? `Only ${eps.length} years of EPS held.` : `Positive EPS in ${positiveEpsYears} of ${eps.length} years.`);

  if (lastExDate === null) {
    add("e_dividend", "fail", "No dividend in the record.");
  } else {
    const current = daysSinceDividend !== null && daysSinceDividend <= E.currentDividendDays;
    add("e_dividend", current ? "pass" : "fail",
      `Last ex-dividend date ${lastExDate}${current ? "" : ` — more than 12 months ago`}.`);
  }

  if (epsLatest === null || epsOldest === null) {
    add("e_growth", "na", eps.length < E.growthYears ? `Only ${eps.length} years of EPS held.` : "Latest EPS missing.");
  } else {
    add("e_growth", epsLatest > epsOldest ? "pass" : "fail",
      `EPS ${r2(epsLatest)} now vs ${r2(epsOldest)} ${E.growthYears - 1} years earlier.`);
  }

  if (tbvps === null) {
    add("e_tangible", "na",
      latest && ok(latest.equity) && !ok(latest.goodwillAndIntangibles)
        ? "Goodwill and intangibles not yet held — fills as the accounts refresh."
        : "Book value, intangibles, shares or price not reported.");
  } else if (tbvps <= 0) {
    add("e_tangible", "fail", `Negative tangible book value (${r2(tbvps)} per share) — nothing tangible supports the price.`);
  } else if (pTangibleBook === null) {
    add("e_tangible", "na", "Price missing.");
  } else {
    add("e_tangible", pTangibleBook < E.maxPTangibleBook ? "pass" : "fail",
      `Price ${pTangibleBook}× tangible book (${r2(tbvps)} per share).`);
  }

  const { passes, applicable, fails, verdict } = tally(res, "candidate");

  return {
    symbol: input.symbol, name: input.name, sector: input.sector,
    results: res, passes, applicable, fails, verdict,
    figures: {
      epsLatest, pe, currentRatio,
      ltDebtToWc: ltDebtToWc !== null && Number.isFinite(ltDebtToWc) ? ltDebtToWc : null,
      positiveEpsYears, epsYears: eps.length,
      lastExDate, daysSinceDividend, epsOldest,
      tangibleBookPerShare: tbvps === null ? null : r2(tbvps), pTangibleBook,
    },
  };
}
