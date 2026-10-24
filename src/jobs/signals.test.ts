/** The nightly signal pass against a fake D1: what it reads, what it writes, what the receipt says. */
import { describe, it, expect } from "vitest";
import { runSignals, LOOKBACK } from "./signals";
import { HISTORY_LIMIT } from "../lib/signals";
import { fakeD1, asD1 } from "./fake-d1";

const closes = (n: number, start = 100, step = 0.3) => Array.from({ length: n }, (_, i) => {
  const d = new Date("2021-01-01"); d.setUTCDate(d.getUTCDate() + (n - 1 - i));   // newest first, as the job reads them
  return { date: d.toISOString().slice(0, 10), close: start + (n - 1 - i) * step };
});

describe("runSignals", () => {
  it("writes one row per instrument with enough closes, skips the rest, and the receipt counts long / flat / warming", async () => {
    const db = fakeD1()
      .on("SELECT symbol FROM tickers", () => ({ results: [{ symbol: "AAA" }, { symbol: "BBB" }, { symbol: "CCC" }, { symbol: "DDD" }] }))
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
      .on("SELECT symbol FROM tickers", () => ({ results: [{ symbol: "AAA" }, { symbol: "BAD" }, { symbol: "ZERO" }, { symbol: "CCC" }] }))
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
      .on("SELECT symbol FROM tickers", () => ({ results: [{ symbol: "AAA" }] }))
      .on("FROM daily_prices", () => ({ results: closes(200) }))
      .on("INSERT INTO signals", () => ({ error: "D1_ERROR: write limit" }));
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T22:50:00Z");
    expect(s.written).toBe(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["write_error", "run_summary"]);
  });

  it("an empty universe writes nothing but still leaves a receipt", async () => {
    const db = fakeD1().on("SELECT symbol FROM tickers", () => ({ results: [] }));
    const s = await runSignals({ DB: asD1(db) }, "2026-10-24T22:50:00Z");
    expect(s).toMatchObject({ instruments: 0, written: 0 });
    expect(db.ran("INSERT INTO fetch_log").length).toBe(1);
  });
});
