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
 *
 * v3 — the second speeding ticket (12 Oct 2026). Workers Free allows
 * 50 external fetch() calls per invocation. One run was making 31 (prices)
 * + 36 (accounts) = 67: fetch 51 failed every night at the same company,
 * and the failure was mis-recorded as "blocked". Now:
 *   - TWO cron invocations: prices at 22:30 UTC, accounts at 22:50 UTC —
 *     each with its own 50-fetch budget
 *   - the job COUNTS its own fetches and stops cleanly at
 *     MAX_FETCHES_PER_INVOCATION, logging that it did, so the platform
 *     cap is never hit silently
 *   - a transient error can never mark a company "blocked"; only a
 *     genuine paywall response can. partial/error are retried next night
 *   - the price phase walks the universe stalest-first, so a stopped run
 *     resumes where it left off
 *
 * Assumption on the record (review N8, 23 Oct 2026): D1 binding calls are
 * taken NOT to count against the 50-subrequest cap. The receipts fit that —
 * 31 FMP fetches plus ~90 D1 operations a night, and the failure was at
 * fetch 51 — but it has not been verified from the platform's own meter.
 */

import { fetchFmpDailyAdjusted, type DailyBar } from "../providers";
import { runSmallCaps, type SmallEnv } from "./smallcaps";

type Env = SmallEnv & {
  FMP_API_KEY: string;
};

/** Free plan ≈ 250 provider calls/day; the cron never spends more than this. */
const MAX_CALLS_PER_RUN = 200;
/** Price-row inserts per INVOCATION, ~2 metered writes each. Two price
 *  invocations a night (v0.5.3) → ≤ 40k inserts ≈ 80k metered, under the
 *  100k/day allowance even on a night that backfills new symbols. */
const MAX_INSERTS_PER_RUN = 20000;
/** Symbols given a full-history realign each night. Universe realigns fully every ~⌈N/this⌉ nights. */
const REALIGN_PER_NIGHT = 4;
/** Consecutive D1 write failures treated as the daily write limit. */
const MAX_WRITE_FAILURES = 3;
/** Workers Free: 50 external fetches per invocation. Stop well short. */
const MAX_FETCHES_PER_INVOCATION = 45;
/** A price fetched this recently counts as "done tonight" for a later invocation. */
const FRESH_HOURS = 6;
const DELAY_MS = 250;
const CHUNK = 40;

export type Phase = "prices" | "fundamentals" | "smallcaps" | "all";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runNightly(env: Env, phase: Phase = "all"): Promise<void> {
  const runAt = new Date().toISOString();
  const started = Date.now();
  /** One fetch budget for the whole invocation, whichever phases run in it. */
  const budget = { fetches: 0, max: MAX_FETCHES_PER_INVOCATION, calls: 0, maxCalls: MAX_CALLS_PER_RUN };

  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare(
        "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind(runAt, symbol, outcome, rows, detail.slice(0, 300)).run();
    } catch {
      /* if even logging fails (write limit), there is nothing useful left to do */
    }
  };

  // The small-cap tier (decision 14): its own invocation at 23:10 UTC, its own
  // rations (Alpha Vantage 20 calls, spaced; EDGAR free), the shared fetch budget.
  if (phase === "smallcaps") {
    await runSmallCaps(env, runAt, budget);
    return;
  }

  if (!env.FMP_API_KEY) {
    await log(null, "auth_failed", 0, "FMP_API_KEY not configured — nothing fetched.");
    return;
  }

  if (phase === "fundamentals") {
    await runFundamentals(env, runAt, budget);
    await log(null, "run_summary", 0, JSON.stringify({ phase, fetches: budget.fetches, ms: Date.now() - started }));
    return;
  }

  // Stalest prices first, so a run stopped by any budget resumes where it
  // left off — and so a SECOND price invocation the same night (v0.5.3: the
  // universe may exceed one invocation's 45 fetches) carries on from where
  // the first stopped instead of repeating it: anything fetched within the
  // last FRESH_HOURS is "done tonight" and skipped.
  const all = (
    await env.DB.prepare(
      `SELECT t.symbol, t.last_full_fetch, t.last_price_fetch, MAX(p.date) AS last_date
       FROM tickers t LEFT JOIN daily_prices p ON p.symbol = t.symbol
       WHERE t.status = 'active' AND t.tier = 'core'
       GROUP BY t.symbol
       ORDER BY t.last_price_fetch IS NOT NULL, t.last_price_fetch, t.symbol`,
    ).all<{ symbol: string; last_full_fetch: string | null; last_price_fetch: string | null; last_date: string | null }>()
  ).results;

  if (all.length === 0) {
    await log(null, "run_summary", 0, "No active tickers — seed the universe first.");
    return;
  }

  const freshCutoff = Date.now() - FRESH_HOURS * 3600 * 1000;
  const tickers = all.filter((t) => !(t.last_price_fetch && Date.parse(t.last_price_fetch) > freshCutoff));
  const doneTonight = all.length - tickers.length;
  if (tickers.length === 0) {
    await log(null, "run_summary", 0, JSON.stringify({ phase, tickers: all.length, doneTonight, fetches: 0, note: "all prices already fetched tonight" }));
    return;
  }

  // Tonight's realign set: the symbols whose full history is stalest (never-fetched first).
  const realignSet = new Set(
    [...tickers]
      .sort((a, b) => (a.last_full_fetch ?? "").localeCompare(b.last_full_fetch ?? "") || a.symbol.localeCompare(b.symbol))
      .slice(0, REALIGN_PER_NIGHT)
      .map((t) => t.symbol),
  );

  let inserted = 0;
  let writeFailures = 0;
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);

  for (const { symbol, last_date } of tickers) {
    if (budget.fetches >= budget.max) {
      await log(null, "fetch_budget", 0, `Fetch budget ${budget.max} per invocation reached — remainder resumes tomorrow (stalest first).`);
      break;
    }
    if (budget.calls >= budget.maxCalls) {
      await log(null, "rate_limited", 0, `Call budget ${budget.maxCalls} reached — remainder resumes tomorrow.`);
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
    if (!realignSet.has(symbol) && last_date) {
      const back = new Date(last_date);
      back.setUTCDate(back.getUTCDate() - 7);
      fromDate = back.toISOString().slice(0, 10);
      mode = `incremental from ${fromDate}`;
    }

    budget.calls++;
    budget.fetches++;
    const result = await fetchFmpDailyAdjusted(symbol, env.FMP_API_KEY, fromDate);

    if (result.kind === "ok") {
      try {
        const written = await upsertBars(env.DB, symbol, result.bars);
        inserted += written;
        writeFailures = 0;
        bump("ok");
        await log(symbol, "ok", written, mode);
        await env.DB.prepare(
          fromDate
            ? "UPDATE tickers SET last_price_fetch = ?2 WHERE symbol = ?1"
            : "UPDATE tickers SET last_price_fetch = ?2, last_full_fetch = ?2 WHERE symbol = ?1",
        ).bind(symbol, runAt).run();
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
  // "all" (local testing only): run the accounts phase in the same invocation,
  // unless the price phase hit a wall. In production the two phases are
  // separate cron invocations, each with its own fetch budget.
  const phaseBlocked =
    (counts.auth_failed ?? 0) > 0 ||
    (counts.rate_limited ?? 0) > 0 ||
    writeFailures >= MAX_WRITE_FAILURES;
  let fundamentals = "separate invocation";
  let smallcaps = "separate invocation";
  if (phase === "all") {
    fundamentals = phaseBlocked ? "skipped" : "ran";
    if (!phaseBlocked) await runFundamentals(env, runAt, budget);
    // Local doorbell only: the small-cap visit too (slow — Alpha Vantage calls
    // are 13 s apart). Ring ?cron=10+23+*+*+* to run just this phase.
    smallcaps = "ran";
    await runSmallCaps(env, runAt, budget);
  }

  await log(null, "run_summary", inserted, JSON.stringify({
    phase,
    tickers: all.length,
    doneTonight,
    fetches: budget.fetches,
    inserts: inserted,
    realigned: [...realignSet],
    fundamentals,
    smallcaps,
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
// provider calls each. From v3 it runs in its OWN cron invocation (22:50 UTC)
// with its own 50-fetch budget: 12 symbols × 3 = 36 fetches. partial/error
// results are retried the next night; only a genuine paywall is "blocked".
// Initial fill of a 31-name universe completes in ~3 nights.
// ---------------------------------------------------------------------------

import {
  fetchFmpIncomeAnnual,
  fetchFmpBalanceAnnual,
  fetchFmpDividends,
  type IncomeYear,
  type BalanceYear,
} from "../providers";

/** 15 × 3 calls = 45 fetches: the whole accounts invocation's budget. */
const FUND_PER_NIGHT = 15;
const FUND_STALE_DAYS = 30;

type EnvF = {
  FMP_API_KEY: string;
  DB: D1Database;
};

export async function runFundamentals(
  env: EnvF,
  runAt: string,
  budget: { fetches: number; max: number; calls: number; maxCalls: number },
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
       WHERE status = 'active' AND tier = 'core'
         AND (fundamentals_as_of IS NULL
              OR fundamentals_status IN ('partial', 'error')
              OR fundamentals_as_of < datetime('now', ?1))
       ORDER BY fundamentals_as_of IS NOT NULL, fundamentals_as_of, symbol
       LIMIT ?2`,
    ).bind(`-${FUND_STALE_DAYS} days`, FUND_PER_NIGHT).all<{ symbol: string }>()
  ).results;

  for (const { symbol } of due) {
    if (budget.fetches + 3 > budget.max) {
      await log(null, "fetch_budget", 0, `Fetch budget ${budget.max} per invocation would be exceeded — resumes tomorrow.`);
      return;
    }
    if (budget.calls + 3 > budget.maxCalls) {
      await log(null, "rate_limited", 0, "Call budget would be exceeded by fundamentals — resumes tomorrow.");
      return;
    }

    budget.calls += 3;
    budget.fetches += 3;
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
            long_term_debt, shareholders_equity, shares_diluted, goodwill_and_intangibles, source, eps_source)
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,'fmp','fmp')
         ON CONFLICT (symbol, fiscal_year) DO UPDATE SET
           period_end=excluded.period_end, revenue=excluded.revenue,
           net_income=excluded.net_income, eps_diluted=excluded.eps_diluted,
           current_assets=excluded.current_assets, current_liabilities=excluded.current_liabilities,
           total_assets=excluded.total_assets, total_liabilities=excluded.total_liabilities,
           long_term_debt=excluded.long_term_debt, shareholders_equity=excluded.shareholders_equity,
           shares_diluted=excluded.shares_diluted,
           goodwill_and_intangibles=excluded.goodwill_and_intangibles,
           source=excluded.source, eps_source=excluded.eps_source`,
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
              b?.goodwillAndIntangibles ?? null,
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
      parts.push(`income ${inc.kind}: ${inc.detail.slice(0, 80)}`);
    }
    if (bal.kind !== "ok") parts.push(`balance ${bal.kind}${"detail" in bal ? ": " + bal.detail.slice(0, 60) : ""}`);

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
      parts.push(`dividends ${div.kind}${"detail" in div ? ": " + div.detail.slice(0, 60) : ""}`);
    }

    // Only a genuine paywall response on the income statement is "blocked".
    // Anything transient (network, 5xx, cap) is "error" and retried tomorrow.
    const status =
      inc.kind === "ok" && bal.kind === "ok" && div.kind === "ok" ? "ok"
      : inc.kind === "ok" ? "partial"
      : inc.kind === "blocked" ? "blocked"
      : "error";
    await env.DB.prepare(
      "UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3 WHERE symbol = ?1",
    ).bind(symbol, runAt, status).run();

    await log(symbol, `fund_${status}`, rows, parts.join(" · "));
    await new Promise((r) => setTimeout(r, 250));
  }
}
