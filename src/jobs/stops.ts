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
  errors: number;
  ms: number;
};

const RECEIPT_CHARS = 300;
const RECEIPT_SUMMARY_CHARS = 1500;
/** How many closes one night may bring for one position (a failed-night catch-up is two or three). */
const CLOSES_PER_NIGHT = 400;
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Is a re-alignment factor a split? Known splits come from the table; the core
 * tier's provider series is split-adjusted without a row, so a round ratio
 * (½, ⅓, ¼ … for a forward split; 2, 3, 4 … for a reverse) within 2% counts.
 * Returns new shares per old share, or null for a dividend-sized move.
 */
export function splitMultiplier(factor: number, known: { date: string; factor: number }[]): number | null {
  if (known.length) return known.reduce((m, k) => m * k.factor, 1);
  if (!(factor > 0) || Math.abs(factor - 1) < 0.2) return null;
  if (factor < 1) {
    const n = Math.round(1 / factor);
    return n >= 2 && Math.abs(1 / factor - n) / n < 0.02 ? n : null;
  }
  const m = Math.round(factor);
  return m >= 2 && Math.abs(factor - m) / m < 0.02 ? 1 / m : null;
}

export async function runStops(env: Env, runAt: string): Promise<StopsSummary> {
  const started = Date.now();
  const summary: StopsSummary = { phase: "stops", positions: 0, tracked: 0, hits: 0, realigned: 0, splits: 0, errors: 0, ms: 0 };
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
        if (mult !== null) {
          const newUnits = Math.round(units * mult);
          const fractional = Math.abs(units * mult - newUnits) > 1e-9;
          summary.splits++;
          await log(p.symbol, "split_realigned", 1, `${p.code}: a ${mult >= 1 ? `${mult}-for-1` : `1-for-${Math.round(1 / mult)}`} split after entry${known.length ? ` (the splits table: ${known.map((k) => `${k.factor} on ${k.date}`).join(", ")})` : " (a round ratio in the provider's adjusted series)"}: ${units} shares → ${newUnits}${fractional ? " (a fractional share rounded — check the position)" : ""}, entry ${p.entry_price} → ${r2(entryNow.adj_close)}, stop gap ${p.stop_gap} → ${r2(gap * factor)}`);
          units = newUnits;
        }
        entry = r2(entryNow.adj_close);
        gap = r2(gap * factor);
        realignDate = latest.date;
        summary.realigned++;
        await log(p.symbol, "realigned", 1, `${p.code}: the series was re-aligned (×${factor.toFixed(6)}${mult !== null ? ", a split" : ""}); entry ${p.entry_price} → ${entry}, stop gap ${p.stop_gap} → ${gap}`);
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
      await env.DB.prepare(
        "UPDATE positions SET entry_price = ?2, stop_gap = ?3, high_since = ?4, stop_level = ?5, stop_hit_on = ?6, realign_date = ?7, tracked_on = ?8, units = ?9 WHERE id = ?1",
      ).bind(p.id, entry, gap, highR, level, hitOn, realignDate, trackedOn, units).run();
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
