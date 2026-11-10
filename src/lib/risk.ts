/**
 * Week 9: running your paper portfolio — the account marked to market and the
 * risk report (decision 20; the PraxiRisk-derived layer of the syllabus:
 * pre-trade checks and a nightly per-student report). Pure: the route and the
 * nightly job load the rows, this file does the arithmetic and the sentences.
 *
 * The report is a habit, not an alarm. Every line is a statement a student
 * can check: the account's value at the latest closes, the high-water mark
 * and the drawdown from it, the risk the open positions carry against the
 * 12% budget, the nearest stop. Drawdowns are normal: at a 12% target, a
 * one-in-twenty year is about −20% (1.65 standard deviations); a run of
 * years typically sees a drawdown of 20–30% from a high, one run in twenty
 * 40% or more, and a decade deeper still (a random walk at 12% a year —
 * v0.11.0 review F9 bounded the sentence by simulation; Carver's own table
 * is the tutor's, OI-40). The target is set so that the worst are survivable
 * (week 8). The report says how far below the high the account is and leaves
 * the feeling to the journal.
 *
 * Education, not advice.
 */
import { SIZING, targetFor } from "./sizing";
import type { Marked, Student } from "./tickets";
export { markToMarket } from "./tickets";
export type { Latest, Marked } from "./tickets";

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type RiskFlag = "over_budget" | "stop_hit" | "drawdown" | "missing_close" | "too_many_positions";

export type RiskReport = {
  code: string;
  date: string;
  accountValue: number;
  cash: number;
  marketValue: number;
  openPnl: number;
  realisedPnl: number;
  hwm: number;
  drawdownPct: number;
  riskUsedPct: number;
  riskTargetPct: number;
  perInstrumentPct: number;
  instruments: number;
  openPositions: number;
  nearestStopPct: number | null;
  stopHits: number;
  flags: RiskFlag[];
  marked: Marked;
};

/**
 * Tonight's report from the marked account. `prevHwm` is the high-water mark
 * carried from the last report (the enrolled capital on the first night); the
 * new mark is the larger of it and tonight's value. `date` is the NIGHT — the
 * latest close the toolkit holds for any instrument — not the close a lagging
 * position happens to be valued at (review F2 of v0.11.0: keyed on the
 * position's close, a small cap between visits or a US holiday rewrote the
 * previous night's row instead of writing tonight's). A position valued at an
 * older close is named in the reading; one with no close at all is `missing`.
 */
export function buildReport(student: Student, marked: Marked, prevHwm: number | null, date: string): RiskReport {
  const hwm = r2(Math.max(prevHwm ?? student.capital, marked.value, 0));
  const drawdownPct = hwm > 0 ? r2(((hwm - marked.value) / hwm) * 100) : 0;
  const instruments = Math.max(1, Math.min(SIZING.maxInstruments, student.instruments || 1));
  const openPositions = marked.contributions.length;
  const stopHits = marked.contributions.filter((c) => c.stopHit).length;
  const distances = marked.contributions.map((c) => c.stopDistancePct).filter((d): d is number => d !== null);
  const nearestStopPct = distances.length ? Math.min(...distances) : null;
  const flags: RiskFlag[] = [];
  if (marked.riskUsedPct > SIZING.riskTargetPct + SIZING.budgetTolerancePct) flags.push("over_budget");
  if (stopHits > 0) flags.push("stop_hit");
  if (drawdownPct >= SIZING.drawdownNotePct) flags.push("drawdown");
  if (marked.missing.length) flags.push("missing_close");
  if (openPositions > instruments) flags.push("too_many_positions");
  return {
    code: student.code, date, accountValue: marked.value, cash: marked.cash, marketValue: marked.marketValue, openPnl: marked.openPnl, realisedPnl: marked.realised,
    hwm, drawdownPct, riskUsedPct: marked.riskUsedPct, riskTargetPct: SIZING.riskTargetPct, perInstrumentPct: targetFor(instruments), instruments, openPositions,
    nearestStopPct, stopHits, flags, marked,
  };
}

const pct1 = (v: number) => `${v.toFixed(1)}%`;

/** The report in sentences — the page's and the API's "reading". Statements, not instructions; the journal is where the decision goes. */
export function describeReport(r: RiskReport, enrolledCapital: number): string[] {
  const lines: string[] = [];
  const since = enrolledCapital > 0 ? ((r.accountValue - enrolledCapital) / enrolledCapital) * 100 : 0;
  const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  lines.push(`On the ${r.date} close the account is worth ${money(r.accountValue)}: ${money(r.cash)} cash and ${money(r.marketValue)} in ${r.openPositions} open position${r.openPositions === 1 ? "" : "s"} — ${signed(since)} since enrolment (${money(r.realisedPnl)} realised, ${money(r.openPnl)} open).`);
  const stale = r.marked.contributions.filter((c) => c.date !== null && c.date < r.date);
  if (stale.length) lines.push(`${stale.map((c) => `${c.symbol} is valued at its ${c.date} close`).join("; ")} — the latest stored; the nightly pass has not reached ${stale.length === 1 ? "it" : "them"} since.`);
  if (r.drawdownPct > 0) {
    lines.push(`The high-water mark is ${money(r.hwm)}; the account is ${pct1(r.drawdownPct)} below it. At a ${r.riskTargetPct}% target a one-in-twenty year is about −20%; a run of years typically sees a drawdown of 20–30% from a high, one run in twenty 40% or more, and deeper over a decade: this is what the target was chosen to survive. Nothing in the rules changes because of it.`);
  } else {
    lines.push(`The account is at its high-water mark (${money(r.hwm)}). It will not stay there — a ${r.riskTargetPct}% target means ordinary years move it by about that much either way.`);
  }
  if (r.openPositions === 0) {
    lines.push(`No open positions: the account carries no market risk tonight. The rule opens; you write the ticket — or you wait, which is also a decision for the journal.`);
  } else {
    const parts = r.marked.contributions.map((c) => `${c.symbol} ${c.riskPct === null ? "—" : pct1(c.riskPct)}${c.riskAtEntry ? " (at the entry risk; none stored tonight)" : ""}`).join(", ");
    lines.push(`The open positions carry ${pct1(r.riskUsedPct)} a year of the ${r.riskTargetPct}% budget (${parts}); the account runs ${r.instruments} instrument${r.instruments === 1 ? "" : "s"}, each sized at ${r.perInstrumentPct % 1 === 0 ? r.perInstrumentPct : r.perInstrumentPct.toFixed(2)}%.${r.flags.includes("over_budget") ? ` That is over the budget by more than ${SIZING.budgetTolerancePct} point${SIZING.budgetTolerancePct === 1 ? "" : "s"} — a volatility that rose since entry, or a position sized before the instruments were changed; the rules do not trim a position for it, the stop does its work.` : ""}`);
    if (r.nearestStopPct !== null) {
      const nearest = r.marked.contributions.filter((c) => c.stopDistancePct === r.nearestStopPct)[0];
      lines.push(r.stopHits > 0
        ? `${r.stopHits} stop${r.stopHits === 1 ? " has" : "s have"} been hit (${r.marked.contributions.filter((c) => c.stopHit).map((c) => c.symbol).join(", ")}): the rule says close — the close ticket is yours to write at the next decision, with the journal line.`
        : `The nearest stop is ${nearest ? nearest.symbol + ", " : ""}${pct1(r.nearestStopPct)} below ${nearest && r.marked.missing.includes(nearest.symbol) ? "the price it is valued at (its entry — no close is stored)" : "the latest close"}.`);
    }
    if (r.flags.includes("too_many_positions")) lines.push(`${r.openPositions} positions are open for an account set to ${r.instruments} instrument${r.instruments === 1 ? "" : "s"}: no new opening ticket until that is one or fewer than the setting.`);
    if (r.flags.includes("missing_close")) lines.push(`No close is stored tonight for ${r.marked.missing.join(", ")}: valued at entry until the nightly pass reaches it.`);
  }
  return lines;
}

/** One line for the receipt and the register: the numbers that matter. */
export function summarizeReport(r: RiskReport): string {
  return `${r.code}: value ${r.accountValue}, hwm ${r.hwm}, drawdown ${r.drawdownPct}%, risk ${r.riskUsedPct}% of ${r.riskTargetPct}% (${r.instruments} instr.), open ${r.openPositions}, nearest stop ${r.nearestStopPct ?? "—"}%, flags [${r.flags.join(",")}]`;
}
