/**
 * EDGAR's company-concept API — the selection rules the record taught us
 * (VC-13, 15 Oct 2026), pinned with synthetic facts shaped like Ethan Allen's.
 */
import { describe, it, expect } from "vitest";
import { selectAnnualFacts, factForEnd, edgarEpsForPeriods, padCik, type EdgarFact } from "./providers-edgar";

const K = (over: Partial<EdgarFact>): EdgarFact => ({ start: "2025-07-01", end: "2026-06-30", val: 1.56, accn: "0001437749-26-029578", fy: 2026, fp: "FY", form: "10-K", filed: "2026-09-03", ...over });

describe("selectAnnualFacts", () => {
  it("one fact per period end; the most recently FILED copy wins; fy is ignored", () => {
    const facts = [
      K({ start: "2023-07-01", end: "2024-06-30", val: 2.49, fy: 2024, filed: "2024-08-20", accn: "a" }),
      K({ start: "2023-07-01", end: "2024-06-30", val: 2.49, fy: 2025, filed: "2025-08-21", accn: "b" }),   // comparative, labelled fy 2025
      K({ start: "2023-07-01", end: "2024-06-30", val: 2.48, fy: 2026, filed: "2026-09-03", accn: "c" }),   // restated in the newest 10-K
      K({ start: "2024-07-01", end: "2025-06-30", val: 2.01, fy: 2025, filed: "2025-08-21" }),
      K({}),
    ];
    const sel = selectAnnualFacts(facts);
    expect(sel.map((f) => f.end)).toEqual(["2026-06-30", "2025-06-30", "2024-06-30"]);
    expect(sel[2].val).toBe(2.48);
    expect(sel[2].accn).toBe("c");
  });
  it("proxy forms and quarters are not annual reports", () => {
    const facts = [
      K({ form: "PREC14A", fy: null, filed: "2026-01-10", val: 9.99 }),
      K({ form: "DEFC14A", fy: null, filed: "2026-02-10", val: 9.98 }),
      K({ form: "10-Q", start: "2026-01-01", end: "2026-03-31", val: 0.4 }),
      K({ form: "10-K", start: "2026-04-01", end: "2026-06-30", val: 0.3 }),   // a quarter inside a 10-K
    ];
    expect(selectAnnualFacts(facts)).toEqual([]);
  });
  it("52/53-week years count as annual; instants are selected separately", () => {
    const facts = [
      K({ start: "2025-01-05", end: "2026-01-03", val: 3 }),     // 363 days
      K({ start: "2024-12-29", end: "2025-01-04", val: 0.1 }),   // a week
      K({ start: undefined, end: "2026-06-30", val: 471461000 }),
    ];
    expect(selectAnnualFacts(facts).map((f) => f.val)).toEqual([3]);
    expect(selectAnnualFacts(facts, "instant").map((f) => f.val)).toEqual([471461000]);
  });
  it("a 270-day transition period (10-KT) is not a year — the 340–380-day window holds (review mutation M10)", () => {
    const facts = [
      K({ form: "10-KT", start: "2025-10-01", end: "2026-06-30", val: 1.1 }),   // 272 days
      K({ form: "10-K", start: "2025-06-15", end: "2026-06-30", val: 1.2 }),    // 380 days — the edge, in
      K({ form: "10-K", start: "2025-06-10", end: "2026-06-30", val: 1.3 }),    // 385 days — out
      K({ form: "10-K", start: "2025-07-25", end: "2026-06-30", val: 1.4, filed: "2026-01-01" }),   // 340 days — the edge, in (older filing)
    ];
    expect(selectAnnualFacts(facts).map((f) => f.val)).toEqual([1.2]); // the newest-filed in-window copy for that end
    expect(selectAnnualFacts([facts[0]])).toEqual([]);
    expect(selectAnnualFacts([facts[3]]).map((f) => f.val)).toEqual([1.4]);
  });
  it("factForEnd tolerates a few days of fiscal-calendar wobble, not more", () => {
    const sel = selectAnnualFacts([K({ start: "2025-01-05", end: "2026-01-03", val: 3 })]);
    expect(factForEnd(sel, "2025-12-31")?.val).toBe(3);
    expect(factForEnd(sel, "2025-12-15")).toBeNull();
  });
  it("pads a CIK to ten digits", () => {
    expect(padCik("896156")).toBe("0000896156");
    expect(padCik(37996)).toBe("0000037996");
  });
});

describe("edgarEpsForPeriods with a fake EDGAR", () => {
  const concept = (tag: string, unit: string, facts: EdgarFact[]) => ({ cik: 896156, entityName: "ETHAN ALLEN INTERIORS INC", tag, units: { [unit]: facts } });
  const route = (table: Record<string, unknown>, status404 = new Set<string>()) => {
    const calls: { url: string; ua: string | null }[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const tag = u.match(/us-gaap\/([^.]+)\.json/)![1];
      const h = init?.headers as Record<string, string> | undefined;
      calls.push({ url: u, ua: h?.["user-agent"] ?? null });
      if (status404.has(tag) || !(tag in table)) return new Response("not found", { status: 404 });
      return new Response(JSON.stringify(table[tag]), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    return { fetchImpl, calls };
  };
  const ends = ["2026-06-30", "2025-06-30", "2024-06-30"];

  it("EPS with provenance, net income for the cross-check, diluted shares; sends the User-Agent", async () => {
    const { fetchImpl, calls } = route({
      EarningsPerShareDiluted: concept("EarningsPerShareDiluted", "USD/shares", [
        K({}), K({ start: "2024-07-01", end: "2025-06-30", val: 2.01, filed: "2025-08-21", accn: "x" }), K({ start: "2023-07-01", end: "2024-06-30", val: 2.49, filed: "2024-08-20", accn: "y" }),
      ]),
      NetIncomeLoss: concept("NetIncomeLoss", "USD", [K({ val: 39883000 }), K({ start: "2024-07-01", end: "2025-06-30", val: 51596000 })]),
      WeightedAverageNumberOfDilutedSharesOutstanding: concept("W", "shares", [K({ val: 25584000 })]),
    });
    const r = await edgarEpsForPeriods("896156", ends, "stock-market-toolkit test@example.com", { fetchImpl });
    expect(r.fatal).toBeNull();
    expect(r.calls).toBe(5); // EPS, NetIncomeLoss (2 of 3 periods), ProfitLoss (404), NetIncomeLossAvailable… (404), shares
    expect(calls[0].ua).toBe("stock-market-toolkit test@example.com");
    expect(calls[0].url).toContain("/CIK0000896156/us-gaap/EarningsPerShareDiluted.json");
    expect(r.years.map((y) => y.eps)).toEqual([1.56, 2.01, 2.49]);
    expect(r.years[0].epsSource).toBe("edgar:EarningsPerShareDiluted 10-K filed 2026-09-03 accn 0001437749-26-029578");
    expect(r.years[0].netIncome).toBe(39883000);
    expect(r.years[0].sharesDiluted).toBe(25584000);
    expect(r.years[2].netIncome).toBeNull(); // no tag covered it — stays empty rather than guessed
  });

  it("tries the next net-income tag for the periods the first one left uncovered (review S5)", async () => {
    const { fetchImpl } = route({
      EarningsPerShareDiluted: concept("EarningsPerShareDiluted", "USD/shares", [K({}), K({ start: "2024-07-01", end: "2025-06-30", val: 2.01 }), K({ start: "2023-07-01", end: "2024-06-30", val: 2.49 })]),
      NetIncomeLoss: concept("NetIncomeLoss", "USD", [K({ val: 39883000 })]),                                   // newest year only
      ProfitLoss: concept("ProfitLoss", "USD", [K({ val: 39900000 }), K({ start: "2024-07-01", end: "2025-06-30", val: 51596000 }), K({ start: "2023-07-01", end: "2024-06-30", val: 63816000 })]),
      WeightedAverageNumberOfDilutedSharesOutstanding: concept("W", "shares", [K({ val: 25584000 })]),
    });
    const r = await edgarEpsForPeriods("896156", ends, "ua", { fetchImpl });
    expect(r.years.map((y) => [y.netIncome, y.netIncomeTag])).toEqual([
      [39883000, "NetIncomeLoss"],   // the first tag keeps its period — NetIncomeLoss preferred
      [51596000, "ProfitLoss"],      // the drifted tag fills the rest
      [63816000, "ProfitLoss"],
    ]);
  });

  it("falls back to net income ÷ diluted shares when the EPS tag is dimensioned away (Ford's case), and drifts to ProfitLoss", async () => {
    const { fetchImpl, calls } = route({
      EarningsPerShareDiluted: concept("EarningsPerShareDiluted", "USD/shares", []),   // present but empty
      ProfitLoss: concept("ProfitLoss", "USD", [K({ val: 39883000 })]),
      WeightedAverageNumberOfDilutedSharesOutstanding: concept("W", "shares", [K({ val: 25584000 })]),
    }, new Set(["EarningsPerShareBasicAndDiluted", "NetIncomeLoss"]));
    const r = await edgarEpsForPeriods("896156", ["2026-06-30"], "ua", { fetchImpl });
    expect(r.fatal).toBeNull();
    expect(r.years[0].eps).toBe(1.56);  // 39,883,000 ÷ 25,584,000 = 1.5589 → 1.56
    expect(r.years[0].epsSource).toMatch(/^edgar:ProfitLoss\/WeightedAverageNumberOfDilutedSharesOutstanding 10-K filed 2026-09-03/);
    expect(r.years[0].netIncomeTag).toBe("ProfitLoss");
    expect(calls.map((c) => c.url.match(/us-gaap\/([^.]+)\.json/)![1])).toEqual([
      "EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted", "NetIncomeLoss", "ProfitLoss", "WeightedAverageNumberOfDilutedSharesOutstanding",
    ]);
  });

  it("a 403 (User-Agent refused) is fatal for the night, not a 'no data' answer", async () => {
    const fetchImpl = (async () => new Response("forbidden", { status: 403 })) as typeof fetch;
    const r = await edgarEpsForPeriods("896156", ends, "bad", { fetchImpl });
    expect(r.fatal).toMatch(/403/);
    expect(r.years.every((y) => y.eps === null)).toBe(true);
  });
});
