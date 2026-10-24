/**
 * Week 6: the fact sheet on trial. The AI may only say what is on it, so the
 * sheet itself has to be right — and checkable on paper.
 */
import { describe, it, expect } from "vitest";
import { buildFactSheet, templateNarrative, checkGrounding, fingerprint, findAdvice, findAdviceDetailed, extractNumbers, extractNumbersWithPrecision, ADVICE_PATTERNS, type Narrative } from "./explain";
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

  // Review S4 (23 Oct 2026) and OI-19/OI-20 (24 Oct): one sentence per ALTERNATIVE of every
  // family, asserting the family that catches it — so removing any one alternative fails a test.
  const advice: [string, string][] = [
    // subject should buy/sell
    ["You should buy it.", "subject should buy/sell"],
    ["Investors should buy before the results.", "subject should buy/sell"],
    ["I would avoid this one.", "subject should buy/sell"],
    ["One ought to hold through the dip.", "subject should buy/sell"],
    ["We might want to trim here.", "subject should buy/sell"],
    ["They need to sell.", "subject should buy/sell"],
    ["Readers must own this.", "subject should buy/sell"],
    ["Anyone could short it.", "subject should buy/sell"],
    ["Everyone will get in eventually.", "subject should buy/sell"],
    ["I'd buy it at this price.", "subject should buy/sell"],
    ["We'd avoid it for now.", "subject should buy/sell"],
    ["You'll want to steer clear.", "subject should buy/sell"],
    ["We should stay away.", "subject should buy/sell"],
    ["You should take profits.", "subject should buy/sell"],
    ["Investors should not add here.", "subject should buy/sell"],
    ["You should probably accumulate.", "subject should buy/sell"],
    // imperative
    ["Buy this stock.", "imperative"],
    ["The numbers are fine. Sell before the results.", "imperative"],
    ["Avoid.", "imperative"],
    ["Hold for the long run.", "imperative"],
    ["Short it.", "imperative"],
    ["Dump it now.", "imperative"],
    ["Take profits here.", "imperative"],
    ["Get in while it is cheap.", "imperative"],
    ["Get out before the results.", "imperative"],
    ["Steer clear of this one.", "imperative"],
    ["Stay away from it.", "imperative"],
    ["Load up on weakness.", "imperative"],
    ["Back up the truck.", "imperative"],
    // recommend/advise
    ["We'd recommend a small position.", "recommend/advise"],
    ["I would suggest buying.", "recommend/advise"],
    ["We advise caution and a sale.", "recommend/advise"],
    ["This is a recommended buy.", "recommend/advise"],
    ["A strong buy at these levels.", "recommend/advise"],
    ["This looks like a good buy.", "recommend/advise"],
    ["A great buy for patient money.", "recommend/advise"],
    ["A clear sell.", "recommend/advise"],
    ["A screaming buy.", "recommend/advise"],
    // price target
    ["Our price target is $30.", "price target"],
    ["The target price is 45.", "price target"],
    ["Fair value sits near 50.", "price target"],
    ["The intrinsic value of the shares is 60.", "price target"],
    ["The shares are worth $70.", "price target"],
    // forecast
    ["The shares are likely to rise from here.", "forecast"],
    ["Earnings should double next year.", "forecast"],
    ["It will rise once rates fall.", "forecast"],
    ["The price is going to fall further.", "forecast"],
    ["Margins are set to recover.", "forecast"],
    ["The stock is poised to outperform.", "forecast"],
    ["Shares are expected to rally.", "forecast"],
    ["It is bound to rebound.", "forecast"],
    ["The price is about to climb.", "forecast"],
    ["It could drop sharply.", "forecast"],
    ["The shares would crash on a miss.", "forecast"],
    ["The stock should re-rate.", "forecast"],
    ["The shares will appreciate over time.", "forecast"],
    ["Profits will increase.", "forecast"],
    ["The price will gain ground.", "forecast"],
    ["It will surge on the news.", "forecast"],
    ["It will soar.", "forecast"],
    ["The shares will jump.", "forecast"],
    ["It will plunge.", "forecast"],
    ["It will tank.", "forecast"],
    ["It will take off.", "forecast"],
    ["It will beat the market.", "forecast"],
    ["The shares will go up.", "forecast"],
    ["The price will go lower.", "forecast"],
    // expect the price
    ["Expect the price to recover by spring.", "expect the price"],
    ["We expect the shares to fall.", "expect the price"],
    ["Expecting the stock to drift.", "expect the price"],
    // valuation verdict
    ["The stock is clearly undervalued.", "valuation verdict"],
    ["It looks overvalued here.", "valuation verdict"],
    ["The shares are underpriced.", "valuation verdict"],
    ["It is overpriced.", "valuation verdict"],
    ["At this price it is a bargain.", "valuation verdict"],
    ["This is a buying opportunity.", "valuation verdict"],
    ["A rare opportunity at these prices.", "valuation verdict"],
    ["Attractively priced for patient money.", "valuation verdict"],
    ["I think the shares are cheap.", "valuation verdict"],
    ["There is money to be made here.", "valuation verdict"],
    ["You are missing out.", "valuation verdict"],
    ["The market has got this one wrong.", "valuation verdict"],
    ["We rate the shares outperform.", "recommend/advise"],
    ["The shares are worth far more than the market says.", "price target"],
    ["You should get some of this before the results.", "subject should buy/sell"],
    ["Smart money is piling in.", "stance"],
    ["A re-rating is coming.", "position words"],
    // the second reader's own phrasings (v0.9.0 review X5)
    ["Investors would do well to pick up shares here.", "subject should buy/sell"],
    ["Don't sell — the dividend alone pays you to wait.", "imperative"],
    ["I would not be surprised to see 50 by Christmas.", "price target"],
    ["Shares are mispriced and due a catch-up.", "valuation verdict"],
    ["This is a stock to own for the next decade.", "valuation verdict"],
    ["I'd be adding on any weakness.", "position words"],
    ["It is due a re-rating.", "position words"],
    ["It's a no-lose situation at this price.", "stance"],
    ["Buy-and-hold investors will be rewarded.", "stance"],
    ["I've been adding to my position all week.", "position words"],
    ["You should add to your holding here.", "subject should buy/sell"],
    // the first reader's phrasings that still passed (v0.9.0 review A1, re-run after F4)
    ["I wouldn't sell at these levels.", "subject should buy/sell"],
    ["Back the truck up.", "imperative"],
    ["Grab some before the market wakes up.", "imperative"],
    ["Upgrade to Buy.", "recommend/advise"],
    ["Shares should trade at a premium.", "price target"],
    ["The shares could easily double from here.", "forecast"],
    ["Prices are heading higher.", "forecast"],
    ["This one's a steal at 12 times earnings.", "valuation verdict"],
    ["Buying here makes sense.", "valuation verdict"],
    ["This will make you money.", "valuation verdict"],
    ["Strongly consider taking a position.", "position words"],
    ["A core holding for any portfolio.", "position words"],
    ["It deserves a place in your portfolio.", "position words"],
    ["You can't go wrong here.", "stance"],
    ["Now is a good time to get involved.", "stance"],
    ["The downside is limited and the upside is significant.", "stance"],
    ["The risk/reward is skewed to the upside.", "stance"],
    ["Hard to see this going anywhere but up.", "stance"],
    ["Could be a ten-bagger.", "stance"],
    ["I'd be a buyer at these levels.", "stance"],
    ["This is an attractive entry point.", "valuation verdict"],
    ["A compelling case.", "valuation verdict"],
    ["It is worth buying.", "valuation verdict"],
    ["Worth owning for the dividend.", "valuation verdict"],
    ["Worth holding through the cycle.", "valuation verdict"],
    ["Worth considering here.", "valuation verdict"],
    ["Worth a look.", "valuation verdict"],
    ["Worth a punt.", "valuation verdict"],
    ["Worth a bet at these prices.", "valuation verdict"],
    ["Good value at 12 times.", "valuation verdict"],
    ["Great value here.", "valuation verdict"],
    ["Cheap at this price.", "valuation verdict"],
    ["Too expensive to buy.", "valuation verdict"],
    // position words
    ["Accumulate on weakness and stay overweight.", "position words"],
    ["Stay underweight the sector.", "position words"],
    ["Buy now.", "position words"],
    ["Buy the dip.", "position words"],
    ["Sell into strength.", "position words"],
    ["Get in before the results.", "position words"],
    ["Lock in profits.", "position words"],
    // stance
    ["I'm bullish on this one.", "stance"],
    ["The market is bearish on it.", "stance"],
    ["This is my top pick.", "stance"],
    ["Our pick for the year.", "stance"],
    ["A safe bet.", "stance"],
    ["A no-brainer at this price.", "stance"],
    ["A must-own name.", "stance"],
    ["A must-have holding.", "stance"],
    ["There is room to run.", "stance"],
    ["Plenty of upside from here.", "stance"],
    ["Limited downside.", "stance"],
    ["Big upside potential.", "stance"],
    ["It is time to buy.", "stance"],
    ["Time to sell.", "stance"],
    ["Get in now.", "stance"],
    ["Act now.", "stance"],
    ["Don't miss this one.", "stance"],
  ];
  it.each(advice)("catches advice-shaped language: %s → %s", (sentence, family) => {
    const hits = findAdviceDetailed(sentence);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.family)).toContain(family);
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
    expect(findAdvice("The dividend was held at $0.39 a quarter.")).toEqual([]);             // "held" is not "hold"
    expect(findAdvice("Revenue grew; the company sells furniture and buys timber.")).toEqual([]);   // sells/buys as verbs about the business
    expect(findAdvice("The screen's bar for test 6 is 1.2 times tangible book.")).toEqual([]);
  });
  it("does not read balance-sheet English as orders or stances (v0.9.0 review F4)", () => {
    for (const t of [
      "Short-term borrowings fell to $12m.",
      "Sell-side analysts expected less.",
      "Hold-to-maturity securities are carried at cost.",
      "Buy-side and sell-side alike read the filing.",
      "Management described the market as attractive.",
      "An opportunity cost is not a cash cost.",
      "Its bullish customers kept ordering.",
      "Total debt could fall as leases expire.",
      "The company sells furniture and buys timber.",
      "Sales rose 4% and the dividend was held.",
      "Holding costs rose with inventory.",
      "Executives will be rewarded under the new plan.",
      "Revenue reached $50m by year-end.",
      "The company sold its stake in the joint venture.",
      "Don't-ask pricing is not a thing; the price list is public.",
      "Hold on: the figures are for the fiscal year.",
      "The company will increase capacity next year.",
      "The sell-side consensus is not part of this sheet.",
      "Dump trucks are its main product.",
      "They will add two plants in Ohio.",
      "Management took a position on the lease accounting change.",
      "The core business is furniture; the holding company owns two brands.",
      "Prices for timber are heading higher, which squeezes margins.",
      "The upside case in the 10-K assumes a housing recovery.",
      "A ten-year lease on the Dublin store was renewed.",
    ]) expect(findAdvice(t), t).toEqual([]);
  });

  // Review V6 / OI-22 (24 Oct 2026): precision, sign, ids and month-name dates.
  it("a figure rounded to fewer decimals is the same figure; a loss is the sheet's negative; ids and dates are not numbers", () => {
    const sheet = extractNumbersWithPrecision("Revenue in FY2025: $1,912m. Net income: −$52m. Debt: $0m.");
    expect(sheet.map((h) => [h.value, h.precision])).toEqual([[1.912e9, 1e6], [-5.2e7, 1e6], [0, 1e6]]);
    const text = extractNumbersWithPrecision("Revenue of $1.9bn and a loss of $52m (F13, B2); on October 14, 2026 and 14 Oct 2026; 12 months; 37.5%.");
    expect(text.map((h) => h.value)).toEqual([1.9e9, 5.2e7, 12, 37.5]);   // no 13, 2, 14, 2026
    expect(text[0].precision).toBe(1e8);
    expect(extractNumbersWithPrecision("The share closed at 80 and the P/E is 17.1.").map((h) => [h.value, h.precision])).toEqual([[80, 0], [17.1, 0.1]]);
  });
  it("$1.9bn against the sheet's $1,912m passes; $11.2bn against $11.3bn does not; a loss of $52m matches −$52m; 37.5 matches nothing", () => {
    const s = buildFactSheet(base({ lastClose: 80 }), "2026-10-16");
    const facts = [...s.facts, { id: "F90", text: "Revenue in FY2025: $1,912m.", kind: "books" as const }, { id: "F91", text: "Net income: −$52m.", kind: "books" as const }, { id: "F92", text: "Sales: $11.3bn.", kind: "books" as const }];
    const sheet = { ...s, facts };
    const g = (text: string) => checkGrounding({ source: "claude", paragraphs: [{ text, facts: ["F90"] }], question: "" }, sheet).unsupportedNumbers.flatMap((u) => u.numbers);
    expect(g("Revenue of $1.9bn.")).toEqual([]);
    expect(g("A loss of $52m.")).toEqual([]);
    expect(g("A profit of $52m.")).toEqual(["52000000"]);          // the sheet's figure is a loss (review F5)
    expect(g("A loss of $1,912m.")).toEqual(["1912000000"]);       // the sheet's revenue is positive
    expect(g("Sales of $11.2bn.")).toEqual(["11200000000"]);     // ANDE, 24 Oct: the sheet said 11.3
    expect(g("Revenue grew 37.5% last year.")).toEqual(["37.5"]);
    expect(g("Nothing happened on October 14, 2026 (F13).")).toEqual([]);
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
