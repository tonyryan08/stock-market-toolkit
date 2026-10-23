/**
 * Week 4: the ratio engine — pure functions, no I/O, unit-tested.
 *
 * These numbers end up on the class screen and, in week 5, inside the
 * Graham screener. The course's credibility rides on them, so they are
 * the first code in the project with their own test suite: `npm test`.
 *
 * Conventions: null in → null out, never NaN, never a throw. Years are
 * passed NEWEST FIRST (as FMP serves them).
 */

export type FundamentalsYear = {
  fiscalYear: string;
  periodEnd: string | null;
  revenue: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  longTermDebt: number | null;
  equity: number | null;
  sharesDiluted: number | null;
  /** Goodwill + intangibles (balance sheet). Optional: rows stored before
   *  migration 0004 carry null, and the defensive screen never needs it. */
  goodwillAndIntangibles?: number | null;
  /** The toolkit's readings of a provider's "None" on this year's balance sheet
   *  ("no debt line reported → long-term debt 0"), shown wherever a test rests on them (review S8). */
  readings?: string | null;
};

export type Ratios = {
  asOfYear: string | null;
  /** Current assets ÷ current liabilities. Graham's defensive bar: ≥ 2. */
  currentRatio: number | null;
  /** Current assets − current liabilities. */
  workingCapital: number | null;
  /** Long-term debt ÷ working capital. Graham's defensive bar: ≤ 1. */
  ltDebtToWorkingCapital: number | null;
  /** Equity ÷ diluted shares. */
  bookValuePerShare: number | null;
  /** (Equity − goodwill − intangibles) ÷ diluted shares — Graham's "net tangible
   *  assets" per share (ch. 15). Null until the intangibles figure is held. */
  tangibleBookPerShare: number | null;
  /** Price ÷ tangible book per share. Graham's enterprising bar: < 1.2 (p. 386). */
  pTangibleBook: number | null;
  /** Price ÷ latest diluted EPS — informational. Null when EPS ≤ 0. */
  pe: number | null;
  /** Average diluted EPS of the newest three fiscal years (Graham's basis). */
  epsAvg3: number | null;
  /** Price ÷ epsAvg3 — THE Graham P/E (ch. 14: "average earnings of the past
   *  three years"). The screen uses this; so does the books page chip. */
  pe3: number | null;
  /** Price ÷ book value per share. Null when book value ≤ 0 or unreported. */
  pb: number | null;
  /** Graham's combined test on the 3-year P/E: bar ≤ 22.5 (15 × 1.5). */
  peTimesPb: number | null;
  /** How many fiscal years of EPS we actually hold (free plan: 5; Graham asked for 10). */
  epsYearsAvailable: number;
  /** Years with EPS > 0. Stability = every available year positive. */
  epsPositiveYears: number;
  /**
   * Growth across the window: average of the two newest EPS vs average of
   * the two oldest (Graham's smoothing habit, shrunk to a 5-year window).
   * Null when the early average isn't positive.
   */
  epsGrowthPct: number | null;
  /** The same ratios UNROUNDED, for comparisons against Graham's bars (review F3:
   *  the chips must agree with the screen, which compares unrounded). */
  raw: {
    currentRatio: number | null;
    pe3: number | null;
    pb: number | null;
    peTimesPb: number | null;
    pTangibleBook: number | null;
  };
};

const ok = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

const round = (v: number, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

export function computeRatios(
  years: FundamentalsYear[],
  lastClose: number | null,
): Ratios {
  const latest = years[0] ?? null;

  const currentRatio =
    latest && ok(latest.currentAssets) && ok(latest.currentLiabilities) && latest.currentLiabilities > 0
      ? round(latest.currentAssets / latest.currentLiabilities)
      : null;

  const workingCapital =
    latest && ok(latest.currentAssets) && ok(latest.currentLiabilities)
      ? round(latest.currentAssets - latest.currentLiabilities, 0)
      : null;

  const ltDebtToWorkingCapital =
    latest && ok(latest.longTermDebt) && ok(workingCapital) && workingCapital! > 0
      ? round(latest.longTermDebt / workingCapital!)
      : null;

  const bookValuePerShare =
    latest && ok(latest.equity) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0
      ? round(latest.equity / latest.sharesDiluted)
      : null;

  const tangibleBookPerShare =
    latest && ok(latest.equity) && ok(latest.goodwillAndIntangibles) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0
      ? round((latest.equity - latest.goodwillAndIntangibles!) / latest.sharesDiluted)
      : null;

  const latestEps = latest && ok(latest.epsDiluted) ? latest.epsDiluted : null;

  const pe =
    ok(lastClose) && ok(latestEps) && latestEps > 0 ? round(lastClose / latestEps, 1) : null;

  const recent3 = years.slice(0, 3).map((y) => y.epsDiluted);
  const epsAvg3 =
    recent3.length === 3 && recent3.every(ok)
      ? round((recent3 as number[]).reduce((a, b) => a + b, 0) / 3)
      : null;
  const epsAvg3Raw = recent3.length === 3 && recent3.every(ok) ? (recent3 as number[]).reduce((a, b) => a + b, 0) / 3 : null;
  const pe3Raw = ok(lastClose) && epsAvg3Raw !== null && epsAvg3Raw > 0 ? lastClose / epsAvg3Raw : null;
  const pe3 = pe3Raw === null ? null : round(pe3Raw, 1);

  const bvpsRaw = latest && ok(latest.equity) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0 ? latest.equity / latest.sharesDiluted : null;
  const pbRaw = ok(lastClose) && bvpsRaw !== null && bvpsRaw > 0 ? lastClose / bvpsRaw : null;
  const pb = pbRaw === null ? null : round(pbRaw, 1);

  const peTimesPbRaw = pe3Raw !== null && pbRaw !== null ? pe3Raw * pbRaw : null;
  const peTimesPb = peTimesPbRaw === null ? null : round(peTimesPbRaw, 1);

  const tbvpsRaw = latest && ok(latest.equity) && ok(latest.goodwillAndIntangibles) && ok(latest.sharesDiluted) && latest.sharesDiluted > 0
    ? (latest.equity - latest.goodwillAndIntangibles!) / latest.sharesDiluted : null;
  const pTangibleBookRaw = ok(lastClose) && tbvpsRaw !== null && tbvpsRaw > 0 ? lastClose / tbvpsRaw : null;
  const pTangibleBook = pTangibleBookRaw === null ? null : round(pTangibleBookRaw, 2);
  const crRaw = latest && ok(latest.currentAssets) && ok(latest.currentLiabilities) && latest.currentLiabilities > 0
    ? latest.currentAssets / latest.currentLiabilities : null;

  const epsSeries = years.map((y) => y.epsDiluted).filter(ok);
  const epsPositiveYears = epsSeries.filter((e) => e > 0).length;

  let epsGrowthPct: number | null = null;
  if (epsSeries.length >= 4) {
    // newest first: head = recent pair, tail = oldest pair
    const recent = (epsSeries[0] + epsSeries[1]) / 2;
    const early = (epsSeries[epsSeries.length - 1] + epsSeries[epsSeries.length - 2]) / 2;
    if (early > 0) epsGrowthPct = round(((recent - early) / early) * 100, 1);
  }

  return {
    asOfYear: latest?.fiscalYear ?? null,
    currentRatio,
    workingCapital,
    ltDebtToWorkingCapital,
    bookValuePerShare,
    tangibleBookPerShare,
    pTangibleBook,
    pe,
    epsAvg3,
    pe3,
    pb,
    peTimesPb,
    epsYearsAvailable: epsSeries.length,
    epsPositiveYears,
    epsGrowthPct,
    raw: { currentRatio: crRaw, pe3: pe3Raw, pb: pbRaw, peTimesPb: peTimesPbRaw, pTangibleBook: pTangibleBookRaw },
  };
}

/** Distinct calendar years, within the data window, that paid any dividend. */
export function dividendYears(exDates: { ex_date: string; amount: number | null }[]): {
  yearsPaid: number;
  perYear: Record<string, number>;
} {
  const perYear: Record<string, number> = {};
  for (const d of exDates) {
    if (!ok(d.amount) || d.amount <= 0) continue;
    const y = d.ex_date.slice(0, 4);
    perYear[y] = round((perYear[y] ?? 0) + d.amount, 4);
  }
  return { yearsPaid: Object.keys(perYear).length, perYear };
}
