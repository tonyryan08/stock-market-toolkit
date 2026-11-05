import { describe, it, expect } from "vitest";
import { parseTicket, decideTicket, accountOf, type Facts, type PositionRow, type TicketRow } from "./tickets";

const student = { code: "K7PM-4R2X", name: "Test student", capital: 10_000 };
const aapl = { date: "2026-10-29", close: 348.91, instrument_risk: 18.18, state: "long", state_since: "2026-05-08" };
const facts = (over: Partial<Facts> = {}): Facts => ({ student, tier: "core", tickerStatus: "active", signal: aapl, positions: [], tickets: [], ...over });
const req = (over: Partial<Parameters<typeof decideTicket>[0]> = {}) => ({ code: student.code, symbol: "AAPL", side: "open" as const, units: null, journal: "The rule is long since May; stop at 317.19; if hit I close on Monday.", ...over });

describe("parseTicket — input validation with messages a student can act on", () => {
  it("accepts a well-formed ticket, upper-casing the code and symbol and defaulting units to the rule's", () => {
    const r = parseTicket({ code: "k7pm-4r2x", ticker: "aapl", side: "Open", journal: "The rule is long since May; stop at 317.19; if hit I close on Monday." });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.req).toEqual({ code: "K7PM-4R2X", symbol: "AAPL", side: "open", units: null, journal: "The rule is long since May; stop at 317.19; if hit I close on Monday." });
  });
  it("refuses a blank journal, a bad code, a bad symbol, a bad side and fractional units — all at once", () => {
    const r = parseTicket({ code: "ABC", symbol: "AAPL'--", side: "buy", units: "2.5", journal: "ok" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reasons.map((x) => x.code)).toEqual(["code", "symbol", "side", "units", "journal"]);
      expect(r.reasons.find((x) => x.code === "journal")!.message).toMatch(/The journal entry is the ticket/);
    }
  });
  it("units may be omitted or blank (the rule's size), but not zero or a million", () => {
    expect(parseTicket({ code: "K7PM-4R2X", symbol: "AAPL", side: "open", units: "", journal: "x".repeat(20) }).ok).toBe(true);
    expect(parseTicket({ code: "K7PM-4R2X", symbol: "AAPL", side: "open", units: 0, journal: "x".repeat(20) }).ok).toBe(false);
    expect(parseTicket({ code: "K7PM-4R2X", symbol: "AAPL", side: "open", units: 2_000_000, journal: "x".repeat(20) }).ok).toBe(false);
  });
});

describe("decideTicket — opening", () => {
  it("the rule is long, nothing held, the size is the rule's: 18 shares of AAPL at $348.91, cost $17.70, filled on the signal's close", () => {
    const d = decideTicket(req(), facts());
    expect(d.ok).toBe(true);
    if (d.ok && d.side === "open") {
      expect(d.units).toBe(18);
      expect(d.fillDate).toBe("2026-10-29");
      expect(d.fillPrice).toBe(348.91);
      expect(d.cost).toBe(17.7);
      expect(d.underSized).toBe(false);
      expect(d.sizing.stopLevel).toBe(317.19);
    }
  });
  it("THE EXIT CHECK — an oversized ticket is rejected with the arithmetic a student can follow", () => {
    const d = decideTicket(req({ units: 40 }), facts());
    expect(d.ok).toBe(false);
    if (!d.ok) {
      expect(d.reasons.length).toBe(1);
      expect(d.reasons[0].code).toBe("oversized");
      expect(d.reasons[0].message).toBe(
        "Oversized. At 18.18% instrument risk and the 12% target, a $10,000.00 account supports $6,600.66 of AAPL — 18 shares at $348.91. You asked for 40 ($13,956.40, 140% of the account, carrying 25.4% a year). The rule's size is the most you can hold; fewer is allowed.",
      );
    }
  });
  it("fewer shares than the rule's size is allowed and marked under-sized", () => {
    const d = decideTicket(req({ units: 10 }), facts());
    expect(d.ok && d.side === "open" && d.underSized && d.units === 10).toBe(true);
  });
  it("the rule opens, you don't: flat or warming → no opening ticket", () => {
    const flat = decideTicket(req(), facts({ signal: { ...aapl, state: "flat" } }));
    expect(!flat.ok && flat.reasons[0].message).toMatch(/the rule is FLAT for AAPL \(the 16-day average is below the 64-day\) — no opening ticket/);
    const warm = decideTicket(req(), facts({ signal: { ...aapl, state: "warming" } }));
    expect(!warm.ok && warm.reasons[0].message).toMatch(/WARMING/);
  });
  it("one position per instrument", () => {
    const open: PositionRow = { id: 1, code: student.code, symbol: "AAPL", status: "open", opened_on: "2026-10-20", entry_price: 340, units: 18, exposure: 6120, stop_gap: 30, high_since: 350, stop_level: 320, stop_hit_on: null, instrument_risk: 18, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null };
    const d = decideTicket(req(), facts({ positions: [open] }));
    expect(!d.ok && d.reasons[0].message).toMatch(/You already hold 18 shares of AAPL/);
  });
  it("THE EXIT CHECK as the lesson scripts it: a student who already holds the position and asks for twice the size reads BOTH sentences (review F2)", () => {
    const open: PositionRow = { id: 1, code: student.code, symbol: "AAPL", status: "open", opened_on: "2026-10-20", entry_price: 340, units: 18, exposure: 6120, stop_gap: 30, high_since: 350, stop_level: 320, stop_hit_on: null, instrument_risk: 18, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null };
    const d = decideTicket(req({ units: 36 }), facts({ positions: [open] }));
    expect(!d.ok && d.reasons.map((r) => r.code)).toEqual(["held", "oversized"]);
    expect(!d.ok && d.reasons[1].message).toMatch(/^Oversized\. At 18\.18% instrument risk/);
  });
  it("after a close, the same signal cannot be re-entered: the rule must have gone long again after the close", () => {
    const closed: PositionRow = { id: 1, code: student.code, symbol: "AAPL", status: "closed", opened_on: "2026-06-01", entry_price: 300, units: 20, exposure: 6000, stop_gap: 27, high_since: 330, stop_level: 303, stop_hit_on: "2026-09-10", instrument_risk: 18, closed_on: "2026-09-14", exit_price: 302, pnl: 4, open_ticket_id: 1, close_ticket_id: 2 };
    const same = decideTicket(req(), facts({ positions: [closed] }));                                    // long since 2026-05-08 ≤ closed 2026-09-14
    expect(!same.ok && same.reasons[0].message).toMatch(/wait for a fresh crossover/);
    const fresh = decideTicket(req(), facts({ positions: [closed], signal: { ...aapl, state_since: "2026-10-01" } }));
    expect(fresh.ok).toBe(true);
    // a crossover on the exit close itself counts as fresh (review N2)
    const sameDay = decideTicket(req(), facts({ positions: [closed], signal: { ...aapl, state_since: "2026-09-14" } }));
    expect(sameDay.ok).toBe(true);
  });
  it("too small to size or to trade: the sizing checks' messages come through", () => {
    const d = decideTicket(req(), facts({ student: { ...student, capital: 500 } }));
    expect(!d.ok && d.reasons[0].code).toBe("size_one_share");
    expect(!d.ok && d.reasons[0].message).toMatch(/needs a paper account of at least/);
    expect(!d.ok && d.reasons.length).toBe(1);   // "Not checked — no position to cost" is not a reason (review N3)
  });
  it("not enough cash: open positions and their costs reduce what a new ticket can spend", () => {
    const msft: PositionRow = { id: 1, code: student.code, symbol: "MSFT", status: "open", opened_on: "2026-10-20", entry_price: 500, units: 10, exposure: 5000, stop_gap: 56, high_since: 530, stop_level: 474, stop_hit_on: null, instrument_risk: 22.55, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null };
    const t: TicketRow = { id: 1, code: student.code, symbol: "MSFT", side: "open", units: 10, fill_date: "2026-10-20", fill_price: 500, cost: 14.5, signal_state: "long", journal: "x".repeat(20), created_at: "x" };
    const d = decideTicket(req(), facts({ positions: [msft], tickets: [t] }));                           // 18 × 348.91 + 17.70 = 6,298.08 > 4,985.50
    expect(!d.ok && d.reasons[0].code).toBe("cash");
    expect(!d.ok && d.reasons[0].message).toMatch(/\$4,985\.50 available \(\$5,000\.00 in 1 open position\(s\)\)/);
    const smaller = decideTicket(req({ units: 14 }), facts({ positions: [msft], tickets: [t] }));          // 14 × 348.91 + 14.21 = 4,898.95
    expect(smaller.ok).toBe(true);
  });
  it("outside the core tier, outside the plan, outside the universe, no signal yet — each has its own sentence", () => {
    expect(!decideTicket(req(), facts({ tier: "small" })).ok).toBe(true);
    expect((decideTicket(req(), facts({ tier: "small" })) as any).reasons[0].message).toMatch(/no tickets until week 9/);
    expect((decideTicket(req(), facts({ tickerStatus: "blocked" })) as any).reasons[0].message).toMatch(/outside the free data plan/);
    expect((decideTicket(req(), facts({ tier: null, tickerStatus: null })) as any).reasons[0].message).toMatch(/not in the course universe/);
    expect((decideTicket(req(), facts({ signal: null })) as any).reasons[0].message).toMatch(/No signal row/);
  });
});

describe("parseTicket — units written as a whole number, nothing else (review N7)", () => {
  const base = { code: "K7PM-4R2X", symbol: "AAPL", side: "open", journal: "x".repeat(20) };
  it("accepts 18 and \"18\"; refuses true, \"0x12\", \"1e3\", [], 18.5, \"-5\"", () => {
    expect((parseTicket({ ...base, units: 18 }) as any).req.units).toBe(18);
    expect((parseTicket({ ...base, units: "18" }) as any).req.units).toBe(18);
    expect((parseTicket({ ...base, units: " 18 " }) as any).req.units).toBe(18);
    for (const bad of [true, "0x12", "1e3", [], 18.5, "-5", "18a"]) expect((parseTicket({ ...base, units: bad }) as any).reasons?.[0]?.code, String(bad)).toBe("units");
    expect((parseTicket({ ...base, units: "" }) as any).req.units).toBeNull();
  });
});

describe("decideTicket — closing, and the ledger", () => {
  const open: PositionRow = { id: 1, code: student.code, symbol: "AAPL", status: "open", opened_on: "2026-10-01", entry_price: 330, units: 18, exposure: 5940, stop_gap: 30, high_since: 350, stop_level: 320, stop_hit_on: "2026-10-28", instrument_risk: 18, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 7, close_ticket_id: null };
  const openTicket: TicketRow = { id: 7, code: student.code, symbol: "AAPL", side: "open", units: 18, fill_date: "2026-10-01", fill_price: 330, cost: 16.85, signal_state: "long", journal: "x".repeat(20), created_at: "x" };
  it("closes the whole position at the signal's close; P&L nets both tickets' costs; the stop stamp is reported", () => {
    const d = decideTicket(req({ side: "close" }), facts({ positions: [open], tickets: [openTicket] }));
    expect(d.ok).toBe(true);
    if (d.ok && d.side === "close") {
      expect(d.units).toBe(18);
      expect(d.fillPrice).toBe(348.91);
      expect(d.cost).toBe(17.7);                                  // 2 + 0.25% × 6,280.38
      expect(d.pnl).toBeCloseTo((348.91 - 330) * 18 - 16.85 - 17.7, 2);   // 305.83
      expect(d.stopWasHit).toBe(true);
    }
  });
  it("a partial close is refused; closing what you don't hold is refused", () => {
    const p = decideTicket(req({ side: "close", units: 5 }), facts({ positions: [open], tickets: [openTicket] }));
    expect(!p.ok && p.reasons[0].message).toMatch(/A close is the whole position: 18 shares/);
    const n = decideTicket(req({ side: "close" }), facts());
    expect(!n.ok && n.reasons[0].message).toMatch(/no open position in AAPL/);
  });
  it("accountOf: cash = capital + realised − invested − open tickets' costs", () => {
    const closed: PositionRow = { ...open, id: 2, symbol: "KO", status: "closed", exposure: 5000, closed_on: "2026-10-20", exit_price: 95, pnl: 120.5, open_ticket_id: 3, close_ticket_id: 4 };
    const a = accountOf(10_000, [open, closed], [openTicket, { ...openTicket, id: 3, symbol: "KO", cost: 14.5 }, { ...openTicket, id: 4, symbol: "KO", side: "close", cost: 14.9 }]);
    expect(a).toEqual({ capital: 10_000, realised: 120.5, invested: 5940, openCosts: 16.85, cash: 4163.65 });
  });
});
