/** The nightly signal pass against a fake D1: what it reads, what it writes, what the receipt says. */
import { describe, it, expect } from "vitest";
import { runSignals, LOOKBACK, quarantineReason, loadJumpReceipts } from "./signals";
import { HISTORY_LIMIT } from "../lib/signals";
import { jumpReceipt, parseJumpReceipt, suspiciousJumps } from "../lib/adjust";
import { fakeD1, asD1 } from "./fake-d1";

const closes = (n: number, start = 100, step = 0.3) => Array.from({ length: n }, (_, i) => {
  const d = new Date("2021-01-01"); d.setUTCDate(d.getUTCDate() + (n - 1 - i));   // newest first, as the job reads them
  return { date: d.toISOString().slice(0, 10), close: start + (n - 1 - i) * step };
});

describe("runSignals", () => {
  it("writes one row per instrument with enough closes, skips the rest, and the receipt counts long / flat / warming", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers", () => ({ results: [{ symbol: "AAA" }, { symbol: "BBB" }, { symbol: "CCC" }, { symbol: "DDD" }] }))
      .on("FROM daily_prices", (b) => ({ results: b[0] === "AAA" ? closes(300) : b[0] === "BBB" ? closes(300, 300, -0.5) : b[0] === "CCC" ? closes(60) : closes(5) }));
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T22:50:00Z");
    expect(s).toMatchObject({ phase: "signals", instruments: 4, written: 3, long: 1, flat: 1, warming: 1, skipped: 1 });
    const reads = db.ran("FROM daily_prices");
    expect(reads.map((r) => r.binds)).toEqual([["AAA", LOOKBACK], ["BBB", LOOKBACK], ["CCC", LOOKBACK], ["DDD", LOOKBACK]]);
    const writes = db.ran("INSERT INTO signals");
    expect(writes.length).toBe(3);
    const aaa = writes.find((w) => w.binds[0] === "AAA")!.binds;
    expect(aaa[9]).toBe("long");               // state
    expect(aaa[11]).toBe(300);                 // days
    expect(aaa[12]).toBe("2026-10-24T22:50:00Z");
    expect(writes.find((w) => w.binds[0] === "BBB")!.binds[9]).toBe("flat");
    expect(writes.find((w) => w.binds[0] === "CCC")!.binds[9]).toBe("warming");
    const receipt = db.ran("INSERT INTO fetch_log").at(-1)!;
    expect(receipt.binds[2]).toBe("run_summary");
    expect(JSON.parse(String(receipt.binds[4]))).toMatchObject({ phase: "signals", written: 3 });
  });

  it("one instrument's fault is its own receipt, never the night's (review F1): a throwing SELECT and an all-zero series", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers", () => ({ results: [{ symbol: "AAA" }, { symbol: "BAD" }, { symbol: "ZERO" }, { symbol: "CCC" }] }))
      .on("FROM daily_prices", (b) => {
        if (b[0] === "BAD") return { error: "D1_ERROR: storage caused object reset" };
        if (b[0] === "ZERO") return { results: closes(30).map((r) => ({ ...r, close: 0 })) };
        return { results: closes(300) };
      });
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T23:00:00Z");
    expect(s).toMatchObject({ instruments: 4, written: 2, errors: 1, skipped: 1, long: 2 });
    const receipts = db.ran("INSERT INTO fetch_log").map((r) => [r.binds[1], r.binds[2]]);
    expect(receipts).toEqual([["BAD", "signals_error"], ["ZERO", "signals_skipped"], [null, "run_summary"]]);
    expect(db.ran("INSERT INTO signals").map((w) => w.binds[0])).toEqual(["AAA", "CCC"]);
  });

  it("the window the job reads is the whole store, and the same one the API reads (review N1)", () => {
    expect(LOOKBACK).toBe(1900);
    expect(LOOKBACK).toBe(HISTORY_LIMIT);
  });

  it("a failed batch is a write_error receipt, not a crash", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers", () => ({ results: [{ symbol: "AAA" }] }))
      .on("FROM daily_prices", () => ({ results: closes(200) }))
      .on("INSERT INTO signals", () => ({ error: "D1_ERROR: write limit" }));
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T22:50:00Z");
    expect(s.written).toBe(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["write_error", "run_summary"]);
  });

  it("an empty universe writes nothing but still leaves a receipt", async () => {
    const db = fakeD1().on("SELECT symbol, tier FROM tickers", () => ({ results: [] }));
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T22:50:00Z");
    expect(s).toMatchObject({ instruments: 0, written: 0 });
    expect(db.ran("INSERT INTO fetch_log").length).toBe(1);
  });
});

describe("the small-cap quarantine (week 9, decision 20, OI-08)", () => {
  const jump = jumpReceipt([{ date: "2026-07-01", ratio: 0.467 }]);
  it("the receipt's text is the visit's own: formatter and parser round-trip, one jump and two (review F1 / N1)", () => {
    expect(jump).toBe("adjusted close moved ×0.467 on 2026-07-01 — a split the toolkit does not know (add it to the splits table), or news; prices are as traded");
    const two = jumpReceipt([{ date: "2026-06-10", ratio: 2.01 }, { date: "2026-08-20", ratio: 0.48 }]);
    expect(two).toContain("×2.01 on 2026-06-10, ×0.48 on 2026-08-20");
    expect(parseJumpReceipt(two)).toEqual([{ ratio: "2.01", date: "2026-06-10" }, { ratio: "0.48", date: "2026-08-20" }]);
    // the v0.10.0 visits wrote the × once, before the first ratio — those receipts are in the live log and must still parse whole
    expect(parseJumpReceipt("adjusted close moved ×2.01 on 2026-06-10, 0.48 on 2026-08-20 — a split the toolkit does not know")).toEqual([{ ratio: "2.01", date: "2026-06-10" }, { ratio: "0.48", date: "2026-08-20" }]);
    expect(parseJumpReceipt("")).toEqual([]);
    expect(parseJumpReceipt("adjusted close moved ×0.467 on 2026-07")).toEqual([]);       // a receipt cut mid-date yields nothing
    // from the detector's own output: the series halves on 1 Jul and doubles on 20 Aug
    const bars = [["2026-06-29", 100], ["2026-06-30", 101], ["2026-07-01", 47], ["2026-07-02", 48], ["2026-08-19", 50], ["2026-08-20", 101]].map(([date, adjClose]) => ({ date: date as string, adjClose: adjClose as number }));
    const found = suspiciousJumps(bars);
    expect(parseJumpReceipt(jumpReceipt(found)).map((j) => j.date)).toEqual(["2026-07-01", "2026-08-20"]);
  });
  it("an av_jump receipt with no splits row within four days → the reason; a splits row (a split, or factor 1 for news) → clear; no receipt → clear", async () => {
    const q = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: jump }] })).on("FROM splits WHERE symbol", () => ({ results: [] }));
    expect(await quarantineReason(asD1(q), "MLI")).toBe("the adjusted close moved ×0.467 on 2026-07-01 with no splits row to explain it.");
    const explained = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: jump }] })).on("FROM splits WHERE symbol", () => ({ results: [{ date: "2026-07-01", factor: 2 }] }));
    expect(await quarantineReason(asD1(explained), "MLI")).toBeNull();
    const news = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: jump }] })).on("FROM splits WHERE symbol", () => ({ results: [{ date: "2026-07-03", factor: 1 }] }));
    expect(await quarantineReason(asD1(news), "MLI")).toBeNull();
    const far = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: jump }] })).on("FROM splits WHERE symbol", () => ({ results: [{ date: "2026-07-20", factor: 2 }] }));
    expect(await quarantineReason(asD1(far), "MLI")).toMatch(/no splits row/);
    const none = fakeD1().on("outcome = 'av_jump'", () => ({ results: [] }));
    expect(await quarantineReason(asD1(none), "MLI")).toBeNull();
    expect(none.ran("FROM splits").length).toBe(0);           // no receipt, no second query
  });
  it("two jumps in one receipt: the first explained by a splits row, the second not → quarantined for the second (review F1)", async () => {
    const two = jumpReceipt([{ date: "2026-06-10", ratio: 2.01 }, { date: "2026-08-20", ratio: 0.48 }]);
    const db = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: two }] })).on("FROM splits WHERE symbol", () => ({ results: [{ date: "2026-06-10", factor: 0.5 }] }));
    expect(await quarantineReason(asD1(db), "MULT")).toBe("the adjusted close moved ×0.48 on 2026-08-20 with no splits row to explain it.");
    const neither = fakeD1().on("outcome = 'av_jump'", () => ({ results: [{ detail: two }] })).on("FROM splits WHERE symbol", () => ({ results: [] }));
    expect(await quarantineReason(asD1(neither), "MULT")).toBe("the adjusted close moved ×2.01 on 2026-06-10, ×0.48 on 2026-08-20 with no splits row to explain it.");
    // receipts handed in from the pass-wide read: no fetch_log query of its own
    const given = fakeD1().on("FROM splits WHERE symbol", () => ({ results: [] }));
    expect(await quarantineReason(asD1(given), "MULT", [two])).toMatch(/×2\.01 on 2026-06-10, ×0\.48 on 2026-08-20/);
    expect(given.ran("fetch_log").length).toBe(0);
    expect(await quarantineReason(asD1(given), "CLEAN", [])).toBeNull();
    expect(given.ran("FROM splits").length).toBe(1);          // an empty share → no splits read either
  });
  it("one read of the receipts for the whole pass, three per symbol, newest first — picked per symbol by a window function (review F3, Phase 3 review N6)", async () => {
    const db = fakeD1().on("ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY id DESC)", (b) => {
      expect(b).toEqual([]);
      // what SQLite hands back: at most three rows per symbol, newest first within the symbol
      return { results: [{ symbol: "CALM", detail: "c1" }, { symbol: "MLI", detail: "r4" }, { symbol: "MLI", detail: "r3" }, { symbol: "MLI", detail: "r2" }] };
    });
    const m = await loadJumpReceipts(asD1(db));
    expect(db.ran("ROW_NUMBER")[0].sql).toMatch(/WHERE outcome = 'av_jump' AND symbol IS NOT NULL\) WHERE rn <= 3 ORDER BY symbol, rn$/);
    expect(m.get("MLI")).toEqual(["r4", "r3", "r2"]);
    expect(m.get("CALM")).toEqual(["c1"]);
    expect(m.get("NONE")).toBeUndefined();
  });
  it("the pass reads the receipts once, writes the reason into the small-tier row and counts it; a core-tier symbol is never checked", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers", () => ({ results: [{ symbol: "AAPL", tier: "core" }, { symbol: "MLI", tier: "small" }, { symbol: "SMLX", tier: "small" }] }))
      .on("FROM daily_prices", () => ({ results: closes(300) }))
      .on("ROW_NUMBER() OVER (PARTITION BY symbol", () => ({ results: [{ symbol: "MLI", detail: jump }, { symbol: "AAPL", detail: jump }] }))
      .on("FROM splits WHERE symbol", () => ({ results: [] }));
    const s = await runSignals({ DB: asD1(db) }, "2026-11-05T23:00:00Z");
    expect(s).toMatchObject({ written: 3, quarantined: 1 });
    const writes = db.ran("INSERT INTO signals");
    expect(writes.find((w) => w.binds[0] === "MLI")!.binds[13]).toMatch(/×0\.467 on 2026-07-01/);
    expect(writes.find((w) => w.binds[0] === "AAPL")!.binds[13]).toBeNull();                  // core: never checked, even with a receipt
    expect(writes.find((w) => w.binds[0] === "SMLX")!.binds[13]).toBeNull();                  // small, no receipt: clear, no splits read
    expect(db.ran("outcome = 'av_jump'").length).toBe(1);                                      // ONE read for the pass
    expect(db.ran("FROM splits WHERE symbol").map((r) => r.binds[0])).toEqual(["MLI"]);
  });
  it("if the pass-wide read fails, each small-tier symbol reads its own receipts and the night says so", async () => {
    const db = fakeD1()
      .on("SELECT symbol, tier FROM tickers", () => ({ results: [{ symbol: "MLI", tier: "small" }] }))
      .on("FROM daily_prices", () => ({ results: closes(300) }))
      .on("ROW_NUMBER() OVER (PARTITION BY symbol", () => ({ error: "D1_ERROR: storage reset" }))
      .on("SELECT detail FROM fetch_log WHERE symbol = ?1 AND outcome = 'av_jump'", () => ({ results: [{ detail: jump }] }))
      .on("FROM splits WHERE symbol", () => ({ results: [] }));
    const s = await runSignals({ DB: asD1(db) }, "2026-11-05T23:00:00Z");
    expect(s).toMatchObject({ written: 1, quarantined: 1 });
    expect(db.ran("INSERT INTO fetch_log").map((r) => [r.binds[1], r.binds[2]])[0]).toEqual([null, "signals_error"]);
    expect(String(db.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/could not be read in one pass .* reading per symbol/);
  });
});
