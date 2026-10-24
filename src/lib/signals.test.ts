/**
 * Week 7: the signal engine, checkable on a calculator. λ = 2 ÷ (span + 1):
 * fast 2/17, slow 2/65, vol 2/36. Every expected figure below was computed
 * independently (Python, the same formulas) or by hand.
 */
import { describe, it, expect } from "vitest";
import { computeSignals, describeSignal, lambda, annualise, RULE } from "./signals";

const series = (closes: number[], start = "2026-01-01") =>
  closes.map((close, i) => { const d = new Date(start); d.setUTCDate(d.getUTCDate() + i); return { date: d.toISOString().slice(0, 10), close }; });

describe("the rule's constants are Carver's", () => {
  it("spans 16/64, vol span 35, scalar 3.75, cap 20, 256 business days", () => {
    expect([RULE.fastSpan, RULE.slowSpan, RULE.volSpan]).toEqual([16, 64, 35]);
    expect(RULE.forecastScalar).toBe(3.75);
    expect(RULE.forecastCap).toBe(20);
    expect(Math.sqrt(RULE.businessDays)).toBe(16);
    expect(lambda(16)).toBeCloseTo(2 / 17, 12);
    expect(lambda(64)).toBeCloseTo(2 / 65, 12);
    expect(annualise(0.01)).toBeCloseTo(0.16, 12);
  });
});

describe("computeSignals", () => {
  it("EWMAs by hand: 10, 11, 12 → fast 10 / 10.117647 / 10.3391, slow 10 / 10.030769 / 10.091361", () => {
    const s = computeSignals(series([10, 11, 12]));
    expect(s.points.map((p) => [p.fast, p.slow])).toEqual([[10, 10], [10.117647, 10.030769], [10.3391, 10.091361]]);
    expect(s.points.every((p) => p.sigmaPx === null && p.forecast === null && p.state === "warming")).toBe(true); // fewer than 20 changes
  });

  it("a +1-a-day staircase: σ_px is exactly 1, the forecast hits the +20 cap", () => {
    const s = computeSignals(series(Array.from({ length: 25 }, (_, i) => 100 + i)));
    const last = s.latest!;
    expect(last.sigmaPx).toBe(1);
    expect(last.fast).toBeCloseTo(116.871944, 6);
    expect(last.slow).toBeCloseTo(107.378638, 6);
    expect(last.forecastRaw).toBeCloseTo(9.4933, 4);
    expect(last.forecast).toBe(20);         // 9.4933 × 3.75 = 35.6 → capped
    expect(last.state).toBe("warming");     // 25 closes < 128
    expect(s.mature).toBe(false);
  });

  it("the fixture reconciles with the independent computation to six places (lesson 7's exit check, in code)", () => {
    const closes = Array.from({ length: 300 }, (_, i) => Math.round(100 * Math.exp(0.0004 * i) * (1 + 0.03 * Math.sin(i / 9)) * 1e4) / 1e4);
    const s = computeSignals(series(closes));
    const last = s.latest!;
    expect(last.close).toBe(115.9924);
    expect(last.fast).toBeCloseTo(114.658667, 6);
    expect(last.slow).toBeCloseTo(111.795231, 6);
    expect(last.sigmaPx).toBeCloseTo(0.267689, 6);
    expect(last.sigmaPct).toBeCloseTo(0.00238798, 7);
    expect(last.instrumentRisk).toBe(3.82);
    expect(last.forecastRaw).toBeCloseTo(10.6969, 3);
    expect(last.forecast).toBe(20);
    expect(last.state).toBe("long");
    expect(s.mature).toBe(true);
  });

  it("long-only: a falling market is FLAT, never short", () => {
    const s = computeSignals(series(Array.from({ length: 200 }, (_, i) => 200 - i * 0.5)));
    expect(s.latest!.forecast).toBe(-20);
    expect(s.latest!.state).toBe("flat");
    expect(s.timeLong).toBe(0);
  });

  it("burn-in: 127 closes are 'warming', the 128th is a state", () => {
    const up = Array.from({ length: 128 }, (_, i) => 50 + i * 0.1);
    expect(computeSignals(series(up.slice(0, 127))).latest!.state).toBe("warming");
    const s = computeSignals(series(up));
    expect(s.latest!.state).toBe("long");
    expect(s.mature).toBe(true);
    expect(s.stateSince).toBe(s.points[127].date);
  });

  it("a rise then a fall flips once, and the state's start date is the crossover close", () => {
    const closes = [...Array.from({ length: 200 }, (_, i) => 100 + i * 0.5), ...Array.from({ length: 200 }, (_, i) => 199.5 - i * 0.5)];
    const s = computeSignals(series(closes));
    expect(s.flips).toBe(1);
    expect(s.latest!.state).toBe("flat");
    const firstFlat = s.points.find((p) => p.state === "flat")!;
    expect(s.stateSince).toBe(firstFlat.date);
    // mature closes: 400 − 127 = 273; long from the 128th close to the crossover ~30 days after the peak
    const crossoverIndex = s.points.findIndex((p) => p.state === "flat");
    expect(crossoverIndex).toBeGreaterThan(200);
    expect(crossoverIndex).toBeLessThan(240);
    expect(s.timeLong).toBeCloseTo((crossoverIndex - 127) / 273, 4);
  });

  it("a flat line: σ is zero, no forecast, state flat once mature", () => {
    const s = computeSignals(series(Array.from({ length: 150 }, () => 42)));
    expect(s.latest!.forecast).toBeNull();
    expect(s.latest!.state).toBe("flat");
  });

  it("sorts unordered closes and drops bad ones", () => {
    const s = computeSignals([{ date: "2026-01-03", close: 12 }, { date: "2026-01-01", close: 10 }, { date: "2026-01-02", close: 11 }, { date: "2026-01-04", close: NaN }, { date: "2026-01-05", close: -1 }]);
    expect(s.points.map((p) => p.close)).toEqual([10, 11, 12]);
  });

  it("describes itself in plain words", () => {
    const s = computeSignals(series(Array.from({ length: 200 }, (_, i) => 100 + i * 0.5)));
    expect(describeSignal(s)).toMatch(/^LONG — the 16-day average is above the 64-day; forecast \+20 on a ±20 scale; instrument risk [\d.]+% a year; this state since 2026-05-08\.$/);
    expect(describeSignal(computeSignals(series([1, 2, 3])))).toMatch(/^Warming up: 3 closes stored, 128 needed/);
    expect(describeSignal(computeSignals([]))).toBe("No closes stored yet.");
  });
});
