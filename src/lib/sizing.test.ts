import { describe, it, expect } from "vitest";
import { SIZING, sizePosition, minimumCapital, tradeCost, stopLevel, stopHit, describeSizing, SizeInputError } from "./sizing";

describe("the sizing constants are the ones the course decided (decisions 18 and 19)", () => {
  it("12% target · leverage 1 · stop at half the annual risk · $2 + 0.25% a trade · 1% round-trip limit · whole shares", () => {
    expect(SIZING.riskTargetPct).toBe(12);
    expect(SIZING.leverageFactor).toBe(1);
    expect(SIZING.stopFraction).toBe(0.5);
    expect(SIZING.costPerTrade).toBe(2);
    expect(SIZING.fxPct).toBe(0.25);
    expect(SIZING.maxRoundTripCostPct).toBe(1);
    expect(SIZING.minUnits).toBe(1);
    expect(SIZING.currency).toBe("USD");
  });
});

describe("sizePosition — the arithmetic on a calculator", () => {
  // AAPL on the 2026-10-29 close (VC-19's figures): price 348.91, instrument risk 18.18%.
  const aapl = sizePosition({ capital: 10_000, price: 348.91, instrumentRiskPct: 18.18 });
  it("target exposure = capital × 12 ÷ 18.18 = $6,600.66; 18 whole shares = $6,280.38; 62.8% of the account carrying 11.42%", () => {
    expect(aapl.targetExposure).toBeCloseTo(6600.66, 2);
    expect(aapl.capped).toBe(false);
    expect(aapl.units).toBe(18);
    expect(aapl.exposure).toBeCloseTo(6280.38, 2);
    expect(aapl.weightPct).toBeCloseTo(62.8, 1);
    expect(aapl.achievedRiskPct).toBeCloseTo(11.42, 2);
  });
  it("the stop gap is ½ × 18.18% × 348.91 = $31.72, so the first stop is $317.19", () => {
    expect(aapl.stopGap).toBeCloseTo(31.72, 2);
    expect(aapl.stopLevel).toBeCloseTo(317.19, 2);
  });
  it("costs: $2 + 0.25% of $6,280.38 = $17.70 a trade, $35.40 a round trip = 0.56% — under the 1% limit", () => {
    expect(aapl.costs.open).toBeCloseTo(17.7, 2);
    expect(aapl.costs.roundTrip).toBeCloseTo(35.4, 2);
    expect(aapl.costs.roundTripPct).toBeCloseTo(0.56, 2);
    expect(aapl.ok).toBe(true);
    expect(aapl.checks.map((c) => c.ok)).toEqual([true, true]);
  });
  it("a share that moves less than the target cannot reach it without leverage: capped at the whole account, risk under target", () => {
    const s = sizePosition({ capital: 10_000, price: 348.91, instrumentRiskPct: 6 });
    expect(s.capped).toBe(true);
    expect(s.targetExposure).toBe(10_000);
    expect(s.units).toBe(28);                      // floor(10,000 ÷ 348.91)
    expect(s.achievedRiskPct).toBeCloseTo(5.86, 2); // 97.69% × 6
    expect(describeSizing(s, "AAPL")).toMatch(/without leverage the whole account/);
  });
  it("too small to size: one share is more than the target exposure — says so, and names the minimum account", () => {
    const s = sizePosition({ capital: 500, price: 348.91, instrumentRiskPct: 18.18 });
    expect(s.units).toBe(0);
    expect(s.ok).toBe(false);
    expect(s.checks[0].code).toBe("one_share");
    expect(s.checks[0].ok).toBe(false);
    expect(s.checks[0].message).toMatch(/One share at \$348\.91 is more than the \$330\.03/);
    expect(s.checks[0].message).toMatch(/at least \$1,586\.00/);   // 3 shares (the first whole number worth ≥ $800) × 1.515 (review F1)
    expect(s.checks[1].message).toMatch(/Not checked/);
  });
  it("too small to trade: a $500 position's round trip ($6.50) is 1.3% of it — over the 1% limit", () => {
    const s = sizePosition({ capital: 1_000, price: 5, instrumentRiskPct: 24 });
    expect(s.units).toBe(100);
    expect(s.exposure).toBe(500);
    expect(s.costs.roundTrip).toBeCloseTo(6.5, 2);
    expect(s.costs.roundTripPct).toBeCloseTo(1.3, 2);
    expect(s.ok).toBe(false);
    expect(s.checks[1].code).toBe("cost");
    expect(s.checks[1].message).toMatch(/over the course's 1% limit/);
    expect(s.checks[1].message).toMatch(/at least \$1,600\.00/);
  });
  it("the cost limit is inclusive: an $800 position's round trip is exactly 1%", () => {
    const s = sizePosition({ capital: 1_600, price: 8, instrumentRiskPct: 24 });
    expect(s.exposure).toBe(800);
    expect(s.costs.roundTripPct).toBe(1);
    expect(s.ok).toBe(true);
  });
  it("rejects nonsense inputs with a plain message", () => {
    expect(() => sizePosition({ capital: 0, price: 10, instrumentRiskPct: 20 })).toThrow(SizeInputError);
    expect(() => sizePosition({ capital: 1000, price: -1, instrumentRiskPct: 20 })).toThrow(/price must be a positive number/);
    expect(() => sizePosition({ capital: 1000, price: 10, instrumentRiskPct: 0 })).toThrow(/instrument risk must be a positive percentage/);
    expect(() => sizePosition({ capital: NaN, price: 10, instrumentRiskPct: 20 })).toThrow(/capital must be a positive number/);
    expect(() => sizePosition({ capital: 2e9, price: 10, instrumentRiskPct: 20 })).toThrow(/below/);
  });
});

describe("minimumCapital and tradeCost", () => {
  it("the cost floor is 2 × $2 ÷ (1% − 2 × 0.25%) = $800 of exposure, rounded UP to whole shares; scaled by σ ÷ τ (review F1)", () => {
    expect(minimumCapital(5, 24)).toBe(1600);          // 160 shares = $800 exactly × 2
    expect(minimumCapital(20, 30)).toBe(2000);         // 40 shares = $800 × 2.5 — the lesson's example
    expect(minimumCapital(348.91, 18.18)).toBe(1586);  // 3 shares = $1,046.73 × 1.515 (2 shares = $697.82 would fail the 1% check)
    expect(minimumCapital(94.08, 21.11)).toBe(1490);   // KO: 9 shares = $846.72 × 1.759
    expect(minimumCapital(530.14, 22.55)).toBe(1993);  // MSFT: 2 shares = $1,060.28 × 1.879
    expect(minimumCapital(900, 24)).toBe(1800);        // one share ($900) is the floor when it exceeds $800
    expect(minimumCapital(100, 6)).toBe(800);          // under the target: ratio 1; 8 shares = $800
  });
  it("the named minimum clears both checks and one dollar less does not, across a grid of prices and risks", () => {
    for (const price of [1, 2.5, 5, 7, 13, 20, 33.33, 49.99, 94.08, 100, 348.91, 530.14, 799, 801, 1234.56, 5000]) {
      for (const sigma of [3, 6, 11.9, 12, 12.1, 18.18, 24, 37.5, 60, 95]) {
        const m = minimumCapital(price, sigma);
        expect(sizePosition({ capital: m, price, instrumentRiskPct: sigma }).ok, `${price} @ ${sigma}% min ${m}`).toBe(true);
        if (m > 1) expect(sizePosition({ capital: m - 1, price, instrumentRiskPct: sigma }).ok, `${price} @ ${sigma}% min−1`).toBe(false);
      }
    }
  });
  it("whole shares survive floating point: $6,978.20 ÷ $348.91 is 20 shares, not 19", () => {
    const s = sizePosition({ capital: 6978.2 / 12 * 18.18, price: 348.91, instrumentRiskPct: 18.18 });
    expect(s.targetExposure).toBe(6978.2);
    expect(s.units).toBe(20);
  });
  it("tradeCost is the fee plus the conversion", () => {
    expect(tradeCost(0)).toBe(2);
    expect(tradeCost(10_000)).toBe(27);
  });
});

describe("the stop", () => {
  it("trails the high since entry by the gap fixed at entry; a close at or below it is a hit", () => {
    expect(stopLevel(360, 31.72)).toBe(328.28);
    expect(stopHit(328.28, 328.28)).toBe(true);
    expect(stopHit(328.29, 328.28)).toBe(false);
    expect(stopHit(300, 328.28)).toBe(true);
  });
});

describe("describeSizing", () => {
  it("reads as a sentence with the numbers a student can check", () => {
    const s = sizePosition({ capital: 10_000, price: 348.91, instrumentRiskPct: 18.18 });
    const t = describeSizing(s, "AAPL");
    expect(t).toMatch(/18\.18% instrument risk and a 12% target/);   // two decimals: the arithmetic used 18.18 (review F3)
    expect(t).toMatch(/\$10,000\.00 supports \$6,600\.66 of AAPL: 18 shares at \$348\.91 = \$6,280\.38/);
    expect(t).toMatch(/The stop starts \$31\.72 below the entry, at \$317\.19/);
  });
});
