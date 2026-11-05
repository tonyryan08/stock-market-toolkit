/**
 * Week 8: the ticket — a decision written down, checked against the rules
 * before it is accepted. Pure: the route loads the facts, this file judges.
 *
 * The rules (decisions 18 and 19), each with the reason a student reads:
 *   - the rule opens, you don't: an opening ticket needs the rule LONG on the latest close;
 *   - one position per instrument;
 *   - after a close, a fresh crossover before the next open (the rule must have gone
 *     long again AFTER you closed — no re-entering the same signal you were stopped out of);
 *   - the size is the rule's (sizing.ts): you may hold fewer shares, never more;
 *   - it must fit the cash you have;
 *   - the journal entry is the ticket: a blank one is refused;
 *   - a close is the whole position;
 *   - core tier only until week 9 (small caps are not split-adjusted and still warming up).
 *
 * Education, not advice: the checks say whether a ticket follows the rules
 * the student chose to follow, not whether the trade is a good idea.
 */
import { SIZING, sizePosition, tradeCost, type Sizing } from "./sizing";

export const CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const JOURNAL_MIN = 20;
export const JOURNAL_MAX = 1000;

export type Student = { code: string; name: string; capital: number };
export type SignalFact = { date: string; close: number; instrument_risk: number | null; state: string; state_since: string | null; days?: number | null };
export type PositionRow = {
  id: number; code: string; symbol: string; status: "open" | "closed"; opened_on: string; entry_price: number; units: number; exposure: number;
  stop_gap: number; high_since: number; stop_level: number; stop_hit_on: string | null; instrument_risk: number; realign_date?: string | null; closed_on: string | null;
  exit_price: number | null; pnl: number | null; open_ticket_id: number; close_ticket_id: number | null;
};
export type TicketRow = { id: number; code: string; symbol: string; side: "open" | "close"; units: number; fill_date: string; fill_price: number; cost: number; signal_state: string | null; journal: string; created_at: string };

export type TicketRequest = { code: string; symbol: string; side: "open" | "close"; units: number | null; journal: string };

export type Account = {
  capital: number;
  /** Σ pnl of closed positions (net of both tickets' costs). */
  realised: number;
  /** Σ entry exposure of open positions. */
  invested: number;
  /** Costs paid on open positions' opening tickets. */
  openCosts: number;
  /** capital + realised − invested − openCosts. */
  cash: number;
};

/** The account from its rows — week 8's simple ledger (week 9 marks the open positions to market). */
export function accountOf(capital: number, positions: PositionRow[], tickets: TicketRow[]): Account {
  const realised = positions.filter((p) => p.status === "closed").reduce((s, p) => s + (p.pnl ?? 0), 0);
  const open = positions.filter((p) => p.status === "open");
  const invested = open.reduce((s, p) => s + p.exposure, 0);
  const openIds = new Set(open.map((p) => p.open_ticket_id));
  const openCosts = tickets.filter((t) => openIds.has(t.id)).reduce((s, t) => s + t.cost, 0);
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { capital, realised: r2(realised), invested: r2(invested), openCosts: r2(openCosts), cash: r2(capital + realised - invested - openCosts) };
}

export type Reason = { code: string; message: string };

export type Decision =
  | { ok: true; side: "open"; units: number; fillDate: string; fillPrice: number; cost: number; sizing: Sizing; underSized: boolean; signalState: string }
  | { ok: true; side: "close"; units: number; fillDate: string; fillPrice: number; cost: number; position: PositionRow; pnl: number; signalState: string; stopWasHit: boolean }
  | { ok: false; reasons: Reason[] };

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Parse and bound the request; the messages are the ones the form shows. */
export function parseTicket(body: Record<string, unknown>): { ok: true; req: TicketRequest } | { ok: false; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const code = String(body.code ?? "").trim().toUpperCase();
  if (!CODE.test(code)) reasons.push({ code: "code", message: "The student code looks wrong — it is eight characters like K7PM-4R2X, from your enrolment." });
  const symbol = String(body.symbol ?? body.ticker ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.\-]{0,11}$/.test(symbol)) reasons.push({ code: "symbol", message: "That doesn't look like a ticker symbol." });
  const sideRaw = String(body.side ?? "").trim().toLowerCase();
  if (sideRaw !== "open" && sideRaw !== "close") reasons.push({ code: "side", message: "A ticket is 'open' or 'close'." });
  let units: number | null = null;
  const u = body.units;
  if (u !== undefined && u !== null && !(typeof u === "string" && u.trim() === "")) {
    // A whole number, written as one: no booleans, hex, exponents or arrays (review N7).
    const plain = typeof u === "number" ? Number.isInteger(u) : typeof u === "string" && /^\d{1,7}$/.test(u.trim());
    const n = plain ? Number(u) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > 1_000_000) reasons.push({ code: "units", message: "Units must be a whole number of shares, at least 1." });
    else units = n;
  }
  const journal = String(body.journal ?? "").trim();
  if (journal.length < JOURNAL_MIN) reasons.push({ code: "journal", message: `The journal entry is the ticket. Write why — what the rule said, where the stop is, what you will do if it is hit — in at least ${JOURNAL_MIN} characters.` });
  if (journal.length > JOURNAL_MAX) reasons.push({ code: "journal", message: `The journal entry is long enough at ${JOURNAL_MAX} characters.` });
  if (reasons.length) return { ok: false, reasons };
  return { ok: true, req: { code, symbol, side: sideRaw as "open" | "close", units, journal } };
}

export type Facts = {
  student: Student;
  tier: string | null;            // the ticker's tier, or null when it is not in the universe
  tickerStatus: string | null;    // 'active' | 'blocked' | …
  signal: SignalFact | null;      // the latest nightly row for the symbol
  positions: PositionRow[];       // the student's, all symbols
  tickets: TicketRow[];           // the student's, all symbols
};

/** Judge a parsed request against the facts. */
export function decideTicket(req: TicketRequest, f: Facts): Decision {
  const reasons: Reason[] = [];
  const sym = req.symbol;
  if (f.tier === null || f.tickerStatus === null) return { ok: false, reasons: [{ code: "universe", message: `${sym} is not in the course universe (the verified list at /api/universe).` }] };
  if (f.tickerStatus !== "active") return { ok: false, reasons: [{ code: "universe", message: `${sym} is in the universe but outside the free data plan — no prices, no signal, no ticket.` }] };
  if (f.tier !== "core") return { ok: false, reasons: [{ code: "tier", message: `${sym} is in the small-cap tier: no tickets until week 9 — the tier is still warming up and is not yet split-adjusted.` }] };
  if (!f.signal) return { ok: false, reasons: [{ code: "signal", message: `No signal row for ${sym} yet — the nightly pass has not reached it. Try after 23:00 UTC.` }] };
  const sig = f.signal;
  const open = f.positions.find((p) => p.symbol === sym && p.status === "open") ?? null;

  if (req.side === "open") {
    if (sig.state !== "long") {
      reasons.push({ code: "rule", message: `The rule opens, you don't: on the ${sig.date} close the rule is ${sig.state.toUpperCase()} for ${sym}${sig.state === "flat" ? " (the 16-day average is below the 64-day)" : " (fewer than 128 closes)"} — no opening ticket.` });
    }
    if (open) {
      reasons.push({ code: "held", message: `You already hold ${open.units} shares of ${sym} (opened ${open.opened_on}); one position per instrument.` });
    }
    const lastClosed = f.positions.filter((p) => p.symbol === sym && p.status === "closed").sort((a, b) => (a.closed_on ?? "").localeCompare(b.closed_on ?? "")).at(-1);
    // A crossover on the very close the exit was filled at counts as fresh (review N2): refused only when the rule's
    // long began strictly before the close.
    if (!open && lastClosed && lastClosed.closed_on && sig.state === "long" && sig.state_since && sig.state_since < lastClosed.closed_on) {
      reasons.push({ code: "reentry", message: `The rule has been long for ${sym} since ${sig.state_since}, before you closed on ${lastClosed.closed_on}: wait for a fresh crossover (flat, then long again) before re-entering.` });
    }
    const hasRisk = !!(sig.instrument_risk && sig.instrument_risk > 0);
    if (!hasRisk) {
      reasons.push({ code: "risk", message: `No instrument risk for ${sym} on ${sig.date}: the position cannot be sized.` });
    }

    // The size is judged whenever it can be, even when another rule already refuses (review F2): the
    // "Oversized" sentence is the week's exit check and must be readable by a student who already holds
    // the position and tries twice the size on purpose.
    let sizing: Sizing | null = null;
    let units = req.units ?? 0;
    if (sig.state === "long" && hasRisk) {
      sizing = sizePosition({ capital: f.student.capital, price: sig.close, instrumentRiskPct: sig.instrument_risk as number });
      if (!sizing.ok) {
        // The cost check is "not checked" when no share fits — a non-reason, not shown (review N3).
        reasons.push(...sizing.checks.filter((c) => !c.ok && !(c.code === "cost" && !sizing!.checks[0].ok)).map((c) => ({ code: `size_${c.code}`, message: c.message })));
      } else {
        units = req.units ?? sizing.units;
        if (units > sizing.units) {
          const risk = sig.instrument_risk as number;
          reasons.push({ code: "oversized", message: `Oversized. At ${risk.toFixed(2)}% instrument risk and the ${SIZING.riskTargetPct}% target, a ${money(f.student.capital)} account supports ${money(sizing.targetExposure)} of ${sym} — ${sizing.units} shares at ${money(sig.close)}. You asked for ${units} (${money(units * sig.close)}, ${((units * sig.close) / f.student.capital * 100).toFixed(0)}% of the account, carrying ${((units * sig.close) / f.student.capital * risk).toFixed(1)}% a year). The rule's size is the most you can hold; fewer is allowed.` });
        }
      }
    }
    if (reasons.length) return { ok: false, reasons };
    if (!sizing || !sizing.ok) return { ok: false, reasons: [{ code: "risk", message: `No instrument risk for ${sym} on ${sig.date}: the position cannot be sized.` }] };
    const exposure = units * sig.close;
    const cost = tradeCost(exposure);
    const account = accountOf(f.student.capital, f.positions, f.tickets);
    if (exposure + cost > account.cash + 1e-9) {
      return { ok: false, reasons: [{ code: "cash", message: `Not enough cash: ${money(account.cash)} available (${money(account.invested)} in ${f.positions.filter((p) => p.status === "open").length} open position(s)); ${units} shares of ${sym} at ${money(sig.close)} plus the ${money(cost)} cost is ${money(exposure + cost)}.` }] };
    }
    return { ok: true, side: "open", units, fillDate: sig.date, fillPrice: sig.close, cost: Math.round(cost * 100) / 100, sizing, underSized: units < sizing.units, signalState: sig.state };
  }

  // close
  if (!open) return { ok: false, reasons: [{ code: "none", message: `You have no open position in ${sym} to close.` }] };
  if (req.units !== null && req.units !== open.units) {
    return { ok: false, reasons: [{ code: "partial", message: `A close is the whole position: ${open.units} shares of ${sym}. Partial closes are not in the rules.` }] };
  }
  const exitValue = open.units * sig.close;
  const cost = Math.round(tradeCost(exitValue) * 100) / 100;
  const openTicket = f.tickets.find((t) => t.id === open.open_ticket_id);
  const pnl = Math.round(((sig.close - open.entry_price) * open.units - (openTicket?.cost ?? 0) - cost) * 100) / 100;
  return { ok: true, side: "close", units: open.units, fillDate: sig.date, fillPrice: sig.close, cost, position: open, pnl, signalState: sig.state, stopWasHit: open.stop_hit_on !== null };
}
