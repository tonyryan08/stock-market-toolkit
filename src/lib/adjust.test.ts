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
