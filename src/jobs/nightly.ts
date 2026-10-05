/**
 * Week 3: the nightly close — v2, after the speeding ticket (2 Oct 2026).
 *
 * D1 meters every insert once for the table PLUS once per index, and the
 * free allowance is 100,000 metered rows written per day. Night one's
 * backfill (38,874 inserts × ~3 with the since-dropped redundant index)
 * breached it. This version budgets WRITES as carefully as it budgets
 * provider calls:
 *
 *   - no history yet   → full ~5y fetch (self-healing backfill)
 *   - history present  → incremental from (last stored date − 7 days)
 *   - ROLLING REALIGN  → each night, the REALIGN_PER_NIGHT symbols whose
 *     full history is stalest get a complete refetch (dividend adjustment
 *     rewrites the past, so old rows need periodic realignment — but a few
 *     symbols a night, never the whole universe in one go)
 *   - hard caps        → MAX_CALLS_PER_RUN provider calls and
 *     MAX_INSERTS_PER_RUN price-row inserts per night; the run stops
 *     cleanly at either and resumes tomorrow
 *   - write failures   → caught per symbol; three in a row is treated as
 *     the daily write limit and the run stops with that on the record
 *
 * Budget arithmetic (31-symbol universe, ~2 metered writes per insert):
 *   normal night ≈ 31 incrementals (~60 inserts) + 4 realigns (~5,016
 *   inserts) ≈ ~10k metered writes — a tenth of the allowance.
 */

import { fetchFmpDailyAdjusted, type DailyBar } from "../providers";

type Env = {
  ALPHAVANTAGE_API_KEY: string;
  FMP_API_KEY: string;
  DB: D1Database;
};

/** Free plan ≈ 250 provider calls/day; the cron never spends more than this. */
const MAX_CALLS_PER_RUN = 200;
/** Price-row inserts per run. ~2 metered writes each; cap ≈ 60k metered, well under 100k/day. */
const MAX_INSERTS_PER_RUN = 30000;
/** Symbols given a full-history realign each night. Universe realigns fully every ~⌈N/this⌉ nights. */
const REALIGN_PER_NIGHT = 4;
/** Consecutive D1 write failures treated as the daily write limit. */
const MAX_WRITE_FAILURES = 3;
const DELAY_MS = 250;
const CHUNK = 40;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runNightly(env: Env): Promise<void> {
  const runAt = new Date().toISOString();
  const started = Date.now();

  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare(
        "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind(runAt, symbol, outcome, rows, detail.slice(0, 300)).run();
    } catch {
      /* if even logging fails (write limit), there is nothing useful left to do */
    }
  };

  if (!env.FMP_API_KEY) {
    await log(null, "auth_failed", 0, "FMP_API_KEY not configured — nothing fetched.");
    return;
  }

  const tickers = (
    await env.DB.prepare(
      "SELECT symbol, last_full_fetch FROM tickers WHERE status = 'active' ORDER BY symbol",
    ).all<{ symbol: string; last_full_fetch: string | null }>()
  ).results;

  if (tickers.length === 0) {
    await log(null, "run_summary", 0, "No active tickers — seed the universe first.");
    return;
  }

  // Tonight's realign set: the symbols whose full history is stalest (never-fetched first).
  const realignSet = new Set(
    [...tickers]
      .sort((a, b) => (a.last_full_fetch ?? "").localeCompare(b.last_full_fetch ?? "") || a.symbol.localeCompare(b.symbol))
      .slice(0, REALIGN_PER_NIGHT)
      .map((t) => t.symbol),
  );

  let calls = 0;
  let inserted = 0;
  let writeFailures = 0;
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  for (const { symbol } of tickers) {
    if (calls >= MAX_CALLS_PER_RUN) {
      await log(null, "rate_limited", 0, `Call budget ${MAX_CALLS_PER_RUN} reached — remainder resumes tomorrow.`);
      break;
    }
    if (inserted >= MAX_INSERTS_PER_RUN) {
      await log(null, "write_budget", 0, `Insert budget ${MAX_INSERTS_PER_RUN} reached — remainder resumes tomorrow.`);
      break;
    }

    // Full fetch for the realign set; incremental otherwise. A symbol with
    // no stored rows falls through to full automatically (fromDate stays
    // undefined), so interrupted backfills heal themselves.
    let fromDate: string | undefined;
    let mode = "full";
    if (!realignSet.has(symbol)) {
      const last = await env.DB.prepare("SELECT MAX(date) AS d FROM daily_prices WHERE symbol = ?1")
        .bind(symbol).first<{ d: string | null }>();
      if (last?.d) {
        const back = new Date(last.d);
        back.setUTCDate(back.getUTCDate() - 7);
        fromDate = back.toISOString().slice(0, 10);
        mode = `incremental from ${fromDate}`;
      }
    }

    calls++;
    const result = await fetchFmpDailyAdjusted(symbol, env.FMP_API_KEY, fromDate);

    if (result.kind === "ok") {
      try {
        const written = await upsertBars(env.DB, symbol, result.bars);
        inserted += written;
        writeFailures = 0;
        bump("ok");
        await log(symbol, "ok", written, mode);
        if (!fromDate) {
          await env.DB.prepare("UPDATE tickers SET last_full_fetch = ?2 WHERE symbol = ?1")
            .bind(symbol, runAt).run();
        }
      } catch (err) {
        writeFailures++;
        bump("write_error");
        await log(symbol, "write_error", 0, String((err as Error).message ?? err).slice(0, 200));
        if (writeFailures >= MAX_WRITE_FAILURES) {
          await log(null, "write_limited", 0,
            `${MAX_WRITE_FAILURES} consecutive write failures — likely the daily D1 write allowance. Stopping; data resumes tomorrow after 00:00 UTC.`);
          break;
        }
      }
    } else if (result.kind === "blocked") {
      bump("blocked");
      await env.DB.prepare("UPDATE tickers SET status = 'blocked', notes = ?2 WHERE symbol = ?1")
        .bind(symbol, `Outside the free data plan (${result.detail.slice(0, 120)})`).run();
      await log(symbol, "blocked", 0, result.detail);
    } else if (result.kind === "rate_limited") {
      bump("rate_limited");
      await log(symbol, "rate_limited", 0, `${result.detail} — run stopped; resumes tomorrow.`);
      break;
    } else if (result.kind === "auth_failed") {
      bump("auth_failed");
      await log(symbol, "auth_failed", 0, `${result.detail} — run aborted; check FMP_API_KEY.`);
      break;
    } else {
      bump("error");
      await log(symbol, "error", 0, result.detail);
    }

    await sleep(DELAY_MS);
  }

  // Week 4: the fundamentals phase — skipped when the price phase hit an
  // auth failure, a provider limit, or the write wall (same cause, same cure).
  const phaseBlocked =
    (counts.auth_failed ?? 0) > 0 ||
    (counts.rate_limited ?? 0) > 0 ||
    writeFailures >= MAX_WRITE_FAILURES;
  const budget = { calls, maxCalls: MAX_CALLS_PER_RUN };
  if (!phaseBlocked) {
    await runFundamentals(env, runAt, budget);
    calls = budget.calls;
  }

  await log(null, "run_summary", inserted, JSON.stringify({
    tickers: tickers.length,
    calls,
    inserts: inserted,
    realigned: [...realignSet],
    fundamentals: phaseBlocked ? "skipped" : "ran",
    outcomes: counts,
    ms: Date.now() - started,
  }));
}

async function upsertBars(db: D1Database, symbol: string, bars: DailyBar[]): Promise<number> {
  if (bars.length === 0) return 0;
  const stmt = db.prepare(
    `INSERT INTO daily_prices (symbol, date, adj_open, adj_high, adj_low, adj_close, volume)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
     ON CONFLICT (symbol, date) DO UPDATE SET
       adj_open = excluded.adj_open, adj_high = excluded.adj_high,
       adj_low  = excluded.adj_low,  adj_close = excluded.adj_close,
       volume   = excluded.volume`,
  );
  let written = 0;
  for (let i = 0; i < bars.length; i += CHUNK) {
    const chunk = bars.slice(i, i + CHUNK);
    await db.batch(chunk.map((b) =>
      stmt.bind(symbol, b.date, b.adjOpen, b.adjHigh, b.adjLow, b.adjClose, b.volume),
    ));
    written += chunk.length;
  }
  return written;
}

// ---------------------------------------------------------------------------
// Week 4: the fundamentals phase. Accounts change quarterly, not nightly,
// so each run refreshes only the stalest few symbols (missing first), three
// provider calls each, inside the same call budget as the price phase.
// Initial fill of a 31-name universe completes in ~3 nights.
// ---------------------------------------------------------------------------

import {
  fetchFmpIncomeAnnual,
  fetchFmpBalanceAnnual,
  fetchFmpDividends,
  type IncomeYear,
  type BalanceYear,
} from "../providers";

const FUND_PER_NIGHT = 12;
const FUND_STALE_DAYS = 30;

type EnvF = {
  FMP_API_KEY: string;
  DB: D1Database;
};

export async function runFundamentals(
  env: EnvF,
  runAt: string,
  budget: { calls: number; maxCalls: number },
): Promise<void> {
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare(
        "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind(runAt, symbol, outcome, rows, detail.slice(0, 300)).run();
    } catch { /* write limit — nothing left to do */ }
  };

  const due = (
    await env.DB.prepare(
      `SELECT symbol FROM tickers
       WHERE status = 'active'
         AND (fundamentals_as_of IS NULL OR fundamentals_as_of < datetime('now', ?1))
       ORDER BY fundamentals_as_of IS NOT NULL, fundamentals_as_of, symbol
       LIMIT ?2`,
    ).bind(`-${FUND_STALE_DAYS} days`, FUND_PER_NIGHT).all<{ symbol: string }>()
  ).results;

  for (const { symbol } of due) {
    if (budget.calls + 3 > budget.maxCalls) {
      await log(null, "rate_limited", 0, "Call budget would be exceeded by fundamentals — resumes tomorrow.");
      return;
    }

    budget.calls += 3;
    const [inc, bal, div] = [
      await fetchFmpIncomeAnnual(symbol, env.FMP_API_KEY),
      await fetchFmpBalanceAnnual(symbol, env.FMP_API_KEY),
      await fetchFmpDividends(symbol, env.FMP_API_KEY),
    ];

    if (inc.kind === "auth_failed" || bal.kind === "auth_failed" || div.kind === "auth_failed") {
      await log(symbol, "auth_failed", 0, "fundamentals: key rejected — run aborted.");
      return;
    }
    if (inc.kind === "rate_limited" || bal.kind === "rate_limited" || div.kind === "rate_limited") {
      await log(symbol, "rate_limited", 0, "fundamentals: provider limit — resumes tomorrow.");
      return;
    }

    let rows = 0;
    const parts: string[] = [];

    // Merge income + balance by fiscal year.
    if (inc.kind === "ok") {
      const balByYear = new Map<string, BalanceYear>(
        bal.kind === "ok" ? bal.years.map((b) => [b.fiscalYear, b]) : [],
      );
      const stmt = env.DB.prepare(
        `INSERT INTO fundamentals_annual
           (symbol, fiscal_year, period_end, revenue, net_income, eps_diluted,
            current_assets, current_liabilities, total_assets, total_liabilities,
            long_term_debt, shareholders_equity, shares_diluted)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
         ON CONFLICT (symbol, fiscal_year) DO UPDATE SET
           period_end=excluded.period_end, revenue=excluded.revenue,
           net_income=excluded.net_income, eps_diluted=excluded.eps_diluted,
           current_assets=excluded.current_assets, current_liabilities=excluded.current_liabilities,
           total_assets=excluded.total_assets, total_liabilities=excluded.total_liabilities,
           long_term_debt=excluded.long_term_debt, shareholders_equity=excluded.shareholders_equity,
           shares_diluted=excluded.shares_diluted`,
      );
      try {
        await env.DB.batch(
          inc.years.map((y: IncomeYear) => {
            const b = balByYear.get(y.fiscalYear);
            return stmt.bind(
              symbol, y.fiscalYear, y.periodEnd, y.revenue, y.netIncome, y.epsDiluted,
              b?.currentAssets ?? null, b?.currentLiabilities ?? null,
              b?.totalAssets ?? null, b?.totalLiabilities ?? null,
              b?.longTermDebt ?? null, b?.equity ?? null, y.sharesDiluted,
            );
          }),
        );
        rows += inc.years.length;
        parts.push(`income ${inc.years.length}y${bal.kind === "ok" ? "+balance" : ""}`);
      } catch (err) {
        await log(symbol, "write_error", 0, String((err as Error).message ?? err).slice(0, 200));
        return; // likely the daily write allowance — stop the phase
      }
    } else {
      parts.push(`income ${inc.kind}`);
    }
    if (bal.kind !== "ok") parts.push(`balance ${bal.kind}`);

    if (div.kind === "ok" && div.rows.length > 0) {
      const dstmt = env.DB.prepare(
        `INSERT INTO dividends (symbol, ex_date, amount) VALUES (?1, ?2, ?3)
         ON CONFLICT (symbol, ex_date) DO UPDATE SET amount = excluded.amount`,
      );
      try {
        const recent = div.rows.slice(0, 60); // ~15 years of quarters — plenty
        for (let i = 0; i < recent.length; i += 40) {
          await env.DB.batch(recent.slice(i, i + 40).map((d) => dstmt.bind(symbol, d.exDate, d.amount)));
        }
        rows += Math.min(div.rows.length, 60);
        parts.push(`dividends ${Math.min(div.rows.length, 60)}`);
      } catch { parts.push("dividends write_error"); }
    } else if (div.kind !== "ok") {
      parts.push(`dividends ${div.kind}`);
    }

    const status =
      inc.kind === "ok" && bal.kind === "ok" && div.kind === "ok" ? "ok"
      : inc.kind === "ok" ? "partial"
      : "blocked";
    await env.DB.prepare(
      "UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3 WHERE symbol = ?1",
    ).bind(symbol, runAt, status).run();

    await log(symbol, `fund_${status}`, rows, parts.join(" · "));
    await new Promise((r) => setTimeout(r, 250));
  }
}
