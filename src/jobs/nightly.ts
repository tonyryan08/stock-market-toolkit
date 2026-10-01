/**
 * Week 3: the nightly close.
 *
 * One run per night, after the US close. For each active ticker:
 *   - no history yet  → fetch the full ~5y (the first night IS the backfill)
 *   - history present → incremental fetch from (last stored date − 7 days)
 *   - Sundays         → full refetch, because dividend-adjusted history
 *                       rewrites the past every time a dividend is paid;
 *                       a weekly realign keeps old rows honest.
 *
 * Error handling is the verification record's M-shape map, executed:
 *   blocked (M-5/M-6)  → mark the ticker 'blocked'; never retried
 *   rate_limited (M-1) → stop the run; resume tomorrow
 *   auth_failed (M-2)  → abort the run; every symbol would fail the same way
 *   error              → log; retry next night
 *
 * Every outcome lands in fetch_log — the machine-written BUILD-LOG, and the
 * evidence behind the phase gate's "cron green three consecutive nights".
 */

import { fetchFmpDailyAdjusted, type DailyBar } from "../providers";

type Env = {
  ALPHAVANTAGE_API_KEY: string;
  FMP_API_KEY: string;
  DB: D1Database;
};

/** Free plan ≈ 250 calls/day; the cron never spends more than this. */
const MAX_CALLS_PER_RUN = 200;
/** Politeness gap between provider calls. */
const DELAY_MS = 250;
/** D1 batch chunk — comfortably inside statement limits. */
const CHUNK = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runNightly(env: Env): Promise<void> {
  const runAt = new Date().toISOString();
  const started = Date.now();
  const log = (
    symbol: string | null,
    outcome: string,
    rows: number,
    detail: string,
  ) =>
    env.DB.prepare(
      "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
    )
      .bind(runAt, symbol, outcome, rows, detail.slice(0, 300))
      .run();

  if (!env.FMP_API_KEY) {
    await log(null, "auth_failed", 0, "FMP_API_KEY not configured — nothing fetched.");
    return;
  }

  const tickers = (
    await env.DB.prepare(
      "SELECT symbol FROM tickers WHERE status = 'active' ORDER BY symbol",
    ).all<{ symbol: string }>()
  ).results;

  if (tickers.length === 0) {
    await log(null, "run_summary", 0, "No active tickers — seed the universe first (see shipment notes).");
    return;
  }

  const fullRefresh = new Date().getUTCDay() === 0; // Sunday: realign adjusted history
  let calls = 0;
  let totalRows = 0;
  const counts: Record<string, number> = {};

  for (const { symbol } of tickers) {
    if (calls >= MAX_CALLS_PER_RUN) {
      await log(null, "rate_limited", 0, `Budget cap ${MAX_CALLS_PER_RUN} reached — remainder resumes tomorrow.`);
      break;
    }

    let fromDate: string | undefined;
    if (!fullRefresh) {
      const last = await env.DB.prepare(
        "SELECT MAX(date) AS d FROM daily_prices WHERE symbol = ?1",
      )
        .bind(symbol)
        .first<{ d: string | null }>();
      if (last?.d) {
        const back = new Date(last.d);
        back.setUTCDate(back.getUTCDate() - 7);
        fromDate = back.toISOString().slice(0, 10);
      }
    }

    calls++;
    const result = await fetchFmpDailyAdjusted(symbol, env.FMP_API_KEY, fromDate);

    if (result.kind === "ok") {
      const written = await upsertBars(env.DB, symbol, result.bars);
      totalRows += written;
      counts.ok = (counts.ok ?? 0) + 1;
      await log(symbol, "ok", written, fromDate ? `incremental from ${fromDate}` : "full history");
    } else if (result.kind === "blocked") {
      counts.blocked = (counts.blocked ?? 0) + 1;
      await env.DB.prepare(
        "UPDATE tickers SET status = 'blocked', notes = ?2 WHERE symbol = ?1",
      )
        .bind(symbol, `Outside the free data plan (${result.detail.slice(0, 120)})`)
        .run();
      await log(symbol, "blocked", 0, result.detail);
    } else if (result.kind === "rate_limited") {
      counts.rate_limited = (counts.rate_limited ?? 0) + 1;
      await log(symbol, "rate_limited", 0, `${result.detail} — run stopped; resumes tomorrow.`);
      break;
    } else if (result.kind === "auth_failed") {
      counts.auth_failed = (counts.auth_failed ?? 0) + 1;
      await log(symbol, "auth_failed", 0, `${result.detail} — run aborted; check FMP_API_KEY.`);
      break;
    } else {
      counts.error = (counts.error ?? 0) + 1;
      await log(symbol, "error", 0, result.detail);
    }

    await sleep(DELAY_MS);
  }

  await log(
    null,
    "run_summary",
    totalRows,
    JSON.stringify({
      tickers: tickers.length,
      calls,
      outcomes: counts,
      fullRefresh,
      ms: Date.now() - started,
    }),
  );
}

async function upsertBars(db: D1Database, symbol: string, bars: DailyBar[]): Promise<number> {
  if (bars.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO daily_prices (symbol, date, adj_open, adj_high, adj_low, adj_close, volume)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (symbol, date) DO UPDATE SET
       adj_open = excluded.adj_open,
       adj_high = excluded.adj_high,
       adj_low  = excluded.adj_low,
       adj_close = excluded.adj_close,
       volume   = excluded.volume`,
  );
  let written = 0;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    await db.batch(
      chunk.map((b) =>
        stmt.bind(symbol, b.date, b.adjOpen, b.adjHigh, b.adjLow, b.adjClose, b.volume),
      ),
    );
    written += chunk.length;
  }
  return written;
}
