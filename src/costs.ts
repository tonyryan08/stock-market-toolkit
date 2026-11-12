/**
 * Week 11: `/costs` — the total-cost-of-ownership worksheet as a page, and
 * `GET /api/costs` as JSON. Deterministic (src/lib/costs.ts): the same paper
 * trade priced the way an Irish student would pay for it — the trade's
 * costs, the holding's, and the tax on the gain three ways. Every rate with
 * its source and date, and a "Bill, not yet law" mark where it depends on
 * the Finance (No. 2) Bill 2026. No D1, no model, no provider.
 */
import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, esc, SHARED_CSS } from "./page";
import { parseCostInput, worksheet, CostInputError, DEFAULT_INPUT, TAX_RULES, BROKER, billRules, statusSentence, type Worksheet, type TradeCosts, type Regime, type Basis } from "./lib/costs";

export const costs = new Hono();

/** The footer's sentence follows the rules' basis (review F3): the Bill's while any rate rests on it, the Act's after. */
const noteFor = (w: Worksheet) => `Education, not advice. The worksheet shows what the published rules and a published schedule would charge on a paper trade; it is not tax advice, ${billRules(w.rules).length ? "the Bill it cites is not yet law" : "the rates are as enacted on the date shown"}, and your own case is a question for Revenue's guidance or a tax adviser.`;

const eur = (v: number) => `€${v.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

costs.get("/api/costs", (c) => {
  try {
    const input = parseCostInput(c.req.query());
    const w = worksheet(input);
    return c.json({ ...w, note: noteFor(w) });
  } catch (err) {
    if (err instanceof CostInputError) return c.json({ error: err.message, defaults: DEFAULT_INPUT }, 400);
    throw err;
  }
});

costs.get("/costs", (c) => {
  let input = DEFAULT_INPUT;
  let error: string | null = null;
  try { input = parseCostInput(c.req.query()); } catch (err) { if (err instanceof CostInputError) error = err.message; else throw err; }
  return c.html(costsPage(worksheet(input), error), error ? 400 : 200);
});

function table(t: TradeCosts, totalLabel: string): string {
  return `<div class="wrap"><table><tbody>${t.lines.map((l) => `<tr><th scope="row">${esc(l.label)}</th><td class="n">${eur(l.amount)}</td><td class="note">${esc(l.note)}</td></tr>`).join("")}<tr class="total"><th scope="row">${esc(totalLabel)}</th><td class="n">${eur(t.total)}</td><td></td></tr></tbody></table></div>`;
}
function regime(r: Regime): string {
  return `<div class="regime"><h3>${esc(r.name)} <span class="basis ${r.basis}">${r.basis === "Bill" ? "Bill — not yet law" : "current"}</span></h3>
  <p class="big">${eur(r.tax)}<span class="sub">on a gain of ${eur(r.gain)} → ${eur(r.net)} after tax</span></p>
  <ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></div>`;
}

const mark = (b: Basis) => `<span class="basis ${b}">${b === "Bill" ? "Bill" : "current"}</span>`;

export function costsPage(w: Worksheet, error: string | null): string {
  const i = w.input;
  const sel = (m: string) => (i.market === m ? " selected" : "");
  const rules = w.rules;
  const bill = billRules(rules).length > 0;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Costs and tax — the worksheet</title>
<meta name="referrer" content="same-origin">
${FONTS_HTML}
<style>
${PAGE_CSS}
${SHARED_CSS}
  main { max-width: 56rem; }
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.2rem; margin:1.6rem 0 .5rem; }
  h3 { font-size:1rem; margin:.2rem 0 .3rem; }
  form.ws { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:1rem; margin:1rem 0; display:grid; gap:.7rem; grid-template-columns: repeat(4, 1fr); }
  form.ws label { display:flex; flex-direction:column; font-size:.78rem; color:var(--faint); gap:.2rem; }
  form.ws input, form.ws select { font: inherit; padding:.4rem .5rem; border:1px solid var(--rule); border-radius:4px; background:#fff; }
  form.ws button { font: inherit; padding:.5rem 1rem; border:1px solid var(--entry); background:var(--entry); color:#fff; border-radius:4px; cursor:pointer; align-self:end; }
  @media (max-width: 700px) { form.ws { grid-template-columns: 1fr 1fr; } }
  .reading { background:#fff; border:1px solid var(--rule); border-radius:6px; padding:.8rem 1.1rem; margin:.8rem 0; font-size:.95rem; line-height:1.55; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th, td { padding:.35rem .5rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:top; }
  tbody th { font-weight:500; white-space:nowrap; }
  td.n { font-family:"IBM Plex Mono",monospace; white-space:nowrap; text-align:right; }
  td.note { color:var(--faint); font-size:.78rem; }
  tr.total th, tr.total td { border-top:2px solid var(--ink); font-weight:600; }
  .three { display:grid; grid-template-columns: repeat(3, 1fr); gap:.8rem; margin:.6rem 0 1rem; }
  @media (max-width: 760px) { .three { grid-template-columns: 1fr; } }
  .regime { background:#fff; border:1px solid var(--rule); border-radius:6px; padding:.7rem .9rem; font-size:.85rem; }
  .regime ul { margin:.4rem 0 0 1.1rem; padding:0; } .regime li { margin:.2rem 0; }
  .big { font-family:"IBM Plex Mono",monospace; font-size:1.5rem; margin:.2rem 0; } .big .sub { display:block; font-family:"IBM Plex Sans",sans-serif; font-size:.78rem; color:var(--faint); }
  .basis { font-family:"IBM Plex Mono",monospace; font-size:.65rem; padding:.1rem .4rem; border-radius:3px; vertical-align:middle; } .basis.Bill { background:#F1EBD6; color:#6b5d2a; } .basis.current { background:#E3E8E4; color:#3b4a42; }
  .status { background:rgba(241,235,214,.6); border:1px solid #b89b3a; border-radius:6px; padding:.6rem 1rem; font-size:.85rem; }
  dl.rules dt { font-weight:600; margin-top:.6rem; } dl.rules dd { margin:.2rem 0 0 0; font-size:.85rem; color:var(--ink); }
  .err { color:var(--stamp); }
  .cols { display:grid; grid-template-columns: 1fr 1fr; gap:1rem; } @media (max-width: 760px) { .cols { grid-template-columns: 1fr; } }
</style></head>
<body><main>
  <p class="back"><a href="/">← course home</a> · <a href="/size">calculator</a> · <a href="/signals">signals</a> · <a href="/tutor">tutor</a></p>
  <p class="eyebrow">Week 11 · the real world</p>
  <h1>What a trade really costs — and what the gain is taxed at</h1>
  <p class="lede">The same paper trade, priced in euro the way an Irish student would pay for it: the trade's costs on a published schedule beside the course's own model, the holding's costs, and the tax on the gain three ways — as shares, as a fund or ETF, and inside the Individual Investment Account the Finance (No. 2) Bill 2026 ${bill ? "would open" : "opens"} on 1 July 2027. Change the numbers; the order of the three changes with them.</p>
  <p class="status"><b>As checked on ${esc(rules.checkedOn)}.</b> ${esc(statusSentence(rules))}</p>
  ${error ? `<p class="err">${esc(error)} Showing the defaults.</p>` : ""}
  <form class="ws" method="get" action="/costs">
    <label>Invested, euro <input name="invested" inputmode="decimal" value="${i.invested}"></label>
    <label>Gain over the holding, % <input name="gainPct" inputmode="decimal" value="${i.gainPct}"></label>
    <label>Years held (0 = sold in 2026) <input name="years" inputmode="numeric" value="${i.years}"></label>
    <label>The share's market <select name="market"><option value="US"${sel("US")}>US (no stamp duty)</option><option value="IE"${sel("IE")}>Irish (1% stamp duty)</option><option value="UK"${sel("UK")}>UK (0.5%)</option></select></label>
    <label>Dividend yield, % a year <input name="dividendYieldPct" inputmode="decimal" value="${i.dividendYieldPct}"></label>
    <label>The ETF's annual charge (TER), % <input name="terPct" inputmode="decimal" value="${i.terPct}"></label>
    <label>The spread, % of the price <input name="spreadPct" inputmode="decimal" value="${i.spreadPct}"></label>
    <label>The €${rules.cgt.exemption.toLocaleString("en-IE")} CGT exemption unused this year? <select name="exemptionAvailable"><option value="1"${i.exemptionAvailable ? " selected" : ""}>yes</option><option value="0"${i.exemptionAvailable ? "" : " selected"}>no — already used</option></select></label>
    <button type="submit">Work it out</button>
  </form>
  <h2>The reading</h2>
  <div class="reading">${w.reading.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
  <h2>The trade's costs</h2>
  <div class="cols">
    <div><h3>As a ${i.market === "US" ? "US" : i.market === "IE" ? "Irish" : "UK"} share, through a euro account</h3>${table(w.trade.share, "To open and close")}</div>
    <div><h3>As a euro-listed UCITS ETF (core selection)</h3>${table(w.trade.etf, "To open and close")}<h3>The course's model, for comparison</h3>${table(w.trade.course, "Both tickets' cost lines")}</div>
  </div>
  <p class="caption">${esc(BROKER.name)}: US shares €${BROKER.usShare.toFixed(2)} an order, Irish shares €${BROKER.irishShare.toFixed(2)}, core-selection ETFs €${BROKER.coreEtf.toFixed(2)} (€${BROKER.otherEtf.toFixed(2)} outside the selection), currency conversion ${BROKER.fxPct}% each way, €${BROKER.connectivityPerExchangePerYear.toFixed(2)} a year per foreign exchange. Any MiFID broker on an EU regulator's register works the same way; the numbers differ.</p>
  <h2>The holding's costs over ${i.years} year${i.years === 1 ? "" : "s"}</h2>
  <div class="cols">
    <div><h3>The share: dividends and what is withheld</h3>${table(w.holding.share, "Withheld at source")}</div>
    <div><h3>The ETF: the annual charge</h3>${table(w.holding.etf, "Taken inside the price")}</div>
  </div>
  <h2>The tax on the same gain, three ways</h2>
  <div class="three">${regime(w.tax.shares)}${regime(w.tax.etf)}${regime(w.tax.iia)}</div>
  <h2>The rules, with their sources</h2>
  <dl class="rules">
    <dt>Capital gains tax on shares ${mark(rules.cgt.basis)}</dt><dd>${esc(rules.cgt.note)}</dd>
    <dt>The exit tax on funds and ETFs ${mark(rules.exitTax.basis)}</dt><dd>${esc(rules.exitTax.note)}</dd>
    <dt>The Individual Investment Account ${mark(rules.iia.basis)}</dt><dd>${esc(rules.iia.note)}</dd>
    <dt>Stamp duty ${mark(rules.stampDuty.basis)}</dt><dd>${esc(rules.stampDuty.note)}</dd>
    <dt>Dividends ${mark(rules.dividends.basis)}</dt><dd>${esc(rules.dividends.note)}</dd>
  </dl>
  <p class="caption">Sources, as read on ${esc(rules.checkedOn)}: the Budget 2027 statement and main points (6 Oct 2026); the Finance (No. 2) Bill 2026 as published (19 Oct 2026) and the professional firms' summaries of it; Revenue's guidance on capital gains tax (payment dates and the exemption); the broker's published fee schedule. The lesson plan lists them by name. The worksheet is in euro; the paper account is in dollars because the shares are — lesson 8.</p>
  <footer><p class="notice">${noteFor(w)}</p><p>The worksheet does not compute income tax on dividends (it depends on the person), the four-week rule, a foreign-currency gain on the cash itself, or the broker's cap on connectivity fees; it assumes a straight-line path from cost to sale value for the averages. JSON at <code>/api/costs?invested=10000&amp;gainPct=30&amp;years=3</code>.</p></footer>
</main></body></html>`;
}
