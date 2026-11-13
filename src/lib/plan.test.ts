/**
 * v1.1 (decision 24): the planner's arithmetic, pinned — the order of the candidates (the tests, never a return),
 * the sizes (the ticket judge's own sizing.ts at 12% ÷ N on the judge's facts, each row on the value less the costs
 * of the rows above — the v1.1.0 review's F1 and F3), the cash fit, the stop, the costs in dollars and in euro at a
 * typed rate, the overrides (fewer allowed, more flagged, a typo refused — S2), the journal in two parts (F2), the
 * totals against the budget, the inputs, the saved shape and the CSV.
 */
import { describe, it, expect } from "vitest";
import type { GateRow } from "./gate";
import type { PositionRow } from "./tickets";
import { rankCandidates, buildPlan, topPicks, parseInputs, parseUnits, parseSavedPlan, planCsv, journalFacts, journalOf, euroLines, ineligibleReason, DEFAULT_INPUTS, type Candidate, type Account } from "./plan";
import { sizePosition } from "./sizing";
import { decideTicket, type Facts, type TicketRow } from "./tickets";

const score = (passes: number, applicable: number, verdict: "survivor" | "candidate" | "near_miss" | "fails" | "insufficient", failed: string[] = []) => ({ passes, applicable, verdict, failed });
const row = (symbol: string, over: Partial<GateRow> = {}): GateRow => ({
  symbol, name: `${symbol} Co`, tier: "core", date: "2026-11-13", close: 100, state: "long", state_since: "2026-09-01", forecast: 8, instrument_risk: 20, days: 1300, quarantined: null,
  defensive: score(5, 7, "fails", ["P/E", "P/B"]), enterprising: score(3, 6, "fails", ["x"]), gate: "closed", ...over,
});
const pos = (symbol: string, status: "open" | "closed", over: Partial<PositionRow> = {}): PositionRow => ({
  id: 1, code: "K7PM-4R2X", symbol, status, opened_on: "2026-10-01", entry_price: 100, units: 5, exposure: 500, stop_gap: 10, high_since: 100, stop_level: 90, stop_hit_on: null, instrument_risk: 20, realign_date: null,
  closed_on: status === "closed" ? "2026-10-20" : null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null, ...over,
});
const fresh = (over: Partial<Account> = {}): Account => ({ value: 10000, cash: 10000, riskUsedPct: 0, openCount: 0, instruments: 2, ...over });
const pick = (symbol: string, units: number | null = null, thesis = "a thesis of twenty characters at least") => ({ symbol, units, thesis });

const AAPL = row("AAPL", { close: 348.91, instrument_risk: 18.18, forecast: 12.4, gate: "open", defensive: score(7, 7, "survivor"), enterprising: score(4, 6, "fails", ["a", "b"]) });

describe("the order: the watchlist's bands, then the tests — never a return (decision 24 b)", () => {
  it("gate first, then near misses, then longs failing both, then longs without books; the rest after with the ticket's reason", () => {
    const rows = [
      row("LONGA"),
      row("NOBK", { defensive: null, enterprising: null, gate: "no_books" }),
      row("NEAR", { gate: "near", defensive: score(6, 7, "near_miss", ["P/B"]) }),
      row("FLAT", { state: "flat", forecast: -3, gate: "closed" }),
      AAPL,
      row("WARM", { tier: "small", state: "warming", days: 40, forecast: null, instrument_risk: null, gate: "warming" }),
      row("QUAR", { tier: "small", quarantined: "a ×2.1 jump on 2026-11-02 with no splits row.", gate: "quarantined" }),
    ];
    const c = rankCandidates(rows, []);
    expect(c.map((x) => x.symbol)).toEqual(["AAPL", "NEAR", "LONGA", "NOBK", "QUAR", "FLAT", "WARM"]);   // the refused: longs first (a quarantined long is still long), then by the tests
    expect(c.slice(0, 4).map((x) => [x.band, x.rank, x.eligible])).toEqual([["gate", 1, true], ["near", 2, true], ["long", 3, true], ["no_books", 4, true]]);
    expect(c.find((x) => x.symbol === "FLAT")).toMatchObject({ eligible: false, rank: null, band: null, why: "the rule is FLAT tonight — the rule opens, you don't" });
    expect(c.find((x) => x.symbol === "WARM")!.why).toBe("the rule is still warming up (40 of 128 closes)");
    expect(c.find((x) => x.symbol === "QUAR")!.why).toBe("quarantined: a ×2.1 jump on 2026-11-02 with no splits row");   // the reason's own full stop dropped (review H3)
  });
  it("within a band: defensive passes, then enterprising passes, then the forecast, then the LOWER instrument risk, then the symbol", () => {
    const rows = [
      row("D5E3F8R20"),
      row("D5E3F8R15", { instrument_risk: 15 }),
      row("D5E3F9R30", { forecast: 9, instrument_risk: 30 }),
      row("D5E4F2R40", { enterprising: score(4, 6, "fails"), forecast: 2, instrument_risk: 40 }),
      row("D6E0F1R50", { defensive: score(6, 7, "fails", ["P/E"]), enterprising: score(0, 6, "fails"), forecast: 1, instrument_risk: 50 }),
    ];
    expect(rankCandidates(rows, []).map((x) => x.symbol)).toEqual(["D6E0F1R50", "D5E4F2R40", "D5E3F9R30", "D5E3F8R15", "D5E3F8R20"]);
  });
  it("a held name and a name waiting for a fresh crossover are not eligible, in the ticket's words; a closed position with the crossover after it is", () => {
    const held = pos("AAPL", "open", { units: 9, opened_on: "2026-10-01" });
    expect(ineligibleReason(AAPL, [held])).toBe("already held: 9 shares opened 2026-10-01 — one position per instrument");
    const stale = pos("AAPL", "closed", { closed_on: "2026-10-20" });   // the rule long since 2026-09-01, before the close
    expect(ineligibleReason(AAPL, [stale])).toBe("the rule has been long since 2026-09-01, before the close on 2026-10-20 — wait for a fresh crossover");
    const freshX = pos("AAPL", "closed", { closed_on: "2026-08-20" });   // closed before the rule went long again: fresh
    expect(ineligibleReason(AAPL, [freshX])).toBeNull();
    expect(ineligibleReason(row("NORISK", { instrument_risk: null }), [])).toBe("no instrument risk on the latest row — the position cannot be sized");
  });
});

describe("the plan: the judge's sizing at 12% ÷ N on the judge's facts, the stop, the costs, the overrides (decision 24 a, c, f)", () => {
  const cands = rankCandidates([AAPL, row("LONGA"), row("NEAR", { gate: "near", defensive: score(6, 7, "near_miss", ["P/B"]) })], []);
  const inputs = { eurUsd: 1.08, spreadPct: 0.1 };
  it("the top names fill the room; each row is sizePosition at the split target on the account's value — the same figures the calculator prints", () => {
    const picks = topPicks(cands, 2);
    expect(picks.map((p) => p.symbol)).toEqual(["AAPL", "NEAR"]);
    const p = buildPlan(cands, picks, inputs, fresh(), "2026-11-13");
    expect(p.targetPct).toBe(6);
    const s = sizePosition({ capital: 10000, price: 348.91, instrumentRiskPct: 18.18, targetPct: 6 });
    const a = p.rows[0];
    expect(a).toMatchObject({ symbol: "AAPL", band: "gate", rank: 1, sizedOn: 10000, ruleUnits: s.units, units: s.units, typedUnits: null, unitsText: null, underSized: false, oversized: false, stopGap: s.stopGap, stopLevel: s.stopLevel, exposure: s.exposure, achievedRiskPct: s.achievedRiskPct });
    expect(s.units).toBe(9);
    expect(a.stopGap).toBe(31.72);
    expect(a.stopLevel).toBe(317.19);
    expect(a.stopDistance).toBe(285.48);                 // 9 × 31.72 to the initial stop
    expect(a.costs).toEqual({ open: 9.85, close: 9.85, roundTrip: 19.7, roundTripPct: 0.63 });
    expect(a.facts).toBe("AAPL: rule LONG since 2026-09-01 (forecast +12.4); Graham 7/7 · 4/6; 9 of the rule's 9 shares at the 6% target; stop $317.19 (gap $31.72), trailing the high; if it is hit I close on the next close.");
    expect(a.thesis).toBe("");
    expect(a.blocked).toBe(true);                        // no thesis: not raised (F2)
    expect(a.problems).toEqual([]);
    // the second row is sized on the value less the first row's opening cost (F3)
    expect(p.rows[1].sizedOn).toBe(9990.15);
  });
  it("F3: each row is sized on the value less the opening costs of the rows above — what the judge sees when they are raised in order", () => {
    const aaa = row("AAA", { close: 50, instrument_risk: 20, gate: "open", defensive: score(7, 7, "survivor") });
    const bbbb = row("BBBB", { close: 100, instrument_risk: 30, gate: "near", defensive: score(6, 7, "near_miss", ["P/B"]) });
    const c = rankCandidates([aaa, bbbb], []);
    const p = buildPlan(c, [pick("AAA"), pick("BBBB")], DEFAULT_INPUTS, fresh(), null);
    expect(p.rows.map((r) => [r.symbol, r.sizedOn, r.units])).toEqual([["AAA", 10000, 60], ["BBBB", 9990.5, 19]]);   // on $10,000 the rule says 20 of BBBB; after AAA's $9.50 cost, 19
    // the judge agrees row by row
    const student = { code: "K7PM-4R2X", name: "Ada", capital: 10000, instruments: 2 };
    const sig = (r: GateRow) => ({ date: r.date, close: r.close, instrument_risk: r.instrument_risk, state: r.state, state_since: r.state_since ?? null, days: r.days, quarantined: null });
    const first = decideTicket({ code: student.code, symbol: "AAA", side: "open", units: 60, journal: "x".repeat(20) }, { student, tier: "core", tickerStatus: "active", signal: sig(aaa), positions: [], tickets: [], latest: {} } as Facts);
    expect(first.ok && first.side === "open" && first.units).toBe(60);
    const opened = pos("AAA", "open", { entry_price: 50, units: 60, exposure: 3000, stop_gap: 5, high_since: 50, stop_level: 45, instrument_risk: 20, open_ticket_id: 7 });
    const ticket: TicketRow = { id: 7, code: student.code, symbol: "AAA", side: "open", units: 60, fill_date: "2026-11-13", fill_price: 50, cost: 9.5, signal_state: "long", journal: "x".repeat(20), created_at: "x" };
    const second = decideTicket({ code: student.code, symbol: "BBBB", side: "open", units: 19, journal: "x".repeat(20) }, { student, tier: "core", tickerStatus: "active", signal: sig(bbbb), positions: [opened], tickets: [ticket], latest: { AAA: sig(aaa) } } as Facts);
    expect(second.ok).toBe(true);
    const twenty = decideTicket({ code: student.code, symbol: "BBBB", side: "open", units: 20, journal: "x".repeat(20) }, { student, tier: "core", tickerStatus: "active", signal: sig(bbbb), positions: [opened], tickets: [ticket], latest: { AAA: sig(aaa) } } as Facts);
    expect(twenty.ok).toBe(false);
    expect(!twenty.ok && twenty.reasons[0].code).toBe("oversized");
  });
  it("the euro lines are the broker schedule at the typed rate: €1 + €1 an order, 0.25% each way, the spread once; blank rate → blank columns and a note", () => {
    const p = buildPlan(cands, [pick("AAPL")], inputs, fresh(), "2026-11-13");
    const e = p.rows[0].eur!;
    expect(e).toEqual({ value: 2907.58, commission: 2, fx: 7.27, spread: 2.91, roundTrip: 21.45, roundTripPct: 0.74, stopLevel: 293.69, stopDistance: 264.33 });
    expect(euroLines({ exposure: 1080, stopLevel: 90, stopGap: 10, units: 1 }, 1.08, 0)).toMatchObject({ value: 1000, commission: 2, fx: 2.5, spread: 0, roundTrip: 9, roundTripPct: 0.9, stopLevel: 83.33, stopDistance: 9.26 });
    expect(p.totals.eur).toMatchObject({ exposure: 2907.58, costOpen: 9.27, roundTrip: 21.45, stopDistance: 264.33, connectivity: 2.5 });
    const blank = buildPlan(cands, [pick("AAPL")], DEFAULT_INPUTS, fresh(), null);
    expect(blank.rows[0].eur).toBeNull();
    expect(blank.totals.eur).toBeNull();
    expect(blank.notes).toContain("No exchange rate typed, so the euro columns are blank: enter today's US-dollars-per-euro rate from your broker's screen to see the broker's lines.");
  });
  it("fewer shares than the rule's is allowed; more is flagged first among the problems and kept as typed; a units cell that cannot be read blocks the row (S2)", () => {
    const p = buildPlan(cands, [pick("AAPL", 4, "my own words here, twenty plus"), pick("NEAR", 50, "")], inputs, fresh(), null);
    expect(p.rows[0]).toMatchObject({ units: 4, typedUnits: 4, underSized: true, oversized: false, exposure: 1395.64, problems: [], thesis: "my own words here, twenty plus", blocked: false });
    expect(p.rows[0].journal).toBe(`${p.rows[0].facts} Thesis: my own words here, twenty plus`);
    const near = p.rows[1];
    expect(near.ruleUnits).toBe(29);                                        // $9,994.51 × 6% ÷ 20% = $2,998.35 → 29 shares at $100 (the row above cost $5.49)
    expect(near).toMatchObject({ units: 50, oversized: true, exposure: 5000, blocked: true });
    expect(near.problems[0]).toBe("Oversized: the rule's size is 29 shares; 50 would carry 10.0% a year against the 6% target. The ticket will refuse it; fewer is allowed.");
    const typo = buildPlan(cands, [{ symbol: "AAPL", units: null, unitsText: "5O", thesis: "a thesis of twenty characters at least" }], inputs, fresh(), null);
    expect(typo.rows[0]).toMatchObject({ units: 9, unitsText: "5O", blocked: true });
    expect(typo.rows[0].problems[0]).toBe('Units must be a whole number of shares, at least 1 — "5O" could not be read. The rule\'s size is shown; the row is not raised until the cell is fixed or cleared.');
  });
  it("the totals: room for N minus the open positions, the risk beside what is open tonight, the budget flag; a pick the ticket would refuse is dropped with a note", () => {
    const p = buildPlan(cands, [pick("AAPL"), pick("NEAR"), pick("LONGA"), pick("FLAT")], inputs, fresh({ riskUsedPct: 5.5, openCount: 1 }), "2026-11-13");
    expect(p.rows.map((r) => r.symbol)).toEqual(["AAPL", "NEAR", "LONGA"]);
    expect(p.notes[0]).toBe("FLAT is not on tonight's rows — dropped.");
    expect(p.totals).toMatchObject({ openCount: 1, roomFor: 1, overCount: true });
    expect(p.totals.overBudget).toBe(true);
    expect(p.notes).toContain("The account runs 2 instruments and 1 is open: there is room for 1, and the plan has 3 — only the first 1 would be raised; the ticket refuses the rest as concentration.");
    expect(p.notes.find((n) => n.startsWith("Over the risk budget"))).toMatch(/^Over the risk budget: the open positions carry 5\.5% tonight and the plan adds \d+\.\d% — \d+\.\d% against the 12% target \(tolerance 1 point\)\. The ticket will refuse the row that crosses it\.$/);
    const held = rankCandidates([AAPL], [pos("AAPL", "open")]);
    const q = buildPlan(held, [pick("AAPL")], inputs, fresh(), null);
    expect(q.rows).toEqual([]);
    expect(q.notes[0]).toBe("AAPL dropped: already held: 5 shares opened 2026-10-01 — one position per instrument.");
    expect(q.totals.cashAfter).toBe(10000);
  });
  it("a share the account is too small for is kept on the plan with the sizing's own sentence (the ticket refuses on it too); a duplicate pick is one row; a zero row is blocked", () => {
    const dear = rankCandidates([row("DEAR", { close: 12000, instrument_risk: 10 })], []);   // the whole account (capped) is less than one share
    const p = buildPlan(dear, [pick("DEAR"), pick("dear", 3)], DEFAULT_INPUTS, fresh({ instruments: 1 }), null);
    expect(p.rows.length).toBe(1);
    expect(p.rows[0].ruleUnits).toBe(0);
    expect(p.rows[0].problems[0]).toMatch(/^One share at \$12,000\.00 is more than the \$10,000\.00 this rule would put in it/);
    expect(p.rows[0].units).toBe(0);                                           // the first pick wins (the rule's size); the duplicate's 3 is not read
    expect(p.rows[0]).toMatchObject({ oversized: false, blocked: true });
    expect(p.rows[0].costs).toEqual({ open: 0, close: 0, roundTrip: 0, roundTripPct: null });   // no shares, no fee, no percentage (N3)
  });
});

describe("the rows fit in the ledger cash, in rank order — the judge's own check", () => {
  // two shares that move less than the target: each sizes to the whole account (the cap), so the second cannot fit
  const calm = rankCandidates([row("CALMA", { close: 60, instrument_risk: 2.5, gate: "open", defensive: score(7, 7, "survivor") }), row("CALMB", { close: 90, instrument_risk: 2.3, gate: "near", defensive: score(6, 7, "near_miss", ["P/B"]) })], []);
  it("a blank units cell is fitted to the cash left and says so; the totals leave cash, never a negative", () => {
    const p = buildPlan(calm, topPicks(calm, 2), DEFAULT_INPUTS, fresh(), null);
    const [a, b] = p.rows;
    expect(a).toMatchObject({ ruleUnits: 166, units: 166, problems: [] });                 // 10000 ÷ 60 = 166.7 → 166 at the cap; cost $26.90
    expect(b.sizedOn).toBe(9973.1);                                                          // less the first row's cost
    expect(b.ruleUnits).toBe(110);                                                           // 9973.1 ÷ 90 → 110 at the cap
    expect(b.units).toBe(0);                                                                 // $10,000 − $9,960 − $26.90 = $13.10 left: nothing fits
    expect(b.problems).toEqual(["No cash left after the rows above: the rule's size is 110 shares and none fits (cost included). Drop a row above, or overwrite."]);
    expect(p.totals.cashAfter).toBe(13.1);
    const half = buildPlan(calm, [pick("CALMA", 80), pick("CALMB")], DEFAULT_INPUTS, fresh(), null);
    expect(half.rows[1].units).toBe(57);                                                     // $10,000 − $4,800 − $14 = $5,186 → 57 × $90 + cost fits, 58 does not
    expect(half.rows[1].problems[0]).toBe("Fitted to the cash left after the rows above: the rule's size is 110 shares, 57 fit (cost included). Overwrite it if you would rather drop a row above.");
    expect(half.totals.cashAfter).toBeGreaterThan(0);
  });
  it("a typed figure that does not fit is flagged in the judge's words with what would; the ledger cash, not the value, is what the rows fit in (F1)", () => {
    const p = buildPlan(calm, [pick("CALMA", 100), pick("CALMB", 100)], DEFAULT_INPUTS, fresh(), null);
    expect(p.rows[1].problems[0]).toBe("Not enough cash after the rows above: $3,983.00 left; 100 shares at $90.00 plus the $24.50 cost is $9,024.50. 44 shares would fit, cost included. The ticket will refuse it.");
    const invested = buildPlan(calm, [pick("CALMA")], DEFAULT_INPUTS, fresh({ value: 10000, cash: 3000, riskUsedPct: 5, openCount: 1 }), null);
    expect(invested.rows[0].ruleUnits).toBe(166);                                            // the rule's size on the VALUE
    expect(invested.rows[0].units).toBe(49);                                                 // fitted to the CASH: 49 × $60 + cost
    expect(invested.rows[0].problems[0]).toMatch(/^Fitted to the cash left after the rows above: the rule's size is 166 shares, 49 fit/);
  });
});

describe("the inputs, the saved shape and the CSV", () => {
  it("parseInputs: blank → the defaults; plain decimals with € $ % allowed; a field that cannot be read keeps its default and is named (S4, N6)", () => {
    expect(parseInputs({})).toEqual({ inputs: { eurUsd: null, spreadPct: 0.1 }, errors: [] });
    expect(parseInputs({ eurusd: " 1.0850 ", spread: "0.3%" })).toEqual({ inputs: { eurUsd: 1.085, spreadPct: 0.3 }, errors: [] });
    const bad = parseInputs({ eurusd: "12", spread: "abc" });
    expect(bad.inputs).toEqual({ eurUsd: null, spreadPct: 0.1 });
    expect(bad.errors).toEqual([
      "The exchange rate must be a plain number from 0.2 to 5 (US dollars per euro) — it was left blank.",
      "The spread must be a plain number from 0 to 10 (percent of the value) — 0.1% was used.",
    ]);
    for (const odd of ["0x2", "1e0", "1,08", "-1", "1.", ".5"]) expect(parseInputs({ eurusd: odd }).errors.length).toBe(1);   // no hex, exponents, thousands commas, signs or bare points
  });
  it("parseUnits: blank → the rule's; a whole number ≥ 1 → that; anything else kept as text and refused", () => {
    expect(parseUnits(undefined)).toEqual({ units: null });
    expect(parseUnits("  ")).toEqual({ units: null });
    expect(parseUnits("12")).toEqual({ units: 12 });
    expect(parseUnits("0")).toEqual({ units: null, unitsText: "0" });
    expect(parseUnits("-3")).toEqual({ units: null, unitsText: "-3" });
    expect(parseUnits("5O")).toEqual({ units: null, unitsText: "5O" });
    expect(parseUnits("12345678")).toEqual({ units: null, unitsText: "12345678" });
  });
  it("parseSavedPlan: a round trip; every bound re-applied (N5); garbage, a missing body → null; the picks capped at 50", () => {
    const saved = { inputs: { eurUsd: 1.08, spreadPct: 0.1 }, picks: [{ symbol: "aapl", units: 9, thesis: "t" }, { symbol: "NEAR", units: 2.5, thesis: "" }] };
    expect(parseSavedPlan(JSON.stringify(saved))).toEqual({ inputs: saved.inputs, picks: [{ symbol: "AAPL", units: 9, thesis: "t" }, { symbol: "NEAR", units: null, thesis: "" }] });
    expect(parseSavedPlan("{nope")).toBeNull();
    expect(parseSavedPlan(null)).toBeNull();
    const wild = parseSavedPlan(JSON.stringify({ inputs: { eurUsd: 1e-300, spreadPct: 1e308, capital: 5, positions: 9 }, picks: [{ symbol: "X", units: 1e21, thesis: "y".repeat(5000) }, ...Array.from({ length: 80 }, (_, i) => ({ symbol: `S${i}`, units: null, thesis: "" }))] }))!;
    expect(wild.inputs).toEqual({ eurUsd: null, spreadPct: 0.1 });
    expect(wild.picks[0]).toEqual({ symbol: "X", units: null, thesis: "y".repeat(1000) });
    expect(wild.picks.length).toBe(50);
    // the v1.1.0 pre-review shape (capital, positions, journal) reads as a plan without them
    expect(parseSavedPlan(JSON.stringify({ inputs: { capital: 10000, positions: 2, eurUsd: 1.08, spreadPct: 0.1 }, picks: [{ symbol: "GOOD", units: 20, journal: "old" }] }))).toEqual({ inputs: { eurUsd: 1.08, spreadPct: 0.1 }, picks: [{ symbol: "GOOD", units: 20, thesis: "" }] });
  });
  it("planCsv: a header, one line per row, a TOTAL line, CRLF; the facts and the thesis in their own columns; a thesis with a comma and a quote is quoted the RFC 4180 way", () => {
    const cands = rankCandidates([AAPL], []);
    const p = buildPlan(cands, [pick("AAPL", null, 'Thesis: "cheap", I think')], { eurUsd: 1.08, spreadPct: 0.1 }, fresh({ instruments: 1 }), "2026-11-13");
    const csv = planCsv(p);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe("rank,symbol,name,band,rule_long_since,forecast,instrument_risk_pct,graham,close_usd,sized_on_usd,rule_units,units,exposure_usd,weight_pct,risk_pct,stop_gap_usd,stop_level_usd,stop_distance_usd,cost_open_usd,cost_round_trip_usd,round_trip_pct,value_eur,commission_eur,fx_eur,spread_eur,round_trip_eur,stop_level_eur,stop_distance_eur,problems,facts,thesis");
    expect(lines[1]).toBe(`1,AAPL,AAPL Co,gate,2026-09-01,12.4,18.18,7/7 · 4/6,348.91,10000,18,18,6280.38,62.8,11.42,31.72,317.19,570.96,17.7,35.4,0.56,5815.17,2,14.54,5.82,38.89,293.69,528.67,,"${p.rows[0].facts}","Thesis: ""cheap"", I think"`);   // the facts carry a comma, so they are quoted
    expect(lines[2]).toMatch(/^,TOTAL,,,,,,,,,,,6280\.38,62\.8,11\.42,,,,17\.7,,,5815\.17,,,,38\.89,,528\.67,,"as of 2026-11-13; the account's value 10000, cash 10000, 1 instruments at 12% each, 0 open; USD per EUR 1\.08; spread 0\.1%\. Education, not advice\.",$/);
    expect(lines[3]).toBe("");
    expect(csv.endsWith("\r\n")).toBe(true);
  });
  it("a thesis that begins like a formula is prefixed with an apostrophe in the CSV, so a spreadsheet shows it rather than runs it", () => {
    const cands = rankCandidates([AAPL], []);
    for (const j of ['=HYPERLINK("x")', "+1", "-1", "@SUM(A1)"]) {
      const p = buildPlan(cands, [pick("AAPL", 1, j)], DEFAULT_INPUTS, fresh({ instruments: 1 }), null);
      expect(planCsv(p).split("\r\n")[1]).toMatch(/,"?'[=+\-@]/);   // the last cell begins with the apostrophe (quoted when the thesis carries a quote)
    }
    // a negative forecast is a number, not a formula: printed plain
    const neg = buildPlan(rankCandidates([row("NEG", { forecast: -0.5, state: "long", gate: "closed" })], []), [pick("NEG", 1)], DEFAULT_INPUTS, fresh({ instruments: 1 }), null);
    expect(planCsv(neg).split("\r\n")[1]).toMatch(/^1,NEG,NEG Co,long,2026-09-01,-0\.5,20,/);
  });
  it("journalFacts carries the rule's facts only; journalOf joins the thesis after them and bounds the whole", () => {
    const c = rankCandidates([AAPL], [])[0] as Candidate;
    const s = sizePosition({ capital: 10000, price: 348.91, instrumentRiskPct: 18.18, targetPct: 12 });
    const facts = journalFacts(c, s, 10, 12);
    expect(facts).toBe("AAPL: rule LONG since 2026-09-01 (forecast +12.4); Graham 7/7 · 4/6; 10 of the rule's 18 shares at the 12% target; stop $317.19 (gap $31.72), trailing the high; if it is hit I close on the next close.");
    expect(journalOf(facts, "  because the gate opened and the P/E is below 15  ")).toBe(`${facts} Thesis: because the gate opened and the P/E is below 15`);
    expect(journalOf(facts, "z".repeat(2000)).length).toBe(1000);
  });
});
