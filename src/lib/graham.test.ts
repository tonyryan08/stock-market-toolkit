/**
 * Week 5: the Graham screen on trial. Every expected value is checkable on
 * paper — this file is where a disputed verdict on the class screen gets
 * settled.
 */
import { describe, it, expect } from "vitest";
import {
  screenCompany, consecutiveDividendYears, rankScreen, requiredGrowthPct,
  CRITERIA, T, type ScreenInput,
} from "./graham";
import type { FundamentalsYear } from "./ratios";

const yr = (fy: number, eps: number, over: Partial<FundamentalsYear> = {}): FundamentalsYear => ({
  fiscalYear: String(fy), periodEnd: `${fy}-12-31`,
  revenue: 2e9, netIncome: null, epsDiluted: eps,
  currentAssets: 400, currentLiabilities: 150, totalAssets: null, totalLiabilities: null,
  longTermDebt: 100, equity: 2000, sharesDiluted: 50, ...over,
});

const divs = (from: number, to: number) =>
  Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), 1]));

/** The clean survivor. Hand check:
 *  CR 400/150 = 2.67 · LTD 100 / WC 250 = 0.4 · EPS 5,4.6,4.4,4,3.8 all > 0
 *  avg3 = 14/3 = 4.67 · P/E = 60/4.67 = 12.8 · BVPS 2000/50 = 40 · P/B = 1.5
 *  growth: late (5+4.6)/2 = 4.8 vs early (4+3.8)/2 = 3.9 → +23.1% · divs 2016–2025 = 10y */
const survivor = (over: Partial<ScreenInput> = {}): ScreenInput => ({
  symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive",
  years: [yr(2025, 5), yr(2024, 4.6), yr(2023, 4.4), yr(2022, 4), yr(2021, 3.8)],
  dividendsPerYear: divs(2016, 2025), lastClose: 60, currentYear: 2026, ...over,
});

const outcome = (r: ReturnType<typeof screenCompany>, id: string) => r.results.find((x) => x.id === id)!.outcome;

describe("the card and the code share one source", () => {
  it("has Graham's seven criteria, numbered 1–7", () => {
    expect(CRITERIA.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("converts Graham's +1/3 in 10 years to the same pace over our 3-year span: +9.0%", () => {
    expect(requiredGrowthPct).toBe(9);
  });
  it("keeps the 22.5 product consistent with 15 × 1.5", () => {
    expect(T.maxPe * T.maxPb).toBe(T.maxPeTimesPb);
  });
});

describe("screenCompany — hand-checked verdicts", () => {
  it("passes a clean defensive company on all seven", () => {
    const r = screenCompany(survivor());
    expect(r.figures.currentRatio).toBe(2.67);
    expect(r.figures.ltDebtToWc).toBe(0.4);
    expect(r.figures.epsAvg3).toBe(4.67);
    expect(r.figures.pe3).toBe(12.8);
    expect(r.figures.pb).toBe(1.5);
    expect(r.figures.epsGrowthPct).toBe(23.1);
    expect(r.figures.dividendYears).toBe(10);
    expect(r.passes).toBe(7);
    expect(r.verdict).toBe("survivor");
  });

  it("fails size below the inflation-adjusted $800m", () => {
    const years = survivor().years.map((y, i) => (i === 0 ? { ...y, revenue: 799e6 } : y));
    const r = screenCompany(survivor({ years }));
    expect(outcome(r, "size")).toBe("fail");
    expect(r.verdict).toBe("near_miss");
  });

  it("fails financial condition when debt exceeds the working-capital cushion", () => {
    const years = survivor().years.map((y, i) => (i === 0 ? { ...y, longTermDebt: 300 } : y)); // 300/250 = 1.2
    expect(outcome(screenCompany(survivor({ years })), "condition")).toBe("fail");
  });

  it("fails financial condition when working capital is negative and there is debt", () => {
    const years = survivor().years.map((y, i) => (i === 0 ? { ...y, currentAssets: 100 } : y));
    const r = screenCompany(survivor({ years }));
    expect(outcome(r, "condition")).toBe("fail");
    expect(r.figures.ltDebtToWc).toBeNull(); // no meaningful ratio to display
  });

  it("skips test 2 for a financial company by sector, whatever the data says (Graham p. 348/361)", () => {
    // Even with current items reported (banks' figures are not comparable), the test is not applied.
    const r = screenCompany(survivor({ sector: "Financial Services" }));
    expect(outcome(r, "condition")).toBe("skip");
    expect(r.applicable).toBe(6);
  });

  it("a bank that passes all six applicable tests is a survivor, scored 6/6 (decision 12 Oct 2026)", () => {
    const years = survivor().years.map((y) => ({ ...y, currentAssets: null, currentLiabilities: null }));
    const r = screenCompany(survivor({ years, sector: "Financial Services" }));
    expect(r.verdict).toBe("survivor");
    expect(r.passes).toBe(6);
    expect(r.applicable).toBe(6);
  });

  it("a bank with one fail is a near miss at 5/6, not 'fails'", () => {
    const years = survivor().years.map((y) => ({ ...y, currentAssets: null, currentLiabilities: null }));
    const r = screenCompany(survivor({ years, sector: "Financial Services", lastClose: 72 })); // P/E 15.4 fails; P/B 1.8, product 27.7 fails too
    // price 72: pe3 = 72/4.67 = 15.4 (fail), pb = 72/40 = 1.8, product 27.7 → price_assets fails as well → 2 fails
    expect(r.fails).toBe(2);
    expect(r.verdict).toBe("fails");
    const r2 = screenCompany(survivor({ years, sector: "Financial Services", dividendsPerYear: {} }));
    expect(r2.fails).toBe(1);
    expect(r2.verdict).toBe("near_miss");
    expect(`${r2.passes}/${r2.applicable}`).toBe("5/6");
  });

  it("negative shareholders' equity FAILS test 7 — it is not missing data (review finding 1)", () => {
    const years = survivor().years.map((y) => ({ ...y, equity: -500 }));
    const r = screenCompany(survivor({ years }));
    expect(outcome(r, "price_assets")).toBe("fail");
    expect(r.figures.bookValuePerShare).toBe(-10);
    expect(r.verdict).toBe("near_miss");
  });

  it("missing data is 'incomplete', not a fail: no revenue figure", () => {
    const years = survivor().years.map((y, i) => (i === 0 ? { ...y, revenue: null } : y));
    const r = screenCompany(survivor({ years }));
    expect(outcome(r, "size")).toBe("na");
    expect(r.verdict).toBe("insufficient");
  });

  it("two fails outrank missing data: the verdict is 'fails' even with an N/A", () => {
    const years = survivor().years.map((y, i) => (i === 0 ? { ...y, revenue: null } : y));
    const r = screenCompany(survivor({ years, lastClose: 80, dividendsPerYear: {} }));
    expect(r.fails).toBeGreaterThanOrEqual(2);
    expect(r.verdict).toBe("fails");
  });

  it("one loss year breaks earnings stability (the Boeing lesson)", () => {
    const r = screenCompany(survivor({ years: [yr(2025, 5), yr(2024, 4.6), yr(2023, -0.5), yr(2022, 4), yr(2021, 3.8)] }));
    expect(outcome(r, "stability")).toBe("fail");
  });

  it("negative 3-year average earnings: no meaningful P/E, so the P/E test fails", () => {
    const r = screenCompany(survivor({ years: [yr(2025, -3), yr(2024, -2), yr(2023, 1), yr(2022, 4), yr(2021, 3.8)] }));
    expect(r.figures.pe3).toBeNull();
    expect(outcome(r, "pe")).toBe("fail");
  });

  it("an expensive price fails P/E: 80 / 4.67 = 17.1", () => {
    const r = screenCompany(survivor({ lastClose: 80 }));
    expect(r.figures.pe3).toBe(17.1);
    expect(outcome(r, "pe")).toBe("fail");
  });

  it("P/B above 1.5 can still pass via the 22.5 product", () => {
    // equity 1000 → BVPS 20 → P/B 3.0; price 60 / avg EPS 4.67 = 12.8 → product 38.4 → FAIL.
    const fails = screenCompany(survivor({ years: survivor().years.map((y) => ({ ...y, equity: 1000 })) }));
    expect(fails.figures.pb).toBe(3);
    expect(outcome(fails, "price_assets")).toBe("fail");
    // Same P/B of 3.0 (equity 500 → BVPS 10 at price 30) but a cheap P/E: 30 / 4.67 = 6.4; product 19.2 → rescued.
    const rescued = screenCompany(survivor({ lastClose: 30, years: survivor().years.map((y) => ({ ...y, equity: 500 })) }));
    expect(rescued.figures.pb).toBe(3);
    expect(rescued.figures.peTimesPb).toBe(19.2);
    expect(outcome(rescued, "price_assets")).toBe("pass");
  });

  it("growth below Graham's pace fails: 4.0 vs 3.9 is +2.6%", () => {
    const r = screenCompany(survivor({ years: [yr(2025, 4), yr(2024, 4), yr(2023, 4), yr(2022, 4), yr(2021, 3.8)] }));
    expect(r.figures.epsGrowthPct).toBe(2.6);
    expect(outcome(r, "growth")).toBe("fail");
  });

  it("no dividend record fails — the Tesla case", () => {
    const r = screenCompany(survivor({ dividendsPerYear: {} }));
    expect(outcome(r, "dividends")).toBe("fail");
    expect(r.figures.dividendYears).toBe(0);
  });

  it("a new dividend payer (Google/Meta: 2024 start) is a fail, not an error", () => {
    expect(outcome(screenCompany(survivor({ dividendsPerYear: divs(2024, 2026) })), "dividends")).toBe("fail");
  });

  it("missing price makes P/E and P/B N/A, never a crash", () => {
    const r = screenCompany(survivor({ lastClose: null }));
    expect(outcome(r, "pe")).toBe("na");
    expect(outcome(r, "price_assets")).toBe("na");
  });

  it("empty books give an all-N/A row, never a throw", () => {
    const r = screenCompany(survivor({ years: [], dividendsPerYear: {}, lastClose: null }));
    expect(r.passes).toBe(0);
    expect(r.results).toHaveLength(7);
  });
});

describe("consecutiveDividendYears", () => {
  it("counts back from last year if this year hasn't paid yet", () => {
    expect(consecutiveDividendYears(divs(2016, 2025), 2026)).toBe(10);
  });
  it("includes this year once it has paid", () => {
    expect(consecutiveDividendYears(divs(2016, 2026), 2026)).toBe(11);
  });
  it("a single skipped year breaks the streak", () => {
    const d = { ...divs(2010, 2025) }; delete d["2020"];
    expect(consecutiveDividendYears(d, 2026)).toBe(5); // 2021–2025
  });
  it("zero amounts don't count as paid", () => {
    expect(consecutiveDividendYears({ "2025": 0, "2024": 1 }, 2026)).toBe(0);
  });
});

describe("rankScreen", () => {
  it("orders survivors, then near misses, then by passes, then alphabetically", () => {
    const a = screenCompany(survivor({ symbol: "BBB" }));                                   // survivor 7/7
    const b = screenCompany(survivor({ symbol: "AAA", dividendsPerYear: {} }));             // near miss: dividends only
    const c = screenCompany(survivor({ symbol: "CCC", lastClose: 80 }));                    // fails: P/E 17.1 and P/B product 34.2 → 5/7
    const d = screenCompany(survivor({ symbol: "DDD", lastClose: 80, dividendsPerYear: {} })); // fails: 4/7
    expect(b.verdict).toBe("near_miss");
    expect(c.verdict).toBe("fails");
    expect(rankScreen([d, c, b, a]).map((r) => r.symbol)).toEqual(["BBB", "AAA", "CCC", "DDD"]);
  });
});
