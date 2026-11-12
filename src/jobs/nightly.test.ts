/**
 * The core-tier price walk and the accounts phase on the fake D1 (OI-77 — the
 * half of OI-70 the Week 10 shipment left; review N13 of Phase 3). The
 * network is a router at `fetch`, keyed by the FMP path and the `from`
 * parameter, so each test says what the provider answers and pins what the
 * job then reads, writes and records: the realign set (full history for the
 * stalest few, incremental from last date − 7 days for the rest), the
 * "done tonight" skip, `upsertBars` in chunks, the blocked / rate-limited /
 * auth-failed / error branches, the write wall, the fetch budget, and
 * `runFundamentals`' merge, statuses and stops. Timers are faked: the walk
 * sleeps 250 ms a symbol, which the suite does not.
 *
 * Decisions only: the SQL's ORDER BY (stalest first) runs in SQLite, and is
 * exercised against the real local D1 in the sandbox runs recorded in
 * BUILD-LOG; here the rows arrive in the order the fake returns them.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { fakeD1, asD1, type FakeD1 } from "./fake-d1";
import { runNightly, runFundamentals } from "./nightly";

const NOW = "2026-11-12T22:30:00.000Z";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const bars = (n: number, from = "2026-11-01") => Array.from({ length: n }, (_, i) => { const d = new Date(from); d.setUTCDate(d.getUTCDate() + i); return { date: d.toISOString().slice(0, 10), adjOpen: 100 + i, adjHigh: 101 + i, adjLow: 99 + i, adjClose: 100.5 + i, volume: 1000 }; });

type Answer = (url: URL) => Response | Promise<Response>;
/** A router at `fetch`: FMP calls by path; the calls recorded as "path symbol from?". */
function network(answers: Record<string, Answer | unknown>) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    const path = url.pathname.replace("/stable/", "");
    const symbol = url.searchParams.get("symbol")!;
    const from = url.searchParams.get("from");
    calls.push(`${path} ${symbol}${from ? ` from ${from}` : ""}`);
    const a = answers[`${path} ${symbol}`] ?? answers[path];
    if (a === undefined) throw new Error(`no stub for ${path} ${symbol}`);
    return typeof a === "function" ? (a as Answer)(url) : json(a);
  }));
  return calls;
}
const ticker = (symbol: string, over: Record<string, unknown> = {}) => ({ symbol, last_full_fetch: null, last_price_fetch: null, last_date: null, ...over });
const env = (db: FakeD1, key = "TESTKEY0000000000") => ({ DB: asD1(db), FMP_API_KEY: key, ALPHAVANTAGE_API_KEY: "x", EDGAR_USER_AGENT: "" }) as any;
const summary = (db: FakeD1) => JSON.parse(String(db.ran("INSERT INTO fetch_log").find((l) => l.binds[2] === "run_summary")!.binds[4]));
const receipts = (db: FakeD1) => db.ran("INSERT INTO fetch_log").map((l) => `${l.binds[1] ?? "-"}:${l.binds[2]}`);

/** Runs the job with the sleeps skipped. */
async function run(db: FakeD1, phase: "prices" | "fundamentals" = "prices", key?: string) {
  const p = runNightly(env(db, key), phase);
  await vi.runAllTimersAsync();
  await p;
}

const fakeClock = () => { beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(NOW)); }); afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); }); };

describe("runNightly — the price walk", () => {
  fakeClock();
  it("no key: an auth_failed receipt and no fetch; no active tickers: a summary that says to seed", async () => {
    const calls = network({});
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [] }));
    await run(d, "prices", "");
    expect(receipts(d)).toEqual(["-:auth_failed"]);
    expect(calls).toEqual([]);
    const e = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [] }));
    await run(e);
    expect(String(e.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/seed the universe first/);
  });
  it("the realign set is the four stalest full fetches (never-fetched first): full history for them, incremental from last date − 7 days for the rest; the stamps differ", async () => {
    const calls = network({ "historical-price-eod/dividend-adjusted": (url: URL) => json(url.searchParams.get("from") ? bars(3, "2026-11-08") : bars(250, "2025-11-12")) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [
      ticker("AAA", { last_full_fetch: "2026-10-01T22:30:00.000Z", last_date: "2026-11-10" }),
      ticker("BBB", { last_full_fetch: null, last_date: null }),
      ticker("CCC", { last_full_fetch: "2026-09-01T22:30:00.000Z", last_date: "2026-11-10" }),
      ticker("DDD", { last_full_fetch: "2026-11-01T22:30:00.000Z", last_date: "2026-11-10" }),
      ticker("EEE", { last_full_fetch: "2026-08-01T22:30:00.000Z", last_date: "2026-11-10" }),
      ticker("FFF", { last_full_fetch: "2026-10-15T22:30:00.000Z", last_date: "2026-11-10" }),
    ] }));
    await run(d);
    // realign: BBB (never), EEE (Aug), CCC (Sep), AAA (Oct 1) — not FFF (Oct 15) or DDD (Nov 1)
    expect(calls).toEqual([
      "historical-price-eod/dividend-adjusted AAA", "historical-price-eod/dividend-adjusted BBB", "historical-price-eod/dividend-adjusted CCC",
      "historical-price-eod/dividend-adjusted DDD from 2026-11-03", "historical-price-eod/dividend-adjusted EEE", "historical-price-eod/dividend-adjusted FFF from 2026-11-03",
    ]);
    const stamps = d.ran("UPDATE tickers SET last_price_fetch");
    expect(stamps.map((s) => `${s.binds[0]}:${s.sql.includes("last_full_fetch") ? "full" : "incremental"}`)).toEqual(["AAA:full", "BBB:full", "CCC:full", "DDD:incremental", "EEE:full", "FFF:incremental"]);
    expect(stamps[0].binds[1]).toBe(NOW);
    const s = summary(d);
    expect(s).toMatchObject({ phase: "prices", tickers: 6, doneTonight: 0, fetches: 6, inserts: 4 * 250 + 2 * 3, realigned: ["BBB", "EEE", "CCC", "AAA"], outcomes: { ok: 6 }, fundamentals: "separate invocation", smallcaps: "separate invocation" });
    expect(receipts(d).filter((r) => r.endsWith(":ok"))).toHaveLength(6);
  });
  it("upsertBars writes in chunks of bound statements (40 a batch), every bar once, on conflict updating", async () => {
    network({ "historical-price-eod/dividend-adjusted": bars(130) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA")] }));
    await run(d);
    const ins = d.ran("INSERT INTO daily_prices");
    expect(ins).toHaveLength(130);
    expect(d.batches).toBe(4);   // 40 + 40 + 40 + 10 — the chunk size is the statement's, pinned (review N10)
    expect(ins[0].sql).toMatch(/ON CONFLICT \(symbol, date\) DO UPDATE SET/);
    expect(ins[0].binds).toEqual(["AAA", "2026-11-01", 100, 101, 99, 100.5, 1000]);
    expect(ins[129].binds[1]).toBe("2027-03-10");
    expect(summary(d).inserts).toBe(130);
  });
  it("a symbol fetched within six hours is 'done tonight' and skipped; all done means no fetch and a note", async () => {
    const calls = network({ "historical-price-eod/dividend-adjusted": bars(2) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [
      ticker("AAA", { last_price_fetch: "2026-11-12T22:00:00.000Z", last_full_fetch: "2026-11-12T22:00:00.000Z", last_date: "2026-11-11" }),
      ticker("BBB", { last_price_fetch: "2026-11-11T22:30:00.000Z", last_full_fetch: "2026-10-01T22:30:00.000Z", last_date: "2026-11-10" }),
    ] }));
    await run(d);
    expect(calls).toEqual(["historical-price-eod/dividend-adjusted BBB"]);
    expect(summary(d)).toMatchObject({ tickers: 2, doneTonight: 1, fetches: 1 });
    const e = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA", { last_price_fetch: "2026-11-12T20:00:00.000Z", last_date: "2026-11-11" })] }));
    await run(e);
    expect(summary(e)).toMatchObject({ tickers: 1, doneTonight: 1, fetches: 0, note: "all prices already fetched tonight" });
  });
  it("a 402 marks the ticker blocked with the reason and the walk goes on; a 500 is an error and the walk goes on", async () => {
    const calls = network({
      "historical-price-eod/dividend-adjusted AAA": () => json({ message: "premium query parameter" }, 402),
      "historical-price-eod/dividend-adjusted BBB": () => json({}, 500),
      "historical-price-eod/dividend-adjusted CCC": bars(2),
    });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB"), ticker("CCC")] }));
    await run(d);
    expect(calls).toHaveLength(3);
    const blocked = d.ran("UPDATE tickers SET status = 'blocked'");
    expect(blocked).toHaveLength(1);
    expect(blocked[0].binds[0]).toBe("AAA");
    expect(String(blocked[0].binds[1])).toMatch(/Outside the free data plan/);
    expect(receipts(d)).toEqual(["AAA:blocked", "BBB:error", "CCC:ok", "-:run_summary"]);
    expect(summary(d).outcomes).toEqual({ blocked: 1, error: 1, ok: 1 });
  });
  it("a 429 stops the walk with a rate_limited receipt; a 401 aborts it with auth_failed — the symbols after are not fetched", async () => {
    const calls = network({ "historical-price-eod/dividend-adjusted AAA": () => json({ message: "Limit Reach" }, 429), "historical-price-eod/dividend-adjusted BBB": bars(2) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB")] }));
    await run(d);
    expect(calls).toEqual(["historical-price-eod/dividend-adjusted AAA"]);
    expect(receipts(d)).toEqual(["AAA:rate_limited", "-:run_summary"]);
    expect(String(d.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/run stopped; resumes tomorrow/);
    const calls2 = network({ "historical-price-eod/dividend-adjusted AAA": () => json({}, 401), "historical-price-eod/dividend-adjusted BBB": bars(2) });
    const e = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB")] }));
    await run(e);
    expect(calls2).toHaveLength(1);
    expect(receipts(e)).toEqual(["AAA:auth_failed", "-:run_summary"]);
    expect(String(e.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/check FMP_API_KEY/);
  });
  it("three consecutive write failures are read as the daily write wall: write_limited, and the walk stops with the stamps unwritten", async () => {
    const calls = network({ "historical-price-eod/dividend-adjusted": bars(2) });
    const d = fakeD1()
      .on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB"), ticker("CCC"), ticker("DDD")] }))
      .on("INSERT INTO daily_prices", () => ({ error: "D1_ERROR: too many writes" }));
    await run(d);
    expect(calls).toHaveLength(3);
    expect(receipts(d)).toEqual(["AAA:write_error", "BBB:write_error", "CCC:write_error", "-:write_limited", "-:run_summary"]);
    expect(d.ran("UPDATE tickers SET last_price_fetch")).toHaveLength(0);
    expect(summary(d).outcomes).toEqual({ write_error: 3 });
  });
  it("one write failure is forgiven when the next symbol writes: the counter resets", async () => {
    network({ "historical-price-eod/dividend-adjusted": bars(1) });
    let n = 0;
    const d = fakeD1()
      .on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB"), ticker("CCC"), ticker("DDD")] }))
      .on("INSERT INTO daily_prices", () => (++n % 2 === 1 ? { error: "flaky" } : undefined));
    await run(d);
    expect(receipts(d)).toEqual(["AAA:write_error", "BBB:ok", "CCC:write_error", "DDD:ok", "-:run_summary"]);
  });
  it("the insert budget per invocation (20,000 rows): the next symbol is left for tomorrow with a write_budget receipt", async () => {
    network({ "historical-price-eod/dividend-adjusted": bars(20001) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: [ticker("AAA"), ticker("BBB")] }));
    await run(d);
    expect(receipts(d)).toEqual(["AAA:ok", "-:write_budget", "-:run_summary"]);
    expect(summary(d)).toMatchObject({ fetches: 1, inserts: 20001 });
  });
  it("the 45-fetch budget per invocation: the 46th symbol is left for tomorrow with a fetch_budget receipt", async () => {
    const calls = network({ "historical-price-eod/dividend-adjusted": bars(1) });
    const d = fakeD1().on("FROM tickers t LEFT JOIN daily_prices", () => ({ results: Array.from({ length: 47 }, (_, i) => ticker(`S${String(i).padStart(2, "0")}`)) }));
    await run(d);
    expect(calls).toHaveLength(45);
    expect(receipts(d).filter((r) => r === "-:fetch_budget")).toHaveLength(1);
    expect(summary(d)).toMatchObject({ tickers: 47, fetches: 45, inserts: 45 });
  });
});

const income = (years: number[]) => years.map((y) => ({ date: `${y}-12-31`, fiscalYear: String(y), revenue: y * 1000, netIncome: y * 10, epsDiluted: 1.5, weightedAverageShsOutDil: 1000 }));
const balance = (years: number[]) => years.map((y) => ({ date: `${y}-12-31`, fiscalYear: String(y), totalCurrentAssets: 500, totalCurrentLiabilities: 200, totalAssets: 900, totalLiabilities: 400, longTermDebt: 100, totalStockholdersEquity: 500, goodwillAndIntangibleAssets: 0 }));
const dividends = (n: number) => Array.from({ length: n }, (_, i) => ({ date: `2026-${String(12 - (i % 12)).padStart(2, "0")}-01`, adjDividend: 0.25 }));
const budget = (max = 45) => ({ fetches: 0, max, calls: 0, maxCalls: 200 });

describe("runFundamentals — the accounts phase", () => {
  fakeClock();
  it("three calls a symbol, income and balance merged by fiscal year into one batch, the dividends in another, the stamp and a fund_ok receipt", async () => {
    const calls = network({ "income-statement": income([2025, 2024]), "balance-sheet-statement": balance([2025, 2024]), dividends: dividends(4) });
    const d = fakeD1().on("FROM tickers\n       WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }] })).on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }] }));
    const b = budget();
    const p = runFundamentals(env(d), NOW, b);
    await vi.runAllTimersAsync();
    await p;
    expect(calls).toEqual(["income-statement AAA", "balance-sheet-statement AAA", "dividends AAA"]);
    expect(b.fetches).toBe(3);
    const fa = d.ran("INSERT INTO fundamentals_annual");
    expect(fa).toHaveLength(2);
    expect(fa[0].binds.slice(0, 7)).toEqual(["AAA", "2025", "2025-12-31", 2025000, 20250, 1.5, 500]);
    expect(d.ran("INSERT INTO dividends")).toHaveLength(4);
    const stamp = d.ran("UPDATE tickers SET fundamentals_as_of");
    expect(stamp[0].binds).toEqual(["AAA", NOW, "ok"]);
    expect(receipts(d)).toEqual(["AAA:fund_ok"]);
    expect(String(d.ran("INSERT INTO fetch_log")[0].binds[4])).toBe("income 2y+balance · dividends 4");
  });
  it("a missing balance sheet is 'partial'; income behind the paywall is 'blocked'; a 500 on income is 'error' — each retried or not as the status says", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ "income-statement": income([2025]), "balance-sheet-statement": () => json({}, 500), dividends: dividends(1) }, "partial"],
      [{ "income-statement": () => json({}, 402), "balance-sheet-statement": balance([2025]), dividends: dividends(1) }, "blocked"],
      [{ "income-statement": () => json({}, 500), "balance-sheet-statement": balance([2025]), dividends: dividends(1) }, "error"],
    ];
    for (const [answers, status] of cases) {
      network(answers);
      const d = fakeD1().on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }] }));
      const p = runFundamentals(env(d), NOW, budget());
      await vi.runAllTimersAsync();
      await p;
      expect(d.ran("UPDATE tickers SET fundamentals_as_of")[0].binds[2], status).toBe(status);
      expect(receipts(d), status).toEqual([`AAA:fund_${status}`]);
    }
  });
  it("a key rejected or a provider limit stops the phase before any write; the fetch budget stops it before the symbol", async () => {
    network({ "income-statement": () => json({}, 401), "balance-sheet-statement": balance([2025]), dividends: dividends(1) });
    const d = fakeD1().on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }, { symbol: "BBB" }] }));
    let p = runFundamentals(env(d), NOW, budget()); await vi.runAllTimersAsync(); await p;
    expect(receipts(d)).toEqual(["AAA:auth_failed"]);
    expect(d.ran("INSERT INTO fundamentals_annual")).toHaveLength(0);
    network({ "income-statement": () => json({ message: "Limit Reach" }, 429), "balance-sheet-statement": balance([2025]), dividends: dividends(1) });
    const e = fakeD1().on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }, { symbol: "BBB" }] }));
    p = runFundamentals(env(e), NOW, budget()); await vi.runAllTimersAsync(); await p;
    expect(receipts(e)).toEqual(["AAA:rate_limited"]);
    const calls = network({ "income-statement": income([2025]), "balance-sheet-statement": balance([2025]), dividends: dividends(1) });
    const f = fakeD1().on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }] }));
    p = runFundamentals(env(f), NOW, budget(2)); await vi.runAllTimersAsync(); await p;
    expect(calls).toEqual([]);
    expect(receipts(f)).toEqual(["-:fetch_budget"]);
  });
  it("the fundamentals invocation of runNightly wraps the phase with its own summary", async () => {
    network({ "income-statement": income([2025]), "balance-sheet-statement": balance([2025]), dividends: dividends(2) });
    const d = fakeD1().on("WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAA" }] }));
    await run(d, "fundamentals");
    expect(receipts(d)).toEqual(["AAA:fund_ok", "-:run_summary"]);
    expect(summary(d)).toMatchObject({ phase: "fundamentals", fetches: 3 });
  });
});

// ---------------------------------------------------------------------------
// The cron → phase dispatch and the fences around the signal pass (v0.9.0 review F1/F3 and N2) — as before OI-77.
// ---------------------------------------------------------------------------
const closes = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date("2021-01-01"); d.setUTCDate(d.getUTCDate() + (n - 1 - i));
  return { date: d.toISOString().slice(0, 10), close: 100 + (n - 1 - i) * 0.3 };
});

describe("runNightly — the signals phase (the dispatch and the fences)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("'signals' runs the pass, the stop tracker and the risk report, nothing else: no provider call, no price or accounts query, one signals row per instrument, three receipts", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers WHERE status = 'active'", () => ({ results: [{ symbol: "AAA" }] }))
      .on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: "2026-10-29" }] }))
      .on("FROM daily_prices", () => ({ results: closes(300) }));
    await runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "signals");
    expect(db.ran("INSERT INTO signals").length).toBe(1);
    expect(db.ran("fundamentals").length).toBe(0);
    expect(db.ran("last_price_fetch").length).toBe(0);
    const receipts = db.ran("INSERT INTO fetch_log").map((r) => JSON.parse(String(r.binds[4])).phase);
    expect(receipts).toEqual(["signals", "stops", "risk"]);    // week 8: the stop tracker follows the signal pass; week 9: the risk report follows the tracker
    expect(JSON.parse(String(db.ran("INSERT INTO fetch_log")[0].binds[4]))).toMatchObject({ phase: "signals", written: 1 });
    expect(JSON.parse(String(db.ran("INSERT INTO fetch_log")[1].binds[4]))).toMatchObject({ phase: "stops", positions: 0 });
    expect(JSON.parse(String(db.ran("INSERT INTO fetch_log")[2].binds[4]))).toMatchObject({ phase: "risk", students: 0, written: 0 });
  });

  it("a pass that throws outright becomes a signals_error receipt — never an unhandled rejection", async () => {
    const db = fakeD1().on("SELECT symbol, tier FROM tickers WHERE status = 'active'", () => { throw new Error("boom"); });
    await expect(runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "signals")).resolves.toBeUndefined();
    const outcomes = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
    expect(outcomes).toContain("signals_error");
  });

  it("'smallcaps' is fenced too (v0.10.0 review F4): a visit that throws outright leaves a smallcaps_error receipt", async () => {
    const db = fakeD1().on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => { throw new Error("D1_ERROR: boom"); });
    await expect(runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "k", SMALLCAP_AV_CALLS: "18" } as any, "smallcaps")).resolves.toBeUndefined();
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toContain("smallcaps_error");
  });

  it("'fundamentals' (the 22:50 line) no longer runs the signal pass — it has its own invocation (review F3)", async () => {
    const db = fakeD1().on("SELECT symbol, tier FROM tickers WHERE status = 'active'", () => ({ results: [{ symbol: "AAA" }] }));
    await runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "fundamentals");
    expect(db.ran("INSERT INTO signals").length).toBe(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["auth_failed"]);   // no FMP key → the accounts phase says so
  });
});
