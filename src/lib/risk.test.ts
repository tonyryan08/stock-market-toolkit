/**
 * Week 9: the account marked to market and the risk report (decision 20),
 * pinned to the cent so the page, the API and the nightly row cannot differ.
 */
import { describe, it, expect } from "vitest";
import { markToMarket, buildReport, describeReport, summarizeReport } from "./risk";
import { currentValue } from "./tickets";
import type { PositionRow, TicketRow } from "./tickets";

const student = { code: "K7PM-4R2X", name: "Test student", capital: 10_000, instruments: 1 };
const aaplOpen: PositionRow = { id: 1, code: student.code, symbol: "AAPL", status: "open", opened_on: "2026-11-02", entry_price: 338.32, units: 18, exposure: 6089.76, stop_gap: 32.21, high_since: 338.32, stop_level: 306.11, stop_hit_on: null, instrument_risk: 19.04, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null };
const aaplTicket: TicketRow = { id: 1, code: student.code, symbol: "AAPL", side: "open", units: 18, fill_date: "2026-11-02", fill_price: 338.32, cost: 17.22, signal_state: "long", journal: "x".repeat(20), created_at: "2026-11-03T20:00:00.000Z" };
const latest = { AAPL: { date: "2026-11-03", close: 331.9, instrument_risk: 19.04, state: "long", state_since: "2026-04-17" } };

describe("markToMarket — the live site's 3 Nov 2026 figures", () => {
  it("cash from the ledger, the position at the latest close, open P&L, value, the risk it carries", () => {
    const m = markToMarket(student, [aaplOpen], [aaplTicket], latest);
    expect(m.cash).toBe(3893.02);                              // 10,000 − 6,089.76 − 17.22
    expect(m.marketValue).toBe(5974.2);                        // 18 × 331.90
    expect(m.openPnl).toBe(-115.56);                           // (331.90 − 338.32) × 18
    expect(m.value).toBe(9867.22);                             // 3,893.02 + 5,974.20
    expect(m.date).toBe("2026-11-03");
    expect(m.missing).toEqual([]);
    expect(m.contributions).toHaveLength(1);
    const c = m.contributions[0];
    expect(c.weightPct).toBe(60.55);                           // 5,974.20 ÷ 9,867.22
    expect(c.riskPct).toBe(11.53);                             // 60.55% × 19.04
    expect(c.stopDistancePct).toBe(7.77);                      // (331.90 − 306.11) ÷ 331.90
    expect(m.riskUsedPct).toBe(11.53);
  });
  it("a position with no stored close is valued at entry and named in `missing`; a closed position counts in realised only", () => {
    const closed: PositionRow = { ...aaplOpen, id: 2, status: "closed", closed_on: "2026-11-04", exit_price: 349.51, pnl: 166.47, close_ticket_id: 2 };
    const m = markToMarket(student, [closed, { ...aaplOpen, id: 3, symbol: "KO", units: 60, entry_price: 94.08, exposure: 5644.8, open_ticket_id: 3 }], [aaplTicket, { ...aaplTicket, id: 3, symbol: "KO", units: 60, fill_price: 94.08, cost: 16.11 }], {});
    expect(m.realised).toBe(166.47);
    expect(m.missing).toEqual(["KO"]);
    expect(m.marketValue).toBe(5644.8);
    expect(m.openPnl).toBe(0);
    // no latest row: the ENTRY instrument risk counts, and says so — the ticket's budget check and the page agree (review F4)
    expect(m.contributions[0]).toMatchObject({ symbol: "KO", instrumentRisk: 19.04, riskAtEntry: true, date: null });
    expect(m.value).toBe(10150.36);                                                   // cash 10,000 + 166.47 − 5,644.80 − 16.11 = 4,505.56, + KO at entry 5,644.80
    expect(m.contributions[0].riskPct).toBe(10.59);                                    // 5,644.80 ÷ 10,150.36 = 55.61% × 19.04
    expect(m.riskUsedPct).toBe(m.contributions[0].riskPct);
  });
  it("risk used is summed unrounded and rounded once, the same figure the ticket's budget check sees (review F4)", () => {
    const two = markToMarket({ ...student, instruments: 2 }, [aaplOpen, { ...aaplOpen, id: 3, symbol: "KO", units: 60, entry_price: 94.08, exposure: 5644.8, open_ticket_id: 3 }], [aaplTicket, { ...aaplTicket, id: 3, symbol: "KO", units: 60, fill_price: 94.08, cost: 16.11 }], { ...latest, KO: { date: "2026-11-03", close: 94.08, instrument_risk: 21.11, state: "long", state_since: "2026-01-02" } });
    const exact = two.contributions.reduce((s, c) => s + (c.units * c.close / two.value) * (c.instrumentRisk as number), 0);
    expect(two.riskUsedPct).toBe(Math.round(exact * 100) / 100);
    expect(currentValue({ student: { ...student, instruments: 2 }, tier: "core", tickerStatus: "active", signal: null, positions: [aaplOpen, { ...aaplOpen, id: 3, symbol: "KO", units: 60, entry_price: 94.08, exposure: 5644.8, open_ticket_id: 3 }], tickets: [aaplTicket, { ...aaplTicket, id: 3, symbol: "KO", units: 60, fill_price: 94.08, cost: 16.11 }], latest: { ...latest, KO: { date: "2026-11-03", close: 94.08, instrument_risk: 21.11, state: "long", state_since: "2026-01-02" } } }).riskUsedPct).toBe(two.riskUsedPct);
  });
});

describe("the ledger identity across a dividend re-alignment (Phase 3 review F1)", () => {
  it("value = capital + realised + open P&L − open costs, before and after the tracker re-aligns entry AND exposure; with the old exposure the page is short by units × the dividend", () => {
    const identity = (positions: PositionRow[]) => {
      const m = markToMarket(student, positions, [aaplTicket], latest);
      const openCosts = 17.22;
      return { value: m.value, identity: Math.round((student.capital + m.realised + m.openPnl - openCosts) * 100) / 100 };
    };
    const before = identity([aaplOpen]);
    expect(before.value).toBe(before.identity);                                     // 9,867.22 both
    // a $0.26 dividend went ex: the tracker scales the entry to 338.06 and, from v0.11.1, the exposure to 18 × 338.06
    const after = identity([{ ...aaplOpen, entry_price: 338.06, exposure: 6085.08 }]);
    expect(after.value).toBe(9871.9);                                               // cash 3,897.70 (the dividend arrived as cash) + 5,974.20
    expect(after.value).toBe(after.identity);
    // the v0.11.0 behaviour — entry re-aligned, exposure left at 18 × 338.32 — breaks the identity by exactly 18 × $0.26
    const stale = identity([{ ...aaplOpen, entry_price: 338.06 }]);
    expect(Math.round((stale.identity - stale.value) * 100) / 100).toBe(4.68);
  });
});

describe("buildReport — the high-water mark, the drawdown and the flags", () => {
  const m = markToMarket(student, [aaplOpen], [aaplTicket], latest);
  it("the first night: the mark is the larger of the enrolled capital and tonight's value; the drawdown is from it", () => {
    const r = buildReport(student, m, null, "2026-11-03");
    expect(r.hwm).toBe(10000);
    expect(r.drawdownPct).toBe(1.33);                          // (10,000 − 9,867.22) ÷ 10,000
    expect(r.riskUsedPct).toBe(11.53);
    expect(r.perInstrumentPct).toBe(12);
    expect(r.nearestStopPct).toBe(7.77);
    expect(r.flags).toEqual([]);
  });
  it("the mark carries forward and only ever rises; a 10% drawdown is flagged as a statement", () => {
    const r = buildReport(student, m, 11_000, "2026-11-03");
    expect(r.hwm).toBe(11000);
    expect(r.drawdownPct).toBe(10.3);                          // (11,000 − 9,867.22) ÷ 11,000
    expect(r.flags).toEqual(["drawdown"]);
    const up = buildReport(student, { ...m, value: 11_500 }, 11_000, "2026-11-03");
    expect(up.hwm).toBe(11500);
    expect(up.drawdownPct).toBe(0);
    // the note's boundary is inclusive: exactly 10.00% below the mark is flagged; 9.99% is not (Phase 3 review F3)
    expect(buildReport(student, { ...m, value: 9_000 }, 10_000, "2026-11-03").flags).toEqual(["drawdown"]);
    expect(buildReport(student, { ...m, value: 9_001 }, 10_000, "2026-11-03").flags).toEqual([]);
  });
  it("over budget, a stop hit, a missing close and more positions than instruments each raise their flag", () => {
    const hit = markToMarket(student, [{ ...aaplOpen, stop_hit_on: "2026-11-03" }], [aaplTicket], { AAPL: { ...latest.AAPL, instrument_risk: 40 } });
    const r = buildReport(student, hit, null, "2026-11-03");
    expect(r.riskUsedPct).toBe(24.22);                         // 60.55% × 40
    expect(r.stopHits).toBe(1);
    expect(r.flags).toEqual(["over_budget", "stop_hit"]);
    const two = markToMarket(student, [aaplOpen, { ...aaplOpen, id: 2, symbol: "KO" }], [aaplTicket], latest);
    expect(buildReport(student, two, null, "2026-11-03").flags).toEqual(expect.arrayContaining(["missing_close", "too_many_positions"]));
    expect(buildReport({ ...student, instruments: 2 }, two, null, "2026-11-03").flags).not.toContain("too_many_positions");
    expect(buildReport({ ...student, instruments: 2 }, two, null, "2026-11-03").perInstrumentPct).toBe(6);
  });
});

describe("describeReport — statements a student can check, never instructions", () => {
  it("value, drawdown, the budget line, the nearest stop", () => {
    const m = markToMarket(student, [aaplOpen], [aaplTicket], latest);
    const lines = describeReport(buildReport(student, m, null, "2026-11-03"), student.capital);
    expect(lines[0]).toBe("On the 2026-11-03 close the account is worth $9,867.22: $3,893.02 cash and $5,974.20 in 1 open position — −1.3% since enrolment ($0.00 realised, −$115.56 open).");
    expect(lines[1]).toMatch(/^The high-water mark \(the account's highest value so far\) is \$10,000\.00; the account is 1\.3% below it\. That is normal\. A 12% target means the account moves about 12% in an ordinary year, so one year in twenty is down about 20%/);   // v1.2.0: the same figures in plainer sentences (the reader review)
    expect(lines[2]).toBe("The open positions carry 11.5% a year of the 12% budget (AAPL 11.5%); the account runs 1 instrument, each sized at 12%.");
    expect(lines[3]).toBe("The nearest stop is AAPL, 7.8% below the latest close.");
    for (const l of lines) expect(l).not.toMatch(/\b(you should|buy|sell now)\b/i);
  });
  it("a position valued at an older close than the night is named; one with no close at all is valued at entry and the stop sentence says so (reviews F2, N5)", () => {
    const m = markToMarket(student, [aaplOpen], [aaplTicket], latest);                 // AAPL's latest close 2026-11-03
    const lines = describeReport(buildReport(student, m, null, "2026-11-05"), student.capital);
    expect(lines[0]).toMatch(/^On the 2026-11-05 close the account is worth \$9,867\.22/);
    expect(lines[1]).toBe("AAPL is valued at its 2026-11-03 close — the latest stored; the nightly pass has not reached it since.");
    const none = markToMarket(student, [aaplOpen], [aaplTicket], {});
    const l2 = describeReport(buildReport(student, none, null, "2026-11-05"), student.capital);
    expect(l2.find((l) => l.startsWith("The open positions carry"))).toBe("The open positions carry 11.6% a year of the 12% budget (AAPL 11.6% (at the entry risk; none stored tonight)); the account runs 1 instrument, each sized at 12%.");
    expect(l2.find((l) => l.startsWith("The nearest stop"))).toBe("The nearest stop is AAPL, 9.5% below the price it is valued at (its entry — no close is stored).");
    expect(l2.at(-1)).toBe("No close is stored tonight for AAPL: valued at entry until the nightly pass reaches it.");
    // a close below the stop with no stamp (the tracker left the position untouched — a split_unknown night, Phase 3 review F2) is said plainly, never as a negative "below"
    const under = markToMarket(student, [aaplOpen], [aaplTicket], { AAPL: { ...latest.AAPL, close: 300 } });
    const l3 = describeReport(buildReport(student, under, null, "2026-11-03"), student.capital);
    expect(l3.find((l) => l.includes("below its stop"))).toMatch(/^AAPL closed 2\.0% below its stop with no stamp: the tracker left it untouched tonight — a `split_unknown` receipt/);
    expect(l3.join(" ")).not.toMatch(/-\d+\.\d% below/);
  });
  it("at the high, with nothing open, and with a stop hit", () => {
    const empty = markToMarket(student, [], [], {});
    const at = describeReport(buildReport(student, empty, null, "2026-11-03"), student.capital);
    expect(at[1]).toMatch(/^The account is at its high-water mark \(\$10,000\.00\)\. It will not stay there/);
    expect(at[2]).toMatch(/^No open positions: the account carries no market risk tonight/);
    const hit = markToMarket(student, [{ ...aaplOpen, stop_hit_on: "2026-11-03" }], [aaplTicket], latest);
    const lines = describeReport(buildReport(student, hit, null, "2026-11-03"), student.capital);
    expect(lines[3]).toBe("1 stop has been hit (AAPL): the rule says close, whatever the price does after — the close ticket is yours to write at the next decision, with the journal line.");
  });
  it("summarizeReport is one line with the numbers that matter", () => {
    const m = markToMarket(student, [aaplOpen], [aaplTicket], latest);
    expect(summarizeReport(buildReport(student, m, null, "2026-11-03"))).toBe("K7PM-4R2X: value 9867.22, hwm 10000, drawdown 1.33%, risk 11.53% of 12% (1 instr.), open 1, nearest stop 7.77%, flags []");
  });
});
