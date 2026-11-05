/**
 * Dividend adjustment, checkable on a calculator. The worked example is the
 * one the record found: Ethan Allen's $3.00 special (VC-14), which painted a
 * ~13% cliff on the as-traded chart.
 */
import { describe, it, expect } from "vitest";
import { adjustmentFactors, adjustBars, suspiciousJumps } from "./adjust";

const pts = (rows: [string, number][]) => rows.map(([date, close]) => ({ date, close }));

describe("adjustmentFactors", () => {
  it("scales every close before the ex-date by (1 − dividend ÷ last close before it)", () => {
    const f = adjustmentFactors(
      pts([["2026-08-05", 23.0], ["2026-08-06", 23.2], ["2026-08-07", 20.2], ["2026-08-08", 20.3]]),
      [{ exDate: "2026-08-07", amount: 3.0 }],
    );
    const expected = 1 - 3.0 / 23.2; // 0.87069…
    expect(f.get("2026-08-05")).toBeCloseTo(expected, 9);
    expect(f.get("2026-08-06")).toBeCloseTo(expected, 9);
    expect(f.get("2026-08-07")).toBe(1);
    expect(f.get("2026-08-08")).toBe(1);
  });
  it("a DECLARED dividend with an ex-date after the newest close adjusts nothing until a close on or after it exists (v0.8.2 verification review, V2)", () => {
    const series = pts([["2026-10-21", 90], ["2026-10-22", 90.5], ["2026-10-23", 90]]);
    const declared = [{ exDate: "2026-11-06", amount: 0.07 }];
    const before = adjustmentFactors(series, declared);
    expect([...before.values()]).toEqual([1, 1, 1]);            // not 0.99922 on every row
    // the ex-date IS the newest close: the earlier closes are adjusted, that one is not
    const onTheDay = adjustmentFactors(pts([["2026-11-04", 90], ["2026-11-05", 91], ["2026-11-06", 90.9]]), declared);
    expect(onTheDay.get("2026-11-05")).toBeCloseTo(1 - 0.07 / 91, 9);
    expect(onTheDay.get("2026-11-06")).toBe(1);
    // a later visit brings closes past the ex-date: now it applies, with the right divisor
    const after = adjustmentFactors(pts([["2026-10-23", 90], ["2026-11-05", 91], ["2026-11-10", 90.8]]), declared);
    expect(after.get("2026-10-23")).toBeCloseTo(1 - 0.07 / 91, 9);
    expect(after.get("2026-11-10")).toBe(1);
    // adjustBars follows the same rule
    const bars = adjustBars(series.map((p) => ({ ...p, open: p.close, high: p.close, low: p.close, volume: 1 })), declared);
    expect(bars.map((b) => b.adjClose)).toEqual([90, 90.5, 90]);
  });
  it("factors compound across dividends, and a dividend with no earlier close adjusts nothing", () => {
    const f = adjustmentFactors(
      pts([["2026-01-02", 100], ["2026-02-02", 100], ["2026-03-02", 100]]),
      [{ exDate: "2026-02-01", amount: 1 }, { exDate: "2026-03-01", amount: 2 }, { exDate: "2025-12-01", amount: 5 }],
    );
    expect(f.get("2026-01-02")).toBeCloseTo(0.99 * 0.98, 9);
    expect(f.get("2026-02-02")).toBeCloseTo(0.98, 9);
    expect(f.get("2026-03-02")).toBe(1);
  });
  it("ignores nonsense: a null amount, or a 'dividend' bigger than the price", () => {
    const f = adjustmentFactors(pts([["2026-01-02", 10], ["2026-01-05", 10]]), [{ exDate: "2026-01-03", amount: null }, { exDate: "2026-01-04", amount: 12 }]);
    expect(f.get("2026-01-02")).toBe(1);
  });
  it("the ex-date need not be a trading day in the series", () => {
    const f = adjustmentFactors(pts([["2026-01-02", 50], ["2026-01-06", 49]]), [{ exDate: "2026-01-04", amount: 1 }]);
    expect(f.get("2026-01-02")).toBeCloseTo(0.98, 9);
    expect(f.get("2026-01-06")).toBe(1);
  });
});

describe("adjustBars and the jump check", () => {
  const raw = [
    { date: "2026-08-05", open: 22.9, high: 23.1, low: 22.8, close: 23.0, volume: 100 },
    { date: "2026-08-06", open: 23.0, high: 23.3, low: 22.9, close: 23.2, volume: 110 },
    { date: "2026-08-07", open: 20.1, high: 20.4, low: 20.0, close: 20.2, volume: 300 },
    { date: "2026-08-08", open: 20.2, high: 20.5, low: 20.1, close: 20.3, volume: 120 },
  ];
  it("keeps the as-traded close and scales open/high/low with it", () => {
    const b = adjustBars(raw, [{ exDate: "2026-08-07", amount: 3.0 }]);
    expect(b[1].close).toBe(23.2);
    expect(b[1].adjClose).toBeCloseTo(23.2 * (1 - 3 / 23.2), 5);
    expect(b[1].adjClose).toBeCloseTo(20.2, 5);          // the special taken out, 6 Aug sits where 7 Aug opened
    expect(b[1].adjHigh).toBeCloseTo(23.3 * (1 - 3 / 23.2), 5);
    expect(b[2].adjClose).toBe(20.2);
  });
  it("the as-traded series shows the 13% cliff; the adjusted one does not", () => {
    const asTraded = suspiciousJumps(raw.map((r) => ({ date: r.date, adjClose: r.close })), 0.1);
    expect(asTraded).toEqual([{ date: "2026-08-07", ratio: 0.871 }]);
    const adjusted = suspiciousJumps(adjustBars(raw, [{ exDate: "2026-08-07", amount: 3.0 }]), 0.1);
    expect(adjusted).toEqual([]);
  });
  it("a move the dividend record cannot explain is reported (a split, or news)", () => {
    const b = adjustBars([...raw, { date: "2026-08-09", open: 10, high: 10.2, low: 9.9, close: 10.1, volume: 500 }], [{ exDate: "2026-08-07", amount: 3.0 }]);
    expect(suspiciousJumps(b)).toEqual([{ date: "2026-08-09", ratio: 0.498 }]);
  });
});

describe("splits (week 8, OI-52)", () => {
  // Mueller Industries, two-for-one on 2026-07-01: the 31 Oct visit flagged ×0.467 on that date.
  const raw = [
    { date: "2026-06-29", open: 160, high: 162, low: 158, close: 160.0, volume: 100 },
    { date: "2026-06-30", open: 161, high: 163, low: 159, close: 162.0, volume: 100 },
    { date: "2026-07-01", open: 80, high: 81, low: 74, close: 75.6, volume: 300 },   // halved, and down 6.7% on the day
    { date: "2026-07-02", open: 76, high: 77, low: 75, close: 76.0, volume: 100 },
  ];
  const split = [{ date: "2026-07-01", factor: 2 }];
  it("every close before the split date is divided by the factor; the split day and after are untouched", () => {
    const f = adjustmentFactors(raw.map((r) => ({ date: r.date, close: r.close })), [], split);
    expect(f.get("2026-06-29")).toBe(0.5);
    expect(f.get("2026-06-30")).toBe(0.5);
    expect(f.get("2026-07-01")).toBe(1);
    expect(f.get("2026-07-02")).toBe(1);
    const b = adjustBars(raw, [], split);
    expect(b[1].adjClose).toBe(81);
    expect(b[1].adjHigh).toBe(81.5);
    expect(b[1].close).toBe(162);          // as traded, kept
  });
  it("with the split known, the jump check sees the day's real move (−6.7%), not the halving", () => {
    expect(suspiciousJumps(adjustBars(raw, []), 0.4)).toEqual([{ date: "2026-07-01", ratio: 0.467 }]);  // what the visit saw
    expect(suspiciousJumps(adjustBars(raw, [], split), 0.4)).toEqual([]);
    expect(suspiciousJumps(adjustBars(raw, [], split), 0.05)).toEqual([{ date: "2026-07-01", ratio: 0.933 }]);
  });
  it("compounds with a dividend: the dividend's factor is computed on the as-traded close of its time, then halved", () => {
    const f = adjustmentFactors(raw.map((r) => ({ date: r.date, close: r.close })), [{ exDate: "2026-06-30", amount: 1.62 }], split);
    expect(f.get("2026-06-29")).toBeCloseTo(0.5 * (1 - 1.62 / 160), 12);   // the dividend takes 1.01% off June 29, then the split halves it
    expect(f.get("2026-06-30")).toBe(0.5);
  });
  it("a split dated after the newest close, a factor of 1, or nothing positive changes nothing", () => {
    const pts = raw.slice(0, 2).map((r) => ({ date: r.date, close: r.close }));
    expect([...adjustmentFactors(pts, [], split).values()]).toEqual([1, 1]);
    expect([...adjustmentFactors(raw.map((r) => ({ date: r.date, close: r.close })), [], [{ date: "2026-07-01", factor: 1 }]).values()]).toEqual([1, 1, 1, 1]);
    expect([...adjustmentFactors(raw.map((r) => ({ date: r.date, close: r.close })), [], [{ date: "2026-07-01", factor: 0 }, { date: "2026-07-01", factor: NaN }]).values()]).toEqual([1, 1, 1, 1]);
  });
  it("a reverse split (1-for-10 = factor 0.1) multiplies every earlier close by ten (review F12)", () => {
    const f = adjustmentFactors(raw.map((r) => ({ date: r.date, close: r.close })), [], [{ date: "2026-07-01", factor: 0.1 }]);
    expect(f.get("2026-06-29")).toBeCloseTo(10, 12);
    expect(f.get("2026-07-01")).toBe(1);
  });
});

