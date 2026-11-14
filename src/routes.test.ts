/**
 * The week-7 routes against the fake D1 — adopted from the v0.9.0 independent
 * review's probes (N2, 24 Oct 2026). No SQL runs here; the SQL is exercised
 * in the local wrangler runs recorded in BUILD-LOG. Injection surface, CSV
 * shape, empty / warming / blocked cases, the overlay and the strip, the
 * quote cap's receipt-first order.
 */
import { describe, it, expect } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";

const env = (db: FakeD1) => ({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "", QUOTE_DAILY_CAP: "3" }) as any;
const get = (db: FakeD1, path: string) => worker.fetch(new Request(`http://localhost${path}`), env(db), { waitUntil() {}, passThroughOnException() {} } as any);

const closesDesc = (n: number, start = 100, step = 0.3, from = "2021-01-01") => Array.from({ length: n }, (_, i) => {
  const d = new Date(from); d.setUTCDate(d.getUTCDate() + (n - 1 - i));
  return { date: d.toISOString().slice(0, 10), close: start + (n - 1 - i) * step, adj_close: start + (n - 1 - i) * step, adj_open: null, adj_high: null, adj_low: null, volume: 1000 };
});

describe("R1 /api/signals/:ticker and /api/prices/:ticker — the ticker gate", () => {
  it.each(["AAPL'--", "AAPL;DROP", "../../etc", "A%20B", "AAPL<script>", "TOOLONGTICKER1", "aapl", " brk.b "])("%s", async (t) => {
    const db = fakeD1().on("FROM daily_prices", () => ({ results: closesDesc(5) }));
    const r = await get(db, `/api/signals/${encodeURIComponent(t)}`);
    const body = await r.json() as any;
    // lower-case and padded symbols are normalised; everything else is 400 before any SQL
    if (t === "aapl" || t === " brk.b ") { expect(r.status).not.toBe(400); }
    else { expect(r.status).toBe(400); expect(db.ran("daily_prices").length).toBe(0); }
    expect(String(body.ticker ?? body.error)).not.toContain("<script>");
  });
});

describe("R2 /api/prices/:ticker?csv=1", () => {
  it("serves text/csv, oldest first, the header the VC-19 recipe names, blanks for NULL, an attachment named by the ticker", async () => {
    const rows = closesDesc(3).map((r, i) => (i === 0 ? { ...r, close: 12.5 } : { ...r, close: null }));
    const db = fakeD1().on("SELECT date, close, adj_open", () => ({ results: rows })).on("fetch_log WHERE symbol", () => ({ results: [] })).on("SELECT tier FROM tickers", () => ({ results: [{ tier: "small" }] }));
    const r = await get(db, "/api/prices/AAPL?days=1900&csv=1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toMatch(/text\/csv/);
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="AAPL-prices.csv"');
    const text = await r.text();
    const lines = text.trim().split("\n");
    expect(lines[0]).toBe("date,close,adj_open,adj_high,adj_low,adj_close,volume");
    expect(lines.length).toBe(4);
    expect(lines[1] < lines[3]).toBe(true);            // oldest first (dates sort lexically)
    expect(lines[3].split(",")[1]).toBe("12.5");       // the as-traded close where present (row 0 of DESC = newest = last line)
    expect(lines[1].split(",")[1]).toBe("");           // blank where NULL
    console.log(`[R2] csv:\n${text}`);
  });
  it("days is clamped to 5…1900 and csv=1 with no rows is the same 404 JSON as the JSON route", async () => {
    const db = fakeD1().on("SELECT date, close, adj_open", () => ({ results: [] })).on("SELECT status, notes FROM tickers", () => ({ results: [{ status: "blocked", notes: "paywall" }] }));
    const r = await get(db, "/api/prices/ZZZ?csv=1");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).toMatch(/json/);
    const big = fakeD1().on("SELECT date, close, adj_open", (b) => { expect(b[1]).toBe(1900); return { results: closesDesc(2) }; }).on("fetch_log WHERE symbol", () => ({ results: [] })).on("SELECT tier FROM tickers", () => ({ results: [{ tier: "core" }] }));
    expect((await get(big, "/api/prices/AAPL?days=99999&csv=1")).status).toBe(200);
  });
});

describe("R3 /api/signals and /signals with no rows, warming rows, a blocked ticker", () => {
  it("no rows: JSON with as_of_close null and zero counts; the page says 'No signals computed yet' and 'Nothing yet.'", async () => {
    const db = fakeD1().on("FROM signals s", () => ({ results: [] })).on("SELECT COUNT(*) AS n FROM tickers", () => ({ results: [{ n: 38 }] }));
    const j = await (await get(db, "/api/signals")).json() as any;
    expect(j.as_of_close).toBeNull();
    expect(j.counts).toEqual({ long: 0, flat: 0, warming: 0, quarantined: 0, gate_open: 0, gate_near: 0 });   // week 10: the gate counts
    expect(j.meta.rule).toMatch(/EWMAC 16\/64/);
    const html = await (await get(db, "/signals")).text();
    expect(html).toContain("No signals yet — the nightly job writes them at 23:00 UTC");
    expect(html).toContain("Nothing yet.");
    expect(html).toContain("Education, not advice");
  });
  it("a warming row shows 'n of 128 closes' in the Since column; a name with markup is escaped; the blocked ticker is filtered by the SQL (WHERE t.status = 'active'), not by the code", async () => {
    const rows = [
      { symbol: "AAA", name: "Acme <b>Co</b>", tier: "core", date: "2026-10-23", close: 123.456, ewma_fast: 120, ewma_slow: 118, instrument_risk: 24.3, forecast: 7.5, state: "long", state_since: "2026-09-01", days: 1260, computed_at: "x" },
      { symbol: "SML", name: "Small", tier: "small", date: "2026-10-23", close: 9.87, ewma_fast: 9, ewma_slow: 9.5, instrument_risk: 55.1, forecast: -3.2, state: "warming", state_since: null, days: 60, computed_at: "x" },
      { symbol: "FLT", name: "Flat", tier: "core", date: "2026-10-23", close: 50, ewma_fast: 49, ewma_slow: 51, instrument_risk: null, forecast: null, state: "flat", state_since: "2026-05-05", days: 1260, computed_at: "x" },
    ];
    const db = fakeD1().on("FROM signals s", () => ({ results: rows })).on("SELECT COUNT(*) AS n FROM tickers", () => ({ results: [{ n: 3 }] }));
    const html = await (await get(db, "/signals")).text();
    expect(html).toContain("60 of 128 closes");
    expect(html).toContain("Acme &lt;b&gt;Co&lt;/b&gt;");
    expect(html).not.toContain("<b>Co</b>");
    expect(html).toContain("WARMING UP");
    expect(html).toMatch(/class="tag flat"/);
    expect(html).toContain("—");                       // null risk / forecast print as a dash
    expect(html).toContain("split-adjusted only for the splits in the toolkit's table");   // the small-cap `s` marker (v0.9.0 N8, v0.10.0 N4)
    const sql = db.ran("FROM signals s")[0].sql;
    expect(sql).toContain("t.status = 'active'");
    expect(sql).toContain("SELECT symbol, MAX(date) AS date FROM signals GROUP BY symbol");   // one MAX per symbol, joined (review N5)
  });
});

describe("R4 /api/signals/:ticker", () => {
  it("no history → 404; with history the series is the last `days` points, latest + summary + the stored row", async () => {
    const none = fakeD1().on("FROM daily_prices", () => ({ results: [] }));
    expect((await get(none, "/api/signals/NOPE")).status).toBe(404);
    // the three-way message, as /api/prices gives it (review N9): blocked / not yet fetched / not in the universe
    const say = async (row: { status: string; notes: string | null } | null) => {
      const db = fakeD1().on("FROM daily_prices", () => ({ results: [] })).on("SELECT status, notes FROM tickers", () => ({ results: row ? [row] : [] }));
      const r = await get(db, "/api/signals/XYZ");
      expect(r.status).toBe(404);
      return ((await r.json()) as any).error as string;
    };
    expect(await say({ status: "blocked", notes: "paywall" })).toMatch(/outside the free data plan/);
    expect(await say({ status: "active", notes: null })).toMatch(/no cached history yet/);
    expect(await say(null)).toMatch(/not in the course universe/);
    const db = fakeD1().on("FROM daily_prices", () => ({ results: closesDesc(400).map((r) => ({ date: r.date, close: r.close })) }))
      .on("FROM signals WHERE symbol", () => ({ results: [{ date: "2022-02-04", forecast: 20, state: "long", computed_at: "x" }] }));
    const j = await (await get(db, "/api/signals/AAPL?days=30")).json() as any;
    expect(j.series.length).toBe(30);
    expect(j.latest.state).toBe("long");
    expect(j.summary.mature).toBe(true);
    expect(j.nightly_row.state).toBe("long");
    expect(j.meta.closes_read).toBe(400);
    expect(j.meta.note).toMatch(/Education, not advice/);
    // the per-point series omits sigma_pct and forecast_raw; `latest` carries them — the VC-19 recipe reads forecastRaw from latest, fine
    expect(Object.keys(j.series[0]).sort()).toEqual(["close", "date", "fast", "forecast", "instrument_risk", "sigma_px", "slow", "state"]);
  });
});

describe("R5 /prices/:ticker — the overlay and the strip", () => {
  it("draws two polylines (class ewma fast / slow) and one strip rect per run of state; warming-only history draws a grey strip and a 'Warming up' reading", async () => {
    const rows = closesDesc(400);
    const db = fakeD1().on("SELECT date, adj_close FROM daily_prices", () => ({ results: rows.map((r) => ({ date: r.date, adj_close: r.adj_close })) }))
      .on("SELECT name, status, tier FROM tickers", () => ({ results: [{ name: "Acme", status: "active", tier: "core" }] }));
    const html = await (await get(db, "/prices/AAPL?days=365")).text();
    expect((html.match(/class="ewma fast"/g) ?? []).length).toBe(1);
    expect((html.match(/class="ewma slow"/g) ?? []).length).toBe(1);
    const rects = html.match(/<rect[^>]*class="strip (long|flat|warming)"/g) ?? [];
    console.log(`[R5] strip rects: ${rects.length} (${rects.map((r) => r.match(/strip (\w+)/)![1]).join(",")})`);
    expect(rects.length).toBeGreaterThan(0);
    expect(html).toContain("LONG — the 16-day average is above the 64-day");
    expect(html).toContain("Education, not advice");
    // the SELECT is LIMIT 1900 regardless of ?days — the whole history feeds the rule
    expect(db.ran("SELECT date, adj_close FROM daily_prices")[0].sql).toContain("LIMIT 1900");
    const short = fakeD1().on("SELECT date, adj_close FROM daily_prices", () => ({ results: rows.slice(0, 60).map((r) => ({ date: r.date, adj_close: r.adj_close })) }))
      .on("SELECT name, status, tier FROM tickers", () => ({ results: [{ name: "Acme", status: "active", tier: "small" }] }));
    const h2 = await (await get(short, "/prices/SML?days=365")).text();
    expect(h2).toContain("Warming up: 60 closes stored, 128 needed");
    expect(h2).toMatch(/class="strip warming"/);
  });
});

describe("R6 the quote cap (OI-24) on the fake D1", () => {
  it('"0" → 429 "switched off" and the receipt is deleted; a non-numeric cap → the default 3; the receipt is written BEFORE the count', async () => {
    const mk = (cap: string, used: number) => {
      const db = fakeD1()
        .on("INSERT INTO fetch_log", () => ({ results: [] }))
        .on("SELECT COUNT(*) AS n FROM fetch_log WHERE outcome = 'quote_demo'", () => ({ results: [{ n: used }] }))
        .on("DELETE FROM fetch_log", () => ({ results: [] }))
        .on("SELECT date, adj_close FROM daily_prices", () => ({ results: [{ date: "2026-10-23", adj_close: 1 }] }));
      const e = { ...env(db), QUOTE_DAILY_CAP: cap, ALPHAVANTAGE_API_KEY: "k", FMP_API_KEY: "k" };
      return { db, e };
    };
    const off = mk("0", 1);
    const r0 = await worker.fetch(new Request("http://localhost/api/quote/AAPL"), off.e, {} as any);
    expect(r0.status).toBe(429);
    expect(((await r0.json()) as any).error).toMatch(/switched off/);
    expect(off.db.log.map((l) => l.sql.slice(0, 6))).toEqual(["SELECT"]);   // switched off: no receipt, no count — only the cached close (review F6)
    const live = mk("3", 2);   // the third call of the day: receipt first, count, then on to the providers
    await worker.fetch(new Request("http://localhost/api/quote/AAPL"), live.e, {} as any).catch(() => undefined);
    expect(live.db.log.map((l) => l.sql.slice(0, 6)).slice(0, 2)).toEqual(["INSERT", "SELECT"]);
    const spent = mk("3", 4);
    expect((await worker.fetch(new Request("http://localhost/api/quote/AAPL"), spent.e, {} as any)).status).toBe(429);
    const junk = mk("abc", 4);   // unparseable → default 3 → 4 > 3 → 429
    expect((await worker.fetch(new Request("http://localhost/api/quote/AAPL"), junk.e, {} as any)).status).toBe(429);
    const neg = mk("-5", 1);     // "-5" fails /^\d+$/ → default 3 → allowed (would go on to call the providers)
    const dbNeg = neg.db.on("SELECT COUNT(*) AS n FROM fetch_log WHERE outcome = 'quote_demo'", () => ({ results: [{ n: 1 }] }));
    void dbNeg;
  });
  it("if the receipt INSERT fails the ration fails CLOSED: 429 from the cache, no live call (review F6)", async () => {
    const db = fakeD1()
      .on("INSERT INTO fetch_log", () => ({ error: "D1_ERROR: write limit" }))
      .on("SELECT COUNT(*) AS n FROM fetch_log WHERE outcome = 'quote_demo'", () => ({ results: [{ n: 0 }] }))
      .on("DELETE FROM fetch_log", () => ({ results: [] }))
      .on("SELECT date, adj_close FROM daily_prices", () => ({ results: [{ date: "2026-10-23", adj_close: 1 }] }));
    const e = { ...env(db), QUOTE_DAILY_CAP: "3", ALPHAVANTAGE_API_KEY: "k", FMP_API_KEY: "k" };
    const r = await worker.fetch(new Request("http://localhost/api/quote/AAPL"), e, {} as any);
    expect(r.status).toBe(429);
    expect(((await r.json()) as any).cached_close).toEqual({ date: "2026-10-23", adj_close: 1 });
  });
});

describe("R7 the scheduled handler: cron → phase (the reviewer's X2)", () => {
  const run = async (cron: string) => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers WHERE status = 'active' ORDER BY symbol", () => ({ results: [{ symbol: "AAA" }] }))
      .on("FROM daily_prices", () => ({ results: closesDesc(300).map((r) => ({ date: r.date, close: r.close })) }));
    const waits: Promise<unknown>[] = [];
    await worker.scheduled!({ cron, scheduledTime: Date.now(), noRetry() {} } as any, env(db), { waitUntil: (p: Promise<unknown>) => waits.push(p), passThroughOnException() {} } as any);
    await Promise.all(waits);
    return db;
  };
  it("'0 23 * * *' runs the signal pass, the stop tracker and the risk report, nothing else: one signals write, no price or accounts query (review F3)", async () => {
    const db = await run("0 23 * * *");
    expect(db.ran("INSERT INTO signals").length).toBe(1);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["run_summary", "run_summary", "risk_skipped", "run_summary"]);   // signals, the stop tracker (week 8), the risk report (week 9: no signal date on this fake → skipped)
    expect(db.ran("INSERT INTO fetch_log").filter((r) => r.binds[2] === "run_summary").map((r) => JSON.parse(String(r.binds[4])).phase)).toEqual(["signals", "stops", "risk"]);
    expect(db.ran("LEFT JOIN daily_prices").length).toBe(0);
    expect(db.ran("fundamentals_as_of IS NULL").length).toBe(0);
  });
  it("'50 22 * * *' (the accounts phase) no longer runs the signal pass; '30 22 * * *' (a price run) never did", async () => {
    const accounts = await run("50 22 * * *");
    expect(accounts.ran("INSERT INTO signals").length).toBe(0);
    expect(accounts.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["auth_failed"]);   // no key in the test env
    const prices = await run("30 22 * * *");
    expect(prices.ran("INSERT INTO signals").length).toBe(0);
  });
});

describe("R-W10 the Graham column on /signals and the watchlist (OI-68)", () => {
  // the clean survivor of graham.test.ts as D1 rows, plus a dear cousin: the books, the dividends, the latest close
  const years = (symbol: string) => [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
    symbol, fiscal_year: String(fy), period_end: `${fy}-12-31`, revenue: 2e9, net_income: null, eps_diluted: [5, 4.6, 4.4, 4, 3.8][i],
    current_assets: 400, current_liabilities: 150, total_assets: null, total_liabilities: null, long_term_debt: 100, shareholders_equity: 2000, shares_diluted: 50, goodwill_and_intangibles: null, readings: null,
  }));
  const divs = (symbol: string) => Array.from({ length: 11 }, (_, i) => 2016 + i).flatMap((y) => [{ symbol, ex_date: `${y}-03-01`, amount: 0.5 }, { symbol, ex_date: `${y}-09-01`, amount: 0.5 }]);   // twice a year into 2026: no gap over 15 months before "today"
  const sig = (symbol: string, over: Record<string, unknown> = {}) => ({ symbol, name: `${symbol} Co`, tier: "core", date: "2026-11-10", close: 60, ewma_fast: 61, ewma_slow: 59, instrument_risk: 20.1, forecast: 8.2, state: "long", state_since: "2026-09-01", days: 1260, computed_at: "x", quarantined: null, ...over });
  const books = () => fakeD1()
    .on("SELECT symbol, name, sector, tier FROM tickers WHERE status = 'active' ORDER BY symbol", () => ({ results: [{ symbol: "DEAR", name: "Dear Co", sector: "Tech", tier: "core" }, { symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive", tier: "core" }, { symbol: "NOBK", name: "No Books", sector: null, tier: "small" }] }))
    .on("FROM fundamentals_annual ORDER BY symbol", () => ({ results: [...years("DEAR"), ...years("GOOD")] }))
    .on("SELECT symbol, ex_date, amount FROM dividends", () => ({ results: [...divs("DEAR"), ...divs("GOOD")] }))
    .on("JOIN (SELECT symbol, MAX(date) AS d FROM daily_prices GROUP BY symbol)", () => ({ results: [{ symbol: "DEAR", date: "2026-11-10", adj_close: 100 }, { symbol: "GOOD", date: "2026-11-10", adj_close: 60 }] }))
    .on("SELECT COUNT(*) AS n FROM tickers", () => ({ results: [{ n: 3 }] }));
  it("/api/signals carries each row's scores and gate; the page prints '7/7 · n/6' with GATE on an open gate and hover text naming the failed tests", async () => {
    const db = books().on("FROM signals s", () => ({ results: [sig("GOOD"), sig("DEAR", { close: 100 }), sig("NOBK", { tier: "small", state: "warming", days: 40, forecast: null, instrument_risk: null, state_since: null })] }));
    const j = (await (await get(db, "/api/signals")).json()) as any;
    const good = j.signals.find((r: any) => r.symbol === "GOOD");
    expect(good.gate).toBe("open");
    expect(good.defensive).toMatchObject({ passes: 7, applicable: 7, verdict: "survivor", failed: [] });
    expect(good.graham).toMatch(/^7\/7 · \d\/6$/);
    const dear = j.signals.find((r: any) => r.symbol === "DEAR");
    expect(dear.gate).toBe("closed");
    expect(dear.defensive.failed).toEqual(["P/E", "P/B"]);
    const nobk = j.signals.find((r: any) => r.symbol === "NOBK");
    expect(nobk.gate).toBe("warming");
    expect(nobk.graham).toBe("—");
    expect(j.counts).toMatchObject({ long: 2, warming: 1, gate_open: 1, gate_near: 0 });
    expect(j.meta.gate).toMatch(/Graham ∩ Carver, in that order/);
    const html = await (await get(db, "/signals")).text();
    expect(html).toContain("<th title=\"Graham tests passed: defensive (of 7) · enterprising (of 6), from the cached books\">Graham</th>");   // v1.2.0 review S6: no "week 10" in a tool page's body
    expect(html).toMatch(/<td class="g open" title="Defensive: 7 of 7 passed\. Enterprising: \d of 6 passed, fails [^"]*">7\/7 · \d\/6 <span class="gt">GATE<\/span><\/td>/);
    expect(html).toMatch(/<td class="g closed" title="Defensive: 5 of 7 passed, fails P\/E, P\/B\./);
    expect(html).toContain('<td class="g warming" title="No accounts cached for this company yet');
    expect(html).toContain("<strong>The two rules side by side:</strong>");
  });
  it("/watchlist and /api/watchlist read the gate out: the open name, the longs failing both, the maturing small cap; the empty case says 'nothing'", async () => {
    const db = books().on("FROM signals s", () => ({ results: [sig("GOOD"), sig("DEAR", { close: 100 }), sig("NOBK", { tier: "small", state: "warming", days: 40, forecast: null, instrument_risk: null, state_since: null })] }));
    const j = (await (await get(db, "/api/watchlist")).json()) as any;
    expect(j.gate_open.map((r: any) => r.symbol)).toEqual(["GOOD"]);
    expect(j.longs_failing_both.map((r: any) => r.symbol)).toEqual(["DEAR"]);
    expect(j.small_caps_maturing.map((r: any) => r.symbol)).toEqual(["NOBK"]);        // no books yet, but its rule is warming: on its way to 128
    expect(j.reading[3]).toBe("1 small cap still warming up (fewer than 128 closes); the nearest, NOBK, has 40 — ticketable once it has 128 and no quarantine.");
    expect(j.reading[0]).toBe("The gate tonight: 1 name passes a Graham screen and is long on the rule — GOOD. The Starter System sizes it; the stop closes it; the ticket is the student's.");
    expect(j.meta.note).toMatch(/Education, not advice/);
    const html = await (await get(db, "/watchlist")).text();
    expect(html).toContain("<h1>The watchlist</h1>");
    expect(html).toContain("The gate tonight: 1 name passes a Graham screen");
    expect(html).toContain("defensive: P/E, P/B");
    expect(html).toContain("Education, not advice. A gate is what two rules say together");
    // the empty night
    const empty = books().on("FROM signals s", () => ({ results: [sig("DEAR", { close: 100 }), sig("GOOD", { state: "flat" })] }));
    const e = (await (await get(empty, "/api/watchlist")).json()) as any;
    expect(e.gate_open).toEqual([]);
    expect(e.reading[0]).toMatch(/^The gate tonight: nothing\. 1 name passes a Graham screen but is not long on the rule/);
    const ehtml = await (await get(empty, "/watchlist")).text();
    expect(ehtml).toContain("Nothing tonight. No company passes a Graham screen and is long on the rule");
    expect(ehtml).toContain("No near miss is long tonight. A near miss is a reading list, not a pick.");
    expect(ehtml).toContain("Every small cap in the tier has its 128 closes.");                  // a template literal, not a quoted string (review F5)
    expect(ehtml).not.toContain("${");
  });
});
