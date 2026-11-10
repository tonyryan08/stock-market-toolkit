/**
 * Week 8: the stop tracker. D1 only — no provider calls, no ration.
 *
 * Every night, after the signal pass, for each open paper position: read the
 * closes stored since the night it was last tracked, trail the stop (the
 * highest adjusted close since entry − the gap fixed at entry) through them
 * in order, and stamp the FIRST close at or below it (review N6: a fetch that
 * brings two closes at once is walked close by close, not newest only). The
 * tracker never closes a position: the student does, with a close ticket and
 * a journal line — the Monday routine (decision 18). The page shows the stop,
 * the distance to it, and the stamp.
 *
 * Re-alignment (decision 18): entry, high and stop are kept in the adjusted
 * series. When the adjuster re-aligns a series (a dividend went ex, a split
 * was added), the stored close on the entry date changes; the tracker scales
 * entry price and stop gap by the same factor and stamps realign_date, so the
 * stop keeps its meaning. The comparison is made at the stored precision —
 * cents — so a re-alignment fires once, not every night after (review F5).
 * A split after entry also multiplies the share count (review F6): a 2-for-1
 * turns 18 shares at $348.91 into 36 at $174.46, the same position. The
 * split is read from the splits table (the small tier) or, for the core tier
 * whose provider series is split-adjusted, recognised by a round ratio.
 * Every position is on its own (the signal pass's F1 lesson): a fault leaves
 * a `stops_error` receipt and the rest are tracked.
 */
import { stopHit, stopLevel } from "../lib/sizing";

type Env = { DB: D1Database };

export type OpenPosition = {
  id: number;
  code: string;
  symbol: string;
  opened_on: string;
  entry_price: number;
  units: number;
  stop_gap: number;
  high_since: number;
  stop_level: number;
  stop_hit_on: string | null;
  realign_date: string | null;
  tracked_on: string | null;
};

export type StopsSummary = {
  phase: "stops";
  positions: number;
  tracked: number;
  hits: number;
  realigned: number;
  /** Of the re-alignments, those that were a split (the share count changed). */
  splits: number;
  /** Positions left untouched tonight because the series moved by a ratio the tracker does not know (a `split_unknown` receipt each). */
  unknown: number;
  errors: number;
  ms: number;
};

const RECEIPT_CHARS = 300;
const RECEIPT_SUMMARY_CHARS = 1500;
/** How many closes one night may bring for one position (a failed-night catch-up is two or three). */
const CLOSES_PER_NIGHT = 400;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Split ratios the tracker recognises without a table row: p-for-q with p, q ≤ 5 (3-for-2, 4-for-3, 5-for-4, 5-for-2 …) and their reverses. */
const RATIOS: [number, number][] = [];
for (let p = 2; p <= 5; p++) for (let q = 1; q < p; q++) if (gcd(p, q) === 1) RATIOS.push([p, q]);
function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }
/** "2-for-1", "1-for-4", "3-for-2": the ratio's name for a receipt, from the share multiplier. */
export function ratioName(mult: number): string {
  for (let q = 1; q <= 10; q++) for (let p = 1; p <= 10; p++) if (Math.abs(mult - p / q) < 1e-9) return `${p}-for-${q}`;
  return `×${mult}`;
}

/**
 * Is a re-alignment factor a split? Known splits come from the table; the core
 * tier's provider series is split-adjusted without a row, so a recognised ratio
 * within 2% counts — N-for-1 and 1-for-N, and (Phase 3 review F2) p-for-q with
 * p, q ≤ 5: a 3-for-2 scales the series by ⅔ and the share count by 3/2.
 * Returns new shares per old share; null for a dividend-sized move (under 19%);
 * and "unknown" for a move of 19% or more that matches no ratio — the night
 * leaves that position alone and writes a `split_unknown` receipt, and a row in
 * the splits table (any tier; factor 1 for "news, not a split") settles it.
 */
export function splitMultiplier(factor: number, known: { date: string; factor: number }[]): number | null | "unknown" {
  if (known.length) return known.reduce((m, k) => m * k.factor, 1);
  if (!(factor > 0) || Math.abs(factor - 1) < 0.19) return null;   // under 19%: a dividend (0.19, not 0.2, so that a 5-for-4's ×0.8 is not lost to floating point)
  for (const [p, q] of RATIOS) {
    if (Math.abs(factor - q / p) / (q / p) < 0.02) return p / q;        // a forward p-for-q: prices × q/p, shares × p/q
    if (Math.abs(factor - p / q) / (p / q) < 0.02) return q / p;        // a reverse q-for-p: prices × p/q, shares × q/p
  }
  return "unknown";
}

export async function runStops(env: Env, runAt: string): Promise<StopsSummary> {
  const started = Date.now();
  const summary: StopsSummary = { phase: "stops", positions: 0, tracked: 0, hits: 0, realigned: 0, splits: 0, unknown: 0, errors: 0, ms: 0 };
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(runAt, symbol, outcome, rows, detail.slice(0, outcome === "run_summary" ? RECEIPT_SUMMARY_CHARS : RECEIPT_CHARS)).run();
    } catch { /* write limit — nothing left to do */ }
  };

  let open: OpenPosition[] = [];
  try {
    open = (await env.DB.prepare(
      "SELECT id, code, symbol, opened_on, entry_price, units, stop_gap, high_since, stop_level, stop_hit_on, realign_date, tracked_on FROM positions WHERE status = 'open' ORDER BY id",
    ).all<OpenPosition>()).results;
  } catch (err) {
    summary.errors++;
    await log(null, "stops_error", 0, `could not read the open positions: ${String((err as Error).message ?? err).slice(0, 200)}`);
    summary.ms = Date.now() - started;
    await log(null, "run_summary", 0, JSON.stringify(summary));
    return summary;
  }
  summary.positions = open.length;

  for (const p of open) {
    try {
      const latest = await env.DB.prepare("SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT 1").bind(p.symbol)
        .first<{ date: string; adj_close: number }>();
      if (!latest || !(latest.adj_close > 0)) { await log(p.symbol, "stops_skipped", 0, `${p.code}: no close stored for ${p.symbol}`); continue; }
      if (p.tracked_on && latest.date <= p.tracked_on) { summary.tracked++; continue; }   // nothing new since last night

      // Re-alignment: the stored close on the entry date is the reference, compared at cents (review F5).
      let entry = p.entry_price;
      let gap = p.stop_gap;
      let units = p.units;
      let realignDate = p.realign_date;
      const entryNow = await env.DB.prepare("SELECT adj_close FROM daily_prices WHERE symbol = ?1 AND date = ?2").bind(p.symbol, p.opened_on)
        .first<{ adj_close: number }>();
      if (entryNow && entryNow.adj_close > 0 && Math.abs(r2(entryNow.adj_close) - entry) >= 0.005) {
        const factor = entryNow.adj_close / entry;
        // A split after entry (review F6): from the table, or a round ratio for the core tier.
        const known = (await env.DB.prepare("SELECT date, factor FROM splits WHERE symbol = ?1 AND date > ?2 AND date <= ?3 ORDER BY date")
          .bind(p.symbol, realignDate ?? p.opened_on, latest.date).all<{ date: string; factor: number }>()).results;
        const mult = splitMultiplier(factor, known);
        if (mult === "unknown") {
          // Phase 3 review F2: a move the tracker cannot explain is left to a human, as the small tier's quarantine is —
          // the position is not re-aligned or tracked tonight; a splits row (a ratio, or factor 1 for news) clears it.
          summary.unknown++;
          await log(p.symbol, "split_unknown", 0, `${p.code}: the series on the entry date moved ×${factor.toFixed(6)} — not a dividend-sized move and not a ratio the tracker knows (N-for-1, 1-for-N, p-for-q with p, q ≤ 5). Position left untouched tonight. Add a splits row: the share multiplier for a split, or factor 1 for a cash event such as a special dividend (the entry re-aligns, the shares stay, the difference is cash); a bad bar in the provider's series is fixed in the data, not with a row. The next pass re-aligns it.`);
          continue;
        }
        if (mult !== null && mult !== 1) {
          // Whole shares only: a fraction left by a p-for-q ratio is cash in lieu, as a broker pays it — the
          // floored count times the new entry is the exposure, so the fraction's value lands in cash (F1's identity).
          const exact = units * mult;
          const newUnits = Math.floor(exact + 1e-9);
          const fraction = r2(exact - newUnits);
          summary.splits++;
          await log(p.symbol, "split_realigned", 1, `${p.code}: a ${ratioName(mult)} split after entry${known.length ? ` (the splits table: ${known.map((k) => `${k.factor} on ${k.date}`).join(", ")})` : " (a ratio in the provider's adjusted series)"}: ${units} shares → ${newUnits}${fraction > 0 ? ` (the ${fraction} of a share is cash in lieu)` : ""}, entry ${p.entry_price} → ${r2(entryNow.adj_close)}, stop gap ${p.stop_gap} → ${r2(gap * factor)}`);
          units = newUnits;
        }
        entry = r2(entryNow.adj_close);
        gap = r2(gap * factor);
        realignDate = latest.date;
        summary.realigned++;
        await log(p.symbol, "realigned", 1, `${p.code}: the series was re-aligned (×${factor.toFixed(6)}${mult === 1 && known.length ? `, settled by the splits table — factor 1 on ${known.map((k) => k.date).join(", ")}: a cash event, the shares stay` : mult !== null ? ", a split" : ""}); entry ${p.entry_price} → ${entry}, stop gap ${p.stop_gap} → ${gap}`);
      }

      // The closes since the last tracked night, oldest first (review N6), and the high before them.
      const sinceDate = p.tracked_on ?? p.opened_on;
      let closes = (await env.DB.prepare("SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 AND date > ?2 ORDER BY date ASC LIMIT ?3")
        .bind(p.symbol, sinceDate, CLOSES_PER_NIGHT).all<{ date: string; adj_close: number }>()).results.filter((c) => c.adj_close > 0);
      if (closes.length === 0) closes = [latest];
      const before = await env.DB.prepare("SELECT MAX(adj_close) AS high FROM daily_prices WHERE symbol = ?1 AND date >= ?2 AND date <= ?3")
        .bind(p.symbol, p.opened_on, sinceDate).first<{ high: number | null }>();
      let high = Math.max(before?.high ?? 0, entry);
      let hitOn = p.stop_hit_on;
      for (const c of closes) {
        const level = stopLevel(r2(high), gap);
        if (!hitOn && stopHit(c.adj_close, level)) {
          hitOn = c.date;
          summary.hits++;
          await log(p.symbol, "stop_hit", 0, `${p.code}: close ${c.adj_close} on ${c.date} is at or below the stop ${level} (high since entry ${r2(high)}, gap ${gap}) — the rule says close; the student's ticket does it`);
        }
        if (c.adj_close > high) high = c.adj_close;
      }
      const highR = r2(high);
      const level = stopLevel(highR, gap);
      const trackedOn = closes[closes.length - 1].date;
      // `exposure` is units × entry at all times (Phase 3 review F1): after a dividend re-alignment the entry falls by the
      // dividend, so the exposure falls with it and the ledger's cash rises by units × dividend — the paper account
      // receives the dividend as cash through the re-alignment, and value = capital + realised + open P&L − open costs holds
      // for the whole life of the position. A split leaves units × entry where it was.
      await env.DB.prepare(
        "UPDATE positions SET entry_price = ?2, stop_gap = ?3, high_since = ?4, stop_level = ?5, stop_hit_on = ?6, realign_date = ?7, tracked_on = ?8, units = ?9, exposure = ?10 WHERE id = ?1",
      ).bind(p.id, entry, gap, highR, level, hitOn, realignDate, trackedOn, units, r2(units * entry)).run();
      summary.tracked++;
    } catch (err) {
      summary.errors++;
      await log(p.symbol, "stops_error", 0, `${p.code}: ${String((err as Error).message ?? err).slice(0, 200)}`);
    }
  }

  summary.ms = Date.now() - started;
  await log(null, "run_summary", summary.tracked, JSON.stringify(summary));
  return summary;
}
