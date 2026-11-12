/**
 * Week 11: the process review's audit and checks (decision 22). The exit
 * check in the syllabus — "review of a deliberately rule-breaking test
 * portfolio flags the breach, not the P&L" — is pinned here on a fixture
 * with three positions: a stop hit nine closes ago and the position still
 * open; a profitable close with the stop not hit (the breach the P&L would
 * hide); a stop answered within the week's routine. The sheet the model
 * reads carries no P&L; a reading that praises a result is caught.
 */
import { describe, it, expect } from "vitest";
import { auditProcess, sheetAsText, describeAudit, validateReading, checkReading, findOutcomeLanguage, OUTCOME_PATTERNS, ROUTINE_CLOSES, REVIEW_PROMPT_VERSION, REVIEW_SYSTEM_PROMPT, REVIEW_SCHEMA } from "./review";
import type { Student, PositionRow, TicketRow } from "./tickets";

const student: Student = { code: "K7PM-4R2X", name: "Test Student", capital: 10000, instruments: 2 };

const ticket = (o: Partial<TicketRow> & { id: number; symbol: string; side: "open" | "close"; fill_date: string; journal: string }): TicketRow =>
  ({ code: student.code, units: 10, fill_price: 100, cost: 2.25, signal_state: "long", created_at: `${o.fill_date}T20:00:00.000Z`, ...o });
const position = (o: Partial<PositionRow> & { id: number; symbol: string; status: "open" | "closed"; opened_on: string; open_ticket_id: number }): PositionRow =>
  ({ code: student.code, entry_price: 100, units: 10, exposure: 1000, stop_gap: 9, high_since: 110, stop_level: 101, stop_hit_on: null, instrument_risk: 18, realign_date: null, closed_on: null, exit_price: null, pnl: null, close_ticket_id: null, ...o });

const tickets: TicketRow[] = [
  ticket({ id: 1, symbol: "AAPL", side: "open", fill_date: "2026-10-20", units: 18, fill_price: 348.91, journal: "The rule went long on the 16/64 crossover; the stop is at $317.19; if it is hit I close the next morning. Calm 2." }),
  ticket({ id: 2, symbol: "KO", side: "open", fill_date: "2026-10-20", units: 29, fill_price: 94.08, journal: "Bought because it seemed cheap and I liked the brand. Everyone drinks it." }),
  ticket({ id: 3, symbol: "KO", side: "close", fill_date: "2026-11-02", units: 29, fill_price: 101.00, journal: "Nervous about the market this week, taking the money while it is there." }),
  ticket({ id: 4, symbol: "MSFT", side: "open", fill_date: "2026-10-20", units: 10, fill_price: 530.14, journal: "Rule long since 14 Oct; stop $470.37; if hit, close at the next close and write why. Prove me wrong: a close below the stop." }),
  ticket({ id: 5, symbol: "MSFT", side: "close", fill_date: "2026-10-28", units: 10, fill_price: 465.00, journal: "Stop hit on the 27 Oct close; the rule says close, so this is the close ticket." }),
];
const positions: PositionRow[] = [
  position({ id: 1, symbol: "AAPL", status: "open", opened_on: "2026-10-20", open_ticket_id: 1, units: 18, entry_price: 348.91, stop_gap: 31.72, high_since: 360, stop_level: 328.28, stop_hit_on: "2026-10-28", instrument_risk: 18.18 }),
  position({ id: 2, symbol: "KO", status: "closed", opened_on: "2026-10-20", open_ticket_id: 2, close_ticket_id: 3, units: 29, entry_price: 94.08, closed_on: "2026-11-02", exit_price: 101, pnl: 196.3, instrument_risk: 21.11 }),
  position({ id: 3, symbol: "MSFT", status: "closed", opened_on: "2026-10-20", open_ticket_id: 4, close_ticket_id: 5, units: 10, entry_price: 530.14, stop_hit_on: "2026-10-27", closed_on: "2026-10-28", exit_price: 465, pnl: -655.9, instrument_risk: 22.55 }),
];
// one report a trading night, 21 Oct – 10 Nov
const nights = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
const reports = nights.map((date) => ({ date, flags: JSON.stringify(date >= "2026-10-28" ? ["stop_hit"] : []), stop_hits: date >= "2026-10-28" ? 1 : 0 }));

describe("auditProcess — the exit check: a deliberately rule-breaking book", () => {
  const a = auditProcess(student, positions, tickets, reports, "2026-11-10");

  it("flags the stop hit nine closes ago with the position still open, and the close with the stop not hit", () => {
    const kinds = a.items.map((i) => `${i.kind}:${i.symbol ?? ""}`);
    expect(kinds).toContain("stop_open:AAPL");
    expect(kinds).toContain("early_close:KO");
    expect(a.breaches).toBe(2);
    const aapl = a.items.find((i) => i.kind === "stop_open")!;
    expect(aapl.what).toMatch(/9 nightly closes since/);
    expect(aapl.severity).toBe("breach");
    const ko = a.items.find((i) => i.kind === "early_close")!;
    expect(ko.what).toMatch(/stop not hit/);
    expect(ko.what).toMatch(/ticket #3/);
  });
  it("the stop answered within the week's routine is kept, one close after the hit", () => {
    const msft = a.items.find((i) => i.kind === "closed_on_stop")!;
    expect(msft).toBeTruthy();
    expect(msft.severity).toBe("kept");
    expect(msft.what).toMatch(/1 nightly close later, within the week's routine/);
    expect(ROUTINE_CLOSES).toBe(5);
  });
  it("the journal notes are word tests, and say so: KO's opening entry names no rule and no stop, its closing entry no rule; the others pass", () => {
    const notes = a.items.filter((i) => i.severity === "note");
    expect(notes.map((n) => `${n.kind}:${n.tickets.join(",")}`).sort()).toEqual(["journal_no_rule:2", "journal_no_rule:3", "journal_no_stop:2"]);
    expect(notes[0].what).toMatch(/a word test/);
  });
  it("the sheet the model reads carries the process and no P&L, account value, drawdown figure or price level beyond the entry (review F5)", () => {
    const text = sheetAsText(a);
    expect(text).not.toMatch(/high of|trailing the high|stop \(\$/);
    const openNoHit = auditProcess(student, [position({ id: 11, symbol: "KO", status: "open", opened_on: "2026-10-20", open_ticket_id: 2, high_since: 101, stop_level: 91.07 })], [tickets[1]], reports, "2026-11-10");
    expect(sheetAsText(openNoHit)).toMatch(/10 shares at \$100\.00, instrument risk 18% at entry; the trailing stop has not been hit as of the 2026-11-10 close/);
    expect(sheetAsText(openNoHit)).not.toMatch(/101|91\.07/);
    expect(text).toMatch(/^F1\. The account runs 2 instruments/);
    expect(text).toMatch(/Ticket #3: close 29 × KO on the 2026-11-02 close; the rule was LONG\. Journal: «Nervous about the market/);
    expect(text).toMatch(/KO: opened 2026-10-20 \(ticket F3\).*closed on the 2026-11-02 close \(ticket F4\) with the stop NOT hit/);
    expect(text).toMatch(/WHAT THE AUDIT FOUND/);
    expect(text).toMatch(/A1 \[breach\]/);
    for (const forbidden of ["196.3", "655.9", "P&L", "profit", "drawdown_pct", "account_value", "$10,000"]) expect(text, forbidden).not.toContain(forbidden);
    expect(a.facts.map((f) => f.id)).toEqual(["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10"]);
  });
  it("describeAudit leads with the count and puts the breaches first", () => {
    const lines = describeAudit(a);
    expect(lines[0]).toBe("5 tickets, 1 open position, 2 closed, read against the rules as of the 2026-11-10 close: 2 rules not followed, 3 notes on the journal.");
    expect(lines[1]).toMatch(/^Not followed — AAPL/);
    expect(lines[2]).toMatch(/^Not followed — KO/);
    expect(lines[3]).toMatch(/^Followed — MSFT/);
    expect(lines.at(-1)).toMatch(/a stop hit on 10 nights/);
  });
  it("the stop hit within the week is a note, not a breach; no ticket at all is 'nothing yet' with no sheet beyond F1–F2", () => {
    const fresh = auditProcess(student, [positions[0]], [tickets[0]], reports.filter((r) => r.date <= "2026-10-30"), "2026-10-30");
    expect(fresh.items.map((i) => i.kind)).toContain("stop_due");
    expect(fresh.breaches).toBe(0);
    const none = auditProcess(student, [], [], [], "2026-11-10");
    expect(none.nothingYet).toBe(true);
    expect(none.facts.map((f) => f.id)).toEqual(["F1", "F2"]);
    expect(describeAudit(none)[0]).toMatch(/No ticket has been written yet/);
  });
  it("the week's routine, at its edges (review F7): five closes after the hit is due or kept, six is a breach", () => {
    const cal = (n: number) => nights.slice(0, n + 1);   // nights[0] = the hit's own close, then n closes after it
    const open = (hit: string) => position({ id: 7, symbol: "AAPL", status: "open", opened_on: "2026-10-20", open_ticket_id: 1, stop_hit_on: hit });
    const at5 = auditProcess(student, [open(nights[0])], [tickets[0]], [], nights[5], cal(5));
    expect(at5.items.find((i) => i.symbol === "AAPL")!.kind).toBe("stop_due");
    expect(at5.items.find((i) => i.symbol === "AAPL")!.what).toMatch(/5 nightly closes since/);
    const at6 = auditProcess(student, [open(nights[0])], [tickets[0]], [], nights[6], cal(6));
    expect(at6.items.find((i) => i.symbol === "AAPL")!.kind).toBe("stop_open");
    const closedAt = (fill: string) => auditProcess(student,
      [position({ id: 8, symbol: "MSFT", status: "closed", opened_on: "2026-10-20", open_ticket_id: 4, close_ticket_id: 5, stop_hit_on: nights[0], closed_on: fill })],
      [tickets[3], ticket({ ...tickets[4], fill_date: fill })], [], "2026-11-10", nights);
    expect(closedAt(nights[5]).items.find((i) => i.symbol === "MSFT")!.kind).toBe("closed_on_stop");
    expect(closedAt(nights[6]).items.find((i) => i.symbol === "MSFT")!.kind).toBe("late_close");
  });
  it("the calendar is the universe's nights, not the student's own report rows (review F6): with no rows at all a three-week-old stop is still a breach, and 'the latest close' is said only of tonight's hit", () => {
    const old = position({ id: 9, symbol: "AAPL", status: "open", opened_on: "2026-10-20", open_ticket_id: 1, stop_hit_on: "2026-10-21" });
    const noRows = auditProcess(student, [old], [tickets[0]], [], "2026-11-10", nights);
    expect(noRows.items.find((i) => i.symbol === "AAPL")!.kind).toBe("stop_open");
    expect(noRows.items.find((i) => i.symbol === "AAPL")!.what).not.toMatch(/latest close the toolkit holds/);
    // no calendar and no rows: nothing to count — the note says so without claiming the hit is tonight's
    const nothing = auditProcess(student, [old], [tickets[0]], [], "2026-11-10", null);
    expect(nothing.items.find((i) => i.symbol === "AAPL")!.kind).toBe("stop_due");
    expect(nothing.items.find((i) => i.symbol === "AAPL")!.what).not.toMatch(/latest close the toolkit holds/);
    // the hit on the latest close itself
    const tonight = auditProcess(student, [position({ id: 10, symbol: "AAPL", status: "open", opened_on: "2026-10-20", open_ticket_id: 1, stop_hit_on: "2026-11-10" })], [tickets[0]], [], "2026-11-10", nights);
    expect(tonight.items.find((i) => i.symbol === "AAPL")!.what).toMatch(/the latest close the toolkit holds/);
  });
  it("a closed position with the stop hit twelve closes before its ticket is a late close", () => {
    const late = auditProcess(student, [position({ id: 9, symbol: "MSFT", status: "closed", opened_on: "2026-10-20", open_ticket_id: 4, close_ticket_id: 5, stop_hit_on: "2026-10-22", closed_on: "2026-11-09" })],
      [tickets[3], ticket({ ...tickets[4], fill_date: "2026-11-09" })], reports, "2026-11-10");
    const item = late.items.find((i) => i.kind === "late_close")!;
    expect(item.severity).toBe("breach");
    expect(item.what).toMatch(/12 nightly closes later/);
  });
});

describe("the reading — validated and checked", () => {
  const a = auditProcess(student, positions, tickets, reports, "2026-11-10");

  it("a reading in process terms, citing the sheet, is clean", () => {
    const r = validateReading({ paragraphs: [
      { text: "You opened all three positions with the rule long and wrote an entry on each ticket; the MSFT stop was hit on the 2026-10-27 close and your close ticket followed one close later, within the week's routine.", facts: ["F2", "F5", "F6", "F10"] },
      { text: "Two rules were not followed. AAPL's stop was hit on the 2026-10-28 close and the position is still open nine reports later; KO was closed on the 2026-11-02 close with the stop not hit, and the entry says «Nervous about the market» rather than what the rule said.", facts: ["F8", "F9", "F4"] },
    ], next_week: "On Monday evening, check the stop line on your page first and write the close ticket the day the report says the stop was hit." })!;
    expect(r).toBeTruthy();
    const c = checkReading(r, a);
    expect(c).toEqual({ unknownFacts: [], uncited: [], unsupportedNumbers: [], recommendationLanguage: [], outcomeLanguage: [], clean: true });
  });
  it("praise of a result, a profit, a number from nowhere, a fact not on the sheet and a tip are each caught", () => {
    const bad = validateReading({ paragraphs: [
      { text: "Well done on KO — you made a profit of $196 by selling early, which paid off.", facts: ["F3"] },
      { text: "AAPL's stop was hit on the 2026-10-28 close; the position has been open 14 nights.", facts: ["F8", "F12"] },
      { text: "The sensible thing is to sell AAPL tomorrow before it falls further.", facts: [] },
    ], next_week: "Hold KO next time; it will go up." })!;
    const c = checkReading(bad, a);
    expect(c.clean).toBe(false);
    expect(c.outcomeLanguage[0]).toMatch(/^Well done/i);
    expect(c.outcomeLanguage.some((s) => /profit/i.test(s))).toBe(true);
    expect(c.unsupportedNumbers).toEqual([{ paragraph: 1, numbers: ["196"] }, { paragraph: 2, numbers: ["14"] }]);
    const nw = checkReading(validateReading({ paragraphs: [{ text: "Fine.", facts: ["F1"] }], next_week: "Write 17 entries." })!, a);
    expect(nw.unsupportedNumbers).toEqual([{ paragraph: 2, where: "next_week", numbers: ["17"] }]);
    expect(c.unknownFacts).toEqual([{ paragraph: 2, ids: ["F12"] }]);
    expect(c.uncited).toEqual([3]);
    expect(c.recommendationLanguage.length).toBeGreaterThan(0);
  });
  it("process words pass the outcome family; result words do not (widened at the v0.13.0 review, F4 — one sentence per form)", () => {
    const innocent = [
      "The stop-loss rule did its work.", "The stop was hit on the 2026-10-27 close.", "The journal entry named the stop and the crossover.", "You closed within the week.",
      "You will gain a clearer record by writing the trigger.", "A loss of nerve is not a rule.", "An impressive journal entry names the stop.", "You returned on Monday to the page.",
      "It is fortunate that the entry named the stop.", "The return of the Monday routine would help.", "The close fell below the stop and the rule said close.", "Write it down on Monday.",
      "The rule went long on the 2026-10-14 close.", "The position is still open.", "The stop is the closing rule.", "You worked out the size from the calculator.",
      "The stop was hit and you closed at the next close: the rule, followed.", "The report flagged a stop hit on 10 nights.", "The entry names what would prove you wrong.",
    ];
    for (const ok of innocent) expect(findOutcomeLanguage(ok), ok).toEqual([]);
    const results = [
      "Well done on MSFT.", "Congratulations on the KO result.", "Good job on the close.", "Nice gain on MSFT.", "You were right to close it.", "That was well timed.", "That decision paid off.",
      "The trade worked out.", "You came out ahead.", "You are better off for it.", "A good outcome on KO.", "A successful trade.", "The position is in the money.", "A win on KO.",
      "You made a profit on KO.", "You lost money on MSFT.", "The profit was real.", "The trade was profitable.", "A loss of $655 on MSFT.", "The P&L was positive.",
      "A return of 8% on KO.", "It went up after you bought it.", "KO is up since entry.", "The trade went well.", "You did well.", "The price has risen since entry.",
      "Apple fell sharply.", "The share recovered since.", "The trade was up 8% when you sold.", "Down 5 per cent on MSFT.", "You sold at the high.", "The stop saved you money.",
      "You were lucky with the timing.", "The trade beat the market.",
    ];
    for (const bad of results) expect(findOutcomeLanguage(bad).length, bad).toBeGreaterThan(0);
    expect(OUTCOME_PATTERNS.map((p) => p.family)).toEqual(["praise", "money outcome"]);
  });
  it("validateReading refuses an empty or oversized reply and upper-cases fact ids", () => {
    expect(validateReading({ paragraphs: [], next_week: "" })).toBeNull();
    expect(validateReading({ paragraphs: [{ text: "", facts: [] }], next_week: "" })).toBeNull();
    expect(validateReading({ paragraphs: Array(4).fill({ text: "x", facts: [] }), next_week: "" })).toBeNull();   // three at most, as the prompt says (review N1)
    expect(validateReading({ paragraphs: Array(3).fill({ text: "x", facts: ["F1"] }), next_week: "" })).not.toBeNull();
    expect(validateReading({ paragraphs: [{ text: "ok", facts: ["f2", " F3 "] }] })).toEqual({ paragraphs: [{ text: "ok", facts: ["F2", "F3"] }], next_week: "" });
    expect(REVIEW_PROMPT_VERSION).toBe("r3");
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/A1, A2 …\) are the audit's own reading of the facts and are not citable/);
  });
  it("r3 (OI-93): the prompt asks for two paragraphs and the next-week sentence once, in its own field — r2 listed it as a third paragraph beside the schema's field and the model wrote it twice", () => {
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/in two short paragraphs:/);
    expect(REVIEW_SYSTEM_PROMPT).not.toMatch(/two or three/);
    expect(REVIEW_SYSTEM_PROMPT).toMatch(/in the next_week field only — not in the paragraphs, and written once — one sentence for next week/);
    expect(REVIEW_SCHEMA.required).toEqual(["paragraphs", "next_week"]);
  });
});
