/**
 * Intro to the Stock Market — course toolkit
 * Week 3: the nightly close. D1 cache, cron-fed; cache-first routes;
 * a chart page students can hammer without spending anyone's ration.
 *
 * Design invariant 4, now real: student-facing data routes (/api/prices,
 * /api/universe, /prices/:ticker) touch only D1 — never a live provider.
 * /api/quote stays live on purpose: it is lesson 2's demo of what the
 * rationed world feels like, run by the tutor.
 */

import { Hono } from "hono";
import { LANDING_PAGE } from "./landing";
import { fetchAlphaVantageQuote, fetchFmpProfile } from "./providers";
import { runNightly } from "./jobs/nightly";

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
// Week 2 (unchanged in spirit): the LIVE quote route — tutor's demo, rationed.
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

  // Two providers in parallel; either may fail without sinking the other.
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
      price: av.data, // Alpha Vantage
      company: fmp.data, // Financial Modeling Prep
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
// Week 3: cache-first routes. D1 only. No ration, no provider, no waiting.
// ---------------------------------------------------------------------------

/** The universe, with per-symbol freshness — "what's in the tin". */
app.get("/api/universe", async (c) => {
  const t0 = Date.now();
  const rows = (
    await c.env.DB.prepare(
      `SELECT t.symbol, t.name, t.sector, t.status,
              COUNT(p.date) AS days_of_history,
              MAX(p.date)   AS latest_close
       FROM tickers t
       LEFT JOIN daily_prices p ON p.symbol = t.symbol
       GROUP BY t.symbol
       ORDER BY t.symbol`,
    ).all()
  ).results;

  const lastRun = await c.env.DB.prepare(
    "SELECT run_at, detail FROM fetch_log WHERE outcome = 'run_summary' ORDER BY id DESC LIMIT 1",
  ).first<{ run_at: string; detail: string }>();

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

/** Daily adjusted history from the cache. ?days=N (default 365, max 1900). */
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
  ).results.reverse(); // serve ascending — charts read left to right

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

/** The human-facing chart page — lesson 3's centrepiece. */
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

app.notFound((c) =>
  c.json(
    { error: "Not found", hint: "Try /, /api/hello, /api/universe, /api/prices/AAPL, or /prices/AAPL" },
    404,
  ),
);

// ---------------------------------------------------------------------------
// The chart page. One series, site palette, no dependencies.
// ---------------------------------------------------------------------------
function chartPage(
  ticker: string,
  name: string | null,
  status: string | null,
  rows: { date: string; adj_close: number }[],
  days: number,
  queryMs: number,
): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
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
    // Geometry
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

    // Last-10 table (accessibility + "read the numbers" habit)
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
    <a href="/prices/${T}?days=1900">max</a> · <a href="/api/prices/${T}?days=${days}">raw JSON</a></p>
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
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root { --paper:#EEF2E9; --ink:#182620; --rule:#B7C6D4; --entry:#3E6B54; --stamp:#B4382E; --faint:#6B7A72; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--paper); color: var(--ink); font-family: "IBM Plex Sans", system-ui, sans-serif; line-height: 1.55; padding: 2.5rem 1.25rem 4rem; }
  main { max-width: 46rem; margin: 0 auto; position: relative; }
  .eyebrow { font-family:"IBM Plex Mono",monospace; font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
  h1 { font-family:"Libre Caslon Text",serif; font-weight:700; font-size:clamp(1.6rem,5vw,2.4rem); line-height:1.1; margin:.4rem 0 .2rem; }
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
  .ranges a, .back a { color:var(--entry); }
  details { margin-top:1rem; font-size:.85rem; }
  summary { cursor:pointer; color:var(--entry); }
  table { border-collapse:collapse; margin-top:.5rem; font-family:"IBM Plex Mono",monospace; font-size:.8rem; }
  td,th { border-bottom:1px solid var(--rule); padding:.25rem .8rem .25rem 0; text-align:left; font-weight:400; }
  th { color:var(--faint); }
  .empty { margin:1.2rem 0; }
  .empty a { color:var(--entry); }
  footer { margin-top:2.5rem; padding-top:1rem; border-top:2px solid var(--ink); font-size:.8rem; color:var(--faint); }
  footer .notice { color:var(--stamp); font-weight:600; }
  .back { font-size:.85rem; margin-bottom:1rem; }
  a:focus-visible { outline:2px solid var(--entry); outline-offset:2px; }
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
