/**
 * Intro to the Stock Market — course toolkit
 * Week 6: numbers into narrative. /explain/:ticker turns a company's two
 * screen verdicts into plain sentences — a numbered fact sheet first (pure,
 * tested), then a narrative written by Claude from that sheet alone, checked
 * and cached; the course's own template sentences when no AI is configured.
 * (Weeks 3–5: charts, books pages, the two screens and the cards, unchanged.)
 *
 * Invariant 4 holds for market data: student-facing data routes touch only
 * D1. The one outward call is the narrative, at most once per company per
 * data-day, cached in D1, capped per day, and never required for the page.
 */

import { Hono } from "hono";
import { LANDING_PAGE } from "./landing";
import { fetchAlphaVantageQuote, fetchFmpProfile } from "./providers";
import { runNightly, type Phase } from "./jobs/nightly";
import { computeRatios, dividendYears, type FundamentalsYear, type Ratios } from "./lib/ratios";
import { buildFactSheet, templateNarrative, checkGrounding, type FactSheet, type Narrative, type Grounding } from "./lib/explain";
import { claudeNarrative, DEFAULT_MODEL } from "./lib/narrative";
import {
  CRITERIA, T as GT, requiredGrowthPct, rankScreen, screenCompany, type ScreenResult, type ScreenInput,
  ENTERPRISING, E as ET, screenEnterprising, type EnterprisingResult, type CriterionDef, type CriterionResult, type Verdict,
} from "./lib/graham";
import { computeSignals, describeSignal, HISTORY_LIMIT, RULE as SIGNAL_RULE, type SignalSeries, type SignalPoint } from "./lib/signals";

type Env = {
  ALPHAVANTAGE_API_KEY: string;
  FMP_API_KEY: string;
  /** Week 6: the Claude API key (wrangler secret put). Optional: without it the explainer serves the plain version. */
  ANTHROPIC_API_KEY?: string;
  /** Optional overrides (wrangler.jsonc "vars"): model id and generations per day. */
  EXPLAIN_MODEL?: string;
  EXPLAIN_DAILY_CAP?: string;
  /** Test hook only (.dev.vars): a stub server standing in for the Claude API. */
  EXPLAIN_API_URL?: string;
  /** Small-cap tier (decision 14): EDGAR's fair-access policy wants a User-Agent
   *  naming the project and a contact — `wrangler secret put EDGAR_USER_AGENT`.
   *  Without it EDGAR is skipped and the tier's EPS stays empty (honestly). */
  EDGAR_USER_AGENT?: string;
  /** Test hooks only (.dev.vars): stub servers standing in for Alpha Vantage and EDGAR. */
  ALPHAVANTAGE_API_URL?: string;
  EDGAR_API_URL?: string;
  /** Optional override: Alpha Vantage calls the small-cap visit may spend a night (default 20 of the 25). */
  SMALLCAP_AV_CALLS?: string;
  /** Test hook only (.dev.vars): shorten the 13-second spacing against a stub server. */
  SMALLCAP_AV_SPACING_MS?: string;
  /** Optional override: live demo quotes allowed per day on the shared Alpha Vantage key (default 3). */
  QUOTE_DAILY_CAP?: string;
  DB: D1Database;
};

const QUOTE_DAILY_CAP_DEFAULT = 3;

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) => c.html(LANDING_PAGE));

// The browser asks every site for a tab icon; give it one instead of log noise.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📒</text></svg>`;
app.get("/favicon.ico", (c) =>
  c.body(FAVICON_SVG, 200, {
    "content-type": "image/svg+xml",
    "cache-control": "public, max-age=604800",
  }),
);

// Week 1's artifact, preserved as shipped.
app.get("/api/hello", (c) =>
  c.json({
    message: "Hello from the Intro to the Stock Market toolkit.",
    week: 1,
    of: 12,
    philosophy: "We grade decisions, not outcomes.",
    served_at: new Date().toISOString(),
  }),
);

/** Letters/digits, optional . or - — covers AAPL, BRK-B, TSCO.LON. */
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

// ---------------------------------------------------------------------------
// Week 2: the LIVE quote route — tutor's demo, rationed.
// ---------------------------------------------------------------------------
app.get("/api/quote/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();

  if (!TICKER.test(ticker)) {
    return c.json(
      {
        error: "That doesn't look like a ticker symbol.",
        hint: "Letters and digits, optionally with . or - : AAPL, BRK-B, TSCO.LON.",
      },
      400,
    );
  }

  const avKey = c.env.ALPHAVANTAGE_API_KEY;
  const fmpKey = c.env.FMP_API_KEY;
  if (!avKey || !fmpKey) {
    return c.json(
      {
        error: "API keys are not configured on this instance.",
        hint:
          "Local: copy .dev.vars.example to .dev.vars and add your keys. " +
          "Production: `npx wrangler secret put ALPHAVANTAGE_API_KEY` and again for FMP_API_KEY, then `npm run deploy`.",
      },
      503,
    );
  }

  // Review S7 (23 Oct 2026): this demo spends the same 25-a-day Alpha Vantage
  // key the small-cap tier runs on, so it is rationed — QUOTE_DAILY_CAP live
  // calls in any 24 hours, counted in fetch_log, the rest answered from the
  // nightly cache with the reason. The tutor's "858 ms vs 9 ms" demo survives.
  // "0" switches the demo off; an unset or unparseable value means the default (OI-24).
  const capRaw = (c.env.QUOTE_DAILY_CAP ?? "").trim();
  const cap = capRaw === "" || !/^\d+$/.test(capRaw) ? QUOTE_DAILY_CAP_DEFAULT : parseInt(capRaw, 10);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  // The receipt is written FIRST and the count taken after it, so requests in
  // flight together cannot all read the same count (verification V8): the
  // n-th receipt beyond the cap is removed again and answered from the cache.
  const runAt = new Date().toISOString();
  // Over the cap until proven otherwise: a demo switched off, or a receipt that
  // cannot be written (D1 in trouble), never spends a live call (review F6).
  let used = cap + 1;
  let receiptWritten = false;
  if (cap > 0) {
    try {
      await c.env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, 'quote_demo', 0, ?3)")
        .bind(runAt, ticker, "live demo call").run();
      receiptWritten = true;
      used = (await c.env.DB.prepare("SELECT COUNT(*) AS n FROM fetch_log WHERE outcome = 'quote_demo' AND run_at >= ?1").bind(since).first<{ n: number }>())?.n ?? cap + 1;
    } catch { used = cap + 1; }
  }
  if (used > cap) {
    if (receiptWritten) {
      try {
        await c.env.DB.prepare("DELETE FROM fetch_log WHERE id = (SELECT MAX(id) FROM fetch_log WHERE outcome = 'quote_demo' AND run_at = ?1 AND symbol = ?2)").bind(runAt, ticker).run();
      } catch { /* leave it: it only makes the ration stricter */ }
    }
    const cached = await c.env.DB.prepare("SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT 1").bind(ticker).first<{ date: string; adj_close: number }>();
    return c.json({
      ticker,
      error: cap === 0 ? "The live demo is switched off on this instance." : `The live demo is rationed to ${cap} calls a day (the free Alpha Vantage key serves the small-cap tier too); today's are spent.`,
      cached_close: cached ?? null,
      hint: "Everything students use is served from the nightly cache: /prices/:ticker, /fundamentals/:ticker, /screen.",
    }, 429, { "cache-control": "no-store" });
  }
  try {
    await c.env.DB.prepare("UPDATE fetch_log SET detail = ?3 WHERE id = (SELECT MAX(id) FROM fetch_log WHERE outcome = 'quote_demo' AND run_at = ?1 AND symbol = ?2)")
      .bind(runAt, ticker, `live demo call ${used} of ${cap} today`).run();
  } catch { /* cosmetic */ }

  const [av, fmp] = await Promise.all([
    fetchAlphaVantageQuote(ticker, avKey),
    fetchFmpProfile(ticker, fmpKey),
  ]);

  const warnings = [av.warning, fmp.warning].filter((w): w is string => w !== null);

  if (!av.data && !fmp.data) {
    return c.json(
      { ticker, error: "Neither data provider returned anything usable.", warnings },
      502,
    );
  }

  return c.json(
    {
      ticker,
      asOf: new Date().toISOString(),
      price: av.data,
      company: fmp.data,
      meta: {
        delayed: true,
        sources: {
          price: "Alpha Vantage (free tier: ~25 requests/day, 5/min)",
          company: "Financial Modeling Prep (free plan: ~250 requests/day)",
        },
        demo_calls_today: `${used} of ${cap}`,
        warnings,
        note: "Education, not advice.",
      },
    },
    200,
    { "cache-control": "no-store" },
  );
});

// ---------------------------------------------------------------------------
// Week 3: cache-first routes. D1 only.
// ---------------------------------------------------------------------------

app.get("/api/universe", async (c) => {
  const t0 = Date.now();
  const rows = (
    await c.env.DB.prepare(
      `SELECT t.symbol, t.name, t.sector, t.status, t.tier, t.cik, t.fundamentals_status,
              COUNT(p.date) AS days_of_history,
              MAX(p.date)   AS latest_close
       FROM tickers t
       LEFT JOIN daily_prices p ON p.symbol = t.symbol
       GROUP BY t.symbol
       ORDER BY t.symbol`,
    ).all()
  ).results;

  const lastRun = await c.env.DB.prepare(
    "SELECT run_at FROM fetch_log WHERE outcome = 'run_summary' ORDER BY id DESC LIMIT 1",
  ).first<{ run_at: string }>();

  return c.json({
    universe: rows,
    meta: {
      source: "d1-cache",
      count: rows.length,
      last_nightly_run: lastRun?.run_at ?? null,
      served_in_ms: Date.now() - t0,
      tiers: { core: "FMP (prices adjusted by the provider; accounts and EPS from FMP)", small: "Alpha Vantage (prices as traded, dividend-adjusted by the toolkit; accounts from Alpha Vantage) + SEC EDGAR (EPS, with the filing named on each row)" },
      note: "Education, not advice. Universe membership is verified against the free data plan — see docs/data-provider-checks.md in the repo.",
    },
  });
});

app.get("/api/prices/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) {
    return c.json({ error: "That doesn't look like a ticker symbol." }, 400);
  }
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "365", 10) || 365, 5), 1900);

  const t0 = Date.now();
  const rows = (
    await c.env.DB.prepare(
      `SELECT date, close, adj_open, adj_high, adj_low, adj_close, volume
       FROM daily_prices WHERE symbol = ?1
       ORDER BY date DESC LIMIT ?2`,
    )
      .bind(ticker, days)
      .all<{
        date: string;
        close: number | null;       // as traded — stored for the small tier (v0.8.0); NULL for FMP rows
        adj_open: number | null;
        adj_high: number | null;
        adj_low: number | null;
        adj_close: number;
        volume: number | null;
      }>()
  ).results.reverse();

  if (rows.length === 0) {
    const t = await c.env.DB.prepare("SELECT status, notes FROM tickers WHERE symbol = ?1")
      .bind(ticker)
      .first<{ status: string; notes: string | null }>();
    return c.json(
      {
        ticker,
        error: t
          ? t.status === "blocked"
            ? `"${ticker}" is in the universe but outside the free data plan — no history is cached. (${t.notes ?? "see verification record"})`
            : `"${ticker}" is in the universe but has no cached history yet — the nightly refresh hasn't reached it. Check back after 23:30 Irish time.`
          : `"${ticker}" is not in the course universe. The universe is the verified list at /api/universe.`,
        hint: "Universe: /api/universe · Live demo quote (tutor only, rationed): /api/quote/:ticker",
      },
      404,
    );
  }

  const lastOk = await c.env.DB.prepare(
    "SELECT run_at FROM fetch_log WHERE symbol = ?1 AND outcome = 'ok' ORDER BY id DESC LIMIT 1",
  )
    .bind(ticker)
    .first<{ run_at: string }>();
  const tierRow = await c.env.DB.prepare("SELECT tier FROM tickers WHERE symbol = ?1").bind(ticker).first<{ tier: string | null }>();
  const small = tierRow?.tier === "small";

  // Week 7: ?csv=1 — the same rows as a spreadsheet can open, for the
  // lesson's exit check (re-implement the rule in Excel and reconcile).
  if (c.req.query("csv") === "1") {
    const head = "date,close,adj_open,adj_high,adj_low,adj_close,volume";
    const lines = rows.map((r) => [r.date, r.close ?? "", r.adj_open ?? "", r.adj_high ?? "", r.adj_low ?? "", r.adj_close, r.volume ?? ""].join(","));
    return c.text(`${head}\n${lines.join("\n")}\n`, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${ticker}-prices.csv"`,
      "cache-control": "no-store",
    });
  }

  return c.json({
    ticker,
    prices: rows,
    meta: {
      source: "d1-cache",
      tier: small ? "small" : "core",
      adjusted: small
        ? "as traded (Alpha Vantage), dividend-adjusted by the toolkit from the dividend record; NOT split-adjusted (review S11)"
        : "split- and dividend-adjusted by the provider (lesson 2: charts longer than a season use adjusted prices)",
      count: rows.length,
      first_date: rows[0].date,
      last_date: rows[rows.length - 1].date,
      last_refresh: lastOk?.run_at ?? null,
      served_in_ms: Date.now() - t0,
      note: "Education, not advice.",
    },
  });
});

// ---------------------------------------------------------------------------
// Week 4: fundamentals from the cache.
// ---------------------------------------------------------------------------

async function loadFundamentals(env: Env, ticker: string) {
  const years = (
    await env.DB.prepare(
      `SELECT fiscal_year, period_end, revenue, net_income, eps_diluted,
              current_assets, current_liabilities, total_assets, total_liabilities,
              long_term_debt, shareholders_equity, shares_diluted, goodwill_and_intangibles,
              source, eps_source, readings
       FROM fundamentals_annual WHERE symbol = ?1
       ORDER BY fiscal_year DESC LIMIT 10`,
    ).bind(ticker).all<{
      fiscal_year: string; period_end: string | null; revenue: number | null;
      net_income: number | null; eps_diluted: number | null;
      current_assets: number | null; current_liabilities: number | null;
      total_assets: number | null; total_liabilities: number | null;
      long_term_debt: number | null; shareholders_equity: number | null;
      shares_diluted: number | null; goodwill_and_intangibles: number | null;
      source: string | null; eps_source: string | null; readings: string | null;
    }>()
  ).results;

  const divs = (
    await env.DB.prepare(
      "SELECT ex_date, amount FROM dividends WHERE symbol = ?1 ORDER BY ex_date DESC LIMIT 80",
    ).bind(ticker).all<{ ex_date: string; amount: number | null }>()
  ).results;

  const close = await env.DB.prepare(
    "SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT 1",
  ).bind(ticker).first<{ date: string; adj_close: number }>();

  const meta = await env.DB.prepare(
    "SELECT name, sector, status, tier, cik, fundamentals_as_of, fundamentals_status FROM tickers WHERE symbol = ?1",
  ).bind(ticker).first<{
    name: string | null; sector: string | null; status: string; tier: string | null; cik: string | null;
    fundamentals_as_of: string | null; fundamentals_status: string | null;
  }>();

  // Where the figures came from, for the page and the JSON (decision 14's audit trail).
  const sources = describeSources(meta?.tier ?? "core", years.map((y) => ({ fiscalYear: y.fiscal_year, source: y.source, epsSource: y.eps_source })));

  const fy: FundamentalsYear[] = years.map((y) => ({
    fiscalYear: y.fiscal_year,
    periodEnd: y.period_end,
    revenue: y.revenue,
    netIncome: y.net_income,
    epsDiluted: y.eps_diluted,
    currentAssets: y.current_assets,
    currentLiabilities: y.current_liabilities,
    totalAssets: y.total_assets,
    totalLiabilities: y.total_liabilities,
    longTermDebt: y.long_term_debt,
    equity: y.shareholders_equity,
    sharesDiluted: y.shares_diluted,
    goodwillAndIntangibles: y.goodwill_and_intangibles,
    readings: y.readings,
  }));

  return {
    years: fy,
    dividends: dividendYears(divs),
    divRows: divs,
    close: close ?? null,
    ratios: computeRatios(fy, close?.adj_close ?? null),
    ticker_meta: meta ?? null,
    sources,
  };
}

/** One honest line per data stream. The small tier names the filing its EPS came from. */
function describeSources(tier: string, years: { fiscalYear: string; source: string | null; epsSource: string | null }[]): { tier: string; prices: string; accounts: string; eps: string } {
  if (tier !== "small") {
    return {
      tier: "core",
      prices: "FMP, dividend-adjusted by the provider",
      accounts: "FMP income statement and balance sheet; dividend record from FMP",
      eps: "FMP (diluted)",
    };
  }
  const newest = years.find((y) => y.epsSource) ?? null;
  const missing = years.filter((y) => !y.epsSource).map((y) => y.fiscalYear);
  return {
    tier: "small",
    prices: "Alpha Vantage, as traded; dividend-adjusted by the toolkit from the dividend record (the as-traded close is stored beside it)",
    accounts: "Alpha Vantage income statement and balance sheet; dividend record from Alpha Vantage",
    eps: newest
      ? `SEC EDGAR — ${newest.epsSource!.replace(/^edgar:/, "")}${missing.length ? ` (no EDGAR figure for FY ${missing.join(", ")})` : ""}`
      : "not available — EDGAR's company-concept API returned no EPS and no diluted-share count for these periods. The usual reason is a filer with more than one class of shares (Bel Fuse, Ford): those facts are reported per class and the API omits per-class facts, so the toolkit shows \"?\" on the earnings tests rather than guess (decision 14). A missing EDGAR_USER_AGENT secret looks the same; the fetch_log receipt says which.",
  };
}

app.get("/api/fundamentals/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) {
    return c.json({ error: "That doesn't look like a ticker symbol." }, 400);
  }
  const t0 = Date.now();
  const f = await loadFundamentals(c.env, ticker);

  if (f.years.length === 0) {
    const m = f.ticker_meta;
    return c.json(
      {
        ticker,
        error: m
          ? m.status === "blocked"
            ? `"${ticker}" is outside the free data plan — no accounts are cached.`
            : `"${ticker}" has no cached accounts yet — the nightly refresh covers a few companies per night and reaches the whole universe within about three nights of first deploy.`
          : `"${ticker}" is not in the course universe (see /api/universe).`,
      },
      404,
    );
  }

  return c.json({
    ticker,
    name: f.ticker_meta?.name ?? null,
    last_close: f.close,
    years: f.years,
    dividends: f.dividends,
    ratios: f.ratios,
    meta: {
      source: "d1-cache",
      data_sources: f.sources,
      years_available: f.years.length,
      note_on_depth: "Free data serves 5 fiscal years; Graham asked for 10. The week-5 criteria adapt openly (decision log #8).",
      fundamentals_as_of: f.ticker_meta?.fundamentals_as_of ?? null,
      fundamentals_status: f.ticker_meta?.fundamentals_status ?? null,
      served_in_ms: Date.now() - t0,
      note: "Education, not advice.",
    },
  });
});

/** The human-facing books page — week 4's centrepiece. */
app.get("/fundamentals/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.text("Not a ticker symbol.", 400);
  const f = await loadFundamentals(c.env, ticker);
  return c.html(
    fundamentalsPage(ticker, f.ticker_meta?.name ?? null, f.ticker_meta?.status ?? null,
      f.years, f.ratios, f.dividends, f.close, f.ticker_meta?.sector ?? null, f.sources),
  );
});

/** The chart page — week 3's centrepiece. */
app.get("/prices/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.text("Not a ticker symbol.", 400);
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "365", 10) || 365, 20), 1900);

  const t0 = Date.now();
  // Week 7: the whole stored history feeds the rule (the slow EWMA needs the
  // past); the picture shows the window asked for.
  const all = (
    await c.env.DB.prepare(
      `SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT ${HISTORY_LIMIT}`,
    )
      .bind(ticker)
      .all<{ date: string; adj_close: number }>()
  ).results.reverse();
  const rows = all.slice(-days);
  const sig = all.length ? computeSignals(all.map((r) => ({ date: r.date, close: r.adj_close }))) : null;

  const name = await c.env.DB.prepare("SELECT name, status, tier FROM tickers WHERE symbol = ?1")
    .bind(ticker)
    .first<{ name: string | null; status: string; tier: string | null }>();

  return c.html(chartPage(ticker, name?.name ?? null, name?.status ?? null, rows, days, Date.now() - t0, name?.tier ?? "core", sig));
});

// ---------------------------------------------------------------------------
// Week 5: the Graham screen — one pass over the cache, three queries total.
// ---------------------------------------------------------------------------

async function loadScreen(env: Env) {
  const [tick, fund, divs, closes] = await env.DB.batch([
    env.DB.prepare("SELECT symbol, name, sector, tier FROM tickers WHERE status = 'active' ORDER BY symbol"),
    env.DB.prepare(
      `SELECT symbol, fiscal_year, period_end, revenue, net_income, eps_diluted,
              current_assets, current_liabilities, total_assets, total_liabilities,
              long_term_debt, shareholders_equity, shares_diluted, goodwill_and_intangibles, readings
       FROM fundamentals_annual ORDER BY symbol, fiscal_year DESC`,
    ),
    env.DB.prepare("SELECT symbol, ex_date, amount FROM dividends"),
    env.DB.prepare(
      `SELECT p.symbol, p.date, p.adj_close FROM daily_prices p
       JOIN (SELECT symbol, MAX(date) AS d FROM daily_prices GROUP BY symbol) m
         ON p.symbol = m.symbol AND p.date = m.d`,
    ),
  ]);

  type FRow = {
    symbol: string; fiscal_year: string; period_end: string | null; revenue: number | null;
    net_income: number | null; eps_diluted: number | null; current_assets: number | null;
    current_liabilities: number | null; total_assets: number | null; total_liabilities: number | null;
    long_term_debt: number | null; shareholders_equity: number | null; shares_diluted: number | null;
    goodwill_and_intangibles: number | null; readings: string | null;
  };
  const yearsBy = new Map<string, FundamentalsYear[]>();
  for (const y of fund.results as FRow[]) {
    const list = yearsBy.get(y.symbol) ?? [];
    list.push({
      fiscalYear: y.fiscal_year, periodEnd: y.period_end, revenue: y.revenue, netIncome: y.net_income,
      epsDiluted: y.eps_diluted, currentAssets: y.current_assets, currentLiabilities: y.current_liabilities,
      totalAssets: y.total_assets, totalLiabilities: y.total_liabilities, longTermDebt: y.long_term_debt,
      equity: y.shareholders_equity, sharesDiluted: y.shares_diluted,
      goodwillAndIntangibles: y.goodwill_and_intangibles, readings: y.readings,
    });
    yearsBy.set(y.symbol, list);
  }
  const divsBy = new Map<string, { ex_date: string; amount: number | null }[]>();
  for (const d of divs.results as { symbol: string; ex_date: string; amount: number | null }[]) {
    const list = divsBy.get(d.symbol) ?? [];
    list.push(d);
    divsBy.set(d.symbol, list);
  }
  const closeBy = new Map<string, { date: string; adj_close: number }>();
  for (const p of closes.results as { symbol: string; date: string; adj_close: number }[]) closeBy.set(p.symbol, p);

  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const smallTier = new Set((tick.results as { symbol: string; tier: string | null }[]).filter((t) => t.tier === "small").map((t) => t.symbol));
  const inputs: ScreenInput[] = (tick.results as { symbol: string; name: string | null; sector: string | null }[])
    .filter((t) => (yearsBy.get(t.symbol)?.length ?? 0) > 0)
    .map((t) => {
      const dv = divsBy.get(t.symbol) ?? [];
      const paid = dv.filter((d) => typeof d.amount === "number" && d.amount > 0).map((d) => d.ex_date).sort();
      return {
        symbol: t.symbol, name: t.name, sector: t.sector,
        years: yearsBy.get(t.symbol) ?? [],
        dividendsPerYear: dividendYears(dv).perYear,
        exDates: paid,
        lastExDate: paid.length ? paid[paid.length - 1] : null,
        lastClose: closeBy.get(t.symbol)?.adj_close ?? null,
        currentYear, today,
      };
    });

  const priceDates = [...closeBy.values()].map((p) => p.date).sort();
  return {
    inputs,
    smallTier,
    universe: tick.results.length,
    withBooks: inputs.length,
    asOfClose: priceDates.length ? priceDates[priceDates.length - 1] : null,
  };
}

const META_NOTE = "Education, not advice. A screen is a starting list for reading, never a buy list.";

app.get("/api/screen/graham", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  const rows = rankScreen(s.inputs.map(screenCompany));
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return c.json({
    criteria: CRITERIA,
    thresholds: GT,
    required_growth_pct: requiredGrowthPct,
    summary: {
      universe: s.universe, screened: s.withBooks,
      survivors: count("survivor"), near_misses: count("near_miss"),
      insufficient_data: count("insufficient"), fails: count("fails"),
    },
    results: rows,
    meta: {
      source: "d1-cache",
      as_of_close: s.asOfClose,
      method: "The Intelligent Investor ch. 14 (defensive investor), adapted openly where free data is shorter than Graham's windows — see /card. Financial companies skip test 2 (Graham applied only the price tests to them) and are scored out of 6.",
      served_in_ms: Date.now() - t0,
      note: META_NOTE,
    },
  });
});

app.get("/api/screen/enterprising", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  const rows = rankScreen(s.inputs.map(screenEnterprising));
  const count = (v: Verdict) => rows.filter((r) => r.verdict === v).length;
  return c.json({
    criteria: ENTERPRISING,
    thresholds: ET,
    summary: {
      universe: s.universe, screened: s.withBooks,
      candidates: count("candidate"), near_misses: count("near_miss"),
      insufficient_data: count("insufficient"), fails: count("fails"),
      cheap_on_earnings: rows.filter((r) => r.results[0].outcome === "pass").length,
    },
    results: rows,
    meta: {
      source: "d1-cache",
      as_of_close: s.asOfClose,
      method: "The Intelligent Investor ch. 15, pp. 385–386 (the enterprising investor's secondary companies): a multiplier of nine or less, then five tests 'not so severe' than the defensive set, and no size test. Financial companies skip the financial-condition test (Graham: 'for industrial companies') and are scored out of 5. Candidates are the list for Graham's 'third selection' by judgment — see /card#enterprising.",
      served_in_ms: Date.now() - t0,
      note: META_NOTE,
    },
  });
});

app.get("/screen", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  const rows = rankScreen(s.inputs.map(screenCompany));
  return c.html(screenPage(DEFENSIVE_PAGE, rows, s.universe, s.withBooks, s.asOfClose, Date.now() - t0, s.smallTier));
});

app.get("/screen/enterprising", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  const rows = rankScreen(s.inputs.map(screenEnterprising));
  return c.html(screenPage(ENTERPRISING_PAGE, rows, s.universe, s.withBooks, s.asOfClose, Date.now() - t0, s.smallTier));
});

app.get("/card", (c) => c.html(cardPage()));

// ---------------------------------------------------------------------------
// Week 7: the signal engine (decision 17). Nightly rows from the cron; the
// per-instrument series computed on request from the stored closes.
// ---------------------------------------------------------------------------
type SignalRow = {
  symbol: string; name: string | null; tier: string | null; date: string; close: number;
  ewma_fast: number; ewma_slow: number; instrument_risk: number | null; forecast: number | null;
  state: string; state_since: string | null; days: number; computed_at: string;
};

async function loadSignals(env: Env): Promise<SignalRow[]> {
  return (await env.DB.prepare(
    `SELECT s.symbol, t.name, t.tier, s.date, s.close, s.ewma_fast, s.ewma_slow, s.instrument_risk, s.forecast,
            s.state, s.state_since, s.days, s.computed_at
     FROM signals s
     JOIN (SELECT symbol, MAX(date) AS date FROM signals GROUP BY symbol) m ON m.symbol = s.symbol AND m.date = s.date
     JOIN tickers t ON t.symbol = s.symbol
     WHERE t.status = 'active'
     ORDER BY CASE s.state WHEN 'long' THEN 0 WHEN 'flat' THEN 1 ELSE 2 END, s.forecast DESC, s.symbol`,
  ).all<SignalRow>()).results;
}

const RULE_META = {
  rule: "EWMAC 16/64 (Carver), long-only",
  fast_span: SIGNAL_RULE.fastSpan, slow_span: SIGNAL_RULE.slowSpan, vol_span: SIGNAL_RULE.volSpan,
  forecast_scalar: SIGNAL_RULE.forecastScalar, forecast_cap: SIGNAL_RULE.forecastCap,
  business_days: SIGNAL_RULE.businessDays, min_mature_days: SIGNAL_RULE.minMatureDays,
  basis: "adjusted close (total-return series); daily σ annualised × 16; state long when the forecast is above zero, flat otherwise (no shorts, no leverage)",
  reference: "Carver, Leveraged Trading (2019) — the Starter System's opening rule; Systematic Trading (2015) ch. 7 — the forecast scalar; constants checked against pysystemtrade (GPL) on 24 Oct 2026",
  note: "Education, not advice. A signal is what a rule says about a price series, not a recommendation to buy or sell anything.",
};

app.get("/api/signals", async (c) => {
  const t0 = Date.now();
  const rows = await loadSignals(c.env);
  const asOf = rows.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
  return c.json({
    as_of_close: asOf,
    counts: { long: rows.filter((r) => r.state === "long").length, flat: rows.filter((r) => r.state === "flat").length, warming: rows.filter((r) => r.state === "warming").length },
    signals: rows,
    meta: { source: "d1-cache (nightly signals table)", ...RULE_META, served_in_ms: Date.now() - t0 },
  });
});

app.get("/api/signals/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.json({ error: "That doesn't look like a ticker symbol." }, 400);
  const t0 = Date.now();
  const all = (await c.env.DB.prepare(`SELECT date, adj_close AS close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT ${HISTORY_LIMIT}`)
    .bind(ticker).all<{ date: string; close: number }>()).results;
  if (all.length === 0) {
    const t = await c.env.DB.prepare("SELECT status, notes FROM tickers WHERE symbol = ?1").bind(ticker).first<{ status: string; notes: string | null }>();
    return c.json({
      ticker,
      error: t
        ? t.status === "blocked"
          ? `"${ticker}" is in the universe but outside the free data plan — no history is cached, so the rule has nothing to read. (${t.notes ?? "see verification record"})`
          : `"${ticker}" is in the universe but has no cached history yet — the nightly refresh (or the small-cap visit) hasn't reached it.`
        : `"${ticker}" is not in the course universe. The universe is the verified list at /api/universe.`,
      hint: "Universe: /api/universe · all signals: /api/signals",
    }, 404);
  }
  const sig = computeSignals(all);
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "365", 10) || 365, 20), 1900);
  const stored = await c.env.DB.prepare("SELECT date, forecast, state, computed_at FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1")
    .bind(ticker).first<{ date: string; forecast: number | null; state: string; computed_at: string }>();
  return c.json({
    ticker,
    latest: sig.latest,
    summary: { days: sig.days, mature: sig.mature, state_since: sig.stateSince, flips: sig.flips, time_long: sig.timeLong, reading: describeSignal(sig) },
    nightly_row: stored ?? null,
    series: sig.points.slice(-days).map((p) => ({ date: p.date, close: p.close, fast: p.fast, slow: p.slow, sigma_px: p.sigmaPx, instrument_risk: p.instrumentRisk, forecast: p.forecast, state: p.state })),
    meta: { source: "computed on request from the cached closes", ...RULE_META, closes_read: all.length, served_in_ms: Date.now() - t0 },
  });
});

app.get("/signals", async (c) => {
  const t0 = Date.now();
  const rows = await loadSignals(c.env);
  const universe = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM tickers WHERE status = 'active'").first<{ n: number }>();
  return c.html(signalsPage(rows, universe?.n ?? 0, Date.now() - t0));
});

function signalsPage(rows: SignalRow[], universe: number, ms: number): string {
  const asOf = rows.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
  const n = (st: string) => rows.filter((r) => r.state === st).length;
  const bar = (f: number | null) => {
    if (f === null) return `<span class="bar"><span class="axis"></span></span>`;
    const w = Math.min(Math.abs(f), SIGNAL_RULE.forecastCap) / SIGNAL_RULE.forecastCap * 50; // half-width in %
    const left = f >= 0 ? 50 : 50 - w;
    return `<span class="bar" title="forecast ${f > 0 ? "+" : ""}${f} on ±${SIGNAL_RULE.forecastCap}"><span class="axis"></span><span class="fill ${f > 0 ? "pos" : "neg"}" style="left:${left}%;width:${w}%"></span></span>`;
  };
  const stateTag = (st: string) => st === "long" ? `<span class="tag long">LONG</span>` : st === "flat" ? `<span class="tag flat">FLAT</span>` : `<span class="tag warming">WARMING UP</span>`;
  const dateOf = (d: string | null) => d ?? "—";
  const body = rows.map((r) => `<tr class="${r.state}">
      <th scope="row"><a href="/prices/${esc(r.symbol)}">${esc(r.symbol)}</a>${r.tier === "small" ? `<span class="st" title="Small-cap tier: as-traded prices, dividend-adjusted by the toolkit, NOT split-adjusted — a split reads as a false flip; the rule needs ${SIGNAL_RULE.minMatureDays} closes">s</span>` : ""}<span class="nm">${esc(r.name ?? "")}</span></th>
      <td class="s">${stateTag(r.state)}</td>
      <td class="f">${bar(r.forecast)}<span class="fv">${r.forecast === null ? "—" : `${r.forecast > 0 ? "+" : ""}${r.forecast.toFixed(1)}`}</span></td>
      <td class="r">${r.instrument_risk === null ? "—" : `${r.instrument_risk.toFixed(0)}%`}</td>
      <td class="d">${r.state === "warming" ? `${r.days} of ${SIGNAL_RULE.minMatureDays} closes` : dateOf(r.state_since)}</td>
      <td class="c">${r.close >= 100 ? r.close.toFixed(0) : r.close.toFixed(2)}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Signals — Carver's rule, nightly</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  main { max-width: 52rem; }
  .lede { color:var(--faint); font-size:.95rem; margin:.3rem 0 1rem; }
  .tally { display:flex; gap:1.2rem; flex-wrap:wrap; margin:.6rem 0 1rem; font-family:"IBM Plex Mono",monospace; font-size:.85rem; }
  .tally b { font-size:1.3rem; display:block; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th, td { padding:.4rem .5rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:middle; }
  thead th { color:var(--faint); font-weight:400; font-size:.75rem; letter-spacing:.04em; text-transform:uppercase; }
  tbody th { font-weight:500; white-space:nowrap; }
  .nm { display:block; color:var(--faint); font-weight:400; font-size:.75rem; white-space:normal; }
  .st { font-family:"IBM Plex Mono",monospace; font-size:.65rem; color:var(--faint); margin-left:.3rem; vertical-align:super; }
  .tag { font-family:"IBM Plex Mono",monospace; font-size:.7rem; padding:.1rem .4rem; border-radius:3px; letter-spacing:.04em; }
  .tag.long { background:#3E6B54; color:#fff; } .tag.flat { background:#E3E8E4; color:#3b4a42; } .tag.warming { background:#F1EBD6; color:#6b5d2a; }
  .bar { position:relative; display:inline-block; width:120px; height:10px; background:#EEF1EC; border-radius:2px; vertical-align:middle; }
  .axis { position:absolute; left:50%; top:0; width:1px; height:100%; background:var(--faint); }
  .fill { position:absolute; top:1px; height:8px; border-radius:2px; } .fill.pos { background:#3E6B54; } .fill.neg { background:#B7C0BA; }
  .fv { font-family:"IBM Plex Mono",monospace; font-size:.8rem; margin-left:.5rem; }
  td.r, td.c { font-family:"IBM Plex Mono",monospace; }
  tr.flat th a, tr.flat td { color:var(--faint); } tr.flat th a { color:var(--entry); }
  .rule { background:rgba(255,255,255,.5); border:1px solid var(--rule); border-radius:6px; padding:.8rem 1rem; font-size:.85rem; margin:1rem 0; }
  .rule code { font-family:"IBM Plex Mono",monospace; font-size:.8rem; }
  .argue { margin:1rem 0; font-size:.9rem; }
  .wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  @media (max-width: 640px) { .nm { display:none; } .bar { width:70px; } td.c { display:none; } thead th:last-child { display:none; } td.d { white-space:nowrap; } }
</style></head>
<body><main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">Phase 3 · week 7 · why systems beat gut feel</p>
  <h1>Signals</h1>
  <p class="lede">One rule, run the same way over every company every night: Robert Carver's 16-day / 64-day moving-average crossover, long-only. ${asOf ? `As of the ${esc(asOf)} close` : "No signals computed yet — the nightly job writes them at 22:50 UTC"}, ${rows.length} of ${universe} instruments.</p>
  <div class="tally">
    <span><b>${n("long")}</b> long — the fast average is above the slow</span>
    <span><b>${n("flat")}</b> flat — below (no position; the rule never goes short)</span>
    <span><b>${n("warming")}</b> warming up — fewer than ${SIGNAL_RULE.minMatureDays} closes</span>
  </div>
  <div class="wrap"><table>
    <thead><tr><th>Instrument</th><th>State</th><th>Forecast (±${SIGNAL_RULE.forecastCap})</th><th title="Annualised volatility: EW σ of daily returns × 16">Instr. risk</th><th>Since</th><th>Close</th></tr></thead>
    <tbody>${body || `<tr><td colspan="6">Nothing yet.</td></tr>`}</tbody>
  </table></div>
  <div class="rule">
    <strong>The rule, in full</strong> (the same numbers run the nightly job, this page and the chart overlay — <a href="/api/signals">raw JSON</a>):<br>
    <code>fast = EWMA(close, ${SIGNAL_RULE.fastSpan})</code> · <code>slow = EWMA(close, ${SIGNAL_RULE.slowSpan})</code> · <code>σ = EW standard deviation of daily price changes, span ${SIGNAL_RULE.volSpan}</code><br>
    <code>forecast = ${SIGNAL_RULE.forecastScalar} × (fast − slow) ÷ σ</code>, capped at ±${SIGNAL_RULE.forecastCap} · <code>state = forecast &gt; 0 ? LONG : FLAT</code> · <code>instrument risk = σ% × 16</code> (a year).<br>
    EWMA weight λ = 2 ÷ (span + 1). The forecast scalar is Carver's (average |forecast| ≈ 10 over his data); the spans, the volatility lookback and the cap are his open-source defaults. Long-only is the course's adaptation: a negative forecast means no position, never a short. The rule reads the adjusted close — dividends are inside the price.
  </div>
  <p class="argue"><strong>Tonight's exercise:</strong> before you looked at this page you wrote three names you believed were "going up". How many are long here? The rule has no opinion about the company, the news or you — it has read 64 days of closes and divided by the noise. Where you and the rule disagree, write down why. Next week: how much a rule like this would let you hold, and where it would make you stop.</p>
  <p class="caption">Served in ${ms} ms · <a href="/screen">the Graham screen</a> · <a href="/screen/enterprising">enterprising</a> · <a href="/card">the cards</a></p>
  <footer><p class="notice">Education, not advice. A signal is what a rule says about a price series — a long is not a recommendation to buy, a flat is not a recommendation to sell. No sizing, no stops, no tickets yet: that is week 8.</p></footer>
</main></body></html>`;
}


// ---------------------------------------------------------------------------
// Week 5 pages
// ---------------------------------------------------------------------------
type ScreenPageConfig = {
  criteria: CriterionDef<string>[];
  anchor: string;          // card anchor prefix: "c" or "e"
  allPass: "survivor" | "candidate";
  title: string;
  eyebrow: string;
  lede: (screened: number) => string;
  allPassLabel: string;    // tally caption
  key: string;
  argue: string;
  notice: string;
  apiPath: string;
  otherScreen: string;     // link line to the sibling screen
};

const DEFENSIVE_PAGE: ScreenPageConfig = {
  criteria: CRITERIA, anchor: "c", allPass: "survivor",
  title: "The Graham screen",
  eyebrow: "Phase 2 · The Intelligent Investor, ch. 14 · defensive investor",
  lede: (n) => `Graham's seven tests (1972 revision), run tonight over ${n} companies' books. A screen doesn't pick shares — it decides which ones are worth reading.`,
  allPassLabel: "survivors · all tests passed",
  key: "✓ pass · ✗ fail · – not applied (financial companies skip test 2 — Graham's rule; their score is out of 6) · ? data missing.",
  argue: "<strong>Tonight's argument:</strong> pick one company that failed and one that passed. Is the screen right about both? Graham wrote these tests to <em>reject</em> — what kind of company can't pass them, and does that make it a bad investment or just not a defensive one?",
  notice: "Education, not advice. A survivor is a company worth reading about — not a recommendation to buy anything.",
  apiPath: "/api/screen/graham",
  otherScreen: `The same books, read the other way: <a href="/screen/enterprising">the enterprising investor's screen</a> — cheaper, smaller, more work (ch. 15).`,
};

const ENTERPRISING_PAGE: ScreenPageConfig = {
  criteria: ENTERPRISING, anchor: "e", allPass: "candidate",
  title: "The enterprising screen",
  eyebrow: "Phase 2 · The Intelligent Investor, ch. 15 · enterprising investor",
  lede: (n) => `Graham's winnowing for the investor willing to do the work (pp. 385–386): a multiple of nine or less first, then five tests "not so severe" — and no size test. Run tonight over ${n} companies' books.`,
  allPassLabel: "candidates · for your judgment",
  key: "✓ pass · ✗ fail · – not applied (financial companies skip test 2 — Graham wrote it \"for industrial companies\"; their score is out of 5) · ? data missing (tangible book fills as the accounts refresh).",
  argue: "<strong>Tonight's argument:</strong> Graham's candidates are not picks — from his list he expected the enterprising investor to make \"a third selection of, say, one out of five\" by judgment (p. 386). Take one candidate or near miss: what would you need to read before you'd put it in the class's paper portfolio? And why is it cheap — is the market wrong, or right?",
  notice: "Education, not advice. A candidate is a company worth reading about — the screen does the first two selections; judgment does the third. Never a recommendation to buy anything.",
  apiPath: "/api/screen/enterprising",
  otherScreen: `The defensive investor's seven tests, on the same books: <a href="/screen">the Graham screen</a> (ch. 14).`,
};

function screenPage(
  cfg: ScreenPageConfig,
  rows: (ScreenResult | EnterprisingResult)[], universe: number, screened: number, asOf: string | null, ms: number,
  smallTier: Set<string> = new Set(),
): string {
  const CRIT = cfg.criteria;
  const n = (v: string) => rows.filter((r) => r.verdict === v).length;
  const mark = (o: string) => (o === "pass" ? "✓" : o === "fail" ? "✗" : o === "skip" ? "–" : "?");
  const verdictLabel: Record<string, string> = {
    survivor: "SURVIVOR", candidate: "CANDIDATE", near_miss: "NEAR MISS", insufficient: "INCOMPLETE", fails: "",
  };
  const head = CRIT.map(
    (c) => `<th scope="col"><a href="/card#${cfg.anchor}${c.n}" title="${esc(c.title)}">${c.n}</a><span class="hs">${esc(c.short)}</span></th>`,
  ).join("");
  const res = (r: ScreenResult | EnterprisingResult) => r.results as CriterionResult<string>[];
  const body = rows.map((r) => {
    const cells = CRIT.map((c) => {
      const x = res(r).find((y) => y.id === c.id)!;
      return `<td class="m ${x.outcome}" title="${esc(c.short)}: ${esc(x.detail)}"><span aria-hidden="true">${mark(x.outcome)}</span><span class="sr">${x.outcome}: ${esc(x.detail)}</span></td>`;
    }).join("");
    const v = verdictLabel[r.verdict];
    return `<tr class="${r.verdict}">
      <th scope="row"><a href="/fundamentals/${esc(r.symbol)}">${esc(r.symbol)}</a>${smallTier.has(r.symbol) ? `<span class="st" title="Small-cap tier: prices and accounts from Alpha Vantage, EPS from SEC EDGAR">s</span>` : ""}<span class="nm">${esc(r.name ?? "")}</span><a class="ex" href="/explain/${esc(r.symbol)}">explain</a></th>
      ${cells}
      <td class="p">${r.passes}/${r.applicable}</td>
      <td class="v">${v ? `<span class="tag ${r.verdict}">${v}</span>` : ""}</td>
    </tr>`;
  }).join("");

  // Footer: how many companies each test rejected — the column tally that
  // used to be counted by hand off a screenshot (14 Oct 2026).
  const failCells = CRIT.map((c) => {
    const outcomes = rows.map((r) => res(r).find((y) => y.id === c.id)!.outcome);
    const fails = outcomes.filter((o) => o === "fail").length;
    const applicable = outcomes.filter((o) => o === "pass" || o === "fail").length;
    return `<td class="m" title="${esc(c.short)}: ${fails} of ${applicable} companies with data fail this test"><b>${fails}</b><span class="hs">of ${applicable}</span></td>`;
  }).join("");
  const foot = rows.length
    ? `<tfoot><tr><th scope="row">Fail this test</th>${failCells}<td></td><td></td></tr></tfoot>`
    : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(cfg.title)}</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  main { max-width: 52rem; }
  .lede { color:var(--faint); font-size:.95rem; margin:.3rem 0 1.2rem; }
  .tally { display:flex; flex-wrap:wrap; gap:.6rem; margin-bottom:1.2rem; }
  .tally div { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:.5rem .8rem; min-width:7rem; }
  .tally b { font-family:"Libre Caslon Text",serif; font-size:1.6rem; display:block; line-height:1.1; }
  .tally span { font-family:"IBM Plex Mono",monospace; font-size:.68rem; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); }
  .tally .sv b { color:var(--entry); }
  .wrap { overflow-x:auto; border:1px solid var(--rule); border-radius:6px; background:rgba(255,255,255,.45); }
  table { border-collapse:collapse; width:100%; font-size:.85rem; }
  th, td { padding:.4rem .45rem; border-bottom:1px solid var(--rule); text-align:center; }
  thead th { font-family:"IBM Plex Mono",monospace; font-weight:500; font-size:.75rem; color:var(--faint); vertical-align:bottom; }
  thead th a { color:var(--ink); text-decoration:none; font-weight:600; display:block; }
  .hs { display:block; font-size:.6rem; letter-spacing:.04em; }
  tbody th { text-align:left; font-weight:600; white-space:nowrap; font-family:"IBM Plex Mono",monospace; }
  .nm { display:block; font-family:"IBM Plex Sans",sans-serif; font-weight:400; font-size:.72rem; color:var(--faint); max-width:11rem; overflow:hidden; text-overflow:ellipsis; }
  .st { display:inline-block; margin-left:.35rem; font-family:"IBM Plex Mono",monospace; font-weight:400; font-size:.6rem; line-height:1; color:var(--stamp); border:1px solid var(--stamp); border-radius:3px; padding:.1rem .25rem; vertical-align:middle; cursor:help; }
  .ex { display:block; font-family:"IBM Plex Mono",monospace; font-weight:400; font-size:.6rem; letter-spacing:.06em; text-transform:uppercase; color:var(--entry); text-decoration:none; }
  .ex:hover { text-decoration:underline; }
  td.m { font-family:"IBM Plex Mono",monospace; font-size:1rem; width:2.4rem; }
  td.pass { color:var(--entry); } td.fail { color:var(--stamp); } td.na, td.skip { color:var(--faint); }
  td.p { font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  tr.survivor, tr.candidate { background:rgba(62,107,84,.10); }
  tbody th, thead th:first-child, tfoot th { position:sticky; left:0; background:#F6F8F4; z-index:1; }
  tfoot th { text-align:left; font-family:"IBM Plex Mono",monospace; font-size:.72rem; letter-spacing:.06em; text-transform:uppercase; color:var(--faint); }
  tfoot td { border-top:2px solid var(--ink); text-align:center; }
  tfoot td b { font-family:"Libre Caslon Text",serif; font-size:1.05rem; color:var(--stamp); display:block; line-height:1.1; }
  tfoot .hs { font-family:"IBM Plex Mono",monospace; font-size:.6rem; color:var(--faint); white-space:nowrap; }
  tr.survivor th, tr.candidate th { background:#E3EBE5; }
  .tag { font-family:"IBM Plex Mono",monospace; font-size:.62rem; letter-spacing:.1em; border:1.4px solid; border-radius:3px; padding:.1rem .35rem; white-space:nowrap; }
  .tag.survivor, .tag.candidate { color:var(--entry); border-color:var(--entry); }
  .other { margin-top:.9rem; font-size:.88rem; }
  .tag.near_miss { color:var(--ink); border-color:var(--faint); }
  .tag.insufficient { color:var(--faint); border-color:var(--rule); }
  .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  .key, .caption { font-size:.8rem; color:var(--faint); margin-top:.7rem; line-height:1.5; }
  .argue { margin-top:1.4rem; border-left:3px solid var(--stamp); padding:.2rem 0 .2rem .9rem; font-size:.92rem; }
</style></head>
<body><main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">${esc(cfg.eyebrow)}</p>
  <h1>${esc(cfg.title)}</h1>
  <p class="lede">${esc(cfg.lede(screened))}</p>
  <div class="tally">
    <div class="sv"><b>${n(cfg.allPass)}</b><span>${esc(cfg.allPassLabel)}</span></div>
    <div><b>${n("near_miss")}</b><span>near misses · one fail</span></div>
    <div><b>${n("fails")}</b><span>fail two or more</span></div>
    <div><b>${n("insufficient")}</b><span>incomplete data</span></div>
  </div>
  <div class="wrap"><table>
    <thead><tr><th scope="col" style="text-align:left">Company</th>${head}<th scope="col">Score</th><th scope="col"></th></tr></thead>
    <tbody>${body || `<tr><td colspan="${CRIT.length + 3}">No company has cached accounts yet — the nightly refresh fills the books over three nights.</td></tr>`}</tbody>
    ${foot}
  </table></div>
  <p class="key">${esc(cfg.key)} Hover or tap a mark for the numbers. Column numbers link to the <a href="/card${cfg.anchor === "e" ? "#enterprising" : ""}">checklist card</a>, which prints from the same rules this screen runs. Universe ${universe}; ${screened} with books.</p>
  <p class="caption">Prices to ${esc(asOf ?? "—")} · accounts to the latest fiscal year held · served from the nightly cache in ${ms}&nbsp;ms · <a href="${cfg.apiPath}">raw JSON</a></p>
  <p class="other">${cfg.otherScreen}</p>
  <p class="argue">${cfg.argue}</p>
  <footer><p class="notice">${esc(cfg.notice)}</p></footer>
</main></body></html>`;
}

function cardPage(): string {
  const li = (anchor: string, c: CriterionDef<string>, quoteAll = false) => `
    <li id="${anchor}${c.n}">
      <span class="num">${c.n}</span>
      <div><p class="t">${esc(c.title)}${c.adapted ? ` <span class="ad">adapted</span>` : ""}</p>
      <p class="rule">${esc(c.ours)}</p>
      <p class="why">${esc(c.why)}</p>
      ${c.adapted ? `<p class="orig">Graham's original: ${esc(c.graham)}</p>` : quoteAll ? `<p class="orig">Graham: ${esc(c.graham)}</p>` : ""}</div>
    </li>`;
  const rows = CRITERIA.map((c) => li("c", c)).join("");
  const erows = ENTERPRISING.map((c) => li("e", c, true)).join("");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Graham checklist card</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  main { max-width: 40rem; }
  .card { background:#fff; border:1.5px solid var(--ink); border-radius:8px; padding:1.4rem 1.5rem 1.1rem; margin-top:1rem; }
  .card h1 { font-size:1.7rem; margin:0; }
  .sub { font-size:.82rem; color:var(--faint); margin:.25rem 0 1rem; }
  ol { list-style:none; padding:0; margin:0; }
  li { display:grid; grid-template-columns:2rem 1fr; gap:.6rem; padding:.6rem 0; border-top:1px solid var(--rule); }
  .num { font-family:"Libre Caslon Text",serif; font-weight:700; font-size:1.4rem; color:var(--entry); line-height:1.1; }
  .t { font-weight:600; }
  .ad { font-family:"IBM Plex Mono",monospace; font-size:.6rem; letter-spacing:.08em; text-transform:uppercase; color:var(--stamp); border:1px solid var(--stamp); border-radius:3px; padding:0 .3rem; vertical-align:middle; }
  .rule { font-family:"IBM Plex Mono",monospace; font-size:.8rem; margin-top:.15rem; }
  .why { font-size:.82rem; color:var(--faint); font-style:italic; }
  .orig { font-size:.74rem; color:var(--faint); margin-top:.15rem; }
  .foot { font-size:.72rem; color:var(--faint); border-top:2px solid var(--ink); margin-top:.6rem; padding-top:.6rem; line-height:1.5; }
  .print { margin-top:1rem; font-size:.85rem; }
  @media print {
    body { background:#fff; padding:0; } .back, .print, footer { display:none; }
    .card { border-width:1px; } a { color:inherit; text-decoration:none; }
    .page2 { break-before:page; }
  }
</style></head>
<body><main>
  <p class="back"><a href="/screen">&larr; the Graham screen</a></p>
  <div class="card">
    <h1>The Graham Checklist</h1>
    <p class="sub">The defensive investor's seven tests · Benjamin Graham, <em>The Intelligent Investor</em>, ch. 14 (course copy p. 347)</p>
    <ol>${rows}</ol>
    <p class="foot">All seven must pass. A company that passes is worth <em>reading about</em> — the screen narrows the list; it never makes the decision. Rules marked <strong>adapted</strong> follow Graham's intent where free data is shorter than his windows. Printed from the same rules the course toolkit runs (src/lib/graham.ts), so the card and the screen cannot disagree. Education, not advice.</p>
  </div>
  <div class="card page2" id="enterprising">
    <h1>The Enterprising Checklist</h1>
    <p class="sub">For the investor willing to do the work · Graham, <em>The Intelligent Investor</em>, ch. 15, pp. 385–386 · <a href="/screen/enterprising">run it</a></p>
    <ol>${erows}</ol>
    <p class="foot">Graham's order: the low multiplier first, then the five tests. <strong>No size test</strong> — "small companies may afford enough safety if bought carefully and on a group basis" (p. 386). The difference from the defensive investor is effort, not nerve: "willingness to devote time and care" (p. 6). Passing all six makes a company a <em>candidate</em>: Graham expected the enterprising investor to make "a third selection of, say, one out of five" by judgment. Financial companies skip test 2. Printed from the same rules the toolkit runs. Education, not advice.</p>
  </div>
  <p class="print">Two cards, one per printed page: the defensive investor's, then the enterprising investor's. Print this page for the takeaway kit (your browser's Print → Save as PDF works too).</p>
  <footer><p class="notice">Education, not advice.</p></footer>
</main></body></html>`;
}

// ---------------------------------------------------------------------------
// Week 6: "explain this stock" — numbers into narrative, with the receipts.
// ---------------------------------------------------------------------------

type ExplainMeta = {
  source: "claude" | "template";
  model: string | null;
  cached: boolean;
  generated_at: string | null;
  tokens: { input: number; output: number } | null;
  ms: number | null;
  /** Why the plain version is showing instead of the AI's. */
  fallback_reason: string | null;
  daily_cap: number;
};
type Explanation = {
  ticker: string;
  sheet: FactSheet;
  narrative: Narrative;
  grounding: Grounding;
  meta: ExplainMeta;
};

const DAILY_CAP_DEFAULT = 60;

async function explainCompany(env: Env, ticker: string, plainOnly: boolean): Promise<
  { ok: true; value: Explanation } | { ok: false; status: 404; error: string }
> {
  const f = await loadFundamentals(env, ticker);
  const m = f.ticker_meta;
  if (!m) return { ok: false, status: 404, error: `"${ticker}" is not in the course universe (see /api/universe).` };
  if (f.years.length === 0) {
    return {
      ok: false, status: 404,
      error: m.status === "blocked"
        ? `"${ticker}" is outside the free data plan — no accounts are cached.`
        : `"${ticker}" has no cached accounts yet — the nightly refresh reaches every company within a few nights.`,
    };
  }
  const paid = f.divRows.filter((d) => typeof d.amount === "number" && d.amount > 0).map((d) => d.ex_date).sort();
  const now = new Date();
  const input: ScreenInput = {
    symbol: ticker, name: m.name, sector: m.sector,
    years: f.years,
    dividendsPerYear: f.dividends.perYear,
    exDates: paid,
    lastExDate: paid.length ? paid[paid.length - 1] : null,
    lastClose: f.close?.adj_close ?? null,
    currentYear: now.getUTCFullYear(),
    today: now.toISOString().slice(0, 10),
  };
  const sheet = buildFactSheet(input, f.close?.date ?? null);
  const cap = Math.max(0, parseInt(env.EXPLAIN_DAILY_CAP ?? "", 10) || DAILY_CAP_DEFAULT);
  const model = env.EXPLAIN_MODEL || DEFAULT_MODEL;

  let narrative: Narrative | null = null;
  let grounding: Grounding | null = null;
  const meta: ExplainMeta = {
    source: "template", model: null, cached: false, generated_at: null, tokens: null, ms: null,
    fallback_reason: null, daily_cap: cap,
  };

  const log = async (outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare(
        "INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)",
      ).bind(new Date().toISOString(), ticker, outcome, rows, detail.slice(0, 300)).run();
    } catch { /* logging must never break the page */ }
  };

  if (plainOnly) {
    meta.fallback_reason = "plain version requested";
  } else {
    // 1) cached for this exact sheet?
    const row = await env.DB.prepare(
      "SELECT source, model, created_at, narrative, grounding, input_tokens, output_tokens, ms FROM explanations WHERE symbol = ?1 AND facts_hash = ?2",
    ).bind(ticker, sheet.hash).first<{
      source: string; model: string | null; created_at: string; narrative: string; grounding: string | null;
      input_tokens: number | null; output_tokens: number | null; ms: number | null;
    }>();
    if (row && row.source === "claude") {
      narrative = { ...(JSON.parse(row.narrative) as { paragraphs: Narrative["paragraphs"]; question: string }), source: "claude", model: row.model ?? undefined };
      grounding = row.grounding ? (JSON.parse(row.grounding) as Grounding) : checkGrounding(narrative, sheet);
      Object.assign(meta, {
        source: "claude", model: row.model, cached: true, generated_at: row.created_at,
        tokens: { input: row.input_tokens ?? 0, output: row.output_tokens ?? 0 }, ms: row.ms,
      });
    } else if (row && row.source === "rejected") {
      meta.fallback_reason = "the AI's answer for this data was rejected by the course's checks (advice-shaped language); the plain version is shown";
    } else if (!env.ANTHROPIC_API_KEY) {
      meta.fallback_reason = "no AI key is configured on this deployment";
    } else {
      // 2) budget: generations in the last 24 hours
      const since = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();
      const used = await env.DB.prepare(
        "SELECT COUNT(*) AS n FROM explanations WHERE source IN ('claude','rejected') AND created_at >= ?1",
      ).bind(since).first<{ n: number }>();
      if ((used?.n ?? 0) >= cap) {
        meta.fallback_reason = `today's narrative budget (${cap}) is spent; the plain version is shown until it resets`;
        await log("explain_capped", 0, `cap ${cap} reached`);
      } else {
        // 3) ask Claude, check the answer, keep the receipt
        const r = await claudeNarrative(sheet, { apiKey: env.ANTHROPIC_API_KEY, model, apiUrl: env.EXPLAIN_API_URL || undefined });
        if (!r.ok) {
          meta.fallback_reason = `the AI call failed (${r.reason}); the plain version is shown`;
          await log("explain_error", 0, r.reason);
        } else {
          const g = checkGrounding(r.narrative, sheet);
          const rejected = g.recommendationLanguage.length > 0;
          const createdAt = new Date().toISOString();
          try {
            await env.DB.prepare(
              `INSERT OR REPLACE INTO explanations (symbol, facts_hash, source, model, created_at, narrative, grounding, input_tokens, output_tokens, ms)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`,
            ).bind(
              ticker, sheet.hash, rejected ? "rejected" : "claude", model, createdAt,
              JSON.stringify({ paragraphs: r.narrative.paragraphs, question: r.narrative.question }),
              JSON.stringify(g), r.usage.input, r.usage.output, r.ms,
            ).run();
          } catch { /* the cache is a convenience; the page still renders */ }
          if (rejected) {
            meta.fallback_reason = `the AI's answer was rejected by the course's checks (advice-shaped language: "${g.recommendationLanguage[0]}"); the plain version is shown`;
            await log("explain_rejected", 1, `${model} ${r.usage.input}/${r.usage.output} tokens ${r.ms} ms — ${g.recommendationLanguage.join("; ")}`);
          } else {
            narrative = r.narrative;
            grounding = g;
            Object.assign(meta, { source: "claude", model, cached: false, generated_at: createdAt, tokens: r.usage, ms: r.ms });
            await log("explain_ok", 1, `${model} ${r.usage.input}/${r.usage.output} tokens ${r.ms} ms${g.clean ? "" : " — flagged: " + [...g.unsupportedNumbers.map((u) => "numbers " + u.numbers.join(",")), ...g.unknownFacts.map((u) => "facts " + u.ids.join(","))].join("; ")}`);
          }
        }
      }
    }
  }

  if (!narrative) {
    narrative = templateNarrative(sheet);
    grounding = checkGrounding(narrative, sheet);
    meta.source = "template";
  }
  return { ok: true, value: { ticker, sheet, narrative, grounding: grounding!, meta } };
}

app.get("/api/explain/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.json({ error: "That doesn't look like a ticker symbol." }, 400);
  const t0 = Date.now();
  const r = await explainCompany(c.env, ticker, c.req.query("plain") === "1");
  if (!r.ok) return c.json({ ticker, error: r.error }, r.status);
  return c.json({
    ...r.value,
    meta: {
      ...r.value.meta,
      source_note: "The fact sheet is computed from the cached books and the two screens. The narrative may say only what is on the sheet; grounding lists anything it said that is not.",
      served_in_ms: Date.now() - t0,
      note: "Education, not advice. An explanation is a reading of the accounts, never a recommendation.",
    },
  });
});

app.get("/explain/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.text("Not a ticker symbol.", 400);
  const t0 = Date.now();
  const r = await explainCompany(c.env, ticker, c.req.query("plain") === "1");
  if (!r.ok) return c.html(explainEmptyPage(ticker, r.error), r.status);
  return c.html(explainPage(r.value, Date.now() - t0));
});

function explainEmptyPage(ticker: string, reason: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(ticker)} — explain this stock</title>${FONTS_HTML}<style>${PAGE_CSS}</style></head>
<body><main><p class="back"><a href="/screen">&larr; the Graham screen</a></p>
<p class="eyebrow">Phase 2 · week 6 · numbers into narrative</p><h1>${esc(ticker)}</h1>
<p style="margin:1rem 0">${esc(reason)}</p>
<footer><p class="notice">Education, not advice.</p></footer></main></body></html>`;
}

function explainPage(x: Explanation, ms: number): string {
  const { sheet: s, narrative: n, grounding: g, meta } = x;
  const name = s.name ?? s.symbol;
  const T = esc(s.symbol);
  const vLabel: Record<string, string> = { survivor: "SURVIVOR", candidate: "CANDIDATE", near_miss: "NEAR MISS", fails: "FAILS", insufficient: "INCOMPLETE" };
  const chip = (label: string, v: string, p: number, a: number) =>
    `<span class="vchip ${v}"><b>${esc(label)}</b> ${vLabel[v]} · ${p}/${a}</span>`;
  const flagsFor = (i: number) => {
    const un = g.unsupportedNumbers.find((u) => u.paragraph === i + 1);
    const uf = g.unknownFacts.find((u) => u.paragraph === i + 1);
    const bits: string[] = [];
    if (un) bits.push(`number${un.numbers.length > 1 ? "s" : ""} not on the sheet: ${un.numbers.map(esc).join(", ")}`);
    if (uf) bits.push(`cites unknown fact${uf.ids.length > 1 ? "s" : ""}: ${uf.ids.map(esc).join(", ")}`);
    return bits.length ? `<span class="flag" title="The course's grounding check">⚠ ${bits.join(" · ")}</span>` : "";
  };
  const paras = n.paragraphs.map((p, i) => `
    <p class="para">${esc(p.text)} <span class="refs">${p.facts.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join(" ")}</span>${flagsFor(i)}</p>`).join("");
  const sourceLine = meta.source === "claude"
    ? `Written by Claude (<code>${esc(meta.model ?? "")}</code>)${meta.generated_at ? ` on ${esc(meta.generated_at.slice(0, 16).replace("T", " "))} UTC` : ""}${meta.cached ? " · served from the cache" : " · fresh"}${meta.tokens ? ` · ${meta.tokens.input} tokens in, ${meta.tokens.output} out` : ""}${meta.ms ? ` · ${meta.ms} ms` : ""}. ${g.clean ? "Every number traced to the sheet; no advice-shaped language." : "The grounding check raised a flag — see the marked paragraph."} <a href="/explain/${T}?plain=1">Read the plain version instead.</a>`
    : `The plain version — the course's own sentences, assembled from the sheet.${meta.fallback_reason ? ` Why: ${esc(meta.fallback_reason)}.` : ""}${meta.fallback_reason === "plain version requested" ? ` <a href="/explain/${T}">Read the AI's version.</a>` : ""}`;
  const facts = s.facts.map((f) => `<li id="${esc(f.id)}"><span class="fid">${esc(f.id)}</span><span class="via ${f.via}">${f.via}</span> ${esc(f.text)}</li>`).join("");
  const bars = s.bars.length
    ? `<table class="bars"><thead><tr><th>Screen</th><th>Test</th><th>Today</th><th>Passes…</th><th>What moves it</th></tr></thead><tbody>${
        s.bars.map((b) => `<tr id="${esc(b.id)}"><td>${b.screen}</td><td>${esc(b.test)}</td><td class="num">${esc(b.today)}</td><td>${esc(b.bar)}</td><td class="mv ${b.moves}">${b.moves === "price" ? "the price" : "the company"}</td></tr>`).join("")
      }</tbody></table>
      <p class="small">A bar is where Graham's test sits at today's figures. It is arithmetic on a threshold — not an estimate of what the share is worth, and not a target.</p>`
    : `<p class="small">Nothing to change: every applicable test passes.</p>`;
  const kinds = s.kinds.length
    ? `<ul class="kinds">${s.kinds.map((k) => `<li><b>${esc(k.label)}</b> — ${esc(k.meaning)} <span class="gr">${esc(k.graham)}</span> <span class="refs">${k.facts.map((id) => `<a href="#${esc(id)}">${esc(id)}</a>`).join(" ")}</span></li>`).join("")}</ul>`
    : `<p class="small">No fail kinds: this company passes every applicable test on both screens.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — explain this stock</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  main { max-width: 46rem; }
  .sym { font-family:"IBM Plex Mono",monospace; font-size:1.1rem; color:var(--faint); font-weight:400; margin-left:.4rem; }
  .asof { color:var(--faint); font-size:.9rem; margin:.3rem 0 .8rem; }
  .chips { display:flex; flex-wrap:wrap; gap:.5rem; margin-bottom:1.4rem; }
  .vchip { font-family:"IBM Plex Mono",monospace; font-size:.72rem; letter-spacing:.06em; border:1.4px solid var(--rule); border-radius:4px; padding:.25rem .55rem; color:var(--ink); background:rgba(255,255,255,.55); }
  .vchip b { font-weight:600; color:var(--faint); margin-right:.3rem; }
  .vchip.survivor, .vchip.candidate { border-color:var(--entry); color:var(--entry); }
  .vchip.fails { border-color:var(--stamp); }
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.25rem; margin:1.6rem 0 .5rem; }
  .story { background:#fff; border:1.5px solid var(--ink); border-radius:8px; padding:1.2rem 1.4rem .9rem; }
  .para { font-family:"Libre Caslon Text",serif; font-size:1.05rem; line-height:1.6; margin-bottom:.9rem; }
  .refs a { font-family:"IBM Plex Mono",monospace; font-size:.66rem; color:var(--entry); text-decoration:none; border:1px solid var(--rule); border-radius:3px; padding:0 .25rem; margin-left:.1rem; vertical-align:middle; }
  .flag { display:block; font-family:"IBM Plex Mono",monospace; font-size:.7rem; color:var(--stamp); margin-top:.2rem; }
  .question { border-left:3px solid var(--stamp); padding:.2rem 0 .2rem .9rem; font-size:1rem; margin:1rem 0 0; }
  .source { font-size:.78rem; color:var(--faint); margin-top:.9rem; line-height:1.5; }
  .source code { font-family:"IBM Plex Mono",monospace; }
  ol.facts { padding-left:0; list-style:none; font-size:.86rem; line-height:1.5; }
  ol.facts li { padding:.35rem 0; border-bottom:1px solid var(--rule); }
  .fid { font-family:"IBM Plex Mono",monospace; font-weight:600; color:var(--entry); margin-right:.4rem; }
  .via { font-family:"IBM Plex Mono",monospace; font-size:.58rem; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); border:1px solid var(--rule); border-radius:3px; padding:0 .3rem; margin-right:.4rem; vertical-align:middle; }
  table.bars { border-collapse:collapse; width:100%; font-size:.84rem; background:rgba(255,255,255,.5); border:1px solid var(--rule); border-radius:6px; }
  table.bars th, table.bars td { padding:.4rem .5rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:top; }
  table.bars th { font-family:"IBM Plex Mono",monospace; font-weight:500; font-size:.7rem; color:var(--faint); text-transform:uppercase; letter-spacing:.06em; }
  td.num { font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  td.mv.price { color:var(--stamp); } td.mv.company { color:var(--entry); }
  ul.kinds { padding-left:1.1rem; font-size:.9rem; line-height:1.55; }
  ul.kinds li { margin-bottom:.6rem; }
  .gr { font-family:"IBM Plex Mono",monospace; font-size:.68rem; color:var(--faint); }
  .small { font-size:.8rem; color:var(--faint); margin-top:.5rem; line-height:1.5; }
  .links { font-size:.8rem; color:var(--faint); margin-top:1.2rem; }
  .argue { margin-top:1.4rem; border-left:3px solid var(--entry); padding:.2rem 0 .2rem .9rem; font-size:.92rem; }
</style></head>
<body><main>
  <p class="back"><a href="/screen">&larr; the Graham screen</a></p>
  <p class="eyebrow">Phase 2 · week 6 · numbers into narrative</p>
  <h1>${esc(name)}<span class="sym">${T}</span></h1>
  <p class="asof">${s.asOf.close !== null ? `Last close <b>${s.asOf.close >= 100 ? s.asOf.close.toFixed(0) : s.asOf.close.toFixed(2)}</b> (${esc(s.asOf.priceDate ?? "—")})` : "No cached price"} · accounts to FY ${esc(s.asOf.fiscalYear ?? "—")} · <a href="/fundamentals/${T}">the books</a></p>
  <div class="chips">${chip("Defensive", s.defensive.verdict, s.defensive.passes, s.defensive.applicable)}${chip("Enterprising", s.enterprising.verdict, s.enterprising.passes, s.enterprising.applicable)}</div>

  <h2>The story</h2>
  <div class="story">
    ${paras}
    <p class="question"><strong>The open question:</strong> ${esc(n.question)}</p>
  </div>
  <p class="source">${sourceLine}</p>

  <p class="argue"><strong>Check the story.</strong> Every sentence above should rest on a numbered fact below; the small tags say which. Find one that doesn't — a number from nowhere, a claim the sheet can't support — and say so. That is tonight's exercise, and it is the habit for every story you will ever be told about a share.${g.unsupportedNumbers.length || g.unknownFacts.length ? ` <strong>A ⚠ under a paragraph is the toolkit's own catch:</strong> a figure that is on no fact, or a fact tag that does not exist. The paragraph is shown, not hidden — the catch is yours to confirm.` : ""} The toolkit refuses a story only for advice-shaped language; a wrong <em>word</em> it cannot see.</p>

  <h2>The fact sheet</h2>
  <ol class="facts">${facts}</ol>

  <h2>What would have to change</h2>
  ${bars}

  <h2>What kind of ✗</h2>
  ${kinds}

  <p class="links">Served in ${ms}&nbsp;ms · <a href="/api/explain/${T}">raw JSON</a> · <a href="/screen">defensive screen</a> · <a href="/screen/enterprising">enterprising screen</a> · <a href="/card">the cards</a></p>
  <footer><p class="notice">Education, not advice. An explanation is a reading of the accounts — never a recommendation to buy or sell anything.</p></footer>
</main></body></html>`;
}

app.notFound((c) =>
  c.json(
    { error: "Not found", hint: "Try /, /screen, /screen/enterprising, /explain/AAPL, /card, /api/universe, /prices/AAPL, or /fundamentals/AAPL" },
    404,
  ),
);

// ---------------------------------------------------------------------------
// Shared page chrome (ledger identity)
// ---------------------------------------------------------------------------
const PAGE_CSS = `
  :root { --paper:#EEF2E9; --ink:#182620; --rule:#B7C6D4; --entry:#3E6B54; --stamp:#B4382E; --faint:#6B7A72; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--paper); color: var(--ink); font-family: "IBM Plex Sans", system-ui, sans-serif; line-height: 1.55; padding: 2.5rem 1.25rem 4rem; }
  main { max-width: 46rem; margin: 0 auto; position: relative; }
  .eyebrow { font-family:"IBM Plex Mono",monospace; font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
  h1 { font-family:"Libre Caslon Text",serif; font-weight:700; font-size:clamp(1.6rem,5vw,2.4rem); line-height:1.1; margin:.4rem 0 .2rem; }
  .back { font-size:.85rem; margin-bottom:1rem; }
  .back a, a { color: var(--entry); }
  footer { margin-top:2.5rem; padding-top:1rem; border-top:2px solid var(--ink); font-size:.8rem; color:var(--faint); }
  footer .notice { color:var(--stamp); font-weight:600; }
  a:focus-visible { outline:2px solid var(--entry); outline-offset:2px; }
`;
const FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ---------------------------------------------------------------------------
// Week 4 page
// ---------------------------------------------------------------------------
function fundamentalsPage(
  ticker: string,
  name: string | null,
  status: string | null,
  years: FundamentalsYear[],
  r: Ratios,
  divs: { yearsPaid: number; perYear: Record<string, number> },
  close: { date: string; adj_close: number } | null,
  sector: string | null = null,
  sources: { tier: string; prices: string; accounts: string; eps: string } | null = null,
): string {
  const T = esc(ticker);
  // Same rule as the screen (graham.ts): test 2 is not applied to financial
  // companies, so the books page must not show it as a fail (16 Oct 2026).
  const financial = sector === "Financial Services";
  const fmtB = (v: number | null) => {
    if (v === null || !Number.isFinite(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + "bn";
    if (a >= 1e6) return (v / 1e6).toFixed(0) + "m";
    return String(Math.round(v));
  };
  const fmt = (v: number | null, suffix = "") =>
    v === null || !Number.isFinite(v) ? "—" : `${v}${suffix}`;

  let body: string;
  if (years.length === 0) {
    const reason =
      status === "blocked"
        ? "This symbol is outside the free data plan, so no accounts are cached for it."
        : status
          ? "No cached accounts yet — the nightly refresh opens a few companies' books per night and covers the whole universe within about three nights."
          : `Not in the course universe — see <a href="/api/universe">/api/universe</a>.`;
    body = `<p class="empty">${reason}</p>`;
  } else {
    const verdict = (okTest: boolean | null, label: string) =>
      okTest === null
        ? `<span class="chip na">no data</span>`
        : okTest
          ? `<span class="chip pass">${label}</span>`
          : `<span class="chip fail">${label}</span>`;

    const cards = [
      {
        k: "Current ratio", v: fmt(r.currentRatio),
        gloss: financial
          ? "Current assets ÷ current liabilities. Not applied to banks and other financial companies: Graham wrote this test for industrial companies (ch. 14)."
          : "Can it pay this year's bills? Current assets ÷ current liabilities.",
        chip: financial
          ? `<span class="chip na">not applied to financials</span>`
          : verdict(r.raw.currentRatio === null ? null : r.raw.currentRatio >= GT.minCurrentRatio, `Graham bar: ≥ ${GT.minCurrentRatio}`),
      },
      {
        k: "P/E (3-yr avg)", v: fmt(r.pe3),
        gloss: `Years of average recent earnings you pay for the share — Graham's basis. On the latest year alone: ${fmt(r.pe)}.`,
        chip: verdict(r.raw.pe3 === null ? null : r.raw.pe3 <= GT.maxPe, `Graham bar: ≤ ${GT.maxPe}`),
      },
      {
        k: "P/B", v: r.bookValuePerShare !== null && r.bookValuePerShare <= 0 ? "neg. book" : fmt(r.pb),
        gloss: r.bookValuePerShare !== null && r.bookValuePerShare <= 0
          ? "Book value is negative — buybacks or losses have used up the equity. No multiple of assets supports the price."
          : "Price against the book value behind each share.",
        chip: r.bookValuePerShare !== null && r.bookValuePerShare <= 0
          ? verdict(false, "Graham bar: ≤ 1.5")
          : verdict(r.raw.pb === null ? null : r.raw.pb <= GT.maxPb, `Graham bar: ≤ ${GT.maxPb}`),
      },
      {
        k: "P/E × P/B", v: fmt(r.peTimesPb),
        gloss: r.raw.pb !== null && r.raw.pb <= GT.maxPb
          ? "Graham's combined test, on the 3-year P/E. Only needed when P/B is above 1.5 — this company's P/B already meets his bar, so test 7 passes either way."
          : "Graham's combined test, on the 3-year P/E. Test 7 passes if P/B ≤ 1.5 OR this product ≤ 22.5.",
        chip: verdict(r.raw.peTimesPb === null ? null : r.raw.peTimesPb <= GT.maxPeTimesPb, `Graham bar: ≤ ${GT.maxPeTimesPb}`),
      },
    ];
    const cardHtml = cards
      .map(
        (cd) => `<div class="card"><p class="k">${cd.k}</p><p class="v">${cd.v}</p>${cd.chip}<p class="gloss">${cd.gloss}</p></div>`,
      )
      .join("");

    const rowsAsc = [...years].reverse(); // oldest → newest across the table
    const th = rowsAsc.map((y) => `<th>${esc(y.fiscalYear)}</th>`).join("");
    const line = (label: string, get: (y: FundamentalsYear) => number | null, money = true) =>
      `<tr><td class="lbl">${label}</td>${rowsAsc
        .map((y) => `<td>${money ? fmtB(get(y)) : fmt(get(y))}</td>`)
        .join("")}</tr>`;
    const divRow = `<tr><td class="lbl">Dividends/share</td>${rowsAsc
      .map((y) => {
        const v = divs.perYear[y.fiscalYear];
        return `<td>${v !== undefined ? v.toFixed(2) : "—"}</td>`;
      })
      .join("")}</tr>`;

    body = `
  <p class="figures">${close ? `Last close <span class="mono">${close.adj_close >= 100 ? close.adj_close.toFixed(0) : close.adj_close.toFixed(2)}</span> (${close.date})` : "No cached price yet"} · accounts to FY ${esc(r.asOfYear ?? "—")}${sources?.tier === "small" ? ` · <span class="tiertag">small-cap tier</span>` : ""}</p>
  ${sources ? `<p class="sources"><b>Where these figures come from.</b> Prices: ${esc(sources.prices)}. Accounts: ${esc(sources.accounts)}. EPS: ${esc(sources.eps)}.${years[0]?.readings ? ` <b>Readings for FY ${esc(years[0].fiscalYear)}:</b> ${esc(years[0].readings)} — a pass that rests on a reading says so in the test's hover.` : ""}</p>` : ""}
  <div class="cards">${cardHtml}</div>

  <h2>Five years, four lines</h2>
  <p class="sub">The whole income statement and balance sheet, reduced to what a defensive investor reads first. Figures in company reporting currency.</p>
  <table>
    <thead><tr><td></td>${th}</tr></thead>
    <tbody>
      ${line("Revenue", (y) => y.revenue)}
      ${line("Net income", (y) => y.netIncome)}
      ${line("EPS (diluted)", (y) => y.epsDiluted, false)}
      ${line("Equity (book)", (y) => y.equity)}
      ${divRow}
    </tbody>
  </table>
  <p class="smallprint">Earnings positive in ${r.epsPositiveYears} of ${r.epsYearsAvailable} available years · EPS growth across the window: ${fmt(r.epsGrowthPct, "%")} · dividends paid in ${divs.yearsPaid} calendar years of the record.
  Free data serves 5 fiscal years; Graham asked for 10 — week 5's checklist adapts openly.</p>
  <p class="ranges"><a href="/explain/${T}">explain this stock</a> · <a href="/prices/${T}">price history</a> · <a href="/api/fundamentals/${T}">raw JSON</a> · <a href="/screen">the Graham screen</a></p>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T} — the books</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  .figures { font-size:.95rem; color:var(--faint); margin:.4rem 0 1rem; }
  .sources { font-size:.8rem; color:var(--faint); line-height:1.5; margin:-.4rem 0 1rem; }
  .tiertag { font-family:"IBM Plex Mono",monospace; font-size:.7rem; letter-spacing:.06em; text-transform:uppercase; color:var(--stamp); border:1px solid var(--stamp); padding:.05rem .35rem; border-radius:3px; }
  .mono { font-family:"IBM Plex Mono",monospace; color:var(--ink); font-weight:500; }
  .cards { display:grid; grid-template-columns:repeat(auto-fit,minmax(10.2rem,1fr)); gap:.6rem; margin-bottom:1.6rem; }
  .card { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding: .7rem .8rem; }
  .card .k { font-family:"IBM Plex Mono",monospace; font-size:.7rem; letter-spacing:.08em; text-transform:uppercase; color:var(--faint); }
  .card .v { font-family:"Libre Caslon Text",serif; font-size:1.7rem; font-weight:700; margin:.1rem 0 .25rem; }
  .chip { font-family:"IBM Plex Mono",monospace; font-size:.62rem; letter-spacing:.06em; border:1.2px solid; border-radius:3px; padding:.08rem .35rem; }
  .chip.pass { color:var(--entry); border-color:var(--entry); }
  .chip.fail { color:var(--stamp); border-color:var(--stamp); }
  .chip.na   { color:var(--faint); border-color:var(--rule); }
  .card .gloss { font-size:.74rem; color:var(--faint); margin-top:.35rem; line-height:1.35; }
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.25rem; margin:.2rem 0 .2rem; }
  .sub { font-size:.82rem; color:var(--faint); margin-bottom:.6rem; }
  table { border-collapse:collapse; width:100%; font-family:"IBM Plex Mono",monospace; font-size:.82rem; background:rgba(255,255,255,.45); border:1px solid var(--rule); border-radius:6px; }
  th, td { padding:.4rem .55rem; text-align:right; border-bottom:1px solid var(--rule); font-weight:400; }
  th { color:var(--faint); }
  td.lbl { text-align:left; font-family:"IBM Plex Sans",sans-serif; color:var(--ink); }
  .smallprint { font-size:.78rem; color:var(--faint); margin-top:.7rem; line-height:1.5; }
  .ranges { font-size:.8rem; color:var(--faint); margin-top:.8rem; }
  .empty { margin:1.2rem 0; }
</style>
</head>
<body>
<main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">The books &middot; from the course cache &middot; 5 fiscal years</p>
  <h1>${name ? esc(name) : T} <span style="color:var(--faint);font-size:.6em">(${T})</span></h1>
  ${body}
  <footer><p class="notice">Education, not advice. Graham bars are teaching thresholds from The Intelligent Investor ch. 14 — not a recommendation to buy or sell anything.</p></footer>
</main>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Week 3 chart page (unchanged except shared chrome)
// ---------------------------------------------------------------------------
/** The rule's state under the chart: a band per run of long / flat / warming days. */
function stripRects(sp: (SignalPoint | null)[], x: (i: number) => number, yTop: number, n: number): string {
  if (!sp.some(Boolean)) return "";
  const out: string[] = [];
  let i = 0;
  while (i < n) {
    const st = sp[i]?.state ?? "warming";
    let j = i;
    while (j + 1 < n && (sp[j + 1]?.state ?? "warming") === st) j++;
    const x0 = x(i), x1 = j + 1 < n ? x(j + 1) : x(j) + 1;
    out.push(`<rect x="${x0.toFixed(1)}" y="${yTop}" width="${Math.max(x1 - x0, 1).toFixed(1)}" height="6" class="strip ${st}"><title>${st} ${sp[i]?.date ?? ""} → ${sp[j]?.date ?? ""}</title></rect>`);
    i = j + 1;
  }
  return out.join("");
}

function chartPage(
  ticker: string,
  name: string | null,
  status: string | null,
  rows: { date: string; adj_close: number }[],
  days: number,
  queryMs: number,
  tier: string = "core",
  sig: SignalSeries | null = null,
): string {
  const T = esc(ticker);

  let body: string;
  if (rows.length === 0) {
    const reason =
      status === "blocked"
        ? "This symbol is outside the free data plan, so no history is cached for it — see the verification record in the repo."
        : status
          ? "No cached history yet — the nightly refresh hasn't reached this symbol. Check back after 23:30 Irish time."
          : `Not in the course universe. The universe is the verified list at <a href="/api/universe">/api/universe</a>.`;
    body = `<p class="empty">${reason}</p>`;
  } else {
    const W = 720, H = 260, PAD_L = 14, PAD_R = 64, PAD_T = 18, PAD_B = 30;
    const closes = rows.map((r) => r.adj_close);
    // Week 7: Carver's two averages over the window, and the rule's state under it.
    const byDate = new Map((sig?.points ?? []).map((p) => [p.date, p] as const));
    const sp = rows.map((r) => byDate.get(r.date) ?? null);
    const overlayVals = sp.flatMap((p) => (p ? [p.fast, p.slow] : []));
    const min = Math.min(...closes, ...overlayVals), max = Math.max(...closes, ...overlayVals);
    const span = max - min || 1;
    const x = (i: number) => PAD_L + (i / Math.max(rows.length - 1, 1)) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - (v - min) / span) * (H - PAD_T - PAD_B);
    const pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.adj_close).toFixed(1)}`).join(" ");
    const last = rows[rows.length - 1], first = rows[0];
    const iMin = closes.indexOf(min), iMax = closes.indexOf(max);
    const fmt = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(2));
    const pct = (((last.adj_close - first.adj_close) / first.adj_close) * 100).toFixed(1);

    const tail = rows.slice(-10).reverse();
    const tableRows = tail
      .map((r) => `<tr><td>${r.date}</td><td>${fmt(r.adj_close)}</td></tr>`)
      .join("");

    body = `
  <p class="figures"><span class="big">${fmt(last.adj_close)}</span> <span class="chg">${Number(pct) >= 0 ? "+" : ""}${pct}% over ${rows.length} trading days</span></p>
  <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Adjusted close of ${T}, ${first.date} to ${last.date}" id="chart">
    <line x1="${PAD_L}" y1="${y(min)}" x2="${W - PAD_R}" y2="${y(min)}" class="grid"/>
    <line x1="${PAD_L}" y1="${y(max)}" x2="${W - PAD_R}" y2="${y(max)}" class="grid"/>
    ${sp.some(Boolean) ? `<polyline points="${sp.map((p, i) => (p ? `${x(i).toFixed(1)},${y(p.slow).toFixed(1)}` : "")).filter(Boolean).join(" ")}" class="ewma slow"/>
    <polyline points="${sp.map((p, i) => (p ? `${x(i).toFixed(1)},${y(p.fast).toFixed(1)}` : "")).filter(Boolean).join(" ")}" class="ewma fast"/>` : ""}
    <polyline points="${pts}" class="series"/>
    <circle cx="${x(rows.length - 1)}" cy="${y(last.adj_close)}" r="3.5" class="dot"/>
    ${stripRects(sp, x, H - PAD_B + 6, rows.length)}
    <text x="${W - PAD_R + 6}" y="${y(max) + 4}" class="lbl">${fmt(max)}</text>
    <text x="${W - PAD_R + 6}" y="${y(min) + 4}" class="lbl">${fmt(min)}</text>
    <text x="${W - PAD_R + 6}" y="${y(last.adj_close) + 4}" class="lbl last">${fmt(last.adj_close)}</text>
    <circle cx="${x(iMax)}" cy="${y(max)}" r="2.5" class="ext"/>
    <circle cx="${x(iMin)}" cy="${y(min)}" r="2.5" class="ext"/>
    <line id="xhair" x1="0" x2="0" y1="${PAD_T}" y2="${H - PAD_B}" class="xhair" visibility="hidden"/>
    <circle id="hdot" r="3.5" class="dot" visibility="hidden"/>
  </svg>
  <div id="tip" class="tip" hidden></div>
  <p class="caption">${first.date} → ${last.date} · ${tier === "small" ? "as traded (Alpha Vantage), dividend-adjusted by the toolkit; not adjusted for splits" : "adjusted for splits &amp; dividends"} · served from the nightly cache in ${queryMs}&nbsp;ms</p>
  ${sig ? `<p class="signal"><span class="swatch fast"></span>16-day average <span class="swatch slow"></span>64-day average · <strong>${esc(describeSignal(sig))}</strong> · <a href="/signals">all signals</a> · <a href="/api/signals/${T}">the series</a>. Education, not advice: a signal is what a rule says, not what you should do.</p>` : ""}
  <p class="ranges">Range:
    <a href="/prices/${T}?days=90">3m</a> · <a href="/prices/${T}?days=365">1y</a> ·
    <a href="/prices/${T}?days=1900">max</a> · <a href="/fundamentals/${T}">the books</a> · <a href="/api/prices/${T}?days=${days}">raw JSON</a></p>
  <details><summary>Last 10 closes (the numbers behind the line)</summary>
    <table><thead><tr><th>Date</th><th>Adj. close</th></tr></thead><tbody>${tableRows}</tbody></table>
  </details>
  <script>
    (function () {
      var data = ${JSON.stringify(rows.map((r) => [r.date, r.adj_close]))};
      var svg = document.getElementById("chart"), tip = document.getElementById("tip");
      var xh = document.getElementById("xhair"), hd = document.getElementById("hdot");
      var W = ${W}, PL = ${PAD_L}, PR = ${PAD_R}, PT = ${PAD_T}, PB = ${PAD_B}, H = ${H};
      var min = ${min}, span = ${span};
      function show(evt) {
        var r = svg.getBoundingClientRect();
        var fx = (evt.clientX - r.left) / r.width * W;
        var i = Math.round((fx - PL) / (W - PL - PR) * (data.length - 1));
        i = Math.max(0, Math.min(data.length - 1, i));
        var cx = PL + i / Math.max(data.length - 1, 1) * (W - PL - PR);
        var cy = PT + (1 - (data[i][1] - min) / span) * (H - PT - PB);
        xh.setAttribute("x1", cx); xh.setAttribute("x2", cx); xh.removeAttribute("visibility");
        hd.setAttribute("cx", cx); hd.setAttribute("cy", cy); hd.removeAttribute("visibility");
        tip.hidden = false;
        tip.textContent = data[i][0] + " · " + data[i][1].toFixed(2);
        tip.style.left = Math.min(evt.clientX - r.left + 12, r.width - 130) + "px";
      }
      function hide() { tip.hidden = true; xh.setAttribute("visibility", "hidden"); hd.setAttribute("visibility", "hidden"); }
      svg.addEventListener("mousemove", show);
      svg.addEventListener("touchmove", function (e) { if (e.touches[0]) show(e.touches[0]); }, { passive: true });
      svg.addEventListener("mouseleave", hide);
    })();
  </script>`;
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T} — price history</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
  .figures { margin:.6rem 0 .4rem; }
  .big { font-family:"IBM Plex Mono",monospace; font-size:1.6rem; font-weight:500; }
  .chg { color:var(--faint); font-size:.9rem; margin-left:.4rem; }
  svg { width:100%; height:auto; display:block; background:rgba(255,255,255,.45); border:1px solid var(--rule); border-radius:6px; }
  .series { fill:none; stroke:var(--entry); stroke-width:2; stroke-linejoin:round; stroke-linecap:round; }
  .ewma { fill:none; stroke-width:1.4; stroke-linejoin:round; }
  .ewma.fast { stroke:#1F5FA8; } .ewma.slow { stroke:#B4382E; stroke-dasharray:4 3; }
  .strip.long { fill:#3E6B54; opacity:.55; } .strip.flat { fill:#9AA5A0; opacity:.45; } .strip.warming { fill:#D9D9D9; opacity:.6; }
  .signal { font-size:.85rem; margin-top:.5rem; }
  .swatch { display:inline-block; width:14px; height:3px; vertical-align:middle; margin:0 .3rem 0 .1rem; }
  .swatch.fast { background:#1F5FA8; } .swatch.slow { background:#B4382E; }
  .grid { stroke:var(--rule); stroke-width:1; stroke-dasharray:2 4; }
  .lbl { font-family:"IBM Plex Mono",monospace; font-size:11px; fill:var(--faint); }
  .lbl.last { fill:var(--ink); font-weight:500; }
  .dot { fill:var(--entry); }
  .ext { fill:none; stroke:var(--faint); stroke-width:1; }
  .xhair { stroke:var(--faint); stroke-width:1; stroke-dasharray:3 3; }
  .tip { position:absolute; background:var(--ink); color:var(--paper); font-family:"IBM Plex Mono",monospace; font-size:.75rem; padding:.2rem .5rem; border-radius:4px; pointer-events:none; margin-top:-1.6rem; }
  .caption, .ranges { font-size:.8rem; color:var(--faint); margin-top:.5rem; }
  details { margin-top:1rem; font-size:.85rem; }
  summary { cursor:pointer; color:var(--entry); }
  table { border-collapse:collapse; margin-top:.5rem; font-family:"IBM Plex Mono",monospace; font-size:.8rem; }
  td,th { border-bottom:1px solid var(--rule); padding:.25rem .8rem .25rem 0; text-align:left; font-weight:400; }
  th { color:var(--faint); }
  .empty { margin:1.2rem 0; }
</style>
</head>
<body>
<main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">Nightly close · from the course cache</p>
  <h1>${name ? esc(name) : T} <span style="color:var(--faint);font-size:.6em">(${T})</span></h1>
  ${body}
  <footer><p class="notice">Education, not advice. Nothing here is a recommendation to buy or sell anything.</p></footer>
</main>
</body>
</html>`;
}

export default {
  fetch: app.fetch,
  // Cron invocations, each with its own 50-fetch budget (Workers Free):
  //   30 22 * * *, 40 22 * * *, …  → prices (add lines for capacity)   50 22 * * *  → accounts
  // Any other cron string (local doorbell without a match) runs both.
  scheduled: async (controller, env, ctx) => {
    // v0.5.3: every "mm 22 * * *" invocation except 22:50 is a price run, so
    // capacity grows by adding lines to wrangler.jsonc's crons (45 fetches
    // each; a later run skips what an earlier one fetched tonight). 22:50 is
    // accounts. Anything else (the local doorbell's "* * * * *") runs both.
    const phase: Phase =
      controller.cron === "50 22 * * *" ? "fundamentals"   // accounts
      : controller.cron === "0 23 * * *" ? "signals"        // week 7: the signal pass, its own invocation (D1 only, no calls)
      : controller.cron === "10 23 * * *" ? "smallcaps"     // decision 14: the small-cap tier, Alpha Vantage + EDGAR
      : /^\d{1,2} 22 \* \* \*$/.test(controller.cron) ? "prices"
      : "all";
    ctx.waitUntil(runNightly(env, phase));
  },
} satisfies ExportedHandler<Env>;
