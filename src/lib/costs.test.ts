/**
 * Week 11: the worksheet's arithmetic, pinned — the trade's costs on the
 * published schedule and the course's model, the holding's costs, and the
 * same gain taxed three ways with the rules as checked on 12 Nov 2026.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_INPUT, TAX_RULES, worksheet, taxThreeWays, shareTradeCosts, etfTradeCosts, courseModelCosts, holdingCosts, parseCostInput, exitTaxRateFor, billRules, statusSentence, CostInputError, type TaxRules } from "./costs";
import { costsPage } from "../costs";

describe("the rules, as checked", () => {
  it("carry their dates and their basis — a Bill is not an Act", () => {
    expect(TAX_RULES.checkedOn).toBe("2026-11-12");
    expect(TAX_RULES.cgt).toMatchObject({ ratePct: 31, previousPct: 33, from: "2026-10-07", exemption: 1270, basis: "Bill" });
    expect(TAX_RULES.exitTax).toMatchObject({ ratePct: 38, ratePctFrom2027: 35, previousPct: 41, deemedDisposalYears: 8, basis: "Bill" });
    expect(TAX_RULES.iia).toMatchObject({ opens: "2027-07-01", contributionLimit: 12000, threshold: 50000, chargePct: 1, basis: "Bill" });
    expect(TAX_RULES.stampDuty).toMatchObject({ irishPct: 1, ukPct: 0.5, usPct: 0, basis: "current" });
    expect(TAX_RULES.dividends).toMatchObject({ usTreatyPct: 15, usDefaultPct: 30, irishDwtPct: 25 });
    expect(TAX_RULES.status).toMatch(/not an Act/);
    expect(exitTaxRateFor(0)).toBe(38);
    expect(exitTaxRateFor(1)).toBe(35);
  });
});

describe("the trade's and the holding's costs — €10,000 in a US share, +30%, 3 years (the defaults)", () => {
  const i = DEFAULT_INPUT;
  it("the published schedule: two orders, conversion both ways, the spread, three years' connectivity", () => {
    const t = shareTradeCosts(i);
    expect(t.lines.map((l) => [l.label, l.amount])).toEqual([
      ["Commission and handling, buy", 2], ["Commission and handling, sell", 2],
      ["Currency conversion, buy", 25], ["Currency conversion, sell", 32.5],
      ["The spread (week 2's toll bridge)", 10], ["Exchange connectivity", 7.5],
    ]);
    expect(t.total).toBe(79);
  });
  it("the course's model says $61.50 for the same two tickets — the paper account's costs were real costs", () => {
    expect(courseModelCosts(i).total).toBe(61.5);
  });
  it("a euro-listed core-selection ETF: €1 an order and the spread; its holding cost is the TER", () => {
    expect(etfTradeCosts(i).total).toBe(12);
    const h = holdingCosts(i);
    expect(h.etf.total).toBe(69);          // 0.2% × €11,500 average × 3 years
    expect(h.share.lines[0].amount).toBe(345);   // 1% × €11,500 × 3
    expect(h.share.total).toBe(51.75);     // 15% withheld under the treaty
  });
  it("stamp duty follows the market: 1% Irish, 0.5% UK, none on US; Irish shares need no conversion", () => {
    const ie = shareTradeCosts({ ...i, market: "IE" });
    expect(ie.lines.find((l) => l.label.startsWith("Stamp duty"))!.amount).toBe(100);
    expect(ie.lines.some((l) => l.label.startsWith("Currency conversion"))).toBe(false);
    const uk = shareTradeCosts({ ...i, market: "UK" });
    expect(uk.lines.find((l) => l.label.startsWith("Stamp duty"))!.amount).toBe(50);
    expect(shareTradeCosts(i).lines.some((l) => l.label.startsWith("Stamp duty"))).toBe(false);
  });
});

describe("the same gain taxed three ways", () => {
  it("€3,000 gain: shares 31% above the €1,270 exemption = €536.30; a fund 35% of all of it = €1,050; the account nothing below €50,000", () => {
    const t = taxThreeWays(DEFAULT_INPUT);
    expect(t.shares).toMatchObject({ gain: 3000, exemption: 1270, taxable: 1730, ratePct: 31, tax: 536.3, net: 2463.7 });
    expect(t.etf).toMatchObject({ gain: 3000, exemption: 0, taxable: 3000, ratePct: 35, tax: 1050, net: 1950 });
    expect(t.iia).toMatchObject({ gain: 3000, tax: 0, net: 3000 });
    expect(t.etf.notes[1]).toMatch(/no deemed disposal inside 8 years/);
  });
  it("the exemption already used: 31% of the whole gain; a sale within 2026: 38% on the fund", () => {
    expect(taxThreeWays({ ...DEFAULT_INPUT, exemptionAvailable: false }).shares.tax).toBe(930);
    const sold2026 = taxThreeWays({ ...DEFAULT_INPUT, years: 0 });
    expect(sold2026.etf.ratePct).toBe(38);
    expect(sold2026.etf.tax).toBe(1140);
  });
  it("a loss: no tax anywhere; shares carry it forward, a fund gets no relief, the account still charges on value above €50,000", () => {
    const t = taxThreeWays({ ...DEFAULT_INPUT, invested: 60000, gainPct: -10, years: 1 });
    expect(t.shares.tax).toBe(0);
    expect(t.shares.notes[0]).toMatch(/carries forward/);
    expect(t.etf.tax).toBe(0);
    expect(t.etf.notes[0]).toMatch(/no relief/);
    expect(t.iia.tax).toBe(70);   // average value €57,000 → 1% of €7,000
    expect(t.iia.notes[0]).toMatch(/payable in a losing year too/);
  });
  it("€60,000 held 3 years at +30%: the account charges 1% of the excess each year on a straight-line path; a 9-year hold is a deemed disposal", () => {
    const t = taxThreeWays({ ...DEFAULT_INPUT, invested: 60000, years: 3 });
    expect(t.iia.tax).toBe(570);          // average values 63,000 / 69,000 / 75,000 → excesses 13,000 + 19,000 + 25,000
    expect(t.iia.notes[1]).toMatch(/needs 5 years of contributions/);
    expect(taxThreeWays({ ...DEFAULT_INPUT, years: 9 }).etf.notes[1]).toMatch(/deemed disposal at year 8/);
  });
  it("the worksheet's reading names the three figures and the net of each", () => {
    const w = worksheet(DEFAULT_INPUT);
    expect(w.gain).toBe(3000);
    expect(w.reading[0]).toBe("€10,000 into a US share for 3 years, sold with a gain of 30%: €3,000.00.");
    expect(w.reading[3]).toMatch(/as shares, €536\.30 .* as a fund or ETF, €1,050\.00 .* inside the investment account, €0\.00/);
    expect(w.reading[1]).toMatch(/would say \$61\.50/);   // the course's model is in dollars (review H2)
    expect(w.reading[4]).toMatch(/€2,384\.70 as shares, €1,938\.00 as an ETF \(its annual charge already in the price\), €2,921\.00 inside the account/);   // the TER not deducted twice (N7)
    expect(w.reading[4]).toMatch(/the share's dividends, €345\.00 gross over the holding, are income taxed at your own rate and are left out of all three/);
  });
  it("the edges (review H6): a gain under the exemption is covered by it, in full; the eighth year is the deemed disposal", () => {
    const small = taxThreeWays({ ...DEFAULT_INPUT, invested: 1000, gainPct: 50 });
    expect(small.shares).toMatchObject({ gain: 500, exemption: 500, taxable: 0, tax: 0 });
    expect(taxThreeWays({ ...DEFAULT_INPUT, years: 8 }).etf.notes[1]).toMatch(/deemed disposal at year 8/);
    expect(taxThreeWays({ ...DEFAULT_INPUT, years: 7 }).etf.notes[1]).toMatch(/no deemed disposal inside 8 years/);
  });
  it("the account's column says what it assumes (review N8): the whole sum inside from the first day, the allowance and the opening date notwithstanding", () => {
    const t = taxThreeWays({ ...DEFAULT_INPUT, invested: 60000 });
    expect(t.iia.notes[1]).toMatch(/needs 5 years of contributions — this column counts the charge as if the whole sum were inside from the first day, which the allowance does not permit: a simplification, not a plan/);
    expect(t.iia.notes[2]).toMatch(/a simplification: the charge is counted from the trade's first year as if the account were open then — it opens on 1 July 2027 if enacted/);
  });
});

describe("the page follows the rules' basis (review F3)", () => {
  const enacted: TaxRules = { ...TAX_RULES, checkedOn: "2026-12-20", cgt: { ...TAX_RULES.cgt, basis: "current" }, exitTax: { ...TAX_RULES.exitTax, basis: "current" }, iia: { ...TAX_RULES.iia, basis: "current" } };
  it("while a rate rests on the Bill the regimes, the marks and the sentences say so; once every basis is current they say the Act's", () => {
    expect(billRules()).toEqual(["cgt", "exitTax", "iia"]);
    expect(billRules(enacted)).toEqual([]);
    expect(statusSentence()).toMatch(/A Bill is not an Act/);
    expect(statusSentence(enacted)).toMatch(/The Finance Act is law for every rate on this page \(checked on 2026-12-20\)/);
    const before = taxThreeWays(DEFAULT_INPUT);
    expect([before.shares.basis, before.etf.basis, before.iia.basis]).toEqual(["Bill", "Bill", "Bill"]);
    expect(before.iia.name).toMatch(/if enacted/);
    expect(before.etf.notes[0]).toMatch(/35% as announced/);
    const after = taxThreeWays(DEFAULT_INPUT, enacted);
    expect([after.shares.basis, after.etf.basis, after.iia.basis]).toEqual(["current", "current", "current"]);
    expect(after.iia.name).not.toMatch(/if enacted/);
    expect(after.etf.notes[0]).not.toMatch(/as announced/);
    expect(after.shares.tax).toBe(536.3);   // the arithmetic is the same either way
  });
  it("the rendered page: six Bill marks and 'not yet law' before; none after, and the lede says the account opens", () => {
    const html0 = costsPage(worksheet(DEFAULT_INPUT), null);
    expect(html0.match(/class="basis Bill"/g)).toHaveLength(6);
    expect(html0).toMatch(/the Bill it cites is not yet law/);
    expect(html0).toMatch(/would open on 1 July 2027/);
    const html1 = costsPage(worksheet(DEFAULT_INPUT, enacted), null);
    expect(html1.match(/class="basis Bill"/g)).toBeNull();
    expect(html1.match(/class="basis current"/g)).toHaveLength(8);
    expect(html1).toMatch(/the rates are as enacted on the date shown/);
    expect(html1).toMatch(/opens on 1 July 2027/);
    expect(html1).toMatch(/The Finance Act is law for every rate on this page/);
    expect(html1).not.toMatch(/if enacted/);
  });
});

describe("parseCostInput", () => {
  it("takes the form's strings with € and % and commas, defaults the blanks, and bounds every field", () => {
    expect(parseCostInput({})).toEqual(DEFAULT_INPUT);
    expect(parseCostInput({ invested: "€12,500", gainPct: "10%", years: "2.4", market: "ie", exemptionAvailable: "0" })).toMatchObject({ invested: 12500, gainPct: 10, years: 2, market: "IE", exemptionAvailable: false });
    expect(() => parseCostInput({ invested: "50" })).toThrow(CostInputError);
    expect(() => parseCostInput({ years: "41" })).toThrow(/years must be a number from 0 to 40/);
    expect(() => parseCostInput({ market: "DE" })).toThrow(/market must be US, IE or UK/);
    expect(() => parseCostInput({ gainPct: "abc" })).toThrow(CostInputError);
  });
});
