/**
 * Week 4: the ratio engine's test suite — the project's first `npm test`.
 *
 * Why these cases: the syllabus exit check is "ratios match a hand-checked
 * sample", so every expected value below is computable on paper in one
 * line. If a student (or the tutor) disputes a number on the books page,
 * this file is where the arithmetic stands trial.
 */
import { describe, it, expect } from "vitest";
import { computeRatios, dividendYears, type FundamentalsYear } from "./ratios";

const year = (over: Partial<FundamentalsYear>): FundamentalsYear => ({
  fiscalYear: "2025",
  periodEnd: "2025-09-30",
  revenue: null,
  netIncome: null,
  epsDiluted: null,
  currentAssets: null,
  currentLiabilities: null,
  totalAssets: null,
  totalLiabilities: null,
  longTermDebt: null,
  equity: null,
  sharesDiluted: null,
  ...over,
});

describe("computeRatios — hand-checked arithmetic", () => {
  it("computes the defensive-investor numbers for a clean case", () => {
    // Hand check: CA 200 / CL 80 = 2.5 · WC = 120 · LTD 60/120 = 0.5
    // BVPS = 500/100 = 5 · price 60 · EPS 4, 4, 4 → avg3 = 4
    // P/E (latest) = 60/4 = 15 · P/E (3-yr) = 60/4 = 15 · P/B = 60/5 = 12 · product = 15 × 12 = 180
    const latest = year({ epsDiluted: 4, currentAssets: 200, currentLiabilities: 80, longTermDebt: 60, equity: 500, sharesDiluted: 100 });
    const r = computeRatios([latest, year({ fiscalYear: "2024", epsDiluted: 4 }), year({ fiscalYear: "2023", epsDiluted: 4 })], 60);
    expect(r.currentRatio).toBe(2.5);
    expect(r.workingCapital).toBe(120);
    expect(r.ltDebtToWorkingCapital).toBe(0.5);
    expect(r.bookValuePerShare).toBe(5);
    expect(r.pe).toBe(15);
    expect(r.epsAvg3).toBe(4);
    expect(r.pe3).toBe(15);
    expect(r.pb).toBe(12);
    expect(r.peTimesPb).toBe(180);
  });

  it("the Graham P/E is the 3-year average, and it can disagree with the latest-year P/E", () => {
    // EPS 10, 12, 12.5 → avg3 11.5; price 160 → latest P/E 16.0 (over the bar), 3-yr P/E 13.9 (under it)
    const r = computeRatios(
      [year({ epsDiluted: 10 }), year({ fiscalYear: "2024", epsDiluted: 12 }), year({ fiscalYear: "2023", epsDiluted: 12.5 })],
      160,
    );
    expect(r.pe).toBe(16);
    expect(r.epsAvg3).toBe(11.5);
    expect(r.pe3).toBe(13.9);
  });

  it("negative equity gives a negative book value per share and no P/B", () => {
    const r = computeRatios([year({ equity: -100, sharesDiluted: 50 })], 180);
    expect(r.bookValuePerShare).toBe(-2);
    expect(r.pb).toBeNull();
  });

  it("a loss year has no meaningful P/E (Boeing's week-5 lesson)", () => {
    const r = computeRatios([year({ epsDiluted: -3.2, equity: 100, sharesDiluted: 50 })], 180);
    expect(r.pe).toBeNull();
    expect(r.pb).toBe(90); // 180 / (100/50 = 2)
    expect(r.peTimesPb).toBeNull(); // combo needs both
  });

  it("negative working capital voids the LT-debt test rather than inverting it", () => {
    const r = computeRatios(
      [year({ currentAssets: 50, currentLiabilities: 80, longTermDebt: 10 })],
      null,
    );
    expect(r.workingCapital).toBe(-30);
    expect(r.ltDebtToWorkingCapital).toBeNull();
  });

  it("EPS stability and Graham-smoothed growth across the 5-year window", () => {
    // newest → oldest: 6, 5, 4, 2, 2. Recent avg (6+5)/2 = 5.5; early avg (2+2)/2 = 2.
    // Growth = (5.5−2)/2 = 175%.  Positive years: 5 of 5.
    const years = [6, 5, 4, 2, 2].map((e, i) =>
      year({ fiscalYear: String(2025 - i), epsDiluted: e }),
    );
    const r = computeRatios(years, null);
    expect(r.epsYearsAvailable).toBe(5);
    expect(r.epsPositiveYears).toBe(5);
    expect(r.epsGrowthPct).toBe(175);
  });

  it("growth is null when the early years weren't profitable", () => {
    const years = [3, 2, 1, -1, -2].map((e, i) =>
      year({ fiscalYear: String(2025 - i), epsDiluted: e }),
    );
    const r = computeRatios(years, null);
    expect(r.epsPositiveYears).toBe(3);
    expect(r.epsGrowthPct).toBeNull();
  });

  it("missing inputs degrade to null, never NaN and never a throw", () => {
    const r = computeRatios([year({})], null);
    expect(r.currentRatio).toBeNull();
    expect(r.pe).toBeNull();
    expect(r.peTimesPb).toBeNull();
    expect(Object.values(r).some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });

  it("empty history is a valid (empty) answer", () => {
    const r = computeRatios([], 100);
    expect(r.asOfYear).toBeNull();
    expect(r.epsYearsAvailable).toBe(0);
  });
});

describe("tangible book — Graham's net tangible assets (ch. 15)", () => {
  it("subtracts goodwill and intangibles before dividing by shares: (500 − 100) / 100 = 4; price 6 → 1.5×", () => {
    const r = computeRatios([year({ equity: 500, goodwillAndIntangibles: 100, sharesDiluted: 100 })], 6);
    expect(r.bookValuePerShare).toBe(5);
    expect(r.tangibleBookPerShare).toBe(4);
    expect(r.pTangibleBook).toBe(1.5);
  });

  it("is null until the intangibles figure is held (rows stored before migration 0004)", () => {
    const r = computeRatios([year({ equity: 500, sharesDiluted: 100 })], 6);
    expect(r.bookValuePerShare).toBe(5);
    expect(r.tangibleBookPerShare).toBeNull();
    expect(r.pTangibleBook).toBeNull();
  });

  it("negative tangible book (goodwill-heavy balance sheet) gives no multiple, like negative book", () => {
    const r = computeRatios([year({ equity: 300, goodwillAndIntangibles: 450, sharesDiluted: 100 })], 6);
    expect(r.tangibleBookPerShare).toBe(-1.5);
    expect(r.pTangibleBook).toBeNull();
  });
});

describe("dividendYears — the dividend record", () => {
  it("sums per calendar year from ex-dates and counts distinct years", () => {
    const d = dividendYears([
      { ex_date: "2025-11-07", amount: 0.25 },
      { ex_date: "2025-08-08", amount: 0.25 },
      { ex_date: "2025-05-09", amount: 0.25 },
      { ex_date: "2025-02-07", amount: 0.24 },
      { ex_date: "2024-11-08", amount: 0.24 },
    ]);
    expect(d.yearsPaid).toBe(2);
    expect(d.perYear["2025"]).toBe(0.99);
    expect(d.perYear["2024"]).toBe(0.24);
  });

  it("zero, null and negative amounts are not a dividend record", () => {
    const d = dividendYears([
      { ex_date: "2025-05-09", amount: 0 },
      { ex_date: "2024-05-09", amount: null },
      { ex_date: "2023-05-09", amount: -0.1 },
    ]);
    expect(d.yearsPaid).toBe(0);
  });
});
