/**
 * Week 9: the nightly risk report on the fake D1 — what the job reads, what it
 * writes, and that one student's fault never costs another's row.
 */
import { describe, it, expect } from "vitest";
import { runRisk } from "./risk";
import { fakeD1, asD1 } from "./fake-d1";

const RUN = "2026-11-03T23:00:05.000Z";
const students = [
  { code: "K7PM-4R2X", name: "Test Student", capital: 10000, instruments: 1 },
  { code: "Q2WD-8HJ3", name: "Second Student", capital: 5000, instruments: 2 },
];
const aapl = { id: 1, code: "K7PM-4R2X", symbol: "AAPL", status: "open", opened_on: "2026-11-02", entry_price: 338.32, units: 18, exposure: 6089.76, stop_gap: 32.21, high_since: 338.32, stop_level: 306.11, stop_hit_on: null, instrument_risk: 19.04, realign_date: null, tracked_on: "2026-11-03", closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null };
const ticket = { id: 1, code: "K7PM-4R2X", symbol: "AAPL", side: "open", units: 18, fill_date: "2026-11-02", fill_price: 338.32, cost: 17.22, signal_state: "long", journal: "x".repeat(20), created_at: "2026-11-03T20:00:00.000Z" };

const base = () => fakeD1()
  .on("FROM students ORDER BY code", () => ({ results: students }))
  .on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: "2026-11-03" }] }))
  .on("FROM positions WHERE code = ?1", (b) => ({ results: b[0] === "K7PM-4R2X" ? [aapl] : [] }))
  .on("FROM tickets WHERE code = ?1", (b) => ({ results: b[0] === "K7PM-4R2X" ? [ticket] : [] }))
  .on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-03", close: 331.9, instrument_risk: 19.04, state: "long", state_since: "2026-04-17", days: 1275, quarantined: null }] }))
  .on("SELECT hwm FROM risk_reports WHERE code = ?1", (b) => ({ results: b[0] === "K7PM-4R2X" ? [{ hwm: 10_100 }] : [] }));

describe("runRisk", () => {
  it("writes one row per student: the account marked to the latest close, the mark carried from the last row, the flags; the receipt counts", async () => {
    const db = base();
    const s = await runRisk({ DB: asD1(db) }, RUN);
    expect(s).toMatchObject({ phase: "risk", students: 2, written: 2, flagged: 0, errors: 0 });
    const rows = db.ran("INSERT OR REPLACE INTO risk_reports");
    expect(rows).toHaveLength(2);
    const first = rows[0].binds;
    expect(first.slice(0, 11)).toEqual(["K7PM-4R2X", "2026-11-03", 9867.22, 3893.02, 5974.2, -115.56, 0, 10100, 2.3, 11.53, 12]);   // drawdown (10,100 − 9,867.22) ÷ 10,100 = 2.30% from the carried mark
    expect(first.slice(11, 16)).toEqual([1, 1, 7.77, 0, "[]"]);
    expect(first[16]).toBe(RUN);
    const second = rows[1].binds;
    expect(second.slice(0, 8)).toEqual(["Q2WD-8HJ3", "2026-11-03", 5000, 5000, 0, 0, 0, 5000]);   // nothing open: the night's date, the enrolled capital as the mark
    expect(second[11]).toBe(2);                                                                     // instruments
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["run_summary"]);
    expect(JSON.parse(String(db.ran("INSERT INTO fetch_log")[0].binds[4]))).toMatchObject({ phase: "risk", written: 2 });
  });
  it("a flagged report leaves a risk_flag receipt with the one-line summary", async () => {
    const db = base().on("SELECT hwm FROM risk_reports WHERE code = ?1", (b) => ({ results: b[0] === "K7PM-4R2X" ? [{ hwm: 11_000 }] : [] }));
    const s = await runRisk({ DB: asD1(db) }, RUN);
    expect(s.flagged).toBe(1);
    const flag = db.ran("INSERT INTO fetch_log").find((r) => r.binds[2] === "risk_flag")!;
    expect(String(flag.binds[4])).toMatch(/^K7PM-4R2X: value 9867\.22, hwm 11000, drawdown 10\.3%, .* flags \[drawdown\]$/);
  });
  it("one student's fault is a risk_error receipt; the other's row is written", async () => {
    const db = base().on("FROM positions WHERE code = ?1", (b) => { if (b[0] === "K7PM-4R2X") throw new Error("D1_ERROR: boom"); return { results: [] }; });
    const s = await runRisk({ DB: asD1(db) }, RUN);
    expect(s).toMatchObject({ written: 1, errors: 1 });
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["risk_error", "run_summary"]);
    expect(String(db.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/^K7PM-4R2X: D1_ERROR: boom/);
  });
  it("the row is the NIGHT's, not the lagging position's close (review F2): a small cap two nights behind still gets tonight's row; yesterday's stands", async () => {
    const db = base()
      .on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: "2026-11-05" }] }))
      .on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-03", close: 331.9, instrument_risk: 19.04, state: "long", state_since: "2026-04-17", days: 1275, quarantined: null }] }));
    const s = await runRisk({ DB: asD1(db) }, "2026-11-05T23:00:05.000Z");
    expect(s.written).toBe(2);
    const rows = db.ran("INSERT OR REPLACE INTO risk_reports");
    expect(rows.map((r) => r.binds[1])).toEqual(["2026-11-05", "2026-11-05"]);     // keyed on the night for both students
    expect(rows[0].binds[2]).toBe(9867.22);                                        // the account still marked at AAPL's latest stored close
  });
  it("with no signal rows yet there is nothing to mark to: risk_skipped, no rows", async () => {
    const db = base().on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: null }] }));
    const s = await runRisk({ DB: asD1(db) }, RUN);
    expect(s.written).toBe(0);
    expect(db.ran("INSERT OR REPLACE INTO risk_reports")).toHaveLength(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["risk_skipped", "run_summary"]);
  });
});
