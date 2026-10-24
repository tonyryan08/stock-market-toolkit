/**
 * The cron → phase dispatch and the fences around the signal pass, on the fake
 * D1 (v0.9.0 review F1/F3 and N2: nothing exercised runNightly's branches).
 */
import { describe, it, expect } from "vitest";
import { runNightly } from "./nightly";
import { fakeD1, asD1 } from "./fake-d1";

const closes = (n: number) => Array.from({ length: n }, (_, i) => {
  const d = new Date("2021-01-01"); d.setUTCDate(d.getUTCDate() + (n - 1 - i));
  return { date: d.toISOString().slice(0, 10), close: 100 + (n - 1 - i) * 0.3 };
});

describe("runNightly — the signals phase", () => {
  it("'signals' runs the pass alone: no provider call, no price or accounts query, one signals row per instrument, one receipt", async () => {
    const db = fakeD1()
      .on("SELECT symbol FROM tickers WHERE status = 'active'", () => ({ results: [{ symbol: "AAA" }] }))
      .on("FROM daily_prices", () => ({ results: closes(300) }));
    await runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "signals");
    expect(db.ran("INSERT INTO signals").length).toBe(1);
    expect(db.ran("fundamentals").length).toBe(0);
    expect(db.ran("last_price_fetch").length).toBe(0);
    const outcomes = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
    expect(outcomes).toEqual(["run_summary"]);
    expect(JSON.parse(String(db.ran("INSERT INTO fetch_log")[0].binds[4]))).toMatchObject({ phase: "signals", written: 1 });
  });

  it("a pass that throws outright becomes a signals_error receipt — never an unhandled rejection", async () => {
    const db = fakeD1().on("SELECT symbol FROM tickers WHERE status = 'active'", () => { throw new Error("boom"); });
    await expect(runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "signals")).resolves.toBeUndefined();
    const outcomes = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
    expect(outcomes).toContain("signals_error");
  });

  it("'fundamentals' (the 22:50 line) no longer runs the signal pass — it has its own invocation (review F3)", async () => {
    const db = fakeD1().on("SELECT symbol FROM tickers WHERE status = 'active'", () => ({ results: [{ symbol: "AAA" }] }));
    await runNightly({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" } as any, "fundamentals");
    expect(db.ran("INSERT INTO signals").length).toBe(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["auth_failed"]);   // no FMP key → the accounts phase says so
  });
});
