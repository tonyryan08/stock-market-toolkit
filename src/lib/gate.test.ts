/**
 * Week 10 (OI-68): the gate reads the two rules and invents nothing. The
 * screen's verdicts come from graham.ts (its own tests); here the fixture is
 * the clean survivor from graham.test.ts and its one-test-short cousin.
 */
import { describe, it, expect } from "vitest";
import { screenCompany, screenEnterprising, type ScreenInput } from "./graham";
import type { FundamentalsYear } from "./ratios";
import { scoreOf, gateOf, scoresText, buildWatchlist, describeWatchlist, type SignalFacts, type ScreenScore } from "./gate";

const yr = (fy: number, eps: number, over: Partial<FundamentalsYear> = {}): FundamentalsYear => ({
  fiscalYear: String(fy), periodEnd: `${fy}-12-31`, revenue: 2e9, netIncome: null, epsDiluted: eps,
  currentAssets: 400, currentLiabilities: 150, totalAssets: null, totalLiabilities: null, longTermDebt: 100, equity: 2000, sharesDiluted: 50, ...over,
});
const divs = (from: number, to: number) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), 1]));
const survivor = (over: Partial<ScreenInput> = {}): ScreenInput => ({
  symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive",
  years: [yr(2025, 5), yr(2024, 4.6), yr(2023, 4.4), yr(2022, 4), yr(2021, 3.8)],
  dividendsPerYear: divs(2016, 2025), lastClose: 60, currentYear: 2026, ...over,
});
const sig = (over: Partial<SignalFacts> = {}): SignalFacts => ({
  symbol: "GOOD", name: "Good Co", tier: "core", date: "2026-11-10", close: 60, state: "long", state_since: "2026-09-01",
  forecast: 8.2, instrument_risk: 20.1, days: 1260, quarantined: null, ...over,
});

describe("scoreOf / scoresText", () => {
  it("counts the passes and names the failed tests by their short names", () => {
    const d = scoreOf(screenCompany(survivor()))!;
    expect(d).toMatchObject({ passes: 7, applicable: 7, verdict: "survivor", failed: [] });
    const dear = scoreOf(screenCompany(survivor({ lastClose: 100 })))!;          // P/E 21.4, P/B 2.5 → two price tests fail
    expect(dear.verdict).toBe("fails");
    expect(dear.failed).toEqual(["P/E", "P/B"]);
    const e = scoreOf(screenEnterprising(survivor()))!;
    expect(e.applicable).toBe(6);
    expect(scoresText({ defensive: d, enterprising: e })).toBe(`7/7 · ${e.passes}/6`);
    expect(scoresText({ defensive: null, enterprising: null })).toBe("—");
    expect(scoreOf(undefined)).toBeNull();
  });
});

describe("gateOf — the gate in that order: a screen, then the rule", () => {
  const pass: ScreenScore = { passes: 7, applicable: 7, verdict: "survivor", failed: [] };
  const near: ScreenScore = { passes: 6, applicable: 7, verdict: "near_miss", failed: ["P/E"] };
  const fails: ScreenScore = { passes: 4, applicable: 7, verdict: "fails", failed: ["P/E", "P/B", "Growth"] };
  const eNear: ScreenScore = { passes: 5, applicable: 6, verdict: "near_miss", failed: ["P/E ≤ 9"] };
  it("open needs a pass AND long; near needs a near miss AND long; flat closes either; the small tier's states come first; no books is its own state", () => {
    expect(gateOf(sig(), pass, fails).gate).toBe("open");
    expect(gateOf(sig(), fails, { ...pass, verdict: "candidate" }).gate).toBe("open");
    expect(gateOf(sig(), near, fails).gate).toBe("near");
    expect(gateOf(sig(), fails, eNear).gate).toBe("near");
    expect(gateOf(sig(), fails, fails).gate).toBe("closed");
    expect(gateOf(sig({ state: "flat" }), pass, pass).gate).toBe("closed");
    expect(gateOf(sig({ state: "warming", days: 100, tier: "small" }), pass, pass).gate).toBe("warming");
    expect(gateOf(sig({ quarantined: "a jump no splits row explains", tier: "small" }), pass, pass).gate).toBe("quarantined");
    expect(gateOf(sig(), null, null).gate).toBe("no_books");
    expect(gateOf(sig({ state: "warming" }), null, null).gate).toBe("warming");      // the rule's state first: a warming small cap with no books is still on its way to 128
  });
});

describe("buildWatchlist / describeWatchlist — statements, never picks", () => {
  const pass: ScreenScore = { passes: 7, applicable: 7, verdict: "survivor", failed: [] };
  const near: ScreenScore = { passes: 6, applicable: 7, verdict: "near_miss", failed: ["P/B"] };
  const f2: ScreenScore = { passes: 5, applicable: 7, verdict: "fails", failed: ["P/E", "P/B"] };
  const f3: ScreenScore = { passes: 4, applicable: 7, verdict: "fails", failed: ["P/E", "P/B", "Growth"] };
  const eF: ScreenScore = { passes: 3, applicable: 6, verdict: "fails", failed: ["P/E ≤ 9", "P/TBV", "Growth"] };
  it("the 6 Nov shape: an empty gate, no near miss, the longs sorted by defensive tests, the small caps by closes", () => {
    const rows = [
      gateOf(sig({ symbol: "KO" }), f2, eF),
      gateOf(sig({ symbol: "DAL" }), f3, eF),
      gateOf(sig({ symbol: "JNJ" }), f2, eF),
      gateOf(sig({ symbol: "MSFT", state: "flat" }), f3, eF),
      gateOf(sig({ symbol: "MLI", tier: "small", state: "warming", days: 100 }), near, eF),
      gateOf(sig({ symbol: "CALM", tier: "small", state: "warming", days: 61 }), near, eF),
      gateOf(sig({ symbol: "NEWC", tier: "small", state: "warming", days: 20 }), null, null),
    ];
    const w = buildWatchlist(rows);
    expect(w.asOf).toBe("2026-11-10");
    expect(w.open).toEqual([]);
    expect(w.near).toEqual([]);
    expect(w.longs.map((r) => r.symbol)).toEqual(["JNJ", "KO", "DAL"]);        // 5/7, 5/7 (ties by symbol), 4/7
    expect(w.maturing.map((r) => r.symbol)).toEqual(["MLI", "CALM", "NEWC"]);  // NEWC has no books yet; its rule is warming all the same
    expect(w.counts).toEqual({ rows: 7, long: 3, open: 0, near: 0, survivors: 0, candidates: 0, warming: 3, quarantined: 0 });
    const lines = describeWatchlist(w);
    expect(lines[0]).toBe('The gate tonight: nothing. No company passes either Graham screen, so there is no name the course would write a ticket for by both rules — the rules\' answer is to hold cash, and a journal line that says "waiting".');
    expect(lines[1]).toBe("No near miss is long tonight. A near miss is a reading list, not a pick.");   // the caution prints every night (review H5)
    expect(lines[2]).toMatch(/^3 names are long on the rule; 3 of them fail both screens\. By defensive tests passed, the nearest: JNJ 5\/7 · 3\/6, KO 5\/7 · 3\/6, DAL 4\/7 · 3\/6\. Lesson 10's point/);
    expect(lines[3]).toBe("3 small caps still warming up (fewer than 128 closes); the nearest, MLI, has 100 — ticketable once it has 128 and no quarantine.");
    expect(lines.join(" ")).not.toMatch(/\b(buy|sell|should)\b/i);
  });
  it("an open gate and a near miss are read out with their failed tests; a pass that is flat is counted but not open", () => {
    const rows = [
      gateOf(sig({ symbol: "GOOD" }), pass, eF),
      gateOf(sig({ symbol: "NEAR" }), near, eF),
      gateOf(sig({ symbol: "FLAT", state: "flat" }), pass, eF),
      gateOf(sig({ symbol: "Q", tier: "small", quarantined: "jump" }), near, eF),
    ];
    const w = buildWatchlist(rows);
    expect(w.open.map((r) => r.symbol)).toEqual(["GOOD"]);
    expect(w.near.map((r) => r.symbol)).toEqual(["NEAR"]);
    expect(w.counts.survivors).toBe(2);
    expect(w.counts.quarantined).toBe(1);
    expect(w.quarantined.map((r) => r.symbol)).toEqual(["Q"]);
    const lines = describeWatchlist(w);
    // the quarantined name is on no table, so the reading names it (review N7)
    expect(lines.at(-1)).toBe("1 quarantined tonight — Q: a jump in the series no splits row explains; no tickets until the row is added (the Q on the signals page has the reason).");
    // a screen that cannot be completed is named, not counted as a fail (review N8)
    const ins: ScreenScore = { passes: 4, applicable: 7, verdict: "insufficient", failed: ["P/E"] };
    const w3 = buildWatchlist([gateOf(sig({ symbol: "INS" }), ins, eF), gateOf(sig({ symbol: "DEAR" }), f2, eF)]);
    expect(describeWatchlist(w3)[2]).toMatch(/^2 names are long on the rule; 2 of them fail \(or, for 1, cannot complete\) both screens\./);
    expect(lines[0]).toBe("The gate tonight: 1 name passes a Graham screen and is long on the rule — GOOD. The Starter System sizes it; the stop closes it; the ticket is the student's.");
    expect(lines[1]).toBe("1 near miss is long — one Graham test short and the rule says so: NEAR (defensive, fails P/B). A near miss is a reading list, not a pick.");
    // a passing name that is flat: the gate's first sentence when nothing is open names the count
    const w2 = buildWatchlist([gateOf(sig({ symbol: "FLAT", state: "flat" }), pass, eF)]);
    expect(describeWatchlist(w2)[0]).toMatch(/^The gate tonight: nothing\. 1 name passes a Graham screen but is not long on the rule/);
  });
});
