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
import { parseJumpReceipt } from "../lib/adjust";

/** A receipt's detail is cut at this many characters; a run_summary carries JSON and gets more
 *  (with the ration fields the small-cap summary passes 300 and would be cut mid-JSON — OI-53). */
const RECEIPT_CHARS = 300;
const RECEIPT_SUMMARY_CHARS = 1500;

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
  /** Week 9: small-tier rows written with a quarantine reason (an unexplained jump, OI-08). */
  quarantined: number;
  ms: number;
};

export async function runSignals(env: SignalsEnv, runAt: string): Promise<SignalsRunSummary> {
  const started = Date.now();
  const summary: SignalsRunSummary = { phase: "signals", instruments: 0, written: 0, warming: 0, skipped: 0, errors: 0, long: 0, flat: 0, quarantined: 0, ms: 0 };
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(runAt, symbol, outcome, rows, detail.slice(0, outcome === "run_summary" ? RECEIPT_SUMMARY_CHARS : RECEIPT_CHARS)).run();
    } catch { /* logging is a convenience */ }
  };

  let tickers: { symbol: string; tier?: string | null }[] = [];
  try {
    tickers = (await env.DB.prepare("SELECT symbol, tier FROM tickers WHERE status = 'active' ORDER BY symbol").all<{ symbol: string; tier?: string | null }>()).results;
  } catch (err) {
    await log(null, "signals_error", 0, `could not read the universe: ${String((err as Error).message ?? err).slice(0, 200)}`);
    summary.ms = Date.now() - started;
    await log(null, "run_summary", 0, JSON.stringify(summary));
    return summary;
  }
  summary.instruments = tickers.length;
  const stmt = env.DB.prepare(
    `INSERT INTO signals (symbol, date, close, ewma_fast, ewma_slow, sigma_px, sigma_pct, instrument_risk, forecast, state, state_since, days, computed_at, quarantined)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
     ON CONFLICT (symbol, date) DO UPDATE SET
       close = excluded.close, ewma_fast = excluded.ewma_fast, ewma_slow = excluded.ewma_slow,
       sigma_px = excluded.sigma_px, sigma_pct = excluded.sigma_pct, instrument_risk = excluded.instrument_risk,
       forecast = excluded.forecast, state = excluded.state, state_since = excluded.state_since,
       days = excluded.days, computed_at = excluded.computed_at, quarantined = excluded.quarantined`,
  );
  // One read of the av_jump receipts for the whole pass (review F3 of v0.11.0: a read per small-tier
  // symbol was a full scan of fetch_log each, ~48 a night and growing). If the read fails, each small
  // symbol falls back to its own read — the quarantine is never silently skipped.
  let jumpReceipts: JumpReceipts | null = null;
  if (tickers.some((t) => t.tier && t.tier !== "core")) {
    try {
      jumpReceipts = await loadJumpReceipts(env.DB);
    } catch (err) {
      await log(null, "signals_error", 0, `the av_jump receipts could not be read in one pass (${String((err as Error).message ?? err).slice(0, 120)}) — reading per symbol`);
    }
  }
  const binds: D1PreparedStatement[] = [];
  for (const { symbol, tier } of tickers) {
    try {
      const rows = (await env.DB.prepare("SELECT date, adj_close AS close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT ?2")
        .bind(symbol, LOOKBACK).all<{ date: string; close: number }>()).results;
      if (rows.length < RULE.minDays) { summary.skipped++; continue; }
      const s = computeSignals(rows);
      const p = s.latest;
      if (!p) { summary.skipped++; await log(symbol, "signals_skipped", 0, `${rows.length} rows stored, none with a usable close`); continue; }
      // Week 9 (decision 20, OI-08): a small-tier series with a jump the toolkit cannot explain is quarantined —
      // its row is written (informational) and the ticket route refuses it until a splits row explains the jump.
      const quarantined = tier && tier !== "core" ? await quarantineReason(env.DB, symbol, jumpReceipts ? jumpReceipts.get(symbol) ?? [] : undefined) : null;
      if (quarantined) summary.quarantined++;
      binds.push(stmt.bind(symbol, p.date, p.close, p.fast, p.slow, p.sigmaPx, p.sigmaPct, p.instrumentRisk, p.forecast, p.state, s.stateSince, s.days, runAt, quarantined));
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

/** Days between two ISO dates, absolute. */
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** symbol → the newest three av_jump receipt texts. */
export type JumpReceipts = Map<string, string[]>;

/** The newest av_jump receipts, three per symbol, in one read (review F3). `limit` bounds the scan's result, never the table. */
export async function loadJumpReceipts(db: D1Database, limit = 1000): Promise<JumpReceipts> {
  const rows = (await db.prepare("SELECT symbol, detail FROM fetch_log WHERE outcome = 'av_jump' AND symbol IS NOT NULL ORDER BY id DESC LIMIT ?1").bind(limit).all<{ symbol: string; detail: string | null }>()).results;
  const out: JumpReceipts = new Map();
  for (const r of rows) {
    const list = out.get(r.symbol) ?? [];
    if (list.length < 3) { list.push(String(r.detail ?? "")); out.set(r.symbol, list); }
  }
  return out;
}

/**
 * The quarantine reason for a small-tier symbol, or null (decision 20, OI-08). An av_jump receipt
 * names the dates on which the adjusted close jumped ×0.4–×2.5 day to day; each must be explained
 * by a splits row within four days of it (a split, or factor 1 with a note when the jump was news).
 * The three newest receipts are read — one per visit that saw the jump; the same date repeats.
 * `receipts` is the symbol's share of one pass-wide read (`loadJumpReceipts`); without it the
 * symbol's receipts are read here. The text is parsed by `parseJumpReceipt`, the formatter's twin
 * (review F1: every jump named in the receipt is checked, not only the first).
 */
export async function quarantineReason(db: D1Database, symbol: string, receipts?: string[]): Promise<string | null> {
  const details = receipts ?? (await db.prepare("SELECT detail FROM fetch_log WHERE symbol = ?1 AND outcome = 'av_jump' ORDER BY id DESC LIMIT 3").bind(symbol).all<{ detail: string }>()).results.map((r) => String(r.detail ?? ""));
  if (!details.length) return null;
  const jumps = new Map<string, string>();   // date → ratio text
  for (const d of details) for (const j of parseJumpReceipt(d)) jumps.set(j.date, j.ratio);
  if (!jumps.size) return null;
  const splits = (await db.prepare("SELECT date, factor FROM splits WHERE symbol = ?1").bind(symbol).all<{ date: string; factor: number }>()).results;
  const unexplained = [...jumps.entries()].filter(([date]) => !splits.some((sp) => daysApart(sp.date, date) <= 4)).sort();
  if (!unexplained.length) return null;
  return `the adjusted close moved ${unexplained.map(([d, r]) => `×${r} on ${d}`).join(", ")} with no splits row to explain it.`;
}
