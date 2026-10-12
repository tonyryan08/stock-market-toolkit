/**
 * Intro to the Stock Market — course toolkit
 * Week 5: the Graham screen. Seven tests from The Intelligent Investor
 * ch. 14, run over the cached books; a checklist card printed from the
 * same rules. (Week 4 books pages and week 3 charts unchanged.)
 *
 * Invariant 4 holds: student-facing data routes touch only D1.
 */

import { Hono } from "hono";
import { LANDING_PAGE } from "./landing";
import { fetchAlphaVantageQuote, fetchFmpProfile } from "./providers";
import { runNightly } from "./jobs/nightly";
import { computeRatios, dividendYears, type FundamentalsYear, type Ratios } from "./lib/ratios";
import { CRITERIA, T as GT, requiredGrowthPct, rankScreen, screenCompany, type ScreenResult } from "./lib/graham";

type Env = {
  ALPHAVANTAGE_API_KEY: string;
  FMP_API_KEY: string;
  DB: D1Database;
};

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
      `SELECT t.symbol, t.name, t.sector, t.status, t.fundamentals_status,
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
      `SELECT date, adj_open, adj_high, adj_low, adj_close, volume
       FROM daily_prices WHERE symbol = ?1
       ORDER BY date DESC LIMIT ?2`,
    )
      .bind(ticker, days)
      .all<{
        date: string;
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

  return c.json({
    ticker,
    prices: rows,
    meta: {
      source: "d1-cache",
      adjusted: "split- and dividend-adjusted (lesson 2: charts longer than a season use adjusted prices)",
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
              long_term_debt, shareholders_equity, shares_diluted
       FROM fundamentals_annual WHERE symbol = ?1
       ORDER BY fiscal_year DESC LIMIT 10`,
    ).bind(ticker).all<{
      fiscal_year: string; period_end: string | null; revenue: number | null;
      net_income: number | null; eps_diluted: number | null;
      current_assets: number | null; current_liabilities: number | null;
      total_assets: number | null; total_liabilities: number | null;
      long_term_debt: number | null; shareholders_equity: number | null;
      shares_diluted: number | null;
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
    "SELECT name, status, fundamentals_as_of, fundamentals_status FROM tickers WHERE symbol = ?1",
  ).bind(ticker).first<{
    name: string | null; status: string;
    fundamentals_as_of: string | null; fundamentals_status: string | null;
  }>();

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
  }));

  return {
    years: fy,
    dividends: dividendYears(divs),
    close: close ?? null,
    ratios: computeRatios(fy, close?.adj_close ?? null),
    ticker_meta: meta ?? null,
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
      f.years, f.ratios, f.dividends, f.close),
  );
});

/** The chart page — week 3's centrepiece. */
app.get("/prices/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.text("Not a ticker symbol.", 400);
  const days = Math.min(Math.max(parseInt(c.req.query("days") ?? "365", 10) || 365, 20), 1900);

  const t0 = Date.now();
  const rows = (
    await c.env.DB.prepare(
      `SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT ?2`,
    )
      .bind(ticker, days)
      .all<{ date: string; adj_close: number }>()
  ).results.reverse();

  const name = await c.env.DB.prepare("SELECT name, status FROM tickers WHERE symbol = ?1")
    .bind(ticker)
    .first<{ name: string | null; status: string }>();

  return c.html(chartPage(ticker, name?.name ?? null, name?.status ?? null, rows, days, Date.now() - t0));
});

// ---------------------------------------------------------------------------
// Week 5: the Graham screen — one pass over the cache, three queries total.
// ---------------------------------------------------------------------------

async function loadScreen(env: Env) {
  const [tick, fund, divs, closes] = await env.DB.batch([
    env.DB.prepare("SELECT symbol, name, sector FROM tickers WHERE status = 'active' ORDER BY symbol"),
    env.DB.prepare(
      `SELECT symbol, fiscal_year, period_end, revenue, net_income, eps_diluted,
              current_assets, current_liabilities, total_assets, total_liabilities,
              long_term_debt, shareholders_equity, shares_diluted
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
  };
  const yearsBy = new Map<string, FundamentalsYear[]>();
  for (const y of fund.results as FRow[]) {
    const list = yearsBy.get(y.symbol) ?? [];
    list.push({
      fiscalYear: y.fiscal_year, periodEnd: y.period_end, revenue: y.revenue, netIncome: y.net_income,
      epsDiluted: y.eps_diluted, currentAssets: y.current_assets, currentLiabilities: y.current_liabilities,
      totalAssets: y.total_assets, totalLiabilities: y.total_liabilities, longTermDebt: y.long_term_debt,
      equity: y.shareholders_equity, sharesDiluted: y.shares_diluted,
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

  const currentYear = new Date().getUTCFullYear();
  const rows = (tick.results as { symbol: string; name: string | null; sector: string | null }[])
    .filter((t) => (yearsBy.get(t.symbol)?.length ?? 0) > 0)
    .map((t) =>
      screenCompany({
        symbol: t.symbol, name: t.name, sector: t.sector,
        years: yearsBy.get(t.symbol) ?? [],
        dividendsPerYear: dividendYears(divsBy.get(t.symbol) ?? []).perYear,
        lastClose: closeBy.get(t.symbol)?.adj_close ?? null,
        currentYear,
      }),
    );

  const priceDates = [...closeBy.values()].map((p) => p.date).sort();
  return {
    rows: rankScreen(rows),
    universe: tick.results.length,
    withBooks: rows.length,
    asOfClose: priceDates.length ? priceDates[priceDates.length - 1] : null,
  };
}

app.get("/api/screen/graham", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  const count = (v: string) => s.rows.filter((r) => r.verdict === v).length;
  return c.json({
    criteria: CRITERIA,
    thresholds: GT,
    required_growth_pct: requiredGrowthPct,
    summary: {
      universe: s.universe, screened: s.withBooks,
      survivors: count("survivor"), near_misses: count("near_miss"),
      insufficient_data: count("insufficient"), fails: count("fails"),
    },
    results: s.rows,
    meta: {
      source: "d1-cache",
      as_of_close: s.asOfClose,
      method: "The Intelligent Investor ch. 14 (defensive investor), adapted openly where free data is shorter than Graham's windows — see /card. Financial companies skip test 2 (Graham applied only the price tests to them) and are scored out of 6.",
      served_in_ms: Date.now() - t0,
      note: "Education, not advice. A screen is a starting list for reading, never a buy list.",
    },
  });
});

app.get("/screen", async (c) => {
  const t0 = Date.now();
  const s = await loadScreen(c.env);
  return c.html(screenPage(s.rows, s.universe, s.withBooks, s.asOfClose, Date.now() - t0));
});

app.get("/card", (c) => c.html(cardPage()));

// ---------------------------------------------------------------------------
// Week 5 pages
// ---------------------------------------------------------------------------
function screenPage(
  rows: ScreenResult[], universe: number, screened: number, asOf: string | null, ms: number,
): string {
  const n = (v: string) => rows.filter((r) => r.verdict === v).length;
  const mark = (o: string) => (o === "pass" ? "✓" : o === "fail" ? "✗" : o === "skip" ? "–" : "?");
  const verdictLabel: Record<string, string> = {
    survivor: "SURVIVOR", near_miss: "NEAR MISS", insufficient: "INCOMPLETE", fails: "",
  };
  const head = CRITERIA.map(
    (c) => `<th scope="col"><a href="/card#c${c.n}" title="${esc(c.title)}">${c.n}</a><span class="hs">${esc(c.short)}</span></th>`,
  ).join("");
  const body = rows.map((r) => {
    const cells = CRITERIA.map((c) => {
      const x = r.results.find((y) => y.id === c.id)!;
      return `<td class="m ${x.outcome}" title="${esc(c.short)}: ${esc(x.detail)}"><span aria-hidden="true">${mark(x.outcome)}</span><span class="sr">${x.outcome}: ${esc(x.detail)}</span></td>`;
    }).join("");
    const v = verdictLabel[r.verdict];
    return `<tr class="${r.verdict}">
      <th scope="row"><a href="/fundamentals/${esc(r.symbol)}">${esc(r.symbol)}</a><span class="nm">${esc(r.name ?? "")}</span></th>
      ${cells}
      <td class="p">${r.passes}/${r.applicable}</td>
      <td class="v">${v ? `<span class="tag ${r.verdict}">${v}</span>` : ""}</td>
    </tr>`;
  }).join("");

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Graham screen</title>
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
  td.m { font-family:"IBM Plex Mono",monospace; font-size:1rem; width:2.4rem; }
  td.pass { color:var(--entry); } td.fail { color:var(--stamp); } td.na, td.skip { color:var(--faint); }
  td.p { font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  tr.survivor { background:rgba(62,107,84,.10); }
  tbody th, thead th:first-child { position:sticky; left:0; background:#F6F8F4; z-index:1; }
  tr.survivor th { background:#E3EBE5; }
  .tag { font-family:"IBM Plex Mono",monospace; font-size:.62rem; letter-spacing:.1em; border:1.4px solid; border-radius:3px; padding:.1rem .35rem; white-space:nowrap; }
  .tag.survivor { color:var(--entry); border-color:var(--entry); }
  .tag.near_miss { color:var(--ink); border-color:var(--faint); }
  .tag.insufficient { color:var(--faint); border-color:var(--rule); }
  .sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); }
  .key, .caption { font-size:.8rem; color:var(--faint); margin-top:.7rem; line-height:1.5; }
  .argue { margin-top:1.4rem; border-left:3px solid var(--stamp); padding:.2rem 0 .2rem .9rem; font-size:.92rem; }
</style></head>
<body><main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">Phase 2 · The Intelligent Investor, ch. 14 · defensive investor</p>
  <h1>The Graham screen</h1>
  <p class="lede">Graham's seven tests (1972 revision), run tonight over ${screened} companies' books. A screen doesn't pick shares — it decides which ones are worth reading.</p>
  <div class="tally">
    <div class="sv"><b>${n("survivor")}</b><span>survivors · all tests passed</span></div>
    <div><b>${n("near_miss")}</b><span>near misses · one fail</span></div>
    <div><b>${n("fails")}</b><span>fail two or more</span></div>
    <div><b>${n("insufficient")}</b><span>incomplete data</span></div>
  </div>
  <div class="wrap"><table>
    <thead><tr><th scope="col" style="text-align:left">Company</th>${head}<th scope="col">Score</th><th scope="col"></th></tr></thead>
    <tbody>${body || `<tr><td colspan="10">No company has cached accounts yet — the nightly refresh fills the books over three nights.</td></tr>`}</tbody>
  </table></div>
  <p class="key">✓ pass · ✗ fail · – not applied (financial companies skip test 2 — Graham's rule; their score is out of 6) · ? data missing. Hover or tap a mark for the numbers. Column numbers link to the <a href="/card">checklist card</a>, which prints from the same rules this screen runs. Universe ${universe}; ${screened} with books.</p>
  <p class="caption">Prices to ${esc(asOf ?? "—")} · accounts to the latest fiscal year held · served from the nightly cache in ${ms}&nbsp;ms · <a href="/api/screen/graham">raw JSON</a></p>
  <p class="argue"><strong>Tonight's argument:</strong> pick one company that failed and one that passed. Is the screen right about both? Graham wrote these tests to <em>reject</em> — what kind of company can't pass them, and does that make it a bad investment or just not a defensive one?</p>
  <footer><p class="notice">Education, not advice. A survivor is a company worth reading about — not a recommendation to buy anything.</p></footer>
</main></body></html>`;
}

function cardPage(): string {
  const rows = CRITERIA.map((c) => `
    <li id="c${c.n}">
      <span class="num">${c.n}</span>
      <div><p class="t">${esc(c.title)}${c.adapted ? ` <span class="ad">adapted</span>` : ""}</p>
      <p class="rule">${esc(c.ours)}</p>
      <p class="why">${esc(c.why)}</p>
      ${c.adapted ? `<p class="orig">Graham's original: ${esc(c.graham)}</p>` : ""}</div>
    </li>`).join("");
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
  <p class="print">Print this page for the takeaway kit (your browser's Print → Save as PDF works too).</p>
  <footer><p class="notice">Education, not advice.</p></footer>
</main></body></html>`;
}

app.notFound((c) =>
  c.json(
    { error: "Not found", hint: "Try /, /screen, /card, /api/universe, /prices/AAPL, or /fundamentals/AAPL" },
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
): string {
  const T = esc(ticker);
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
        gloss: "Can it pay this year's bills? Current assets ÷ current liabilities.",
        chip: verdict(r.currentRatio === null ? null : r.currentRatio >= 2, "Graham bar: ≥ 2"),
      },
      {
        k: "P/E (3-yr avg)", v: fmt(r.pe3),
        gloss: `Years of average recent earnings you pay for the share — Graham's basis. On the latest year alone: ${fmt(r.pe)}.`,
        chip: verdict(r.pe3 === null ? null : r.pe3 <= 15, "Graham bar: ≤ 15"),
      },
      {
        k: "P/B", v: r.bookValuePerShare !== null && r.bookValuePerShare <= 0 ? "neg. book" : fmt(r.pb),
        gloss: r.bookValuePerShare !== null && r.bookValuePerShare <= 0
          ? "Book value is negative — buybacks or losses have used up the equity. No multiple of assets supports the price."
          : "Price against the book value behind each share.",
        chip: r.bookValuePerShare !== null && r.bookValuePerShare <= 0
          ? verdict(false, "Graham bar: ≤ 1.5")
          : verdict(r.pb === null ? null : r.pb <= 1.5, "Graham bar: ≤ 1.5"),
      },
      {
        k: "P/E × P/B", v: fmt(r.peTimesPb),
        gloss: "Graham's combined affordability test, on the 3-year P/E.",
        chip: verdict(r.peTimesPb === null ? null : r.peTimesPb <= 22.5, "Graham bar: ≤ 22.5"),
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
  <p class="figures">${close ? `Last close <span class="mono">${close.adj_close >= 100 ? close.adj_close.toFixed(0) : close.adj_close.toFixed(2)}</span> (${close.date})` : "No cached price yet"} · accounts to FY ${esc(r.asOfYear ?? "—")}</p>
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
  <p class="ranges"><a href="/prices/${T}">price history</a> · <a href="/api/fundamentals/${T}">raw JSON</a> · <a href="/screen">the Graham screen</a></p>`;
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
function chartPage(
  ticker: string,
  name: string | null,
  status: string | null,
  rows: { date: string; adj_close: number }[],
  days: number,
  queryMs: number,
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
    const min = Math.min(...closes), max = Math.max(...closes);
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
    <polyline points="${pts}" class="series"/>
    <circle cx="${x(rows.length - 1)}" cy="${y(last.adj_close)}" r="3.5" class="dot"/>
    <text x="${W - PAD_R + 6}" y="${y(max) + 4}" class="lbl">${fmt(max)}</text>
    <text x="${W - PAD_R + 6}" y="${y(min) + 4}" class="lbl">${fmt(min)}</text>
    <text x="${W - PAD_R + 6}" y="${y(last.adj_close) + 4}" class="lbl last">${fmt(last.adj_close)}</text>
    <circle cx="${x(iMax)}" cy="${y(max)}" r="2.5" class="ext"/>
    <circle cx="${x(iMin)}" cy="${y(min)}" r="2.5" class="ext"/>
    <line id="xhair" x1="0" x2="0" y1="${PAD_T}" y2="${H - PAD_B}" class="xhair" visibility="hidden"/>
    <circle id="hdot" r="3.5" class="dot" visibility="hidden"/>
  </svg>
  <div id="tip" class="tip" hidden></div>
  <p class="caption">${first.date} → ${last.date} · adjusted for splits &amp; dividends · served from the nightly cache in ${queryMs}&nbsp;ms</p>
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
  scheduled: async (controller, env, ctx) => {
    ctx.waitUntil(runNightly(env));
  },
} satisfies ExportedHandler<Env>;
