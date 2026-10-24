/**
 * Week 7: the signal engine — Robert Carver's trend rule as the toolkit's
 * first systematic rule. Pure functions, tested, checkable on a calculator.
 *
 * Sources:
 *   - Carver, *Leveraged Trading* (2019), the Starter System: ONE instrument,
 *     ONE opening rule — a 16-day / 64-day moving-average crossover (MAC) —
 *     with the instrument's annualised volatility ("instrument risk") as the
 *     number everything else hangs off (risk target, position size, stop).
 *   - Carver, *Systematic Trading* (2015), ch. 7 "Forecasts": the same rule as
 *     a scaled, capped forecast — EWMAC: (fast EWMA − slow EWMA) ÷ price
 *     volatility, × a forecast scalar so the average absolute forecast is 10,
 *     capped at ±20. The 16/64 scalar is 3.75 (the book's table; also
 *     systems/provided/futures_chapter15/futuresconfig.yaml in his code).
 *   - Carver's open-source implementation, pysystemtrade (GPL,
 *     github.com/robcarver17/pysystemtrade), read on 24 Oct 2026 as the
 *     reference for every constant below: EWMAs by span (pandas `ewm(span=)`),
 *     volatility = exponentially weighted standard deviation of daily price
 *     changes with a 35-day span (`robust_vol_calc`, `days=35`), forecast cap
 *     20, average absolute forecast 10, 256 business days a year (√256 = 16).
 *
 * ONE source of truth: the RULE table drives the nightly job, the API, the
 * /signals page, the chart overlay and the lesson's worked example. Change a
 * number here and all of them change together.
 *
 * Adaptations, stated (decision log #17):
 *   - LONG-ONLY, no leverage (a community class in cash equities): a negative
 *     forecast means FLAT — no position — never short.
 *   - Volatility: the recursive EWMA of squared changes with the mean taken as
 *     zero (the RiskMetrics convention), no floor, no blend with a long-run
 *     average. Carver's code subtracts an EW mean with a bias correction,
 *     floors σ at the 5% quantile of the last 500 days, and in production
 *     blends 70% of it with 30% of its ten-year mean. Measured against his
 *     estimator on realistic series (v0.9.0 review, F11): the STATE never
 *     differs — the sign of fast − slow does not depend on σ — and the
 *     forecast's size differs by a few tenths of a point in a strong trend
 *     (median 0.05, worst 2.2 on a ±20 scale). A spreadsheet reproduces this
 *     version in one column (VC-19); that is why it is the course's.
 *   - Burn-in: a series shorter than 2 × the slow span (128 closes) is
 *     "warming up" — a state is computed but not trusted on the page.
 *
 * Education, not advice. A signal is what a rule says about a price series.
 * It is not a recommendation to buy or sell anything.
 */

export const RULE = {
  /** EWMA spans in trading days (λ = 2 ÷ (span + 1)). */
  fastSpan: 16,
  slowSpan: 64,
  /** Volatility span (Carver's robust_vol_calc default, 35 days). */
  volSpan: 35,
  /** Forecast scalar for EWMAC 16/64 (Carver's table): average |forecast| ≈ 10. */
  forecastScalar: 3.75,
  /** Forecasts are capped at ±20. */
  forecastCap: 20,
  /** Business days in a year (Carver: 256) → annualise daily σ by √256 = 16. */
  businessDays: 256,
  /** Closes needed before a state is trusted: 2 × slow span. */
  minMatureDays: 128,
  /** Closes needed to compute anything at all (vol needs a handful of changes). */
  minDays: 20,
} as const;

/** Closes the job and the API read per instrument: the whole store (five years ≈ 1,260; review N1 — one window for both). */
export const HISTORY_LIMIT = 1900;

export const lambda = (span: number): number => 2 / (span + 1);
export const annualise = (dailySigma: number): number => dailySigma * Math.sqrt(RULE.businessDays);

export type SignalPoint = {
  date: string;
  close: number;        // the (adjusted) close the rule read
  fast: number;         // EWMA(16) of close
  slow: number;         // EWMA(64) of close
  sigmaPx: number | null;   // EW σ of daily price changes, price units
  sigmaPct: number | null;  // EW σ of daily % returns, decimal (0.015 = 1.5%)
  instrumentRisk: number | null; // annualised, percent (24.3 = 24.3%)
  forecastRaw: number | null;    // (fast − slow) ÷ σ_px
  forecast: number | null;       // scaled and capped, −20…+20
  state: "long" | "flat" | "warming";
};

export type SignalSeries = {
  points: SignalPoint[];
  latest: SignalPoint | null;
  days: number;
  mature: boolean;
  /** Date the current state began (the close after the last crossover). */
  stateSince: string | null;
  /** Number of state changes in the series (long↔flat), ignoring warm-up. */
  flips: number;
  /** Share of mature closes spent long, 0…1. */
  timeLong: number | null;
};

const r = (v: number, dp: number) => Math.round(v * 10 ** dp) / 10 ** dp;

/**
 * Compute the whole series for one instrument from its closes, oldest first.
 * Pure: the same closes always give the same points, so a spreadsheet can
 * reproduce every column (lesson 7's exit check).
 */
export function computeSignals(closes: { date: string; close: number }[]): SignalSeries {
  const pts = closes
    .filter((p) => typeof p.close === "number" && Number.isFinite(p.close) && p.close > 0 && typeof p.date === "string")
    .sort((a, b) => a.date.localeCompare(b.date));
  const lf = lambda(RULE.fastSpan), ls = lambda(RULE.slowSpan), lv = lambda(RULE.volSpan);
  const out: SignalPoint[] = [];
  let fast = 0, slow = 0, varPx = 0, varPct = 0;
  let prevClose: number | null = null;
  let changes = 0;
  for (let i = 0; i < pts.length; i++) {
    const { date, close } = pts[i];
    if (i === 0) { fast = close; slow = close; }
    else { fast = lf * close + (1 - lf) * fast; slow = ls * close + (1 - ls) * slow; }
    if (prevClose !== null) {
      const d = close - prevClose;
      const ret = close / prevClose - 1;
      // RiskMetrics-style EW variance, mean taken as zero; seeded with the first change
      varPx = changes === 0 ? d * d : lv * d * d + (1 - lv) * varPx;
      varPct = changes === 0 ? ret * ret : lv * ret * ret + (1 - lv) * varPct;
      changes++;
    }
    prevClose = close;
    const enough = changes >= RULE.minDays;
    const sigmaPx = enough ? Math.sqrt(varPx) : null;
    const sigmaPct = enough ? Math.sqrt(varPct) : null;
    const raw = sigmaPx !== null && sigmaPx > 0 ? (fast - slow) / sigmaPx : null;
    const scaled = raw === null ? null : Math.max(-RULE.forecastCap, Math.min(RULE.forecastCap, raw * RULE.forecastScalar));
    const mature = i + 1 >= RULE.minMatureDays;
    // Mature with no forecast only when σ is exactly zero (a flat line): flat.
    const state: SignalPoint["state"] = !mature ? "warming" : scaled !== null && scaled > 0 ? "long" : "flat";
    out.push({
      date, close,
      fast: r(fast, 6), slow: r(slow, 6),
      sigmaPx: sigmaPx === null ? null : r(sigmaPx, 6),
      sigmaPct: sigmaPct === null ? null : r(sigmaPct, 8),
      instrumentRisk: sigmaPct === null ? null : r(annualise(sigmaPct) * 100, 2),
      forecastRaw: raw === null ? null : r(raw, 4),
      forecast: scaled === null ? null : r(scaled, 2),
      state,
    });
  }
  // state bookkeeping over the mature part
  let flips = 0, longDays = 0, matureDays = 0;
  let stateSince: string | null = null;
  let prev: SignalPoint["state"] | null = null;
  for (const p of out) {
    if (p.state === "warming") continue;
    matureDays++;
    if (p.state === "long") longDays++;
    if (prev !== null && p.state !== prev) { flips++; stateSince = p.date; }
    if (prev === null) stateSince = p.date;
    prev = p.state;
  }
  const latest = out.length ? out[out.length - 1] : null;
  return {
    points: out,
    latest,
    days: out.length,
    mature: out.length >= RULE.minMatureDays,
    stateSince: latest && latest.state !== "warming" ? stateSince : null,
    flips,
    timeLong: matureDays ? r(longDays / matureDays, 4) : null,
  };
}

/** The plain-words reading of a point, for the page, the hover and the lesson. */
export function describeSignal(s: SignalSeries): string {
  const p = s.latest;
  if (!p) return "No closes stored yet.";
  if (p.state === "warming") return `Warming up: ${s.days} closes stored, ${RULE.minMatureDays} needed before the rule is trusted.`;
  const dir = p.state === "long" ? "LONG — the 16-day average is above the 64-day" : "FLAT — the 16-day average is below the 64-day (long-only: no position)";
  const f = p.forecast === null ? "—" : `${p.forecast > 0 ? "+" : ""}${p.forecast}`;
  const risk = p.instrumentRisk === null ? "—" : `${p.instrumentRisk}%`;
  return `${dir}; forecast ${f} on a ±${RULE.forecastCap} scale; instrument risk ${risk} a year; this state since ${s.stateSince}.`;
}
