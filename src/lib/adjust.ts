/**
 * Dividend adjustment, done by the toolkit (decision 14).
 *
 * Alpha Vantage's free daily series is AS TRADED: on the ex-dividend day the
 * price drops by roughly the dividend, and a chart reads that as a fall.
 * Ethan Allen's $3.00 special showed as a ~13% cliff (VC-14 finding). The
 * adjusted series that providers sell is this arithmetic, which is public:
 *
 *   for each dividend D going ex on date X, every close BEFORE X is multiplied
 *   by (1 − D ÷ close on the last trading day before X).
 *
 * Factors compound across dividends. A dividend with no stored close before
 * its ex-date adjusts nothing (there is nothing earlier to adjust); a
 * dividend larger than the prior close is nonsense and is skipped. The
 * as-traded close is kept beside the adjusted one, so the arithmetic can be
 * checked from the row itself. Students can do this on a calculator; that is
 * the point of writing it down here.
 *
 * Splits (week 8, OI-52): a split of F new shares per old share on date X
 * divides every close BEFORE X by F — Mueller Industries' two-for-one of
 * 1 Jul 2026 halves June's closes. The split factor compounds with the
 * dividend factors; dividend amounts before a split are the amounts declared
 * at the time, on the as-traded prices of the time, so their factors are
 * computed on the as-traded closes and the split is applied on top.
 */

export type PricePoint = { date: string; close: number };
export type DividendEvent = { exDate: string; amount: number | null };
/** A split: `factor` new shares per old share, from `date` (the first day at the new count). */
export type SplitEvent = { date: string; factor: number };

/** Multiplicative factor per date (1 = unadjusted), for the dates given. */
export function adjustmentFactors(points: PricePoint[], dividends: DividendEvent[], splits: SplitEvent[] = []): Map<string, number> {
  const sorted = [...points].filter((p) => Number.isFinite(p.close) && p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const factors = new Map<string, number>(sorted.map((p) => [p.date, 1]));
  const newest = sorted.length ? sorted[sorted.length - 1].date : null;
  const divs = dividends
    .filter((d) => typeof d.amount === "number" && Number.isFinite(d.amount) && (d.amount as number) > 0)
    // A DECLARED dividend whose ex-date is after the newest close has not gone
    // ex yet: nothing is adjusted until a close on or after that date exists.
    // Without this, "the last close before the ex-date" is the newest close and
    // the whole series is scaled by D/P tonight (v0.8.2 verification review, V2).
    .filter((d) => newest === null || d.exDate <= newest)
    .sort((a, b) => a.exDate.localeCompare(b.exDate));
  for (const d of divs) {
    // last close strictly before the ex-date
    let prev: PricePoint | null = null;
    for (const p of sorted) {
      if (p.date < d.exDate) prev = p;
      else break;
    }
    if (!prev) continue;
    const amount = d.amount as number;
    if (amount >= prev.close) continue;
    const f = 1 - amount / prev.close;
    for (const p of sorted) {
      if (p.date < d.exDate) factors.set(p.date, (factors.get(p.date) ?? 1) * f);
      else break;
    }
  }
  // Splits: every close before the split date is divided by the factor — new
  // shares per old share, so a 2-for-1 is 2 and a 1-for-10 reverse split is 0.1
  // (review F12: a reverse split is the same division). A factor of 1, nothing
  // positive, or a split dated after the newest close changes nothing.
  for (const sp of splits) {
    if (!(Number.isFinite(sp.factor) && sp.factor > 0 && sp.factor !== 1)) continue;
    if (newest !== null && sp.date > newest) continue;
    for (const p of sorted) {
      if (p.date < sp.date) factors.set(p.date, (factors.get(p.date) ?? 1) / sp.factor);
      else break;
    }
  }
  return factors;
}

export type AdjustedBar = {
  date: string;
  close: number;
  adjClose: number;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  volume: number | null;
};

/** Apply the factors to a bar list (open/high/low scale with the close). */
export function adjustBars(
  bars: { date: string; close: number; open: number | null; high: number | null; low: number | null; volume: number | null }[],
  dividends: DividendEvent[],
  splits: SplitEvent[] = [],
): AdjustedBar[] {
  const factors = adjustmentFactors(bars.map((b) => ({ date: b.date, close: b.close })), dividends, splits);
  const r6 = (v: number) => Math.round(v * 1e6) / 1e6;
  return bars.map((b) => {
    const f = factors.get(b.date) ?? 1;
    return {
      date: b.date,
      close: b.close,
      adjClose: r6(b.close * f),
      adjOpen: b.open === null ? null : r6(b.open * f),
      adjHigh: b.high === null ? null : r6(b.high * f),
      adjLow: b.low === null ? null : r6(b.low * f),
      volume: b.volume,
    };
  });
}

/**
 * Day-over-day moves beyond `threshold` on the ADJUSTED series: a known
 * dividend is already taken out, so what remains is a split the toolkit
 * does not know about, or real news. Either way it goes on the record.
 */
export function suspiciousJumps(bars: { date: string; adjClose: number }[], threshold = 0.4): { date: string; ratio: number }[] {
  const s = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const out: { date: string; ratio: number }[] = [];
  for (let i = 1; i < s.length; i++) {
    const prev = s[i - 1].adjClose;
    if (!(prev > 0)) continue;
    const ratio = s[i].adjClose / prev;
    if (Math.abs(ratio - 1) > threshold) out.push({ date: s[i].date, ratio: Math.round(ratio * 1000) / 1000 });
  }
  return out;
}
