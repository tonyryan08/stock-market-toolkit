/**
 * Week 6: numbers into narrative — the FACT SHEET behind "explain this stock".
 *
 * Pure functions, tested. The sheet is built from the same inputs as the two
 * screens, so it cannot disagree with them. Everything downstream is bound
 * by it: the AI narrative (narrative.ts) may say only what is on the sheet,
 * and every sentence it writes must point at a fact id. The plain template
 * narrative here is the fallback when no AI key is configured, when the API
 * fails, when the daily cap is spent, or when the AI's answer fails its
 * grounding checks.
 *
 * Three layers, each traceable:
 *   facts  — numbered statements with the number in them (F1, F2, …)
 *   kinds  — what KIND of ✗ this company has (the eight meanings of a fail,
 *            from the first live run; docs/lessons/week-05-reading-the-screen.md)
 *   bars   — "what would have to change", in numbers: where each failed test's
 *            bar sits at today's figures. A bar is arithmetic on a threshold,
 *            never a valuation or a target. Education, not advice.
 */

import {
  T, E, requiredGrowthPct, screenCompany, screenEnterprising, CRITERIA, ENTERPRISING,
  type ScreenInput, type ScreenResult, type EnterprisingResult, type Outcome,
} from "./graham";
import { computeRatios } from "./ratios";

export type Fact = { id: string; text: string; via: "books" | "screen" | "arithmetic" };

export type KindId =
  | "price_only" | "cheap_for_a_reason" | "new_dividend" | "never_paid" | "dividend_gap"
  | "loss_year" | "windfall_base" | "flat_earnings" | "thin_working_capital" | "debt_heavy"
  | "negative_book" | "expensive_vs_tangible" | "financial" | "too_small" | "incomplete";

export type Kind = {
  id: KindId;
  label: string;
  /** Plain words, for adults who are new to this. */
  meaning: string;
  /** Where Graham says it (course copy, 2003 revised edition). */
  graham: string;
  /** Fact ids that support the classification. */
  facts: string[];
};

export type Bar = {
  id: string;            // B1, B2, … (also listed among facts so the AI can cite them)
  screen: "defensive" | "enterprising";
  test: string;          // e.g. "Test 6 · P/E ≤ 15"
  moves: "price" | "company";
  today: string;
  bar: string;
};

export type Mark = { n: number; short: string; title: string; outcome: Outcome; detail: string };

export type FactSheet = {
  symbol: string;
  name: string | null;
  sector: string | null;
  asOf: { priceDate: string | null; close: number | null; fiscalYear: string | null; today: string };
  defensive: { verdict: ScreenResult["verdict"]; passes: number; applicable: number; marks: Mark[] };
  enterprising: { verdict: EnterprisingResult["verdict"]; passes: number; applicable: number; marks: Mark[] };
  facts: Fact[];
  kinds: Kind[];
  bars: Bar[];
  /** Deterministic fingerprint of the facts — the cache key for a narrative. */
  hash: string;
};

export type Paragraph = { text: string; facts: string[] };
export type Narrative = {
  paragraphs: Paragraph[];
  question: string;
  source: "template" | "claude";
  model?: string;
};

const ok = (v: number | null | undefined): v is number => typeof v === "number" && Number.isFinite(v);
const r2 = (v: number) => Math.round(v * 100) / 100;
const r1 = (v: number) => Math.round(v * 10) / 10;
export const money = (v: number) => { const a = Math.abs(v); return `${v < 0 ? "−" : ""}$${a >= 1e9 ? `${r1(a / 1e9)}bn` : `${Math.round(a / 1e6)}m`}`; };
const px = (v: number) => { const a = Math.abs(v); return `${v < 0 ? "−" : ""}$${a >= 100 ? a.toFixed(0) : a.toFixed(2)}`; };

/** FNV-1a, 32-bit, hex. Deterministic, dependency-free, good enough for a cache key. */
export function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

const marksOf = (r: ScreenResult | EnterprisingResult, defs: { n: number; short: string; title: string; id: string }[]): Mark[] =>
  defs.map((d) => {
    const x = (r.results as { id: string; outcome: Outcome; detail: string }[]).find((y) => y.id === d.id)!;
    return { n: d.n, short: d.short, title: d.title, outcome: x.outcome, detail: x.detail };
  });

export function buildFactSheet(input: ScreenInput, priceDate: string | null = null): FactSheet {
  const d = screenCompany(input);
  const e = screenEnterprising(input);
  const ratios = computeRatios(input.years, input.lastClose);
  const years = input.years;
  const latest = years[0] ?? null;
  const oldest = years[years.length - 1] ?? null;
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const name = input.name ?? input.symbol;

  const facts: Fact[] = [];
  let n = 0;
  const add = (text: string, via: Fact["via"]): string => { const id = `F${++n}`; facts.push({ id, text, via }); return id; };
  const dm = (id: string) => d.results.find((x) => x.id === id)!;
  const em = (id: string) => e.results.find((x) => x.id === id)!;

  // --- identity and dates ---
  const fId = add(`${name} (${input.symbol})${input.sector ? ` is classed in the ${input.sector} sector` : "'s sector is not recorded"}.`, "books");
  const fPrice = ok(input.lastClose)
    ? add(`Last close ${px(input.lastClose)}${priceDate ? ` on ${priceDate}` : ""}.`, "books")
    : add("No cached price is held.", "books");
  if (years.length) add(`Accounts held for ${years.length} fiscal year${years.length === 1 ? "" : "s"}, FY${oldest!.fiscalYear} to FY${latest!.fiscalYear}.`, "books")
  else add("No accounts are held yet.", "books");

  // --- the books, as numbers ---
  const fRev = latest && ok(latest.revenue) ? add(`Revenue in FY${latest.fiscalYear}: ${money(latest.revenue)}.`, "books") : null;
  const epsLine = years.length
    ? years.slice().reverse().map((y) => `FY${y.fiscalYear} ${ok(y.epsDiluted) ? r2(y.epsDiluted) : "—"}`).join(", ")
    : null;
  const fEps = epsLine ? add(`Diluted EPS by year: ${epsLine}.`, "books") : null;
  const niLine = years.length && years.some((y) => ok(y.netIncome))
    ? years.slice().reverse().map((y) => `FY${y.fiscalYear} ${ok(y.netIncome) ? money(y.netIncome) : "—"}`).join(", ")
    : null;
  if (niLine) add(`Net income by year: ${niLine}.`, "books");

  let fStrength: string | null = null;
  if (latest && ok(latest.currentAssets) && ok(latest.currentLiabilities)) {
    const wc = latest.currentAssets - latest.currentLiabilities;
    const ltd = ok(latest.longTermDebt) ? latest.longTermDebt : null;
    const dPart = ltd === null
      ? "long-term debt not reported"
      : wc > 0
        ? `long-term debt ${money(ltd)}, ${Math.round((ltd / wc) * 100)}% of working capital`
        : `long-term debt ${money(ltd)} against negative working capital`;
    const debtReading = latest.readings && /debt/i.test(latest.readings) ? ` (reading: ${latest.readings.split("; ").filter((r) => /debt/i.test(r)).join("; ")})` : "";
    fStrength = add(
      `Current assets ${money(latest.currentAssets)} against current liabilities ${money(latest.currentLiabilities)}: current ratio ${ratios.currentRatio ?? "—"}, working capital ${money(wc)}; ${dPart}${debtReading}.`,
      "books",
    );
  } else if (latest) {
    fStrength = add("Current assets and liabilities are not reported for the latest year.", "books");
  }

  let fBook: string | null = null;
  if (latest && ok(latest.equity)) {
    const gi = ok(latest.goodwillAndIntangibles) ? latest.goodwillAndIntangibles : null;
    fBook = add(
      `Shareholders' equity ${money(latest.equity)}${ok(latest.sharesDiluted) ? ` over ${r1(latest.sharesDiluted / 1e6)}m diluted shares: book value per share ${ratios.bookValuePerShare === null ? "—" : px(ratios.bookValuePerShare)}` : ""}` +
      (gi !== null ? `; goodwill and intangibles ${money(gi)}${latest.readings && /goodwill/i.test(latest.readings) ? " (reading: no goodwill/intangibles line reported → 0)" : ""}, so tangible book per share ${ratios.tangibleBookPerShare === null ? "—" : px(ratios.tangibleBookPerShare)}.` : "; goodwill and intangibles not yet held."),
      "books",
    );
  }

  const fPe = ok(input.lastClose) && (ratios.pe !== null || ratios.pe3 !== null)
    ? add(`P/E on the latest year's EPS: ${ratios.pe ?? "no positive earnings"}; on the three-year average EPS (${ratios.epsAvg3 ?? "—"}): ${ratios.pe3 ?? "no positive average"}.`, "arithmetic")
    : null;
  const fPb = ok(input.lastClose) && (ratios.pb !== null || ratios.pTangibleBook !== null || (ratios.bookValuePerShare !== null && ratios.bookValuePerShare <= 0))
    ? add(
        ratios.bookValuePerShare !== null && ratios.bookValuePerShare <= 0
          ? `Book value per share is negative (${px(ratios.bookValuePerShare)}), so price-to-book has no meaning.`
          : `Price-to-book ${ratios.pb ?? "—"}; P/E × P/B ${ratios.peTimesPb ?? "—"}; price to tangible book ${ratios.pTangibleBook ?? "not yet held"}.`,
        "arithmetic",
      )
    : null;

  const perYear = input.dividendsPerYear;
  const paidYears = Object.keys(perYear).filter((y) => perYear[y] > 0).sort();
  const divLine = paidYears.length
    ? `Dividends per share by calendar year: ${paidYears.slice(-6).map((y) => `${y} ${perYear[y].toFixed(2)}`).join(", ")}${paidYears.length > 6 ? ` (record from ${paidYears[0]})` : ""}; ${d.figures.dividendYears} consecutive year${d.figures.dividendYears === 1 ? "" : "s"} counted; last ex-date ${input.lastExDate ?? "—"}.`
    : "No dividend appears in the record.";
  const fDiv = add(divLine, "books");

  const fGrowth = d.figures.epsGrowthPct !== null
    ? add(`EPS growth across the window (two-year averages, early to late): ${d.figures.epsGrowthPct >= 0 ? "+" : ""}${d.figures.epsGrowthPct}%; the defensive bar is +${requiredGrowthPct}%.`, "arithmetic")
    : years.length >= 4 ? add("EPS growth cannot be measured: the early years were not profitable.", "arithmetic") : null;
  if (e.figures.epsLatest !== null && e.figures.epsOldest !== null) add(`Latest EPS ${r2(e.figures.epsLatest)} against ${r2(e.figures.epsOldest)} four fiscal years earlier.`, "arithmetic");

  // --- the two verdicts ---
  const list = (ms: Mark[], o: Outcome) => ms.filter((m) => m.outcome === o).map((m) => `${m.n} ${m.short}`).join(", ") || "none";
  const dMarks = marksOf(d, CRITERIA);
  const eMarks = marksOf(e, ENTERPRISING);
  const vLabel: Record<string, string> = { survivor: "a survivor", candidate: "a candidate", near_miss: "a near miss", fails: "fails", insufficient: "incomplete" };
  const fDef = add(
    `Defensive screen (ch. 14): ${vLabel[d.verdict]}, ${d.passes}/${d.applicable}. Passes: ${list(dMarks, "pass")}. Fails: ${list(dMarks, "fail")}. Not applied: ${list(dMarks, "skip")}. Missing data: ${list(dMarks, "na")}.`,
    "screen",
  );
  const fEnt = add(
    `Enterprising screen (ch. 15): ${vLabel[e.verdict]}, ${e.passes}/${e.applicable}. Passes: ${list(eMarks, "pass")}. Fails: ${list(eMarks, "fail")}. Not applied: ${list(eMarks, "skip")}. Missing data: ${list(eMarks, "na")}.`,
    "screen",
  );
  // one fact per fail or skip, with the screen's own detail line
  const markFacts = new Map<string, string>();
  for (const m of dMarks) if (m.outcome === "fail" || m.outcome === "skip" || m.outcome === "na")
    markFacts.set(`d${m.n}`, add(`Defensive test ${m.n} (${m.title}): ${m.outcome === "fail" ? "fail" : m.outcome === "skip" ? "not applied" : "no data"} — ${m.detail}`, "screen"));
  for (const m of eMarks) if (m.outcome === "fail" || m.outcome === "skip" || m.outcome === "na")
    markFacts.set(`e${m.n}`, add(`Enterprising test ${m.n} (${m.title}): ${m.outcome === "fail" ? "fail" : m.outcome === "skip" ? "not applied" : "no data"} — ${m.detail}`, "screen"));

  // --- bars: what would have to change, in numbers ---
  const bars: Bar[] = [];
  let b = 0;
  const bar = (screen: Bar["screen"], test: string, moves: Bar["moves"], today: string, barText: string) => {
    const id = `B${++b}`;
    bars.push({ id, screen, test, moves, today, bar: barText });
    facts.push({ id, text: `${screen === "defensive" ? "Defensive" : "Enterprising"} ${test}: ${moves === "price" ? "passes at a price" : "passes when"} ${barText} (today: ${today}).`, via: "arithmetic" });
  };
  const close = ok(input.lastClose) ? input.lastClose : null;
  if (dm("size").outcome === "fail" && latest && ok(latest.revenue))
    bar("defensive", "test 1 · size", "company", money(latest.revenue), `revenue is at least ${money(T.minRevenue)}`);
  if (dm("condition").outcome === "fail" && ratios.currentRatio !== null)
    bar("defensive", "test 2 · strength", "company", `current ratio ${ratios.currentRatio}, debt ${d.figures.ltDebtToWc === null ? "above the cushion" : Math.round(d.figures.ltDebtToWc * 100) + "% of working capital"}`,
      `the current ratio is at least ${T.minCurrentRatio} and long-term debt is no more than working capital`);
  if (dm("stability").outcome === "fail")
    bar("defensive", "test 3 · stability", "company", `${d.figures.positiveEpsYears} of ${years.length} years profitable`, `every one of the last ${T.earningsYears} years shows a profit`);
  if (dm("dividends").outcome === "fail")
    bar("defensive", "test 4 · dividends", "company", `${d.figures.dividendYears} consecutive years`, `${T.dividendYears} consecutive years have been paid with no gap over 15 months`);
  if (dm("growth").outcome === "fail" && d.figures.epsGrowthPct !== null)
    bar("defensive", "test 5 · growth", "company", `${d.figures.epsGrowthPct >= 0 ? "+" : ""}${d.figures.epsGrowthPct}%`, `EPS growth across the window reaches +${requiredGrowthPct}%`);
  if (dm("pe").outcome === "fail" && close !== null && ratios.epsAvg3 !== null && ratios.epsAvg3 > 0)
    bar("defensive", "test 6 · P/E ≤ 15", "price", px(close), `at or below ${px(r2(T.maxPe * ratios.epsAvg3))} on today's three-year average EPS`);
  if (dm("price_assets").outcome === "fail" && close !== null && ratios.bookValuePerShare !== null && ratios.bookValuePerShare > 0) {
    const viaPb = T.maxPb * ratios.bookValuePerShare;
    const viaProduct = ratios.epsAvg3 !== null && ratios.epsAvg3 > 0 && ratios.bookValuePerShare > 0
      ? Math.sqrt(T.maxPeTimesPb * ratios.epsAvg3 * ratios.bookValuePerShare) : null;
    const best = viaProduct !== null ? Math.max(viaPb, viaProduct) : viaPb;
    bar("defensive", "test 7 · P/B", "price", px(close), `at or below ${px(r2(best))} (1.5× book value${viaProduct !== null && viaProduct > viaPb ? ", or the 22.5 product on today's earnings" : ""})`);
  }
  if (em("multiplier").outcome === "fail" && close !== null && e.figures.epsLatest !== null && e.figures.epsLatest > 0)
    bar("enterprising", "test 1 · P/E ≤ 9", "price", px(close), `at or below ${px(r2(E.maxPe * e.figures.epsLatest))} on the latest year's EPS`);
  if (em("e_tangible").outcome === "fail" && close !== null && e.figures.tangibleBookPerShare !== null && e.figures.tangibleBookPerShare > 0)
    bar("enterprising", "test 6 · price < 1.2× tangible book", "price", px(close), `below ${px(r2(E.maxPTangibleBook * e.figures.tangibleBookPerShare))}`);

  // --- kinds: the eight meanings of ✗ (and a few more the live runs taught) ---
  const kinds: Kind[] = [];
  const kind = (id: KindId, label: string, meaning: string, graham: string, fs: (string | null)[]) =>
    kinds.push({ id, label, meaning, graham, facts: fs.filter((x): x is string => !!x) });

  const dFail = (id: string) => dm(id).outcome === "fail";
  const businessIds = ["size", "condition", "stability", "dividends", "growth"];
  const businessFails = businessIds.filter(dFail).length;
  const priceFails = ["pe", "price_assets"].filter(dFail).length;
  const anyNa = d.results.some((x) => x.outcome === "na") || e.results.some((x) => x.outcome === "na");

  if (input.sector === "Financial Services")
    kind("financial", "A financial company",
      "Graham's financial-strength test is written for industrial companies, so it is not applied here: the score is out of six on the defensive screen and five on the enterprising one. Banks tend to trade near book value, which is why the book-value test is the one they most often pass.",
      "ch. 14, p. 361", [fId, markFacts.get("d2") ?? null, fPb]);

  if (priceFails >= 1 && businessFails === 0 && !anyNa && !dFail("size"))
    kind("price_only", "Fails only on price",
      "Every business test passes; only the price tests fail. Not a weak company — a price that asks the buyer to pay for future growth in advance, which the defensive investor declines to do.",
      "ch. 14, p. 349", [fDef, markFacts.get("d6") ?? null, markFacts.get("d7") ?? null, fPe]);

  if ((dm("pe").outcome === "pass" || em("multiplier").outcome === "pass") && businessFails >= 1)
    kind("cheap_for_a_reason", "Cheap on earnings, failing elsewhere",
      "The price is low against earnings, and the company fails one or more of the business tests. The value-trap question: is the market wrong about this company, or right? Graham's Chrysler caveat applies — a low multiplier can mean the market expects the earnings to fall.",
      "ch. 7, p. 165", [fPe, fDef, fEnt]);

  if (dFail("dividends")) {
    const streak = d.figures.dividendYears;
    const earliest = paidYears[0] ? Number(paidYears[0]) : null;
    const currentPayer = e.results.find((x) => x.id === "e_dividend")!.outcome === "pass";
    if (!paidYears.length)
      kind("never_paid", "Has never paid a dividend",
        "No dividend appears in the record. That is a policy choice, not a verdict on the business; Graham's test fails it because no cash has reached the owners.",
        "ch. 14, p. 348", [fDiv, markFacts.get("d4") ?? null]);
    else if (currentPayer && streak >= 1 && streak < T.dividendYears && earliest !== null && earliest > Number(today.slice(0, 4)) - T.dividendYears)
      kind("new_dividend", "A dividend too new to have a record",
        `The dividend began in ${earliest}. A ten-year record is impossible for a recent payer: this is a test that cannot apply yet, not a sign of weakness. The enterprising screen's "some current dividend" passes.`,
        "ch. 14, p. 348; ch. 15, p. 386", [fDiv, markFacts.get("d4") ?? null, fEnt]);
    else
      kind("dividend_gap", "A dividend record with a break in it",
        "Dividends were paid, then stopped, suspended or interrupted for more than 15 months. Graham's word is 'uninterrupted'; a cut is not a break, but a gap is.",
        "ch. 14, p. 348", [fDiv, markFacts.get("d4") ?? null]);
  }

  if (dFail("stability")) {
    const lossYears = years.filter((y) => ok(y.epsDiluted) && y.epsDiluted <= 0).map((y) => `FY${y.fiscalYear}`).reverse();
    kind("loss_year", `A loss year inside the window (${lossYears.join(", ") || "see EPS"})`,
      "'Has it never lost money?' is the simplest question on the card and the one most people never ask of a famous name. One loss year fails Graham's stability test on either screen.",
      "ch. 14, p. 348; ch. 15, p. 386", [fEps, markFacts.get("d3") ?? null]);
  }

  if (dFail("growth")) {
    const eps = years.map((y) => y.epsDiluted).filter(ok);
    const maxIdx = eps.indexOf(Math.max(...eps));
    const peakEarly = eps.length >= 4 && maxIdx >= eps.length - 2;
    if (peakEarly && d.figures.epsGrowthPct !== null && d.figures.epsGrowthPct < 0)
      kind("windfall_base", "Earnings peaked in the base years",
        "The growth test fails because the early years of the window were a peak, so later years look like decline. Cyclical earnings are exactly why Graham averaged several years rather than trusting one.",
        "ch. 14, p. 349", [fEps, fGrowth, markFacts.get("d5") ?? null]);
    else
      kind("flat_earnings", "Earnings not growing at Graham's pace",
        `EPS has not grown by the +${requiredGrowthPct}% the window asks for. Graham wanted modest growth that has actually happened, not a promise of it.`,
        "ch. 14, p. 349", [fEps, fGrowth, markFacts.get("d5") ?? null]);
  }

  if (dFail("condition") && ratios.currentRatio !== null) {
    const debtOk = d.figures.ltDebtToWc !== null && d.figures.ltDebtToWc <= T.maxLtDebtToWc;
    if (ratios.currentRatio < T.minCurrentRatio && debtOk)
      kind("thin_working_capital", "Thin working capital, debt under control",
        "Fails the strength test on the current ratio alone. Modern consumer businesses often run on thin current assets by design — customers pay before suppliers are paid. Weak, or efficient? Both answers can be argued from the books.",
        "ch. 14, p. 348", [fStrength, markFacts.get("d2") ?? null]);
    else
      kind("debt_heavy", "Long-term debt bigger than the cushion",
        "Long-term debt exceeds working capital (or the current ratio and the debt both miss). Graham's rule is that the mortgage should be smaller than the cushion that pays this year's bills.",
        "ch. 14, p. 348", [fStrength, markFacts.get("d2") ?? null]);
  }

  if (ratios.bookValuePerShare !== null && ratios.bookValuePerShare <= 0)
    kind("negative_book", "Negative book value",
      "Buybacks or losses have used up the shareholders' funds, so book value per share is below zero. No multiple of assets supports the price; the asset tests fail on either screen.",
      "ch. 14, p. 349", [fBook, fPb, markFacts.get("d7") ?? null]);
  else if ((dFail("price_assets") && ratios.pb !== null && ratios.pb > T.maxPb) || em("e_tangible").outcome === "fail")
    kind("expensive_vs_tangible", "Priced far above the assets on the books",
      "Brands, software and customer relationships barely appear on a balance sheet, so price-to-book runs high for most modern companies — Zweig concedes the point (p. 374). The enterprising screen is stricter still: goodwill and intangibles are removed before the 120% test.",
      "ch. 14, p. 374 (Zweig); ch. 15, p. 386", [fBook, fPb, markFacts.get("d7") ?? null, markFacts.get("e6") ?? null]);

  if (dFail("size"))
    kind("too_small", "Below the defensive size floor",
      "Smaller than Graham's defensive investor allows (revenue under $800m in today's money). The enterprising screen sets no size floor: 'small companies may afford enough safety if bought carefully and on a group basis.'",
      "ch. 14, p. 348; ch. 15, p. 386", [fRev, markFacts.get("d1") ?? null]);

  if (anyNa)
    kind("incomplete", "A figure is missing",
      "At least one test could not be scored because a figure is not yet held. The verdict is incomplete, not a fail; it changes when the nightly refresh fills the gap.",
      "—", [fDef, fEnt]);

  const asOf = { priceDate, close, fiscalYear: latest?.fiscalYear ?? null, today };
  const hash = fingerprint(facts.map((f) => f.text).join("\n"));

  return {
    symbol: input.symbol, name: input.name, sector: input.sector, asOf,
    defensive: { verdict: d.verdict, passes: d.passes, applicable: d.applicable, marks: dMarks },
    enterprising: { verdict: e.verdict, passes: e.passes, applicable: e.applicable, marks: eMarks },
    facts, kinds, bars, hash,
  };
}

// ---------------------------------------------------------------------------
// The plain narrative — deterministic sentences from the sheet. Used when no
// AI is configured or available, and shown beside the AI's version in class.
// ---------------------------------------------------------------------------
export function templateNarrative(s: FactSheet): Narrative {
  const name = s.name ?? s.symbol;
  const fDef = s.facts.find((f) => f.text.startsWith("Defensive screen"))!.id;
  const fEnt = s.facts.find((f) => f.text.startsWith("Enterprising screen"))!.id;
  const vWord: Record<string, string> = {
    survivor: "passes every applicable test", candidate: "passes every applicable test",
    near_miss: "misses by one test", fails: "fails two or more tests", insufficient: "cannot be fully scored yet",
  };
  const paragraphs: Paragraph[] = [];

  paragraphs.push({
    text: `${name} ${vWord[s.defensive.verdict]} on Graham's defensive screen (${s.defensive.passes} of ${s.defensive.applicable}) and ${vWord[s.enterprising.verdict]} on the enterprising screen (${s.enterprising.passes} of ${s.enterprising.applicable}).`,
    facts: [s.facts[0].id, fDef, fEnt],
  });

  for (const k of s.kinds) {
    paragraphs.push({ text: `${k.label}: ${k.meaning}`, facts: k.facts.length ? k.facts : [fDef] });
  }

  const priceBars = s.bars.filter((x) => x.moves === "price");
  if (priceBars.length) {
    const parts = priceBars.map((x) => `${x.screen} ${x.test} ${x.bar}`);
    paragraphs.push({
      text: `For the price tests to pass at today's earnings and book value, the share would need to trade ${parts.join("; ")} — against ${priceBars[0].today} today. That is where Graham's bar sits, not an estimate of what the share is worth.`,
      facts: priceBars.map((x) => x.id),
    });
  }
  const companyBars = s.bars.filter((x) => x.moves === "company");
  if (companyBars.length) {
    paragraphs.push({
      text: `The business tests that fail would pass only if the company itself changed: ${companyBars.map((x) => `${x.test.replace(/^test \d+ · /, "")} — ${x.bar}`).join("; ")}.`,
      facts: companyBars.map((x) => x.id),
    });
  }

  paragraphs.push({
    text: "None of this says whether anyone should buy or sell. A screen reports what the accounts show; it cannot say why the numbers are what they are, or what happens next.",
    facts: [fDef],
  });

  const q = s.kinds.some((k) => k.id === "price_only") ? `What growth is ${name}'s price assuming — and would you pay for it in advance?`
    : s.kinds.some((k) => k.id === "cheap_for_a_reason") ? `Is the market wrong about ${name}, or right?`
    : s.kinds.some((k) => k.id === "loss_year") ? `What happened in ${name}'s loss year, and has it been fixed?`
    : s.kinds.some((k) => k.id === "thin_working_capital") ? `Is ${name}'s thin working capital weakness, or efficiency?`
    : s.kinds.some((k) => k.id === "new_dividend") ? `Should a test written for a 20-year record be allowed to judge a two-year payer?`
    : `What would you need to read about ${name} before the screen's verdict became your own?`;

  return { paragraphs, question: q, source: "template" };
}

// ---------------------------------------------------------------------------
// Grounding checks — applied to ANY narrative, the AI's above all.
// ---------------------------------------------------------------------------
export type Grounding = {
  /** Numbers in the narrative that do not appear in any cited fact. */
  unsupportedNumbers: { paragraph: number; numbers: string[] }[];
  /** Paragraphs citing a fact id that is not on the sheet. */
  unknownFacts: { paragraph: number; ids: string[] }[];
  /** Advice-shaped language the course forbids. */
  recommendationLanguage: string[];
  clean: boolean;
};

/**
 * Numbers as VALUES, not strings (review S13, 23 Oct 2026): "$3,200m" and
 * "$3.2bn" are the same figure; "−$52m" (Unicode minus) and "-52m" too; and
 * the digits inside an ISO date (2026-10-14) are a date, not a number.
 */
const UNIT: Record<string, number> = { bn: 1e9, billion: 1e9, m: 1e6, million: 1e6, k: 1e3, thousand: 1e3 };
const NUM_UNIT = /(-?)\$?(\d[\d,]*(?:\.\d+)?)\s*(bn|billion|m|million|k|thousand)?\b/gi;
const MONTHS = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
export type NumberHit = { value: number; precision: number; lossWord?: boolean };
/**
 * Every figure in a text with the PRECISION it was written at (the unit of
 * its last digit): "$1.9bn" is 1.9e9 ± 0.5e8, "$1,912m" is 1.912e9 ± 0.5e6
 * (review V6, 24 Oct 2026: a sheet figure re-expressed to fewer decimals is
 * the same figure). Dates, page refs and fact ids are not figures.
 */
export function extractNumbersWithPrecision(text: string): NumberHit[] {
  const t = text
    .replace(/[−–]\s*(?=\$?\d)/g, "-")                    // Unicode minus / dash before a figure → ASCII minus
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, " ")               // ISO dates
    .replace(new RegExp(`\\b(?:${MONTHS})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?\\b`, "gi"), " ")   // October 14, 2026
    .replace(new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${MONTHS})\\.?(?:\\s+\\d{4})?\\b`, "gi"), " ")       // 14 Oct 2026
    .replace(/\b(?:FY|fiscal year|in|since|during|for)\s*(?:19|20)\d{2}\b/gi, " ")   // FY2025, in 2024
    .replace(/\b[FB]\d{1,3}\b/g, " ")                        // fact ids F13, bar ids B2
    .replace(/\b(?:pp?\.|ch\.|chapter|page)\s*\d+(?:[–-]\d+)?/gi, " "); // page and chapter references
  const out: NumberHit[] = [];
  for (const m of t.matchAll(NUM_UNIT)) {
    const raw = m[2].replace(/,/g, "");
    const unit = m[3] ? UNIT[m[3].toLowerCase()] : 1;
    const v = parseFloat(raw) * unit;
    const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
    // A bare integer ("80", "37") is exact; a figure with a unit or decimals is rounded to its last digit.
    const precision = m[3] || decimals ? unit / 10 ** decimals : 0;
    // "a loss of $52m", "a deficit of 3m": the words carry the sign the digits lack (review F5).
    const before = t.slice(Math.max(0, (m.index ?? 0) - 40), m.index ?? 0);
    const lossWord = /\b(?:loss(?:es)?|deficit|negative|shortfall|lost)\b[^.]*$/i.test(before);
    if (Number.isFinite(v)) out.push({ value: m[1] === "-" ? -v : v, precision, lossWord });
  }
  return out;
}
export function extractNumbers(text: string): number[] { return extractNumbersWithPrecision(text).map((h) => h.value); }
/**
 * The same figure: within half a unit of either side's last digit, or 0.5%,
 * and the same sign — where a narrative figure's sign is the minus it carries
 * OR a loss word before it ("a loss of $52m" is the sheet's "−$52m"; "a loss
 * of $114m" against a profit of $114m is not — review F5).
 */
const sameValue = (a: NumberHit, b: NumberHit) => {
  if (b.value === 0 || a.value === 0) return Math.abs(a.value) < 1e-9 && Math.abs(b.value) < 1e-9;   // "$0m" matches nothing but zero
  const signA = a.value < 0 || a.lossWord ? -1 : 1;
  const signB = b.value < 0 ? -1 : 1;
  if (signA !== signB) return false;
  return Math.abs(Math.abs(a.value) - Math.abs(b.value)) <= Math.max(a.precision / 2, b.precision / 2, 0.005 * Math.abs(b.value)) + 1e-9;
};
/** Small counts, calendar numbers and Graham's own bars need no fact behind them (a figure equal to one of these cannot be checked — a documented limit). */
const FREE_VALUES = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20, 22.5, 1.5, 1.2, 120, 110, 100, 366]);

/**
 * Advice-shaped language (review S4): the prompt's own forbidden words plus the
 * phrasings a reader would hear as a tip. One pattern per family; one test per
 * family. The course's disclaimer ("whether anyone should buy or sell") is not
 * advice, hence the subject list and the lookbehind.
 */
export const ADVICE_PATTERNS: { family: string; re: RegExp }[] = [
  { family: "subject should buy/sell", re: /(?<!whether )\b(?:you|investors?|one|we|i|they|readers?|anyone|everyone)\s*(?:'d|'ll|\s(?:should|would|could|ought to|might want to|need to|must|will|wouldn'?t|shouldn'?t|won'?t))\s+(?:not\s+|also\s+|probably\s+|want to\s+|do well to\s+)?(?:buy|sell|hold|invest|avoid|accumulate|add(?!\s+(?:\d|two|three|four|five|six|new|more|another|capacity|plants?|stores?|staff|jobs|a |an |the |its |their ))|trim|short|own|get in|get out|get some|pick up|steer clear|stay away|take profits?|add (?:to (?:my|our|your|their|a|the) (?:position|holding|stake)s?|on weakness))\b/i },
  // An order at the start of a sentence. Not a hyphenated compound: "Short-term borrowings",
  // "Sell-side analysts", "Hold-to-maturity" are balance-sheet English (review F4).
  { family: "imperative", re: /(?:^|[.!?:;]\s+|^\s*[-–•]\s*)(?:don'?t (?:sell|buy)|buy|sell|accumulate|avoid|hold(?! on\b)|short|dump(?! trucks?\b)|take profits?|get in|get out|steer clear|stay away|load up|back up the truck|back the truck up|grab some)\b(?!-)(?! list)/im },
  { family: "recommend/advise", re: /\b(?:(?:we|i)(?:'d| would)?\s+(?:recommend|suggest|advise)|recommended (?:buy|sell)|strong (?:buy|sell)|(?:a|the) (?:good |great |clear |screaming |strong )?(?:buy|sell)\b(?!-)(?! list)|(?:rate|rated|rating|rates)\s+(?:the\s+|these\s+|its\s+)?(?:shares?|stock|it)\s+(?:an?\s+|as\s+)?(?:outperform|underperform|buy|sell|hold|overweight|underweight)|upgraded? to (?:buy|outperform|overweight)|downgraded? to (?:sell|underperform|underweight))/i },
  { family: "price target", re: /\b(?:price target|target price|fair value|intrinsic value of|worth \$?\d|worth (?:far |much |a lot )?more than|(?:see|hit|reach|touch)\s+\$?\d[\d,.]*\s+(?:by|before|within)\b|should trade at (?:a premium|a discount|\$?\d))/i },
  // A forecast needs a price-like or earnings-like subject: "Total debt could fall" is accounting, not a tip.
  { family: "forecast", re: /\b(?:(?:shares?|stock|price|it|they)\s+(?:is|are)?\s*(?:will|is going to|are going to|likely to|set to|poised to|expected to|bound to|about to|should|could|would|may well)\s+(?:easily\s+|probably\s+|soon\s+|comfortably\s+)?(?:rise|fall|double|halve|recover|outperform|rally|rebound|climb|drop|crash|re-?rate|appreciate|gain|surge|soar|jump|plunge|tank|take off|beat the market|go (?:up|down|higher|lower))|(?:prices?|shares?|stock|it) (?:is|are) heading (?:higher|lower|up|down)|(?:earnings|profits?|margins?|revenue|sales|dividend)\s+(?:is|are)?\s*(?:will|is going to|are going to|likely to|set to|poised to|expected to|bound to|about to|should|could|would|may well)\s+(?:rise|fall|double|halve|recover|rebound|climb|drop|increase|decrease|gain|grow|surge|soar|jump|plunge))\b/i },
  { family: "expect the price", re: /\b(?:expect|expects|expecting)\s+(?:the\s+)?(?:price|shares?|stock)\s+to\b/i },
  // A verdict on the price: "attractive" and "opportunity" only in a valuation sense (review F4).
  { family: "valuation verdict", re: /\b(?:under-?valued|over-?valued|under-?priced|over-?priced|bargain|(?:buying|investment|rare|great|real) opportunity|attractive(?:ly)? (?:price[ds]?|valu(?:ed|ation)|entry|level)|attractive entry point|compelling (?:valuation|case|price)|entry point|worth (?:buying|owning|holding|considering|a look|a punt|a bet)|good value|great value|cheap at this price|too expensive to buy|(?:is|are|looks?|seems?|remains?)\s+(?:too\s+|very\s+|still\s+|dirt\s+)?cheap\b|mis-?priced|a steal\b|buying (?:here|now|at these levels) makes sense|make you money|make money here|(?:a|the) (?:stock|share|company|one) to (?:own|buy|hold)|money to be made|missing out|(?:market|street) (?:has|have) (?:got )?(?:this(?: one)?|it|the price) wrong)\b/i },
  { family: "position words", re: /\b(?:accumulate|overweight|underweight|buy (?:now|the dip|before|on weakness)|sell (?:now|before|into)|get in before|load up|lock in (?:profits?|gains)|piling in(?:to)?|re-?rating|adding on (?:any )?weakness|adding to (?:my|our|your|their|a|the) (?:position|holding|stake)s?|tak(?:e|ing) a position|core holding|(?:a )?place in (?:your|any|every|the) portfolio|due (?:a|for a) (?:catch-?up|re-?rat(?:e|ing)))\b/i },
  // A stance held by the writer, not an adjective on a noun ("its bullish customers").
  { family: "stance", re: /\b(?:(?:i'?m|i am|we'?re|we are|remain|stay|turn(?:ed|ing)?|is|are|am)\s+(?:very\s+|still\s+|quite\s+)?(?:bullish|bearish)|top pick|(?:my|our) pick|safe bet|no-?brainer|must-?own|must-?have|room to run|(?:big|plenty of|significant|limited|clear|substantial) (?:upside|downside)|upside potential|time to buy|time to sell|time to (?:get in|get involved|invest)|get in now|act now|don't miss|smart money|no-?lose|can'?t go wrong|(?:upside|downside) is (?:limited|significant|substantial|big|huge|enormous|small)|skewed to the (?:upside|downside)|anywhere but up|(?:ten|multi)-?bagger|(?:i'?d be|i am|i'?m|we'?re|we are) a (?:buyer|seller)|(?:investors?|shareholders?|holders?|patience|patient money) will be rewarded)\b/i },
];
export type AdviceHit = { family: string; match: string };
export function findAdviceDetailed(text: string): AdviceHit[] {
  const hits: AdviceHit[] = [];
  for (const { family, re } of ADVICE_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push({ family, match: m[0].trim() });
  }
  return hits;
}
export function findAdvice(text: string): string[] { return findAdviceDetailed(text).map((h) => h.match); }

export function checkGrounding(n: Narrative, sheet: FactSheet): Grounding {
  const byId = new Map(sheet.facts.map((f) => [f.id, f.text]));
  const unsupportedNumbers: Grounding["unsupportedNumbers"] = [];
  const unknownFacts: Grounding["unknownFacts"] = [];
  const recommendationLanguage: string[] = [];
  n.paragraphs.forEach((p, i) => {
    const unknown = p.facts.filter((id) => !byId.has(id));
    if (unknown.length) unknownFacts.push({ paragraph: i + 1, ids: unknown });
    // Numbers are checked as values against the whole sheet (a fact id may be
    // cited loosely; a number from nowhere is the real fault).
    const sheetValues = extractNumbersWithPrecision(sheet.facts.map((f) => f.text).join(" "));
    const bad = extractNumbersWithPrecision(p.text)
      .filter((v) => !FREE_VALUES.has(v.value))
      .filter((v) => !sheetValues.some((f) => sameValue(v, f)))
      .map((v) => String(v.value));
    if (bad.length) unsupportedNumbers.push({ paragraph: i + 1, numbers: [...new Set(bad)] });
    recommendationLanguage.push(...findAdvice(p.text));
  });
  recommendationLanguage.push(...findAdvice(n.question));
  return {
    unsupportedNumbers, unknownFacts, recommendationLanguage,
    clean: !unsupportedNumbers.length && !unknownFacts.length && !recommendationLanguage.length,
  };
}
