/**
 * The small-cap tier's nightly visit (decision 14, 19 Oct 2026) — its own
 * cron invocation (23:10 UTC) with its own two rations:
 *
 *   Alpha Vantage   25 calls a day, 5 a minute, ONE key for the project.
 *                   The job spends at most AV_CALLS_PER_NIGHT (20 — the rest
 *                   is the tutor's for probes), 13 seconds apart.
 *   Workers Free    50 outside fetches per invocation (the second speeding
 *                   ticket) — the shared fetch budget counts EDGAR calls too.
 *
 * One VISIT per company, stalest first: the compact daily series (1 call),
 * and, when its accounts are missing or a year old, the dividend record,
 * income statement and balance sheet (3 more) plus EDGAR for EPS and the
 * cross-check (3–5 free calls). A company is screenable the night it is
 * visited. Arithmetic for 52 names: ~5 visits with accounts a night → the
 * whole tier has books in ~11 nights; after that ~20 price refreshes a
 * night → every company every 2–3 nights, inside the 100-day window.
 *
 * Prices are stored AS TRADED (close) and ADJUSTED (adj_close) — lib/adjust.ts
 * does the arithmetic from the dividend record, and re-does it for the whole
 * stored series when a new ex-date arrives.
 */

import { fetchAvDailyCompact, fetchAvDividends, fetchAvIncomeAnnual, fetchAvBalanceAnnual, type AvResult, type AvBalanceYear } from "../providers-av";
import { edgarEpsForPeriods } from "../providers-edgar";
import { adjustBars, adjustmentFactors, suspiciousJumps } from "../lib/adjust";

export type SmallEnv = {
  ALPHAVANTAGE_API_KEY: string;
  EDGAR_USER_AGENT?: string;
  /** Test hooks only (stub servers in the sandbox). */
  ALPHAVANTAGE_API_URL?: string;
  EDGAR_API_URL?: string;
  SMALLCAP_AV_CALLS?: string;
  /** Test hook only: shorten the 13-second spacing against a stub server. */
  SMALLCAP_AV_SPACING_MS?: string;
  DB: D1Database;
};

export const AV_CALLS_PER_NIGHT = 20;
/** 5 a minute → 12 s; 13 keeps a margin. */
export const AV_SPACING_MS = 13_000;
/** Accounts are refreshed when older than this (annual reports: once a year is the truth). */
export const ACCOUNTS_REFRESH_DAYS = 400;
const FRESH_HOURS = 6;
const CHUNK = 40;

export type SmallTicker = {
  symbol: string;
  cik: string | null;
  last_price_fetch: string | null;
  fundamentals_as_of: string | null;
  fundamentals_status: string | null;
};

export type Visit = { symbol: string; accounts: boolean; cost: number };

/** Pure: which companies tonight, and whether each gets its accounts. Tested on its own. */
export function planNight(tickers: SmallTicker[], avCalls: number, now: Date): { visits: Visit[]; avCalls: number; skippedFresh: number; skippedBlocked: number } {
  const fresh = now.getTime() - FRESH_HOURS * 3600 * 1000;
  const stale = new Date(now.getTime() - ACCOUNTS_REFRESH_DAYS * 86_400_000).toISOString();
  const order = [...tickers].sort((a, b) => {
    const ap = a.last_price_fetch ?? "";
    const bp = b.last_price_fetch ?? "";
    return ap.localeCompare(bp) || a.symbol.localeCompare(b.symbol); // "" (never fetched) sorts first
  });
  const visits: Visit[] = [];
  let remaining = Math.max(0, avCalls);
  let skippedFresh = 0;
  let skippedBlocked = 0;
  for (const t of order) {
    if (remaining <= 0) break;
    if (t.last_price_fetch && Date.parse(t.last_price_fetch) > fresh) { skippedFresh++; continue; }
    // Alpha Vantage had no statements for it: not screenable, so not worth a
    // nightly price call either. Reset fundamentals_status to NULL to retry.
    if (t.fundamentals_status === "blocked") { skippedBlocked++; continue; }
    const accounts =
      !t.fundamentals_as_of ||
      t.fundamentals_status === "partial" || t.fundamentals_status === "error" ||
      t.fundamentals_as_of < stale;
    const cost = 1 + (accounts ? 3 : 0);
    if (cost > remaining) continue;
    visits.push({ symbol: t.symbol, accounts, cost });
    remaining -= cost;
  }
  return { visits, avCalls: Math.max(0, avCalls) - remaining, skippedFresh, skippedBlocked };
}

type Budget = { fetches: number; max: number };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runSmallCaps(env: SmallEnv, runAt: string, budget: Budget, opts: { spacingMs?: number } = {}): Promise<void> {
  const started = Date.now();
  const spacing = opts.spacingMs ?? (parseInt(env.SMALLCAP_AV_SPACING_MS ?? "", 10) || AV_SPACING_MS);
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare(
        "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind(runAt, symbol, outcome, rows, detail.slice(0, 300)).run();
    } catch { /* write limit — nothing left to do */ }
  };

  const tickers = (
    await env.DB.prepare(
      `SELECT symbol, cik, last_price_fetch, fundamentals_as_of, fundamentals_status
       FROM tickers WHERE status = 'active' AND tier = 'small'`,
    ).all<SmallTicker>()
  ).results;
  if (tickers.length === 0) {
    await log(null, "run_summary", 0, JSON.stringify({ phase: "smallcaps", tickers: 0, note: "no small-cap tier seeded — npm run seed-small-caps" }));
    return;
  }
  if (!env.ALPHAVANTAGE_API_KEY) {
    await log(null, "auth_failed", 0, "ALPHAVANTAGE_API_KEY not configured — small-cap tier not fetched.");
    return;
  }

  const avPerNight = Math.max(0, parseInt(env.SMALLCAP_AV_CALLS ?? "", 10) || AV_CALLS_PER_NIGHT);
  const plan = planNight(tickers, avPerNight, new Date());
  const avOpts = { apiUrl: env.ALPHAVANTAGE_API_URL || undefined };
  const edgarOpts = { apiUrl: env.EDGAR_API_URL || undefined };
  const counts: Record<string, number> = {};
  const bump = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  let avCalls = 0;
  let edgarCalls = 0;
  let inserted = 0;
  let stop = null as string | null; // (cast: TS narrows a `let x: T | null = null` to null and ignores closure assignments)

  /** One Alpha Vantage call, spaced, counted against both rations. */
  const av = async <T>(call: () => Promise<AvResult<T>>): Promise<AvResult<T>> => {
    if (avCalls > 0) await sleep(spacing);
    avCalls++;
    budget.fetches++;
    return call();
  };

  for (const visit of plan.visits) {
    if (stop) break;
    const t = tickers.find((x) => x.symbol === visit.symbol)!;
    const sym = t.symbol;
    // EDGAR: usually 3 calls (EPS tag, net income tag, shares), 6 at worst
    // when tags drift; 5 is the planning figure, and the hard platform limit
    // of 50 stays out of reach either way (45 − 5 visits × 9 = 0, +1 spare each).
    const needFetches = visit.cost + (visit.accounts && t.cik && env.EDGAR_USER_AGENT ? 5 : 0);
    if (budget.fetches + needFetches > budget.max) {
      await log(null, "fetch_budget", 0, `Fetch budget ${budget.max} per invocation would be exceeded at ${sym} — resumes tomorrow.`);
      break;
    }

    // Every stop condition in one place: a daily/minute limit or a paywall
    // ends the run (nothing is marked); "not served" marks the symbol.
    const halts = (r: AvResult<unknown>, what: string): boolean => {
      if (r.kind === "rate_limited") { stop = `rate_limited at ${sym} (${what})`; bump("rate_limited"); return true; }
      if (r.kind === "premium") { stop = `premium at ${sym} (${what})`; bump("premium"); return true; }
      if (r.kind === "auth_failed") { stop = `auth_failed at ${sym} (${what})`; bump("auth_failed"); return true; }
      return false;
    };

    // 1) prices: one call decides whether Alpha Vantage knows the symbol at all
    const px = await av(() => fetchAvDailyCompact(sym, env.ALPHAVANTAGE_API_KEY, avOpts));
    if (halts(px, "prices")) { await log(sym, "rate_limited", 0, `${px.kind === "ok" ? "" : px.detail} — run stopped; resumes tomorrow.`); break; }
    if (px.kind === "not_served") {
      bump("blocked");
      await env.DB.prepare("UPDATE tickers SET status = 'blocked', notes = ?2 WHERE symbol = ?1")
        .bind(sym, `Alpha Vantage has no daily series for this symbol (${px.detail.slice(0, 120)})`).run();
      await log(sym, "blocked", 0, px.detail);
      continue;
    }

    // 2) dividends next when accounts are due, so tonight's adjustment uses the fresh record
    let newExDates = 0;
    let divOutcome = "not due";
    if (visit.accounts) {
      const div = await av(() => fetchAvDividends(sym, env.ALPHAVANTAGE_API_KEY, avOpts));
      if (halts(div, "dividends")) { await log(sym, "rate_limited", 0, `${div.kind === "ok" ? "" : div.detail} — run stopped; resumes tomorrow.`); break; }
      if (div.kind === "ok") {
        const before = await env.DB.prepare("SELECT MAX(ex_date) AS d, COUNT(*) AS n FROM dividends WHERE symbol = ?1").bind(sym).first<{ d: string | null; n: number }>();
        const recent = div.data.slice(0, 80); // ~20 years of quarters
        try {
          const stmt = env.DB.prepare("INSERT INTO dividends (symbol, ex_date, amount) VALUES (?1, ?2, ?3) ON CONFLICT (symbol, ex_date) DO UPDATE SET amount = excluded.amount");
          for (let i = 0; i < recent.length; i += CHUNK) {
            await env.DB.batch(recent.slice(i, i + CHUNK).map((d) => stmt.bind(sym, d.exDate, d.amount)));
          }
          newExDates = recent.filter((d) => !before?.d || d.exDate > before.d).length;
          if (!before?.n) newExDates = recent.length;
          divOutcome = `dividends ${recent.length}${newExDates ? ` (+${newExDates} new)` : ""}`;
        } catch (err) {
          divOutcome = `dividends write_error ${String((err as Error).message ?? err).slice(0, 60)}`;
        }
      } else {
        divOutcome = `dividends ${div.kind}: ${div.detail.slice(0, 80)}`;
      }
    }

    // 3) write the series, adjusted with every dividend we hold
    if (px.kind !== "ok") {
      bump("error");
      await log(sym, "error", 0, px.detail);
    } else {
      const divs = (await env.DB.prepare("SELECT ex_date, amount FROM dividends WHERE symbol = ?1").bind(sym).all<{ ex_date: string; amount: number | null }>()).results;
      const bars = adjustBars(px.data, divs.map((d) => ({ exDate: d.ex_date, amount: d.amount })));
      try {
        const stmt = env.DB.prepare(
          `INSERT INTO daily_prices (symbol, date, close, adj_open, adj_high, adj_low, adj_close, volume)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
           ON CONFLICT (symbol, date) DO UPDATE SET
             close = excluded.close, adj_open = excluded.adj_open, adj_high = excluded.adj_high,
             adj_low = excluded.adj_low, adj_close = excluded.adj_close, volume = excluded.volume`,
        );
        for (let i = 0; i < bars.length; i += CHUNK) {
          await env.DB.batch(bars.slice(i, i + CHUNK).map((b) => stmt.bind(sym, b.date, b.close, b.adjOpen, b.adjHigh, b.adjLow, b.adjClose, b.volume)));
        }
        inserted += bars.length;
        await env.DB.prepare("UPDATE tickers SET last_price_fetch = ?2 WHERE symbol = ?1").bind(sym, runAt).run();
        bump("ok");
        const applied = adjustmentFactors(px.data.map((b) => ({ date: b.date, close: b.close })), divs.map((d) => ({ exDate: d.ex_date, amount: d.amount })));
        const adjustedDays = [...applied.values()].filter((f) => f !== 1).length;
        await log(sym, "ok", bars.length, `av compact ${bars.length} days ${bars[0].date}→${bars[bars.length - 1].date}, as traded; ${adjustedDays} days dividend-adjusted by the toolkit`);
        const jumps = suspiciousJumps(bars);
        if (jumps.length) {
          bump("av_jump");
          await log(sym, "av_jump", 0, `adjusted close moved ×${jumps.map((j) => `${j.ratio} on ${j.date}`).join(", ")} — a split the toolkit does not know, or news; prices are as traded`);
        }
      } catch (err) {
        bump("write_error");
        await log(sym, "write_error", 0, String((err as Error).message ?? err).slice(0, 200));
      }
    }

    // 4) accounts, when due
    if (visit.accounts) {
      const inc = await av(() => fetchAvIncomeAnnual(sym, env.ALPHAVANTAGE_API_KEY, avOpts));
      if (halts(inc, "income")) { await log(sym, "rate_limited", 0, `${inc.kind === "ok" ? "" : inc.detail} — run stopped; resumes tomorrow.`); break; }
      const bal = await av(() => fetchAvBalanceAnnual(sym, env.ALPHAVANTAGE_API_KEY, avOpts));
      if (halts(bal, "balance")) { await log(sym, "rate_limited", 0, `${bal.kind === "ok" ? "" : bal.detail} — run stopped; resumes tomorrow.`); break; }

      const parts: string[] = [divOutcome];
      let rows = 0;
      let status: string;
      if (inc.kind === "ok" && inc.data.length > 0) {
        // Five fiscal years, the same window as the core tier: the growth test
        // compares the window's first pair with its last, and the 9% hurdle is
        // pro-rated to five years (v0.8.1 — AV serves ten; VC-16 caught it).
        const years = inc.data.slice(0, 5);
        const balBy = new Map<string, AvBalanceYear>(bal.kind === "ok" ? bal.data.map((b) => [b.fiscalDateEnding, b]) : []);
        // EDGAR: EPS with provenance, net income for the cross-check, diluted shares.
        let edgarNote = "edgar skipped: no CIK on the ticker row";
        const eps = new Map<string, { eps: number | null; epsSource: string | null; shares: number | null; ni: number | null }>();
        if (t.cik && env.EDGAR_USER_AGENT) {
          const e = await edgarEpsForPeriods(t.cik, years.map((y) => y.fiscalDateEnding), env.EDGAR_USER_AGENT, edgarOpts);
          edgarCalls += e.calls;
          budget.fetches += e.calls;
          if (e.fatal) {
            // Not retried nightly on purpose: a persistent 403 would otherwise
            // burn the ration on the same companies every night. The accounts
            // are kept (status ok), EPS stays empty and says so on the page;
            // the yearly refresh, or a manual status reset, asks EDGAR again.
            edgarNote = `edgar failed: ${e.fatal.slice(0, 100)} — EPS left empty`;
            await log(sym, "edgar_failed", 0, e.fatal.slice(0, 200));
          } else {
            for (const y of e.years) eps.set(y.end, { eps: y.eps, epsSource: y.epsSource, shares: y.sharesDiluted, ni: y.netIncome });
            const got = e.years.filter((y) => y.eps !== null).length;
            const agree: string[] = [];
            const differ: string[] = [];
            for (const y of years) {
              const ed = eps.get(y.fiscalDateEnding);
              if (!ed || ed.ni === null || y.netIncome === null) continue;
              const rel = Math.abs(ed.ni - y.netIncome) / Math.max(1, Math.abs(ed.ni));
              (rel <= 0.01 ? agree : differ).push(`${y.fiscalYear}${rel > 0.01 ? ` av ${y.netIncome} vs edgar ${ed.ni}` : ""}`);
            }
            edgarNote = `edgar: eps ${got}/${years.length}${got ? ` (${(e.years.find((y) => y.epsSource)?.epsSource ?? "").split(" ")[0].replace("edgar:", "")})` : ""} · net income agrees ${agree.length}/${agree.length + differ.length}${differ.length ? ` — differs: ${differ.join("; ")}` : ""}`;
            if (differ.length) await log(sym, "edgar_mismatch", 0, `net income differs by more than 1%: ${differ.join("; ")}`);
          }
        } else if (!env.EDGAR_USER_AGENT) {
          edgarNote = "edgar skipped: EDGAR_USER_AGENT not set — EPS stays empty";
        }
        const stmt = env.DB.prepare(
          `INSERT INTO fundamentals_annual
             (symbol, fiscal_year, period_end, revenue, net_income, eps_diluted,
              current_assets, current_liabilities, total_assets, total_liabilities,
              long_term_debt, shareholders_equity, shares_diluted, goodwill_and_intangibles, source, eps_source)
           VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16)
           ON CONFLICT (symbol, fiscal_year) DO UPDATE SET
             period_end=excluded.period_end, revenue=excluded.revenue, net_income=excluded.net_income,
             eps_diluted=excluded.eps_diluted, current_assets=excluded.current_assets,
             current_liabilities=excluded.current_liabilities, total_assets=excluded.total_assets,
             total_liabilities=excluded.total_liabilities, long_term_debt=excluded.long_term_debt,
             shareholders_equity=excluded.shareholders_equity, shares_diluted=excluded.shares_diluted,
             goodwill_and_intangibles=excluded.goodwill_and_intangibles, source=excluded.source, eps_source=excluded.eps_source`,
        );
        try {
          await env.DB.batch(years.map((y) => {
            const b = balBy.get(y.fiscalDateEnding);
            const ed = eps.get(y.fiscalDateEnding);
            const shares = ed?.shares ?? b?.sharesOutstanding ?? null;
            const epsSource = ed?.epsSource ? ed.epsSource + (ed.shares === null && b?.sharesOutstanding !== null ? "; shares: av outstanding" : "") : null;
            return stmt.bind(
              sym, y.fiscalYear, y.fiscalDateEnding, y.revenue, y.netIncome, ed?.eps ?? null,
              b?.currentAssets ?? null, b?.currentLiabilities ?? null, b?.totalAssets ?? null, b?.totalLiabilities ?? null,
              b?.longTermDebt ?? null, b?.equity ?? null, shares, b?.goodwillAndIntangibles ?? null, "av", epsSource,
            );
          }));
          rows += years.length;
          // Rows outside the window (an earlier, wider fetch) would otherwise
          // survive the upsert and widen the tests again.
          await env.DB.prepare(
            `DELETE FROM fundamentals_annual WHERE symbol = ?1 AND source = 'av' AND fiscal_year NOT IN (${years.map((_, i) => `?${i + 2}`).join(",")})`,
          ).bind(sym, ...years.map((y) => y.fiscalYear)).run();
          parts.push(`income ${years.length}y${bal.kind === "ok" ? "+balance" : ""}`, edgarNote);
        } catch (err) {
          await log(sym, "write_error", 0, String((err as Error).message ?? err).slice(0, 200));
          stop = "write_error";
          break;
        }
        if (bal.kind !== "ok") parts.push(`balance ${bal.kind}: ${bal.detail.slice(0, 60)}`);
        else {
          const readings = [...new Set(bal.data.flatMap((b) => b.notes))];
          if (readings.length) parts.push(`balance readings: ${readings.join("; ")}`);
        }
        // partial (retried tomorrow, 3 more calls) only for a missing balance
        // sheet or a transient dividend fault. "Dividends not served" is an
        // answer: the record stays empty and Graham's dividend tests say so.
        const divTransient = /dividends (error|write_error)/.test(divOutcome);
        status = bal.kind === "ok" && !divTransient ? "ok" : "partial";
      } else {
        parts.push(`income ${inc.kind}${inc.kind === "ok" ? ": no annual reports" : ": " + inc.detail.slice(0, 80)}`);
        status = inc.kind === "not_served" ? "blocked" : "error";
      }
      await env.DB.prepare("UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3 WHERE symbol = ?1").bind(sym, runAt, status).run();
      bump(`fund_${status}`);
      await log(sym, `fund_${status}`, rows, parts.join(" · "));

      // 5) a new ex-date changes every earlier adjusted close: re-do the stored series
      if (newExDates > 0 && px.kind === "ok") {
        const n = await realignSymbol(env.DB, sym);
        if (n > 0) await log(sym, "realigned", n, `${newExDates} new ex-date(s): ${n} stored closes re-adjusted`);
      }
    }
  }

  if (stop) await log(null, stop.startsWith("premium") ? "av_premium" : stop.startsWith("write") ? "write_limited" : "rate_limited", 0, `${stop} — small-cap run stopped; resumes tomorrow`);
  await log(null, "run_summary", inserted, JSON.stringify({
    phase: "smallcaps", tickers: tickers.length, planned: plan.visits.length, withAccounts: plan.visits.filter((v) => v.accounts).length,
    skippedFresh: plan.skippedFresh, skippedBlocked: plan.skippedBlocked, avCalls, edgarCalls, fetches: budget.fetches, inserts: inserted, outcomes: counts, ms: Date.now() - started,
  }));
}

/** Recompute adj_* for every stored as-traded row of a symbol from its dividend record. Returns rows changed. */
export async function realignSymbol(db: D1Database, symbol: string): Promise<number> {
  const rows = (await db.prepare("SELECT date, close, adj_close FROM daily_prices WHERE symbol = ?1 AND close IS NOT NULL ORDER BY date").bind(symbol)
    .all<{ date: string; close: number; adj_close: number }>()).results;
  if (rows.length === 0) return 0;
  const divs = (await db.prepare("SELECT ex_date, amount FROM dividends WHERE symbol = ?1").bind(symbol).all<{ ex_date: string; amount: number | null }>()).results;
  const factors = adjustmentFactors(rows.map((r) => ({ date: r.date, close: r.close })), divs.map((d) => ({ exDate: d.ex_date, amount: d.amount })));
  const stmt = db.prepare(
    `UPDATE daily_prices SET adj_close = ROUND(close * ?3, 6), adj_open = ROUND(adj_open / NULLIF(adj_close, 0) * close * ?3, 6),
       adj_high = ROUND(adj_high / NULLIF(adj_close, 0) * close * ?3, 6), adj_low = ROUND(adj_low / NULLIF(adj_close, 0) * close * ?3, 6)
     WHERE symbol = ?1 AND date = ?2`,
  );
  const changed = rows.filter((r) => Math.abs(r.close * (factors.get(r.date) ?? 1) - r.adj_close) > 1e-6);
  for (let i = 0; i < changed.length; i += CHUNK) {
    await db.batch(changed.slice(i, i + CHUNK).map((r) => stmt.bind(symbol, r.date, factors.get(r.date) ?? 1)));
  }
  return changed.length;
}
