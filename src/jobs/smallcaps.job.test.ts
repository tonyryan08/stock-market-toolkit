/**
 * The small-cap visit as a JOB on the fake D1 (OI-44, the S12 tests) — what
 * it reads, what it decides, what it writes — with the network stubbed at
 * `fetch`. The ration (OI-51) is the first case: two live runs were cut short
 * by Alpha Vantage's rolling window before the job counted its own receipts.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fakeD1, asD1 } from "./fake-d1";
import { rationLeft, runSmallCaps, AV_RATION_PER_24H, AV_RESERVE } from "./smallcaps";

const NOW = "2026-11-01T11:15:00.000Z";
const env = (db: ReturnType<typeof fakeD1>, calls = "18") =>
  ({ DB: asD1(db), ALPHAVANTAGE_API_KEY: "k", EDGAR_USER_AGENT: "", SMALLCAP_AV_CALLS: calls, SMALLCAP_AV_SPACING_MS: "0" }) as any;
const budget = () => ({ fetches: 0, max: 45 });

afterEach(() => vi.unstubAllGlobals());

describe("rationLeft — the rolling 24 hours, from the receipts", () => {
  it("sums the visits' avCalls and counts the live quotes since 24 hours ago; the oldest call names when the window frees", () => {
    const db = fakeD1()
      .on("json_extract(detail, '$.phase') END) = 'smallcaps'", (b) => {
        expect(b[0]).toBe("2026-10-31T11:05:00.000Z");          // since = now − 24 h − the 10-minute margin (review F7)
        return { results: [{ n: 18, oldest: "2026-10-31T19:18:55.884Z" }] };
      })
      .on("outcome = 'quote_demo'", () => ({ results: [{ n: 2, oldest: "2026-10-31T20:00:00.000Z" }] }));
    return rationLeft(asD1(db), NOW).then((r) => {
      expect(r).toEqual({ visits: 18, quotes: 2, used: 20, reserve: AV_RESERVE, available: AV_RATION_PER_24H - 20 - AV_RESERVE, nextAt: "2026-11-01T19:28:55.884Z" });   // oldest + 24 h 10 min
    });
  });
  it("nothing in the window: the whole ration less the reserve, and no roll-off time", async () => {
    const db = fakeD1().on("json_extract", () => ({ results: [{ n: null, oldest: null }] })).on("quote_demo", () => ({ results: [{ n: 0, oldest: null }] }));
    expect(await rationLeft(asD1(db), NOW)).toEqual({ visits: 0, quotes: 0, used: 0, reserve: 3, available: 22, nextAt: null });
  });
});

describe("rationLeft — the guards (review F4)", () => {
  it("the SQL never reaches json_extract on a receipt that is not JSON: json_valid inside a CASE, in both terms", () => {
    const sqls: string[] = [];
    const db = fakeD1().on("FROM fetch_log", (b) => { return { results: [{ n: 0, oldest: null }] }; });
    return rationLeft(asD1(db), NOW).then(() => {
      for (const l of db.log) sqls.push(l.sql);
      const visits = sqls.find((q) => q.includes("$.avCalls"))!;
      expect(visits).toContain("CASE WHEN json_valid(detail) THEN json_extract(detail, '$.avCalls') END");
      expect(visits).toContain("(CASE WHEN json_valid(detail) THEN json_extract(detail, '$.phase') END) = 'smallcaps'");
      expect(visits).not.toMatch(/json_extract\(detail, '\$\.(avCalls|phase)'\)(?!\s*END)/);   // no bare json_extract anywhere
    });
  });
  it("a receipt read that throws does not end the visit: a ration_error receipt, the ceiling planned (as v0.9.0 did)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Information: "We have detected your API key as k and our standard API rate limit is 25 requests per day." }), { status: 200, headers: { "content-type": "application/json" } })));
    const db = fakeD1()
      .on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => ({ results: [{ symbol: "AAA", cik: null, last_price_fetch: null, fundamentals_as_of: null, fundamentals_status: null, dividends_as_of: null }] }))
      .on("json_valid", () => ({ error: "D1_ERROR: malformed JSON: SQLITE_ERROR" }));
    await runSmallCaps(env(db), NOW, budget());
    const outcomes = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
    expect(outcomes[0]).toBe("ration_error");
    expect(outcomes.at(-1)).toBe("run_summary");
    const summary = JSON.parse(String(db.ran("INSERT INTO fetch_log").at(-1)!.binds[4]));
    expect(summary.ration).toMatchObject({ unknown: true, available: 18, requested: 18, planned: 18 });
  });
});

describe("runSmallCaps and the ration", () => {
  const tier = [{ symbol: "AAA", cik: null, last_price_fetch: null, fundamentals_as_of: null, fundamentals_status: null, dividends_as_of: null }];
  it("1 Nov 2026 again: 18 calls still in the window → not one full visit fits → one receipt, nothing fetched, the roll-off time named", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
    const db = fakeD1()
      .on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => ({ results: tier }))
      .on("json_extract", () => ({ results: [{ n: 18, oldest: "2026-10-31T19:18:55.884Z" }] }))
      .on("quote_demo", () => ({ results: [{ n: 1, oldest: "2026-10-31T21:00:00.000Z" }] }));
    await runSmallCaps(env(db), NOW, budget());
    expect(fetchSpy).not.toHaveBeenCalled();
    const receipts = db.ran("INSERT INTO fetch_log");
    expect(receipts.length).toBe(1);
    const summary = JSON.parse(String(receipts[0].binds[4]));
    expect(summary).toMatchObject({ phase: "smallcaps", planned: 0, avCalls: 0, ration: { used: 19, available: 3, requested: 18, planned: 0 } });
    expect(summary.note).toMatch(/ration spent: 19 of 25 calls used in the last 24 hours \(18 by visits, 1 by live quotes\), 3 kept back/);
    expect(summary.note).toMatch(/roll off at 2026-11-01T19:28:55.884Z/);
  });
  it("a partly spent window caps the plan: 18 asked, 6 available → one full visit; the receipt carries the ration", async () => {
    // Alpha Vantage answers the first call with its daily-limit notice: the run halts cleanly after that one call.
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Information: "We have detected your API key as k and our standard API rate limit is 25 requests per day." }), { status: 200, headers: { "content-type": "application/json" } })));
    const db = fakeD1()
      .on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => ({ results: tier }))
      .on("json_extract", () => ({ results: [{ n: 16, oldest: "2026-10-31T19:18:55.884Z" }] }))
      .on("quote_demo", () => ({ results: [{ n: 0, oldest: null }] }));
    await runSmallCaps(env(db), NOW, budget());
    const outcomes = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
    expect(outcomes).toContain("rate_limited");
    const summary = JSON.parse(String(db.ran("INSERT INTO fetch_log").at(-1)!.binds[4]));
    expect(summary.ration).toEqual({ visits: 16, quotes: 0, used: 16, reserve: 3, available: 6, nextAt: "2026-11-01T19:28:55.884Z", requested: 18, planned: 6 });
    expect(summary.planned).toBe(1);        // 6 calls buy one full visit (4), not two
    expect(summary.avCalls).toBe(1);        // the one refused call
    expect(summary.ration.planned).toBe(6);
  });
  it("a fresh window: --calls is the ceiling (18 of 22 available), the plan is 4 full visits", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ Note: "Thank you for using Alpha Vantage! Our standard API rate limit is 5 calls per minute." }), { status: 200, headers: { "content-type": "application/json" } })));
    const five = ["AAA", "BBB", "CCC", "DDD", "EEE"].map((symbol) => ({ ...tier[0], symbol }));
    const db = fakeD1()
      .on("FROM tickers WHERE status = 'active' AND tier = 'small'", () => ({ results: five }))
      .on("json_extract", () => ({ results: [{ n: 0, oldest: null }] }))
      .on("quote_demo", () => ({ results: [{ n: 0, oldest: null }] }));
    await runSmallCaps(env(db, "18"), NOW, budget());
    const summary = JSON.parse(String(db.ran("INSERT INTO fetch_log").at(-1)!.binds[4]));
    expect(summary.ration).toMatchObject({ available: 22, requested: 18, planned: 18 });
    expect(summary.planned).toBe(4);
  });
});
