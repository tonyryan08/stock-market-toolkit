/**
 * Week 6: the fact sheet on trial. The AI may only say what is on it, so the
 * sheet itself has to be right — and checkable on paper.
 */
import { describe, it, expect } from "vitest";
import { buildFactSheet, templateNarrative, checkGrounding, fingerprint, findAdvice, extractNumbers, ADVICE_PATTERNS, type Narrative } from "./explain";
import type { ScreenInput } from "./graham";
import type { FundamentalsYear } from "./ratios";

const yr = (fy: number, eps: number, over: Partial<FundamentalsYear> = {}): FundamentalsYear => ({
  fiscalYear: String(fy), periodEnd: `${fy}-12-31`,
  revenue: 2e9, netIncome: eps * 50e6, epsDiluted: eps,
  currentAssets: 400, currentLiabilities: 150, totalAssets: null, totalLiabilities: null,
  longTermDebt: 100, equity: 2000, sharesDiluted: 50, goodwillAndIntangibles: 200, ...over,
});
const divs = (from: number, to: number) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), 1]));

/** Same clean company as the week-5 tests: CR 2.67, debt 40% of WC, EPS 5/4.6/4.4/4/3.8,
 *  BVPS 40, tangible BVPS 36, avg3 4.67. At 60 it survives; at 80 it fails only on price. */
const base = (over: Partial<ScreenInput> = {}): ScreenInput => ({
  symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive",
  years: [yr(2025, 5), yr(2024, 4.6), yr(2023, 4.4), yr(2022, 4), yr(2021, 3.8)],
  dividendsPerYear: divs(2010, 2026), lastExDate: "2026-09-10", today: "2026-10-19",
  lastClose: 60, currentYear: 2026, ...over,
});
const latest = (over: Partial<FundamentalsYear>) => base().years.map((y, i) => (i === 0 ? { ...y, ...over } : y));
const kinds = (s: ReturnType<typeof buildFactSheet>) => s.kinds.map((k) => k.id);

describe("the fact sheet", () => {
  it("numbers its facts, carries both verdicts and fingerprints the lot", () => {
    const s = buildFactSheet(base(), "2026-10-16");
    expect(s.facts[0].id).toBe("F1");
    expect(s.facts.every((f, i) => i === 0 || /^[FB]\d+$/.test(f.id))).toBe(true);
    expect(s.defensive.verdict).toBe("survivor");
    expect(s.defensive.marks).toHaveLength(7);
    expect(s.enterprising.marks).toHaveLength(6);
    expect(s.facts.some((f) => f.text.startsWith("Defensive screen (ch. 14): a survivor, 7/7"))).toBe(true);
    expect(s.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(buildFactSheet(base({ lastClose: 61 }), "2026-10-16").hash).not.toBe(s.hash);
  });

  it("a survivor has no fail kinds and no price bars", () => {
    const s = buildFactSheet(base());
    expect(kinds(s).filter((k) => k !== "expensive_vs_tangible")).toEqual([]); // 60/36 = 1.67× tangible: the enterprising 120% test fails — that is the only kind
    expect(s.bars.filter((b) => b.screen === "defensive")).toEqual([]);
  });

  it("the Nvidia case: passes every business test, fails only on price → price_only, with the bars in dollars", () => {
    const s = buildFactSheet(base({ lastClose: 80 }));
    expect(kinds(s)).toContain("price_only");
    const b6 = s.bars.find((b) => b.test.startsWith("test 6"))!;
    expect(b6.bar).toBe("at or below $70.05 on today's three-year average EPS"); // 15 × 4.67
    const b7 = s.bars.find((b) => b.test.startsWith("test 7"))!;
    expect(b7.bar).toContain("$64.83"); // max(1.5×40 = 60, √(22.5×4.67×40) = 64.83)
    const e1 = s.bars.find((b) => b.screen === "enterprising" && b.test.startsWith("test 1"))!;
    expect(e1.bar).toBe("at or below $45.00 on the latest year's EPS"); // 9 × 5
  });

  it("a dividend that began recently is 'new_dividend', not a gap, and passes the enterprising test", () => {
    const s = buildFactSheet(base({ dividendsPerYear: divs(2024, 2026) }));
    expect(kinds(s)).toContain("new_dividend");
    expect(kinds(s)).not.toContain("dividend_gap");
    expect(s.enterprising.marks.find((m) => m.n === 4)!.outcome).toBe("pass");
  });

  it("no dividend ever → never_paid; an old record with a break → dividend_gap", () => {
    expect(kinds(buildFactSheet(base({ dividendsPerYear: {}, lastExDate: null })))).toContain("never_paid");
    const broken = { ...divs(2008, 2019), ...divs(2022, 2026) };
    const s = buildFactSheet(base({ dividendsPerYear: broken }));
    expect(kinds(s)).toContain("dividend_gap");
  });

  it("a loss year names the year", () => {
    const s = buildFactSheet(base({ years: [yr(2025, 5), yr(2024, 4.6), yr(2023, -0.5), yr(2022, 4), yr(2021, 3.8)] }));
    const k = s.kinds.find((x) => x.id === "loss_year")!;
    expect(k.label).toContain("FY2023");
  });

  it("earnings that peaked in the base years → windfall_base; merely flat → flat_earnings", () => {
    const windfall = buildFactSheet(base({ years: [yr(2025, 2), yr(2024, 2.2), yr(2023, 4), yr(2022, 6), yr(2021, 5.5)], lastClose: 20 }));
    expect(kinds(windfall)).toContain("windfall_base");
    const flat = buildFactSheet(base({ years: [yr(2025, 4), yr(2024, 4), yr(2023, 4), yr(2022, 4), yr(2021, 3.8)] }));
    expect(kinds(flat)).toContain("flat_earnings");
  });

  it("strength: thin working capital with debt under control vs debt bigger than the cushion", () => {
    const thin = buildFactSheet(base({ years: latest({ currentAssets: 135, currentLiabilities: 150, longTermDebt: 0 }) }));
    expect(kinds(thin)).toContain("thin_working_capital");
    const heavy = buildFactSheet(base({ years: latest({ longTermDebt: 500 }) })); // 500 / 250 = 200%
    expect(kinds(heavy)).toContain("debt_heavy");
  });

  it("negative book value is its own kind and gets no price bar on test 7", () => {
    const s = buildFactSheet(base({ years: base().years.map((y) => ({ ...y, equity: -500 })) }));
    expect(kinds(s)).toContain("negative_book");
    expect(s.bars.some((b) => b.test.startsWith("test 7"))).toBe(false);
  });

  it("a financial company is labelled, scored out of 6 and 5", () => {
    const s = buildFactSheet(base({ sector: "Financial Services" }));
    expect(kinds(s)).toContain("financial");
    expect(s.defensive.applicable).toBe(6);
    expect(s.enterprising.applicable).toBe(5);
  });

  it("cheap on earnings but failing a business test → cheap_for_a_reason", () => {
    const s = buildFactSheet(base({ years: latest({ longTermDebt: 500 }), lastClose: 40 })); // P/E 8.6 passes both multiplier tests
    expect(kinds(s)).toContain("cheap_for_a_reason");
  });

  it("fingerprint is stable for equal input", () => {
    expect(fingerprint("abc")).toBe(fingerprint("abc"));
    expect(fingerprint("abc")).not.toBe(fingerprint("abd"));
  });
});

describe("the plain narrative and the grounding checks", () => {
  it("the template narrative cites facts for every paragraph and passes its own grounding check", () => {
    for (const input of [base(), base({ lastClose: 80 }), base({ dividendsPerYear: {}, lastExDate: null, sector: "Financial Services" })]) {
      const s = buildFactSheet(input, "2026-10-16");
      const n = templateNarrative(s);
      expect(n.paragraphs.length).toBeGreaterThanOrEqual(2);
      expect(n.paragraphs.every((p) => p.facts.length > 0)).toBe(true);
      const g = checkGrounding(n, s);
      expect(g).toMatchObject({ unknownFacts: [], recommendationLanguage: [], clean: true });
      expect(g.unsupportedNumbers).toEqual([]);
    }
  });

  it("flags a number that is on no fact, an unknown fact id, and advice language", () => {
    const s = buildFactSheet(base({ lastClose: 80 }), "2026-10-16");
    const n: Narrative = {
      source: "claude", paragraphs: [
        { text: "Good Co trades at 80 and its P/E on the three-year average is 17.1.", facts: ["F1"] }, // 17.1 is on the sheet (fact F9-ish), 80 too
        { text: "Revenue grew 37.5% last year.", facts: ["F4"] },                                 // 37.5 is nowhere
        { text: "This is a strong buy with a price target of 120.", facts: ["F99"] },             // advice + unknown id + 120 excluded as a threshold number
      ], question: "Will it rise?",
    };
    const g = checkGrounding(n, s);
    expect(g.unsupportedNumbers).toEqual([{ paragraph: 2, numbers: ["37.5"] }]);
    expect(g.unknownFacts).toEqual([{ paragraph: 3, ids: ["F99"] }]);
    expect(g.recommendationLanguage.length).toBeGreaterThanOrEqual(1);
    expect(g.clean).toBe(false);
  });

  // Review S4 (23 Oct 2026): the twelve phrasings that got past the old regex, one per family and then some.
  const advice: [string, string][] = [
    ["This looks like a good buy.", "recommend/advise"],
    ["Investors should buy before the results.", "subject should buy/sell"],
    ["I would avoid this one.", "subject should buy/sell"],
    ["We'd recommend a small position.", "recommend/advise"],
    ["At this price it is a bargain.", "valuation verdict"],
    ["The shares are likely to rise from here.", "forecast"],
    ["Earnings should double next year.", "forecast"],
    ["The stock is clearly undervalued.", "valuation verdict"],
    ["Accumulate on weakness and stay overweight.", "position words"],
    ["Expect the price to recover by spring.", "expect the price"],
    ["Sell before the dividend is cut.", "position words"],
    ["This is an attractive entry point.", "valuation verdict"],
    ["You should buy it.", "subject should buy/sell"],
    ["Our price target is $30.", "price target"],
    ["It will rise once rates fall.", "forecast"],
  ];
  it.each(advice)("catches advice-shaped language: %s", (sentence) => {
    expect(findAdvice(sentence).length).toBeGreaterThan(0);
  });
  it("every advice family is exercised by at least one sentence above", () => {
    const covered = new Set(advice.map(([, f]) => f));
    for (const p of ADVICE_PATTERNS) expect(covered.has(p.family)).toBe(true);
  });
  it("does not mistake the course's own disclaimer, 'a buy list' or 'cheap on earnings' for advice", () => {
    expect(findAdvice("None of this says whether anyone should buy or sell.")).toEqual([]);
    expect(findAdvice("A screen is a starting list for reading, never a buy list.")).toEqual([]);
    expect(findAdvice("Cheap on earnings, failing elsewhere: is the market wrong, or right?")).toEqual([]);
    expect(findAdvice("The last ex-dividend date was 12 months ago.")).toEqual([]);
  });

  // Review S13: numbers compared as values.
  it("reads $3,200m and $3.2bn as the same figure, a Unicode minus as a minus, and a date as no number", () => {
    expect(extractNumbers("Revenue $3,200m, net income −$52m, close 19.61 on 2026-10-14.")).toEqual([3.2e9, -52e6, 19.61]);
    expect(extractNumbers("$3.2bn and 12 months and p. 374")).toEqual([3.2e9, 12]);
    const s = buildFactSheet(base({ lastClose: 80 }), "2026-10-16");
    const revenueText = s.facts.find((f) => /^Revenue/.test(f.text))!.text; // "$2.0bn" style
    const n: Narrative = { source: "claude", question: "q?", paragraphs: [{ text: `Revenue was $2,000m, which the sheet gives as ${revenueText.replace(/^Revenue in FY\d+: /, "")}; the last close was 80 on 2026-10-16.`, facts: ["F4"] }] };
    expect(checkGrounding(n, s).unsupportedNumbers).toEqual([]);
    const bad: Narrative = { source: "claude", question: "q?", paragraphs: [{ text: "Revenue was $9,999m.", facts: ["F4"] }] };
    expect(checkGrounding(bad, s).unsupportedNumbers).toEqual([{ paragraph: 1, numbers: ["9999000000"] }]);
  });
});
