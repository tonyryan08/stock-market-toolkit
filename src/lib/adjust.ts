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
 */

export type PricePoint = { date: string; close: number };
export type DividendEvent = { exDate: string; amount: number | null };

/** Multiplicative factor per date (1 = unadjusted), for the dates given. */
export function adjustmentFactors(points: PricePoint[], dividends: DividendEvent[]): Map<string, number> {
  const sorted = [...points].filter((p) => Number.isFinite(p.close) && p.close > 0).sort((a, b) => a.date.localeCompare(b.date));
  const factors = new Map<string, number>(sorted.map((p) => [p.date, 1]));
  const divs = dividends
    .filter((d) => typeof d.amount === "number" && Number.isFinite(d.amount) && (d.amount as number) > 0)
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
): AdjustedBar[] {
  const factors = adjustmentFactors(bars.map((b) => ({ date: b.date, close: b.close })), dividends);
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
