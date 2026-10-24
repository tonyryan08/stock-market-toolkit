/**
 * Week 5: the Graham screen on trial. Every expected value is checkable on
 * paper — this file is where a disputed verdict on the class screen gets
 * settled.
 */
import { describe, it, expect } from "vitest";
import {
  screenCompany, consecutiveDividendYears, rankScreen, requiredGrowthPct,
  CRITERIA, T, type ScreenInput,
  screenEnterprising, ENTERPRISING, E,
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
 *  avg3 = 14/3 = 4.667 · P/E = 60/4.667 = 12.86 → 12.9 · BVPS 2000/50 = 40 · P/B = 1.5
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
    expect(r.figures.pe3).toBe(12.9); // 60 / 4.6667 = 12.857 — the unrounded average (review F3)
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
    // equity 1000 → BVPS 20 → P/B 3.0; price 60 / avg EPS 4.667 = 12.86 → product 38.6 → FAIL.
    const fails = screenCompany(survivor({ years: survivor().years.map((y) => ({ ...y, equity: 1000 })) }));
    expect(fails.figures.pb).toBe(3);
    expect(outcome(fails, "price_assets")).toBe("fail");
    // Same P/B of 3.0 (equity 500 → BVPS 10 at price 30) but a cheap P/E: 30 / 4.667 = 6.43; product 19.3 → rescued.
    const rescued = screenCompany(survivor({ lastClose: 30, years: survivor().years.map((y) => ({ ...y, equity: 500 })) }));
    expect(rescued.figures.pb).toBe(3);
    expect(rescued.figures.peTimesPb).toBe(19.3);
    expect(outcome(rescued, "price_assets")).toBe("pass");
  });

  it("compares the unrounded ratio, not the display figure (review F3, 23 Oct 2026)", () => {
    // P/E 15.04 displays as 15.0 but is MORE than 15 → fail; 14.96 → pass.
    const avg = 14 / 3;
    expect(outcome(screenCompany(survivor({ lastClose: 15.04 * avg })), "pe")).toBe("fail");
    expect(screenCompany(survivor({ lastClose: 15.04 * avg })).figures.pe3).toBe(15);
    expect(outcome(screenCompany(survivor({ lastClose: 14.96 * avg })), "pe")).toBe("pass");
    // Current ratio 399.2/200 = 1.996 displays as 2.00 but is LESS than 2 → fail.
    const thin = survivor({ years: survivor().years.map((y) => ({ ...y, currentAssets: 399.2, currentLiabilities: 200 })) });
    expect(screenCompany(thin).figures.currentRatio).toBe(2);
    expect(outcome(screenCompany(thin), "condition")).toBe("fail");
    // P/B 1.549 displays as 1.5; with the product above 22.5 it must fail.
    const dear = survivor({ lastClose: 61.96, years: survivor().years.map((y) => ({ ...y, epsDiluted: y.epsDiluted! / 2 })) }); // avg3 2.333 → P/E 26.6 → product 41
    expect(screenCompany(dear).figures.pb).toBe(1.5);
    expect(outcome(screenCompany(dear), "price_assets")).toBe("fail");
  });

  it("the other five boundaries compare raw figures too (verification V5): debt/WC 1.004, product 22.54, growth 8.96%, enterprising CR 1.496 and debt/WC 110.4%", () => {
    // defensive debt/WC: WC 100, debt 100.4 → 1.004 displays "1" but is more than 1 → fail
    const d = survivor({ years: survivor().years.map((y, i) => (i === 0 ? { ...y, currentAssets: 300, currentLiabilities: 200, longTermDebt: 100.4 } : y)) });
    expect(screenCompany(d).figures.ltDebtToWc).toBe(1);
    expect(outcome(screenCompany(d), "condition")).toBe("fail");
    // product: P/E 15.03 × P/B 1.5 = 22.545 displays "22.5" but is more than 22.5 → with P/B above 1.5 too it must fail
    const avg = 14 / 3;   // avg3 EPS of the survivor fixture (5, 4.6, 4.4)
    const prod = survivor({ lastClose: 15.03 * avg, years: survivor().years.map((y, i) => (i === 0 ? { ...y, equity: 15.03 * avg * 50 / 1.5 - 0.1 } : y)) });   // P/B 1.50004 — just over, so the product must carry it
    const pr = screenCompany(prod);
    expect(pr.figures.peTimesPb).toBeCloseTo(22.5, 1);
    expect(outcome(pr, "price_assets")).toBe("fail");
    // growth: +8.975% (4.359 v 4.0) displays "9" but is below the 9.0 hurdle → fail
    const g = screenCompany(survivor({ years: [yr(2025, 4.359), yr(2024, 4.359), yr(2023, 4.1), yr(2022, 4.0), yr(2021, 4.0)] }));
    expect(g.figures.epsGrowthPct).toBe(9);
    expect(outcome(g, "growth")).toBe("fail");
    // enterprising CR 1.496 displays "1.5" but is below 1.5 → fail; debt 110.4% of WC displays "110%" but is above 110% → fail
    const e1 = screenEnterprising(smallCo({ years: smallCo().years.map((y, i) => (i === 0 ? { ...y, currentAssets: 299.2, currentLiabilities: 200, longTermDebt: 10 } : y)) }));
    expect(e1.figures.currentRatio).toBe(1.5);
    expect(eOutcome(e1, "e_condition")).toBe("fail");
    const e2 = screenEnterprising(smallCo({ years: smallCo().years.map((y, i) => (i === 0 ? { ...y, currentAssets: 400, currentLiabilities: 200, longTermDebt: 220.8 } : y)) }));
    expect(e2.figures.ltDebtToWc).toBe(1.1);
    expect(eOutcome(e2, "e_condition")).toBe("fail");
  });

  it("growth below Graham's pace fails: 4.0 vs 3.9 is +2.6% — and the detail names the fiscal years compared (review N4)", () => {
    const r = screenCompany(survivor({ years: [yr(2025, 4), yr(2024, 4), yr(2023, 4), yr(2022, 4), yr(2021, 3.8)] }));
    expect(r.figures.epsGrowthPct).toBe(2.6);
    expect(outcome(r, "growth")).toBe("fail");
    expect(r.results.find((t) => t.id === "growth")!.detail).toBe("EPS +2.6% from the FY2021–2022 average to FY2024–2025 average (need +9%).");
    const four = screenCompany(survivor({ years: [yr(2025, 4.4), yr(2024, 4.2), yr(2023, 4), yr(2022, 3.8)] }));
    expect(four.results.find((t) => t.id === "growth")!.detail).toContain("(four years held: a two-year span against the three-year hurdle)");
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

describe("consecutiveDividendYears — the 15-month gap rule (review finding 9, decided 16 Oct 2026)", () => {
  const quarterly = (from: string, to: string) => {
    const out: string[] = []; let d = new Date(from + "T00:00:00Z");
    while (d <= new Date(to + "T00:00:00Z")) { out.push(d.toISOString().slice(0, 10)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, d.getUTCDate())); }
    return out;
  };
  const perYear = (ds: string[]) => Object.fromEntries([...new Set(ds.map((x) => x.slice(0, 4)))].map((y) => [y, 1]));

  it("the Ford case: Jan 2020 then Nov 2021 (~22 months) breaks the streak though every calendar year paid", () => {
    const ds = [...quarterly("2010-01-15", "2020-01-15"), ...quarterly("2021-11-15", "2026-08-15")];
    expect(consecutiveDividendYears(perYear(ds), 2026)).toBe(17);                     // calendar years only: unbroken
    expect(consecutiveDividendYears(perYear(ds), 2026, ds, "2026-10-16")).toBe(6);     // 2021–2026
  });
  it("an annual payer drifting to 14 months between payments keeps its streak", () => {
    // gaps 375–420 days, one payment in every calendar year 2016–2025, none yet in 2026
    const ds = ["2016-01-10","2017-03-01","2018-04-25","2019-06-15","2020-08-01","2021-09-20","2022-11-01","2023-12-10","2024-12-20","2025-12-30"];
    expect(consecutiveDividendYears(perYear(ds), 2026, ds, "2026-10-16")).toBe(10);
  });
  it("a dividend that stopped more than 15 months ago counts zero, whatever the calendar says", () => {
    const ds = quarterly("2012-03-01", "2025-06-01");
    expect(consecutiveDividendYears(perYear(ds), 2026, ds, "2026-10-16")).toBe(0);
    expect(outcome(screenCompany(survivor({ dividendsPerYear: perYear(ds), exDates: ds, today: "2026-10-16" })), "dividends")).toBe("fail");
  });
  it("a steady quarterly payer is unaffected", () => {
    const ds = quarterly("2012-03-01", "2026-09-01");
    expect(consecutiveDividendYears(perYear(ds), 2026, ds, "2026-10-16")).toBe(15);
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

// ---------------------------------------------------------------------------
// The enterprising screen (ch. 15, pp. 385–386) on trial.
// ---------------------------------------------------------------------------

/** A small, dull, cheap company — Graham's enterprising hunting ground.
 *  Hand check (newest first):
 *  EPS 2.0, 1.8, 1.6, 1.5, 1.4 · price 15 → P/E 15/2.0 = 7.5 · CR 300/150 = 2
 *  LTD 100 / WC 150 = 67% · equity 2000 − intangibles 400 = 1600 / 100 sh = 16.00
 *  tangible book → P/TBV 15/16 = 0.94 · growth 2.0 > 1.4 · ex-date 35 days ago.
 *  Revenue $300m: fails the DEFENSIVE size test by design. */
const smallCo = (over: Partial<ScreenInput> = {}): ScreenInput => ({
  symbol: "DULL", name: "Dull Industries", sector: "Industrials",
  years: [
    yr(2025, 2.0, { revenue: 300e6, currentAssets: 300, currentLiabilities: 150, longTermDebt: 100, equity: 2000, sharesDiluted: 100, goodwillAndIntangibles: 400 }),
    yr(2024, 1.8, { revenue: 290e6, goodwillAndIntangibles: 400 }),
    yr(2023, 1.6, { revenue: 280e6, goodwillAndIntangibles: 400 }),
    yr(2022, 1.5, { revenue: 270e6, goodwillAndIntangibles: 400 }),
    yr(2021, 1.4, { revenue: 260e6, goodwillAndIntangibles: 400 }),
  ],
  dividendsPerYear: divs(2021, 2026), lastExDate: "2026-09-10", today: "2026-10-15",
  lastClose: 15, currentYear: 2026, ...over,
});
const latestWith = (over: Partial<FundamentalsYear>) =>
  smallCo().years.map((y, i) => (i === 0 ? { ...y, ...over } : y));
const eOutcome = (r: ReturnType<typeof screenEnterprising>, id: string) => r.results.find((x) => x.id === id)!.outcome;

describe("the enterprising card and the code share one source", () => {
  it("has Graham's six requirements, numbered 1–6, the low multiplier first", () => {
    expect(ENTERPRISING.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ENTERPRISING[0].id).toBe("multiplier");
  });
  it("carries Graham's numbers: 9×, 1.5×, 110%, five years, 120%", () => {
    expect(E.maxPe).toBe(9);
    expect(E.minCurrentRatio).toBe(1.5);
    expect(E.maxDebtToWc).toBe(1.1);
    expect(E.earningsYears).toBe(5);
    expect(E.maxPTangibleBook).toBe(1.2);
  });
});

describe("screenEnterprising — hand-checked verdicts", () => {
  it("passes a small, dull, cheap company on all six: a candidate", () => {
    const r = screenEnterprising(smallCo());
    expect(r.figures.pe).toBe(7.5);
    expect(r.figures.currentRatio).toBe(2);
    expect(r.figures.ltDebtToWc).toBe(0.67);
    expect(r.figures.tangibleBookPerShare).toBe(16);
    expect(r.figures.pTangibleBook).toBe(0.94);
    expect(r.figures.daysSinceDividend).toBe(35);
    expect(r.passes).toBe(6);
    expect(r.applicable).toBe(6);
    expect(r.verdict).toBe("candidate");
  });

  it("has no size test: the same company fails the defensive screen on size (p. 386: 'no lower limit on the size')", () => {
    const d = screenCompany(smallCo());
    expect(outcome(d, "size")).toBe("fail");
    expect(screenEnterprising(smallCo()).results.some((x) => (x.id as string) === "size")).toBe(false);
  });

  it("the multiplier bar is nine or less: 9.0 passes, 9.1 fails", () => {
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 18 })), "multiplier")).toBe("pass");   // 18/2.0 = 9.0
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 18.2 })), "multiplier")).toBe("fail"); // 9.1
  });

  it("a loss year has no multiplier to be low: multiplier fails, stability fails", () => {
    const r = screenEnterprising(smallCo({ years: latestWith({ epsDiluted: -0.2 }) }));
    expect(eOutcome(r, "multiplier")).toBe("fail");
    expect(eOutcome(r, "e_stability")).toBe("fail");
    expect(r.verdict).toBe("fails");
  });

  it("financial condition: current ratio 1.5 passes, 1.49 fails", () => {
    expect(eOutcome(screenEnterprising(smallCo({ years: latestWith({ currentLiabilities: 200 }) })), "e_condition")).toBe("pass"); // 300/200
    expect(eOutcome(screenEnterprising(smallCo({ years: latestWith({ currentLiabilities: 201 }) })), "e_condition")).toBe("fail"); // 1.49; debt 100/99 = 101% still fine
  });

  it("financial condition: debt at 110% of working capital passes, 111% fails", () => {
    expect(eOutcome(screenEnterprising(smallCo({ years: latestWith({ longTermDebt: 165 }) })), "e_condition")).toBe("pass"); // 165/150 = 1.10
    expect(eOutcome(screenEnterprising(smallCo({ years: latestWith({ longTermDebt: 166 }) })), "e_condition")).toBe("fail"); // 1.107 → fail
  });

  it("skips financial condition for a financial company and scores out of 5", () => {
    const r = screenEnterprising(smallCo({ sector: "Financial Services" }));
    expect(eOutcome(r, "e_condition")).toBe("skip");
    expect(r.applicable).toBe(5);
    expect(r.verdict).toBe("candidate");
  });

  it("'some current dividend' means an ex-date inside the last 12 months", () => {
    expect(eOutcome(screenEnterprising(smallCo({ lastExDate: "2025-10-14" })), "e_dividend")).toBe("pass"); // 366 days
    expect(eOutcome(screenEnterprising(smallCo({ lastExDate: "2025-10-13" })), "e_dividend")).toBe("fail"); // 367 days
    expect(eOutcome(screenEnterprising(smallCo({ lastExDate: null })), "e_dividend")).toBe("fail");
  });

  it("growth is 'more than', not 'at a pace': equal EPS fails; a loss four years ago turned to profit passes", () => {
    const flat = smallCo({ years: smallCo().years.map((y) => ({ ...y, epsDiluted: 1.4 })) });
    expect(eOutcome(screenEnterprising(flat), "e_growth")).toBe("fail");
    const years = smallCo().years.map((y, i) => (i === 4 ? { ...y, epsDiluted: -0.5 } : y));
    const r = screenEnterprising(smallCo({ years }));
    expect(eOutcome(r, "e_growth")).toBe("pass");
    expect(eOutcome(r, "e_stability")).toBe("fail"); // the deficit still counts there
  });

  it("tangible assets: price under 120% of tangible book passes, 120% fails, negative tangible book fails", () => {
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 19.1 })), "e_tangible")).toBe("pass"); // 19.1/16 = 1.19
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 19.2 })), "e_tangible")).toBe("fail"); // 1.20 — "less than"
    // Review F3: 19.18/16 = 1.19875 displays as 1.20 but IS less than 120% → pass; 9.04× displays 9.0 but fails the multiplier.
    expect(screenEnterprising(smallCo({ lastClose: 19.18 })).figures.pTangibleBook).toBe(1.2);
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 19.18 })), "e_tangible")).toBe("pass");
    expect(screenEnterprising(smallCo({ lastClose: 18.08 })).figures.pe).toBe(9);
    expect(eOutcome(screenEnterprising(smallCo({ lastClose: 18.08 })), "multiplier")).toBe("fail");
    const r = screenEnterprising(smallCo({ years: latestWith({ goodwillAndIntangibles: 2500 }) })); // 2000 − 2500 = −500
    expect(eOutcome(r, "e_tangible")).toBe("fail");
    expect(r.figures.tangibleBookPerShare).toBe(-5);
  });

  it("intangibles not yet held is 'incomplete', not a fail (the column fills as accounts refresh)", () => {
    const r = screenEnterprising(smallCo({ years: latestWith({ goodwillAndIntangibles: null }) }));
    expect(eOutcome(r, "e_tangible")).toBe("na");
    expect(r.verdict).toBe("insufficient");
  });

  it("a glamour stock fails the first cut: P/E 45 and 12× tangible book", () => {
    const r = screenEnterprising(smallCo({ lastClose: 90 })); // 90/2 = 45; 90/16 = 5.6
    expect(eOutcome(r, "multiplier")).toBe("fail");
    expect(eOutcome(r, "e_tangible")).toBe("fail");
    expect(r.verdict).toBe("fails");
    expect(`${r.passes}/${r.applicable}`).toBe("4/6");
  });

  it("empty books give an all-N/A-or-fail row, never a throw", () => {
    const r = screenEnterprising(smallCo({ years: [], lastExDate: null, lastClose: null }));
    expect(r.results).toHaveLength(6);
    expect(r.passes).toBe(0);
  });

  it("rankScreen puts candidates first, then near misses, then by passes", () => {
    const a = screenEnterprising(smallCo({ symbol: "AAA" }));
    const b = screenEnterprising(smallCo({ symbol: "BBB", lastExDate: null }));        // near miss
    const c = screenEnterprising(smallCo({ symbol: "CCC", lastClose: 90 }));           // fails 4/6
    expect(rankScreen([c, b, a]).map((r) => r.symbol)).toEqual(["AAA", "BBB", "CCC"]);
  });
});
