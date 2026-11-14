/**
 * Week 11: the real world — the total-cost-of-ownership worksheet (decision
 * 22 (f)). Deterministic: no model, no provider, no student data. The same
 * paper trade priced in euro the way an Irish student would pay for it:
 *
 *   - the TRADE's costs — a published broker schedule beside the course's
 *     own model (week 8: $2 + 0.25%), the currency conversion, the spread
 *     (week 2's toll bridge), the exchange's connectivity fee;
 *   - the HOLDING's costs — a fund's annual charge (TER), the withholding on
 *     a US dividend;
 *   - the TAX on the same gain three ways — shares outside any wrapper
 *     (capital gains tax above the annual exemption), a fund or ETF outside
 *     (the exit tax, no exemption, a deemed disposal every eight years), and
 *     the Individual Investment Account the Finance (No. 2) Bill 2026 would
 *     open on 1 July 2027 (nothing below a €50,000 average balance, 1% a
 *     year on the excess).
 *
 * Every rate is in TAX_RULES with its source and date. The Bill is not yet
 * law when this ships (12 Nov 2026): the page says so on every line that
 * depends on it, and the figures are to be re-checked against the Finance
 * Act and Revenue's guidance before the lesson. Education, not advice: the
 * worksheet shows what the rules would charge on a paper trade; it says
 * nothing about what anyone should buy, hold or wrap.
 */

export type Basis = "Bill" | "current";
export type TaxRules = typeof TAX_RULES;

export const TAX_RULES = {
  checkedOn: "2026-11-12",
  status: "Budget 2027 was announced on 6 Oct 2026 and the Finance (No. 2) Bill 2026 published on 19 Oct 2026. A Bill is not an Act: the measures below marked 'Bill' are as announced and drafted, expected to be enacted in December 2026 and, for the investment account, to start only on a commencement order. Re-check every figure against the Finance Act and Revenue's guidance before relying on it.",
  cgt: {
    ratePct: 31, previousPct: 33, from: "2026-10-07", exemption: 1270,
    note: "Capital gains tax on shares: 31% for disposals on or after 7 October 2026 (33% before — Budget 2027, by financial resolution on Budget night; confirmed in the Bill). The first €1,270 of a person's gains in a year is exempt. A loss on shares offsets a gain on shares and carries forward (the four-week rule limits a loss on shares bought back within four weeks). Pay by 15 December for disposals from January to November, by 31 January for December's; the return (CG1, or Form 11 / Form 12 for self-assessed and PAYE filers) by 31 October of the following year.",
    basis: "Bill" as Basis,
  },
  exitTax: {
    ratePct: 38, ratePctFrom2027: 35, from2027: "2027-01-01", previousPct: 41, deemedDisposalYears: 8,
    note: "Irish and equivalent EU/EEA/OECD funds and ETFs (UCITS): the exit tax on a gain or a distribution — 41% to the end of 2025, 38% from 1 January 2026 (Budget 2026), 35% from 1 January 2027 as announced in Budget 2027 and drafted in the Bill. No annual exemption; a loss on one fund cannot be set against a gain on another or on shares; a deemed disposal every eight years taxes the gain as if sold (credited against the tax on the real sale). An Irish fund deducts the tax itself; an ETF held through a clearing system and an equivalent EU fund are self-assessed on Form 11 / Form 12. A US-domiciled ETF is a different case — generally not available to EU retail investors since 2018 (PRIIPs) — and outside this worksheet.",
    basis: "Bill" as Basis,
  },
  iia: {
    opens: "2027-07-01", contributionLimit: 12000, threshold: 50000, chargePct: 1,
    note: "The Individual Investment Account (the Bill's name; 'Personal Investment Account' in the Budget speech): from 1 July 2027 on a commencement order; 18 or over, Irish-resident, one account; contributions of up to €12,000 a year; inside it no capital gains tax, no dividend withholding tax, no exit tax and no deemed disposal; instead 1% a year on the average daily value above €50,000, calculated by the provider each 31 December and deducted from the account by 14 April (a flat charge on value, payable in a losing year too). Eligible: listed shares and bonds, UCITS funds and ETFs, insurance products. Whether a share listed only in the US qualifies, and how US withholding is treated inside, are for the Act and Revenue's guidance — the Bill's text as published does not settle them.",
    basis: "Bill" as Basis,
  },
  stampDuty: {
    irishPct: 1, ukPct: 0.5, usPct: 0,
    note: "Stamp duty on buying shares: 1% for shares in Irish-registered companies, 0.5% for UK shares (stamp duty reserve tax), none on US shares or on Irish-domiciled ETFs. Paid at purchase, not on sale.",
    basis: "current" as Basis,
  },
  dividends: {
    usTreatyPct: 15, usDefaultPct: 30, irishDwtPct: 25,
    note: "A US dividend is withheld at 30% by default and at 15% under the Ireland–US treaty when the broker holds your W-8BEN (the first dividend statement shows which); it is then income in Ireland, taxed at your marginal rate with USC and PRSI, with credit for the 15% withheld. An Irish company's dividend has 25% dividend withholding tax taken, credited against the income tax due. Not computed here: it depends on the person.",
    basis: "current" as Basis,
  },
};

/** Which rules still rest on the Bill — empty once every basis says "current", and the page's sentences follow (review F3). */
export function billRules(rules: TaxRules = TAX_RULES): string[] {
  return (["cgt", "exitTax", "iia"] as const).filter((k) => rules[k].basis === "Bill");
}
/** The status sentence the page prints: the Bill's while any rule rests on it, the Act's once none does. */
export function statusSentence(rules: TaxRules = TAX_RULES): string {
  return billRules(rules).length ? rules.status : `The Finance Act is law for every rate on this page (checked on ${rules.checkedOn}); the figures are as enacted and as Revenue's guidance reads them. Re-check them each Budget.`;
}

/** A published Irish retail schedule beside the course's own model — figures as published in autumn 2026; confirm on the broker's site. */
export const BROKER = {
  name: "a published broker schedule (DEGIRO Ireland, as published autumn 2026 — confirm on the broker's site before relying on it)",
  usShare: 2.00,          // €1 commission + €1 handling, per order
  irishShare: 2.00,       // Euronext Dublin, per order
  coreEtf: 1.00,          // Core Selection ETFs on Tradegate: €1 handling, no commission
  otherEtf: 3.00,         // €2 + €1 handling
  fxPct: 0.25,            // Auto FX on a non-euro trade, each way
  connectivityPerExchangePerYear: 2.50,  // capped at 0.25% of the account's value
  scripDividend: 7.50,
} as const;

/** Week 8's model of a cheap broker plus the conversion an Irish student would pay. */
export const COURSE_MODEL = { fixed: 2, pct: 0.25 } as const;

export type Market = "US" | "IE" | "UK";
export type CostInput = {
  invested: number;        // euro put into the trade
  gainPct: number;         // the gain over the holding, percent (negative = a loss)
  years: number;           // holding period, whole years (0 = sold within 2026)
  dividendYieldPct: number;// a share's dividend yield, percent a year (0 for an accumulating ETF)
  terPct: number;          // a fund's annual charge, percent (0 for a share)
  spreadPct: number;       // the quote's spread, percent of the price (week 2's toll)
  market: Market;          // which stamp duty applies to the share
  exemptionAvailable: boolean; // the €1,270 CGT exemption unused this year
};

export const DEFAULT_INPUT: CostInput = { invested: 10000, gainPct: 30, years: 3, dividendYieldPct: 1, terPct: 0.2, spreadPct: 0.1, market: "US", exemptionAvailable: true };

const r2 = (v: number) => Math.round(v * 100) / 100;

export class CostInputError extends Error {}

/** Bound and parse the form's fields; the messages are the ones the page shows. */
export function parseCostInput(q: Record<string, string | undefined>): CostInput {
  const num = (k: keyof CostInput, lo: number, hi: number, dflt: number) => {
    const raw = q[k];
    if (raw === undefined || raw === "") return dflt;
    const n = Number(String(raw).replace(/[€$,\s%]/g, ""));
    if (!Number.isFinite(n) || n < lo || n > hi) throw new CostInputError(`${k} must be a number from ${lo} to ${hi}.`);
    return n;
  };
  const market = (q.market ?? DEFAULT_INPUT.market).toUpperCase();
  if (!["US", "IE", "UK"].includes(market)) throw new CostInputError("market must be US, IE or UK.");
  return {
    invested: num("invested", 100, 1_000_000, DEFAULT_INPUT.invested),
    gainPct: num("gainPct", -100, 1000, DEFAULT_INPUT.gainPct),
    years: Math.round(num("years", 0, 40, DEFAULT_INPUT.years)),
    dividendYieldPct: num("dividendYieldPct", 0, 20, DEFAULT_INPUT.dividendYieldPct),
    terPct: num("terPct", 0, 5, DEFAULT_INPUT.terPct),
    spreadPct: num("spreadPct", 0, 10, DEFAULT_INPUT.spreadPct),
    market: market as Market,
    exemptionAvailable: q.exemptionAvailable === undefined ? DEFAULT_INPUT.exemptionAvailable : q.exemptionAvailable !== "0" && q.exemptionAvailable !== "false" && q.exemptionAvailable !== "no",
  };
}

export type Line = { label: string; amount: number; note: string };
export type TradeCosts = { lines: Line[]; total: number };
export type Regime = {
  name: string;
  gain: number;
  exemption: number;
  taxable: number;
  ratePct: number;
  tax: number;
  net: number;             // the gain after tax
  notes: string[];
  basis: "current" | "Bill";
};
export type Worksheet = {
  input: CostInput;
  saleValue: number;
  gain: number;
  trade: { share: TradeCosts; etf: TradeCosts; course: TradeCosts };
  holding: { share: TradeCosts; etf: TradeCosts };
  tax: { shares: Regime; etf: Regime; iia: Regime };
  reading: string[];
  rules: TaxRules;
  broker: typeof BROKER;
};

/** The exit-tax rate for a sale `years` from 2026: 38% within 2026, 35% from 1 Jan 2027 (as announced). */
export function exitTaxRateFor(years: number, rules: TaxRules = TAX_RULES): number {
  return years <= 0 ? rules.exitTax.ratePct : rules.exitTax.ratePctFrom2027;
}

/** The trade's costs, both legs, for a US share bought through a euro account. */
export function shareTradeCosts(input: CostInput): TradeCosts {
  const sale = input.invested * (1 + input.gainPct / 100);
  const stampPct = input.market === "IE" ? TAX_RULES.stampDuty.irishPct : input.market === "UK" ? TAX_RULES.stampDuty.ukPct : TAX_RULES.stampDuty.usPct;
  const foreign = input.market !== "IE";
  const perOrder = input.market === "IE" ? BROKER.irishShare : BROKER.usShare;
  const lines: Line[] = [
    { label: "Commission and handling, buy", amount: r2(perOrder), note: `€${perOrder.toFixed(2)} an order on the published schedule` },
    { label: "Commission and handling, sell", amount: r2(perOrder), note: `€${perOrder.toFixed(2)} an order` },
  ];
  if (foreign) {
    lines.push({ label: "Currency conversion, buy", amount: r2(input.invested * BROKER.fxPct / 100), note: `${BROKER.fxPct}% of €${input.invested.toLocaleString("en-IE")} — the euro account buys dollars (or sterling)` });
    lines.push({ label: "Currency conversion, sell", amount: r2(sale * BROKER.fxPct / 100), note: `${BROKER.fxPct}% of the sale value, back to euro` });
  }
  lines.push({ label: "The spread (the toll)", amount: r2(input.invested * input.spreadPct / 100), note: `${input.spreadPct}% of the value: the gap between the buying price and the selling price at the same moment — you pay it to cross` });
  if (stampPct > 0) lines.push({ label: `Stamp duty (${input.market === "IE" ? "Irish" : "UK"} shares)`, amount: r2(input.invested * stampPct / 100), note: `${stampPct}% on the purchase; none on US shares` });
  if (foreign) lines.push({ label: "Exchange connectivity", amount: r2(BROKER.connectivityPerExchangePerYear * Math.max(1, input.years)), note: `€${BROKER.connectivityPerExchangePerYear.toFixed(2)} a year for a foreign exchange, ${Math.max(1, input.years)} year${Math.max(1, input.years) === 1 ? "" : "s"}` });
  return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** The trade's costs for a euro-listed UCITS ETF in a broker's core selection (no conversion, no stamp duty). */
export function etfTradeCosts(input: CostInput): TradeCosts {
  const lines: Line[] = [
    { label: "Handling, buy", amount: BROKER.coreEtf, note: `€${BROKER.coreEtf.toFixed(2)} an order for a core-selection ETF on a euro venue; €${BROKER.otherEtf.toFixed(2)} outside the selection` },
    { label: "Handling, sell", amount: BROKER.coreEtf, note: `€${BROKER.coreEtf.toFixed(2)} an order` },
    { label: "The spread", amount: r2(input.invested * input.spreadPct / 100), note: `${input.spreadPct}% of the value` },
  ];
  return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** Week 8's model, for the comparison the lesson draws: $2 + 0.25% a trade, both legs. */
export function courseModelCosts(input: CostInput): TradeCosts {
  const sale = input.invested * (1 + input.gainPct / 100);
  const lines: Line[] = [
    { label: "Open (the course's model)", amount: r2(COURSE_MODEL.fixed + input.invested * COURSE_MODEL.pct / 100), note: `$${COURSE_MODEL.fixed} + ${COURSE_MODEL.pct}% — the ticket's cost line` },
    { label: "Close (the course's model)", amount: r2(COURSE_MODEL.fixed + sale * COURSE_MODEL.pct / 100), note: `$${COURSE_MODEL.fixed} + ${COURSE_MODEL.pct}%` },
  ];
  return { lines, total: r2(lines.reduce((s, l) => s + l.amount, 0)) };
}

/** The holding's costs over the years: a share's dividend withholding; a fund's annual charge. */
export function holdingCosts(input: CostInput): { share: TradeCosts; etf: TradeCosts } {
  const years = Math.max(0, input.years);
  const avg = input.invested * (1 + input.gainPct / 200);   // the average value over a straight-line path
  const dividends = r2(avg * input.dividendYieldPct / 100 * years);
  const withheld = r2(dividends * (input.market === "US" ? TAX_RULES.dividends.usTreatyPct : input.market === "IE" ? TAX_RULES.dividends.irishDwtPct : 0) / 100);
  const share: Line[] = dividends > 0
    ? [
      { label: "Dividends received, gross", amount: dividends, note: `${input.dividendYieldPct}% a year on the average value over ${years} year${years === 1 ? "" : "s"} — income, not cost` },
      { label: input.market === "US" ? "Withheld at source (US, treaty rate)" : input.market === "IE" ? "Dividend withholding tax (Irish)" : "Withheld at source", amount: withheld, note: input.market === "US" ? `${TAX_RULES.dividends.usTreatyPct}% with a W-8BEN on file (${TAX_RULES.dividends.usDefaultPct}% without); then income tax at your rate, with credit for this` : input.market === "IE" ? `${TAX_RULES.dividends.irishDwtPct}%, credited against the income tax due` : "none for UK shares; then income tax at your rate" },
    ]
    : [{ label: "Dividends", amount: 0, note: "none assumed" }];
  const ter = r2(avg * input.terPct / 100 * years);
  const etf: Line[] = [{ label: "Annual charge (TER)", amount: ter, note: `${input.terPct}% a year of the average value over ${years} year${years === 1 ? "" : "s"}, taken inside the fund — the price you see is after it` }];
  return { share: { lines: share, total: withheld }, etf: { lines: etf, total: ter } };
}

/** The same gain taxed three ways. */
export function taxThreeWays(input: CostInput, rules: TaxRules = TAX_RULES): { shares: Regime; etf: Regime; iia: Regime } {
  const gain = r2(input.invested * input.gainPct / 100);
  // Shares: CGT at 31% on the gain above the exemption; a loss is a loss carried forward, no tax.
  const exemption = gain > 0 && input.exemptionAvailable ? Math.min(rules.cgt.exemption, gain) : 0;
  const taxableShares = Math.max(0, gain - exemption);
  const cgt = r2(taxableShares * rules.cgt.ratePct / 100);
  const shares: Regime = {
    name: "Shares, outside any account", gain, exemption, taxable: r2(taxableShares), ratePct: rules.cgt.ratePct, tax: cgt, net: r2(gain - cgt), basis: rules.cgt.basis,
    notes: [
      gain > 0 ? `${rules.cgt.ratePct}% of €${taxableShares.toLocaleString("en-IE", { maximumFractionDigits: 2 })} (the gain less the €${rules.cgt.exemption.toLocaleString("en-IE")} exemption${input.exemptionAvailable ? "" : ", already used this year"})` : "a loss: no tax, and the loss carries forward against future gains on shares",
      "paid by 15 December (January–November disposals) or 31 January (December's); the return by 31 October of the following year",
    ],
  };
  // ETF: the exit tax at the year's rate, no exemption; a loss is simply unrelievable.
  const rate = exitTaxRateFor(input.years, rules);
  const exit = r2(Math.max(0, gain) * rate / 100);
  const deemed = input.years >= rules.exitTax.deemedDisposalYears;
  const etf: Regime = {
    name: "A UCITS fund or ETF, outside any account", gain, exemption: 0, taxable: r2(Math.max(0, gain)), ratePct: rate, tax: exit, net: r2(gain - exit), basis: rules.exitTax.basis,
    notes: [
      gain > 0 ? `${rate}% of the whole gain (${input.years <= 0 ? "a sale in 2026" : `a sale from 1 January 2027: ${rules.exitTax.ratePctFrom2027}%${rules.exitTax.basis === "Bill" ? " as announced" : ""}; ${rules.exitTax.ratePct}% if sold in 2026`}); no exemption` : "a loss: no tax, and no relief — a fund's loss cannot be set against any gain",
      deemed ? `held ${input.years} years: a deemed disposal at year ${rules.exitTax.deemedDisposalYears} taxes the gain to that date as if sold (credited at the real sale)` : `no deemed disposal inside ${rules.exitTax.deemedDisposalYears} years`,
      "an ETF is self-assessed on Form 11 / Form 12 (an Irish fund deducts the tax itself); the broker reports nothing to Revenue for you",
    ],
  };
  // IIA: 1% a year on the average value above €50,000, nothing else — on a straight-line path from the cost to the sale value.
  const years = Math.max(1, input.years);
  let charge = 0;
  const excesses: number[] = [];
  for (let k = 0; k < years; k++) {
    const avg = input.invested * (1 + (input.gainPct / 100) * ((k + 0.5) / years));
    const excess = Math.max(0, avg - rules.iia.threshold);
    excesses.push(excess);
    charge += excess * rules.iia.chargePct / 100;
  }
  charge = r2(charge);
  const iia: Regime = {
    name: `Inside the Individual Investment Account (from 1 July 2027${rules.iia.basis === "Bill" ? ", if enacted" : ""})`, gain, exemption: 0, taxable: r2(excesses.reduce((s, e) => s + e, 0) / years), ratePct: rules.iia.chargePct, tax: charge, net: r2(gain - charge), basis: rules.iia.basis,
    notes: [
      charge > 0 ? `${rules.iia.chargePct}% a year of the average value above €${rules.iia.threshold.toLocaleString("en-IE")} — a charge on value, payable in a losing year too` : `the average value never passes €${rules.iia.threshold.toLocaleString("en-IE")}: no charge, no capital gains tax, no exit tax, no deemed disposal`,
      `contributions of at most €${rules.iia.contributionLimit.toLocaleString("en-IE")} a year: a €${input.invested.toLocaleString("en-IE")} trade ${input.invested <= rules.iia.contributionLimit ? "fits in one year's allowance" : `needs ${Math.ceil(input.invested / rules.iia.contributionLimit)} years of contributions — this column counts the charge as if the whole sum were inside from the first day, which the allowance does not permit: a simplification, not a plan`}`,
      `a simplification: the charge is counted from the trade's first year as if the account were open then — it opens on 1 July 2027${rules.iia.basis === "Bill" ? " if enacted" : ""}; the provider calculates and deducts the charge; whether a US-listed share is an eligible asset is for the Act and Revenue's guidance`,
    ],
  };
  return { shares, etf, iia };
}

export function worksheet(input: CostInput, rules: TaxRules = TAX_RULES): Worksheet {
  const saleValue = r2(input.invested * (1 + input.gainPct / 100));
  const gain = r2(saleValue - input.invested);
  const trade = { share: shareTradeCosts(input), etf: etfTradeCosts(input), course: courseModelCosts(input) };
  const holding = holdingCosts(input);
  const tax = taxThreeWays(input, rules);
  const eur = (v: number) => `€${v.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const usd = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // The ETF's net takes the gain as the fund's price gain, which is after its annual charge — the TER is shown, not
  // deducted again (review N7); the share's dividends are income taxed at the person's rate and are set aside here.
  const reading: string[] = [
    `€${input.invested.toLocaleString("en-IE")} into a ${input.market === "US" ? "US" : input.market === "IE" ? "Irish" : "UK"} share for ${input.years} year${input.years === 1 ? "" : "s"}, sold with a ${input.gainPct >= 0 ? "gain" : "loss"} of ${input.gainPct}%: ${eur(gain)}.`,
    `The trade costs ${eur(trade.share.total)} to open and close on the published schedule (${trade.share.lines.map((l) => `${l.label.toLowerCase()} ${eur(l.amount)}`).join(", ")}); the course's own model ($2 + 0.25% a trade, in the paper account's dollars) would say ${usd(trade.course.total)} — close enough that the paper account's costs were real costs.`,
    `The same money in a euro-listed ETF: ${eur(trade.etf.total)} to trade, and ${eur(holding.etf.total)} of annual charge over the holding, taken inside the price — if the ${input.gainPct}% is the fund's price gain, that charge is already paid.`,
    `The tax on the same ${eur(gain)}: as shares, ${eur(tax.shares.tax)} (${tax.shares.notes[0]}); as a fund or ETF, ${eur(tax.etf.tax)} (${tax.etf.notes[0]}); inside the investment account, ${eur(tax.iia.tax)} (${tax.iia.notes[0]}).`,
    `Net of trade costs and tax, the ${eur(gain)} becomes ${eur(tax.shares.net - trade.share.total)} as shares, ${eur(tax.etf.net - trade.etf.total)} as an ETF (its annual charge already in the price), ${eur(tax.iia.net - trade.share.total)} inside the account (traded as shares) — the share's dividends, ${eur(holding.share.lines[0].amount)} gross over the holding, are income taxed at your own rate and are left out of all three. The order of the three can change with the size of the gain, the years, and whether the exemption is free — change the numbers and watch it.`,
  ];
  return { input, saleValue, gain, trade, holding, tax, reading, rules, broker: BROKER };
}
