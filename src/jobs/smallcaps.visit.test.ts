/**
 * The small-cap VISIT on the fake D1 (OI-02 / OI-03 / OI-25 — review S12, M15,
 * V9): the cases the ration tests do not reach. The network is a router at
 * `fetch`, keyed by Alpha Vantage's `function=` and EDGAR's URL, so each test
 * says what the providers answer and pins what the job then reads, writes and
 * records. Decisions only: the SQL itself runs against the real local D1 in the
 * sandbox runs recorded in BUILD-LOG.
 *
 * Covered here: price not served → the ticker blocked; dividends not served →
 * the `dividends_as_of` stamp (OI-29); income not served → `fund_blocked`;
 * EDGAR fatal (a 5xx → `eps_missing`, retried by step 0 at no AV cost; a 403 →
 * configuration, never retried); the pruning DELETE after the accounts upsert
 * (M15); realign on a new ex-date; the halt mid-visit that clears
 * `last_price_fetch` (OI-34); the fetch-budget guard.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fakeD1, asD1, type FakeD1 } from "./fake-d1";
import { runSmallCaps } from "./smallcaps";
import { quarantineReason } from "./signals";
import { jumpReceipt } from "../lib/adjust";

const NOW = "2026-11-05T13:00:00.000Z";
const RECENT = "2026-11-01T13:00:00.000Z";   // accounts fetched four days ago: not due
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Five as-traded closes, 29 Oct – 4 Nov 2026 (Thu, Fri, Mon, Tue, Wed). */
const DAILY = {
  "Meta Data": { "2. Symbol": "AAA" },
  "Time Series (Daily)": Object.fromEntries([["2026-11-04", 104], ["2026-11-03", 103], ["2026-11-02", 102], ["2026-10-30", 101], ["2026-10-29", 100]]
    .map(([d, c]) => [d, { "1. open": String(c), "2. high": String(c), "3. low": String(c), "4. close": String(c), "5. volume": "1000" }])),
};
const DIVIDENDS = { symbol: "AAA", data: [{ ex_dividend_date: "2026-11-03", amount: "1.00" }, { ex_dividend_date: "2026-08-01", amount: "1.00" }] };
const income = (years: number[]) => ({ symbol: "AAA", annualReports: years.map((y) => ({ fiscalDateEnding: `${y}-12-31`, totalRevenue: String(y * 1000), netIncome: String(y * 10) })) });
const balance = (years: number[]) => ({ symbol: "AAA", annualReports: years.map((y) => ({ fiscalDateEnding: `${y}-12-31`, totalCurrentAssets: "500", totalCurrentLiabilities: "200", totalAssets: "900", totalLiabilities: "400", longTermDebt: "100", totalShareholderEquity: "500", commonStockSharesOutstanding: "1000", goodwill: "0", intangibleAssetsExcludingGoodwill: "0" })) });
const EDGAR_OK = (val: number) => ({ entityName: "AAA Corp", units: { "USD/shares": [{ end: "2025-12-31", start: "2025-01-01", val, form: "10-K", filed: "2026-02-20", accn: "0001-26-000001", fy: 2025, fp: "FY" }], USD: [], shares: [] } });

type Answer = (url: URL) => Response | Promise<Response>;
/** A router: Alpha Vantage calls by `function`, EDGAR by the tag in the path; the calls are recorded. */
function network(av: Record<string, Answer | unknown>, edgar?: (tag: string) => Response) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "data.sec.gov") {
      const tag = decodeURIComponent(url.pathname.split("/").pop()!.replace(/\.json$/, ""));
      calls.push(`edgar:${tag}`);
      return edgar ? edgar(tag) : json({ entityName: "AAA Corp", units: {} }, 404);
    }
    const fn = url.searchParams.get("function")!;
    calls.push(`av:${fn}`);
    const a = av[fn];
    if (a === undefined) throw new Error(`no stub for ${fn}`);
    return typeof a === "function" ? (a as Answer)(url) : json(a);
  }));
  return calls;
}

const ticker = (over: Partial<Record<string, unknown>> = {}) => ({ symbol: "AAA", cik: null, last_price_fetch: null, fundamentals_as_of: null, fundamentals_status: null, dividends_as_of: null, ...over });
/** A key long enough that the provider's scrub (every occurrence → KEY) touches only the key: with "k" it also rewrote the word "key" in the notice. */
const env = (db: FakeD1, ua = "") => ({ DB: asD1(db), ALPHAVANTAGE_API_KEY: "TESTKEY0000000000", EDGAR_USER_AGENT: ua, SMALLCAP_AV_CALLS: "18", SMALLCAP_AV_SPACING_MS: "0" }) as any;
const budget = (max = 45) => ({ fetches: 0, max });
const base = (tickers: unknown[]) => fakeD1()
  .on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => ({ results: tickers }))
  .on("json_extract", () => ({ results: [{ n: 0, oldest: null }] }))
  .on("quote_demo", () => ({ results: [{ n: 0, oldest: null }] }))
  .on("MAX(ex_date)", () => ({ results: [{ d: "2026-08-01", n: 1 }] }))
  .on("SELECT ex_date, amount FROM dividends", () => ({ results: [{ ex_date: "2026-08-01", amount: 1 }] }))
  .on("FROM splits WHERE symbol", () => ({ results: [] }))
  .on("SELECT date, close, adj_close FROM daily_prices", () => ({ results: [] }));
const outcomes = (db: FakeD1) => db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
const receipt = (db: FakeD1, outcome: string) => db.ran("INSERT INTO fetch_log").filter((r) => r.binds[2] === outcome).map((r) => String(r.binds[4]));
const summary = (db: FakeD1) => JSON.parse(String(db.ran("INSERT INTO fetch_log").at(-1)!.binds[4]));

afterEach(() => vi.unstubAllGlobals());

describe("the visit — prices and dividends", () => {
  it("Alpha Vantage has no daily series: the ticker is blocked with the reason, one receipt, the visit moves on (no dividend or accounts call)", async () => {
    const calls = network({ TIME_SERIES_DAILY: (u) => json(u.searchParams.get("symbol") === "AAA" ? { "Error Message": "Invalid API call. Please retry or visit the documentation" } : DAILY), DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: income([2025, 2024, 2023, 2022, 2021]), BALANCE_SHEET: balance([2025, 2024, 2023, 2022, 2021]) });
    const db = base([ticker(), ticker({ symbol: "BBB" })]);
    await runSmallCaps(env(db), NOW, budget());
    const blocked = db.ran("UPDATE tickers SET status = 'blocked'");
    expect(blocked).toHaveLength(1);
    expect(blocked[0].binds[0]).toBe("AAA");
    expect(String(blocked[0].binds[1])).toMatch(/^Alpha Vantage has no daily series for this symbol \(Error Message: Invalid API call/);
    expect(receipt(db, "blocked")).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("av:")).slice(0, 2)).toEqual(["av:TIME_SERIES_DAILY", "av:TIME_SERIES_DAILY"]);   // AAA's one call, then straight to BBB
    expect(summary(db).outcomes).toMatchObject({ blocked: 1, ok: 1 });
  });
  it("dividends not served is an answer (OI-29): dividends_as_of is stamped so the call is not repeated, the prices are written unadjusted, the receipt says so", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: {} });
    // accounts fresh and ok, the dividend record never fetched: a dividends-only visit (cost 2)
    const db = base([ticker({ fundamentals_as_of: RECENT, fundamentals_status: "ok" })]).on("SELECT ex_date, amount FROM dividends", () => ({ results: [] }));
    await runSmallCaps(env(db), NOW, budget());
    const stamps = db.ran("UPDATE tickers SET dividends_as_of");
    expect(stamps).toHaveLength(1);
    expect(stamps[0].binds).toEqual(["AAA", NOW]);
    expect(db.ran("INSERT INTO dividends")).toHaveLength(0);
    expect(receipt(db, "dividends")[0]).toMatch(/^dividends not_served: empty object/);
    expect(receipt(db, "ok")[0]).toMatch(/^av compact 5 days 2026-10-29→2026-11-04, as traded; 0 days dividend-adjusted/);
    expect(summary(db)).toMatchObject({ planned: 1, dividendsOnly: 1, avCalls: 2, outcomes: { ok: 1 } });
  });
  it("a new ex-date re-aligns the stored series: every stored close before it is re-adjusted, the older rows included; the closes on and after it are left alone", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS });
    // the store holds the five nights plus one from June, all still unadjusted; the record held one ex-date (1 Aug) — tonight's visit adds 3 Nov
    const stored = [["2026-06-01", 90], ["2026-10-29", 100], ["2026-10-30", 101], ["2026-11-02", 102], ["2026-11-03", 103], ["2026-11-04", 104]].map(([date, close]) => ({ date, close, adj_close: close }));
    const db = base([ticker({ fundamentals_as_of: RECENT, fundamentals_status: "ok" })])
      .on("SELECT ex_date, amount FROM dividends", () => ({ results: [{ ex_date: "2026-08-01", amount: 1 }, { ex_date: "2026-11-03", amount: 1 }] }))
      .on("SELECT date, close, adj_close FROM daily_prices", () => ({ results: stored }));
    await runSmallCaps(env(db), NOW, budget());
    expect(db.ran("INSERT INTO dividends").map((r) => r.binds)).toEqual([["AAA", "2026-11-03", 1], ["AAA", "2026-08-01", 1]]);
    // 1 Aug's factor needs a close before it: June's 90 → 1 − 1/90; 3 Nov's: 2 Nov's 102 → 1 − 1/102. June carries both; 29 Oct – 2 Nov the second; 3–4 Nov neither.
    const f1 = 1 - 1 / 90, f2 = 1 - 1 / 102;
    const realigned = db.ran("UPDATE daily_prices SET adj_close");
    expect(realigned.map((r) => [r.binds[1], Number((r.binds[2] as number).toFixed(9))])).toEqual([
      ["2026-06-01", Number((f1 * f2).toFixed(9))], ["2026-10-29", Number(f2.toFixed(9))], ["2026-10-30", Number(f2.toFixed(9))], ["2026-11-02", Number(f2.toFixed(9))],
    ]);
    expect(receipt(db, "realigned")).toEqual(["1 new ex-date(s): 4 stored closes re-adjusted"]);
    expect(db.ran("INSERT INTO fetch_log").find((r) => r.binds[2] === "realigned")!.binds[3]).toBe(4);
  });
  it("a halving in the series leaves the av_jump receipt in the shared format, and the quarantine reads that very text (review N1 / F1)", async () => {
    const halved = { ...DAILY, "Time Series (Daily)": { ...(DAILY["Time Series (Daily)"] as Record<string, unknown>), "2026-11-03": { "1. open": "50", "2. high": "50", "3. low": "50", "4. close": "50", "5. volume": "1000" }, "2026-11-04": { "1. open": "51", "2. high": "51", "3. low": "51", "4. close": "51", "5. volume": "1000" } } };
    network({ TIME_SERIES_DAILY: halved, DIVIDENDS: {} });
    const db = base([ticker({ fundamentals_as_of: RECENT, fundamentals_status: "ok", dividends_as_of: RECENT })]).on("SELECT ex_date, amount FROM dividends", () => ({ results: [] }));
    await runSmallCaps(env(db), NOW, budget());
    const [detail] = receipt(db, "av_jump");
    expect(detail).toBe(jumpReceipt([{ date: "2026-11-03", ratio: 0.49 }]));                     // 50 ÷ 102
    expect(detail).toBe("adjusted close moved ×0.49 on 2026-11-03 — a split the toolkit does not know (add it to the splits table), or news; prices are as traded");
    const q = fakeD1().on("FROM splits WHERE symbol", () => ({ results: [] }));
    expect(await quarantineReason(asD1(q), "AAA", [detail])).toBe("the adjusted close moved ×0.49 on 2026-11-03 with no splits row to explain it.");
    expect(summary(db).outcomes).toMatchObject({ ok: 1, av_jump: 1 });
  });
  it("nothing to re-align when the store already agrees with the record: no UPDATE, no receipt (N7)", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS });
    const f2 = 1 - 1 / 102;
    const stored = [["2026-10-29", 100], ["2026-10-30", 101], ["2026-11-02", 102], ["2026-11-03", 103], ["2026-11-04", 104]].map(([date, close]) => ({ date, close, adj_close: (close as number) * (date < "2026-11-03" ? f2 : 1) }));
    const db = base([ticker({ fundamentals_as_of: RECENT, fundamentals_status: "ok" })])
      .on("MAX(ex_date)", () => ({ results: [{ d: "2026-11-03", n: 2 }] }))
      .on("SELECT ex_date, amount FROM dividends", () => ({ results: [{ ex_date: "2026-08-01", amount: 1 }, { ex_date: "2026-11-03", amount: 1 }] }))
      .on("SELECT date, close, adj_close FROM daily_prices", () => ({ results: stored }));
    await runSmallCaps(env(db), NOW, budget());
    expect(db.ran("UPDATE daily_prices SET adj_close")).toHaveLength(0);
    expect(outcomes(db)).not.toContain("realigned");
  });
});

describe("the visit — accounts", () => {
  const FIVE = [2025, 2024, 2023, 2022, 2021];
  it("income not served → the company is `blocked` for the screen (no statements), stamped tonight, and the plan skips it from the next night", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: {}, BALANCE_SHEET: {} });
    const db = base([ticker()]);
    await runSmallCaps(env(db), NOW, budget());
    const status = db.ran("UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3");
    expect(status).toHaveLength(1);
    expect(status[0].binds).toEqual(["AAA", NOW, "blocked"]);
    expect(receipt(db, "fund_blocked")[0]).toMatch(/income not_served: empty object/);
    expect(db.ran("INSERT INTO fundamentals_annual")).toHaveLength(0);
    expect(summary(db)).toMatchObject({ withAccounts: 1, avCalls: 4, outcomes: { ok: 1, fund_blocked: 1 } });
  });
  it("the pruning DELETE (M15): ten years served, five kept — the rows outside the window are deleted by fiscal year, after the upsert", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: income([2025, 2024, 2023, 2022, 2021, 2020, 2019, 2018, 2017, 2016]), BALANCE_SHEET: balance(FIVE) });
    const db = base([ticker()]);
    await runSmallCaps(env(db), NOW, budget());
    const upserts = db.ran("INSERT INTO fundamentals_annual");
    expect(upserts.map((r) => r.binds[1])).toEqual(["2025", "2024", "2023", "2022", "2021"]);
    const prune = db.ran("DELETE FROM fundamentals_annual WHERE symbol = ?1 AND source = 'av' AND fiscal_year NOT IN");
    expect(prune).toHaveLength(1);
    expect(prune[0].sql).toContain("NOT IN (?2,?3,?4,?5,?6)");
    expect(prune[0].binds).toEqual(["AAA", "2025", "2024", "2023", "2022", "2021"]);
    const order = db.log.map((l) => l.sql).filter((s) => s.includes("fundamentals_annual"));
    expect(order.findIndex((s) => s.startsWith("DELETE"))).toBeGreaterThan(order.findIndex((s) => s.includes("INSERT INTO fundamentals_annual")));
    expect(db.ran("UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3")[0].binds[2]).toBe("ok");
    expect(receipt(db, "fund_ok")[0]).toMatch(/income 5y\+balance · edgar skipped: EDGAR_USER_AGENT not set/);
  });
  it("EDGAR 5xx: the accounts are kept, EPS left empty, the company marked eps_missing for step 0; the receipts say so", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: income(FIVE), BALANCE_SHEET: balance(FIVE) }, () => json({ error: "upstream" }, 502));
    const db = base([ticker({ cik: "12345" })]);
    const b = budget();
    await runSmallCaps(env(db, "stock-market-toolkit test"), NOW, b);
    expect(receipt(db, "edgar_failed")).toEqual(["EarningsPerShareDiluted: HTTP 502"]);
    expect(db.ran("UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3")[0].binds).toEqual(["AAA", NOW, "eps_missing"]);
    expect(receipt(db, "fund_eps_missing")[0]).toMatch(/edgar failed: EarningsPerShareDiluted: HTTP 502 — EPS left empty, EDGAR retried later/);
    expect(db.ran("INSERT INTO fundamentals_annual").map((r) => r.binds[5])).toEqual([null, null, null, null, null]);   // eps_diluted
    expect(summary(db)).toMatchObject({ avCalls: 4, edgarCalls: 1, fetches: 5 });
    expect(b.fetches).toBe(5);
  });
  it("EDGAR 403 is configuration (the User-Agent): status ok, EPS empty, NOT retried later", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: income(FIVE), BALANCE_SHEET: balance(FIVE) }, () => json({}, 403));
    const db = base([ticker({ cik: "12345" })]);
    await runSmallCaps(env(db, "stock-market-toolkit test"), NOW, budget());
    expect(receipt(db, "edgar_failed")[0]).toMatch(/^EarningsPerShareDiluted: HTTP 403 — EDGAR refused the request; check EDGAR_USER_AGENT/);
    expect(db.ran("UPDATE tickers SET fundamentals_as_of = ?2, fundamentals_status = ?3")[0].binds[2]).toBe("ok");
    expect(receipt(db, "fund_ok")[0]).toMatch(/EPS left empty$/);
    expect(receipt(db, "fund_ok")[0]).not.toMatch(/retried later/);
  });
  it("step 0: an eps_missing company is asked of EDGAR again at no Alpha Vantage cost — EPS written, status ok, edgar_ok receipt; it is not visited tonight (fresh)", async () => {
    const calls = network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS }, (tag) => tag === "EarningsPerShareDiluted" ? json(EDGAR_OK(2.5)) : json({}, 404));
    const db = base([ticker({ cik: "12345", fundamentals_status: "eps_missing", fundamentals_as_of: RECENT, last_price_fetch: "2026-11-05T12:00:00.000Z", dividends_as_of: RECENT })])
      .on("SELECT fiscal_year, period_end FROM fundamentals_annual", () => ({ results: [{ fiscal_year: "2025", period_end: "2025-12-31" }] }));
    await runSmallCaps(env(db, "stock-market-toolkit test"), NOW, budget());
    expect(calls.filter((c) => c.startsWith("av:"))).toEqual([]);
    expect(calls[0]).toBe("edgar:EarningsPerShareDiluted");
    const eps = db.ran("UPDATE fundamentals_annual SET eps_diluted");
    expect(eps).toHaveLength(1);
    expect(eps[0].binds.slice(0, 3)).toEqual(["AAA", "2025", 2.5]);
    expect(String(eps[0].binds[3])).toMatch(/^edgar:EarningsPerShareDiluted 10-K filed 2026-02-20/);
    expect(db.ran("UPDATE tickers SET fundamentals_status = 'ok'").map((r) => r.binds[0])).toEqual(["AAA"]);
    expect(receipt(db, "edgar_ok")).toEqual(["EDGAR retry: eps 1/1"]);
    expect(summary(db)).toMatchObject({ planned: 0, skippedFresh: 1, edgarRetried: 1, avCalls: 0 });
  });
  it("step 0 on a 403: the status goes back to ok and the company is not asked again (configuration, not EDGAR's weather)", async () => {
    network({}, () => json({}, 403));
    const db = base([ticker({ cik: "12345", fundamentals_status: "eps_missing", fundamentals_as_of: RECENT, last_price_fetch: "2026-11-05T12:00:00.000Z", dividends_as_of: RECENT })])
      .on("SELECT fiscal_year, period_end FROM fundamentals_annual", () => ({ results: [{ fiscal_year: "2025", period_end: "2025-12-31" }] }));
    await runSmallCaps(env(db, "stock-market-toolkit test"), NOW, budget());
    expect(db.ran("UPDATE tickers SET fundamentals_status = 'ok'")).toHaveLength(1);
    expect(receipt(db, "edgar_failed")[0]).toMatch(/HTTP 403 .* — not retried \(configuration\)$/);
  });
});

describe("the visit — halts and the budget", () => {
  it("the ration met mid-visit (income call refused): the prices stay written, last_price_fetch is cleared so the company is first tomorrow (OI-34), two receipts", async () => {
    network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS, INCOME_STATEMENT: { Information: "We have detected your API key as TESTKEY0000000000 and our standard API rate limit is 25 requests per day." } });
    const db = base([ticker(), ticker({ symbol: "BBB" })]);
    await runSmallCaps(env(db), NOW, budget());
    expect(db.ran("INSERT INTO daily_prices")).toHaveLength(5);                                     // AAA's five bars went in before the halt
    expect(db.ran("UPDATE tickers SET last_price_fetch = ?2").map((r) => r.binds)).toEqual([["AAA", NOW]]);
    expect(db.ran("UPDATE tickers SET last_price_fetch = NULL").map((r) => r.binds)).toEqual([["AAA"]]);
    expect(outcomes(db).filter((o) => o === "rate_limited")).toHaveLength(2);                        // the symbol's receipt and the run's
    const perSymbol = db.ran("INSERT INTO fetch_log").find((r) => r.binds[2] === "rate_limited")!;
    expect(perSymbol.binds[1]).toBe("AAA");
    expect(String(perSymbol.binds[4])).toMatch(/^Information: We have detected your API key as KEY .* — run stopped; resumes tomorrow\.$/);
    expect(db.ran("INSERT INTO fundamentals_annual")).toHaveLength(0);
    expect(db.ran("INSERT INTO daily_prices").filter((r) => r.binds[0] === "BBB")).toHaveLength(0);  // BBB was never reached
    expect(summary(db)).toMatchObject({ planned: 2, avCalls: 3, outcomes: { ok: 1, rate_limited: 1 } });
  });
  it("the fetch budget (50 a Worker invocation): a visit that would cross it is not started; the receipt names the symbol", async () => {
    const calls = network({ TIME_SERIES_DAILY: DAILY, DIVIDENDS: DIVIDENDS });
    const db = base([ticker({ fundamentals_as_of: RECENT, fundamentals_status: "ok" }), ticker({ symbol: "BBB", fundamentals_as_of: RECENT, fundamentals_status: "ok" })]);
    await runSmallCaps(env(db), NOW, { fetches: 42, max: 45 });                                       // AAA's visit costs 2 (44), BBB's would make 46
    expect(calls.filter((c) => c.startsWith("av:"))).toHaveLength(2);
    expect(receipt(db, "fetch_budget")).toEqual(["Fetch budget 45 per invocation would be exceeded at BBB — resumes tomorrow."]);
    expect(summary(db)).toMatchObject({ planned: 2, avCalls: 2, fetches: 44 });
  });
});
