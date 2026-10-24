/**
 * Week 7: the nightly signal pass. D1 only — no provider calls, no ration.
 *
 * For every active instrument with enough closes, read its stored closes
 * (up to HISTORY_LIMIT closes, the same window the API reads — the whole
 * five-year store; the state's start date is exact when the state began
 * inside the window less the 128-close warm-up, which for a 16/64 crossover
 * is always, and the flip count is the count inside that window — review
 * N1), run Carver's rule (src/lib/signals.ts) and write one row for the
 * newest close. The page and the API serve these rows; the
 * per-instrument history is computed on request.
 *
 * Every instrument is on its own (v0.9.0 review F1): a bad series or a D1
 * error on one SELECT is a receipt for that symbol, never a lost night —
 * and the caller (nightly.ts) wraps the whole pass so the accounts phase
 * runs whatever happens here.
 *
 * Budgets: ~40 small SELECTs and ~40 single-row writes a night (≈ 80
 * metered writes); the rule itself is a few hundred thousand multiply-adds,
 * measured at 10–35 ms in V8 for 40 instruments — which is why the pass has
 * its own cron invocation (0 23 UTC) and is not on the request path (the
 * week-7 Cloudflare lesson: precompute, then serve).
 */

import { computeSignals, HISTORY_LIMIT, RULE } from "../lib/signals";

export type SignalsEnv = { DB: D1Database };

/** Closes read per instrument — one window for the job and the API (review N1). */
export const LOOKBACK = HISTORY_LIMIT;

export type SignalsRunSummary = {
  phase: "signals";
  instruments: number;
  written: number;
  warming: number;
  skipped: number;      // fewer than RULE.minDays stored rows, or no usable close
  errors: number;       // a SELECT or the rule threw for this instrument (receipt written)
  long: number;
  flat: number;
  ms: number;
};

export async function runSignals(env: SignalsEnv, runAt: string): Promise<SignalsRunSummary> {
  const started = Date.now();
  const summary: SignalsRunSummary = { phase: "signals", instruments: 0, written: 0, warming: 0, skipped: 0, errors: 0, long: 0, flat: 0, ms: 0 };
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(runAt, symbol, outcome, rows, detail.slice(0, 300)).run();
    } catch { /* logging is a convenience */ }
  };

  let tickers: { symbol: string }[] = [];
  try {
    tickers = (await env.DB.prepare("SELECT symbol FROM tickers WHERE status = 'active' ORDER BY symbol").all<{ symbol: string }>()).results;
  } catch (err) {
    await log(null, "signals_error", 0, `could not read the universe: ${String((err as Error).message ?? err).slice(0, 200)}`);
    summary.ms = Date.now() - started;
    await log(null, "run_summary", 0, JSON.stringify(summary));
    return summary;
  }
  summary.instruments = tickers.length;
  const stmt = env.DB.prepare(
    `INSERT INTO signals (symbol, date, close, ewma_fast, ewma_slow, sigma_px, sigma_pct, instrument_risk, forecast, state, state_since, days, computed_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
     ON CONFLICT (symbol, date) DO UPDATE SET
       close = excluded.close, ewma_fast = excluded.ewma_fast, ewma_slow = excluded.ewma_slow,
       sigma_px = excluded.sigma_px, sigma_pct = excluded.sigma_pct, instrument_risk = excluded.instrument_risk,
       forecast = excluded.forecast, state = excluded.state, state_since = excluded.state_since,
       days = excluded.days, computed_at = excluded.computed_at`,
  );
  const binds: D1PreparedStatement[] = [];
  for (const { symbol } of tickers) {
    try {
      const rows = (await env.DB.prepare("SELECT date, adj_close AS close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT ?2")
        .bind(symbol, LOOKBACK).all<{ date: string; close: number }>()).results;
      if (rows.length < RULE.minDays) { summary.skipped++; continue; }
      const s = computeSignals(rows);
      const p = s.latest;
      if (!p) { summary.skipped++; await log(symbol, "signals_skipped", 0, `${rows.length} rows stored, none with a usable close`); continue; }
      binds.push(stmt.bind(symbol, p.date, p.close, p.fast, p.slow, p.sigmaPx, p.sigmaPct, p.instrumentRisk, p.forecast, p.state, s.stateSince, s.days, runAt));
      if (p.state === "warming") summary.warming++;
      else if (p.state === "long") summary.long++;
      else summary.flat++;
    } catch (err) {
      summary.errors++;
      await log(symbol, "signals_error", 0, String((err as Error).message ?? err).slice(0, 200));
    }
  }
  try {
    for (let i = 0; i < binds.length; i += 40) await env.DB.batch(binds.slice(i, i + 40));
    summary.written = binds.length;
  } catch (err) {
    await log(null, "write_error", 0, `signals: ${String((err as Error).message ?? err).slice(0, 200)}`);
  }
  summary.ms = Date.now() - started;
  await log(null, "run_summary", summary.written, JSON.stringify(summary));
  return summary;
}
