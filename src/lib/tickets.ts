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
 *   - small caps from week 9 (decision 20): a small-tier symbol is ticketable once its rule is
 *     mature (128 closes) and it is not quarantined — an unexplained jump in its as-traded
 *     series keeps it out until a splits row explains it;
 *   - week 9 (decision 20): the size is taken on the account's CURRENT value (cash plus the
 *     open positions at the latest close), at the target split between the instruments the
 *     student runs (12% ÷ N); no more open positions than instruments ("concentration"); and
 *     the account's risk after the ticket within the budget plus a point of tolerance.
 *
 * Education, not advice: the checks say whether a ticket follows the rules
 * the student chose to follow, not whether the trade is a good idea.
 */
import { SIZING, sizePosition, targetFor, tradeCost, fmtPct, type Sizing } from "./sizing";

export const CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const JOURNAL_MIN = 20;
export const JOURNAL_MAX = 1000;

export type Student = { code: string; name: string; capital: number; instruments: number };
export type SignalFact = { date: string; close: number; instrument_risk: number | null; state: string; state_since: string | null; days?: number | null; quarantined?: string | null };
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
  // A string only (v1.0.0 review F1): `String(["K7PM-4R2X"])` is "K7PM-4R2X", and a gate that looked at the raw body
  // and a parser that looked at the stringified one could be made to disagree. One shape, refused otherwise.
  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
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
  /** Week 9: the latest signal row per open-position symbol, to mark the account to market. */
  latest?: Record<string, SignalFact>;
};

export type Latest = Record<string, SignalFact>;

export type Marked = {
  /** The ledger: capital + realised − invested − open costs. */
  cash: number;
  /** Σ units × latest close over the open positions (entry price where no close is stored). */
  marketValue: number;
  /** Σ (latest close − entry) × units. */
  openPnl: number;
  /** Σ pnl of the closed positions. */
  realised: number;
  /** cash + marketValue — the account's current value, the capital the rule sizes on. */
  value: number;
  /** The latest close date among the open positions, or null with none open. */
  date: string | null;
  /** Open positions valued at entry because no close is stored for them. */
  missing: string[];
  /**
   * Per open position: the risk it carries, percent of the account a year, at the latest close and the latest
   * instrument risk — or at the ENTRY instrument risk when the latest row carries none (`riskAtEntry`; review F4 of
   * v0.11.0: the ticket's budget check and the report count the same thing, and the sentence says which).
   * `date` is the close the position is valued at (null when none is stored).
   */
  contributions: { symbol: string; units: number; close: number; date: string | null; weightPct: number; instrumentRisk: number | null; riskAtEntry: boolean; riskPct: number | null; stopDistancePct: number | null; stopHit: boolean }[];
  /** Σ contributions, percent a year — summed unrounded, rounded once (review F4). */
  riskUsedPct: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * The account at the latest closes the toolkit holds (week 9, decision 20) — the ONE arithmetic behind the ticket's
 * checks, the page's strip, the report and the nightly row (review F4 of v0.11.0: two copies disagreed on a position
 * with no instrument risk tonight — the page said 0.0% used while the budget check saw 11.6%).
 */
export function markToMarket(student: Student, positions: PositionRow[], tickets: TicketRow[], latest: Latest): Marked {
  const ledger = accountOf(student.capital, positions, tickets);
  const open = positions.filter((p) => p.status === "open");
  const missing: string[] = [];
  let marketValue = 0;
  let openPnl = 0;
  let date: string | null = null;
  const rows = open.map((p) => {
    const l = latest[p.symbol];
    const close = l?.close ?? null;
    if (close === null) missing.push(p.symbol);
    const px = close ?? p.entry_price;
    marketValue += p.units * px;
    openPnl += (px - p.entry_price) * p.units;
    if (l && (!date || l.date > date)) date = l.date;
    return { p, l, px };
  });
  const value = r2(ledger.cash + marketValue);
  let risk = 0;
  const contributions = rows.map(({ p, l, px }) => {
    const weight = value > 0 ? (p.units * px) / value : 0;
    const latestRisk = l?.instrument_risk && l.instrument_risk > 0 ? l.instrument_risk : null;
    const ir = latestRisk ?? (p.instrument_risk > 0 ? p.instrument_risk : null);
    const riskPct = ir === null ? null : weight * ir;
    if (riskPct !== null) risk += riskPct;
    return {
      symbol: p.symbol, units: p.units, close: px, date: l?.date ?? null, weightPct: r2(weight * 100), instrumentRisk: ir, riskAtEntry: latestRisk === null && ir !== null,
      riskPct: riskPct === null ? null : r2(riskPct),
      stopDistancePct: px > 0 ? r2(((px - p.stop_level) / px) * 100) : null,
      stopHit: p.stop_hit_on !== null,
    };
  });
  return { cash: ledger.cash, marketValue: r2(marketValue), openPnl: r2(openPnl), realised: ledger.realised, value, date, missing, contributions, riskUsedPct: r2(risk) };
}

/** The account's current value for the ticket's checks — a projection of `markToMarket`, never a second arithmetic. */
export function currentValue(f: Facts): { value: number; cash: number; marketValue: number; riskUsedPct: number } {
  const m = markToMarket(f.student, f.positions, f.tickets, f.latest ?? {});
  return { value: m.value, cash: m.cash, marketValue: m.marketValue, riskUsedPct: m.riskUsedPct };
}

/** Judge a parsed request against the facts. */
export function decideTicket(req: TicketRequest, f: Facts): Decision {
  const reasons: Reason[] = [];
  const sym = req.symbol;
  if (f.tier === null || f.tickerStatus === null) return { ok: false, reasons: [{ code: "universe", message: `${sym} is not in the course universe (the verified list at /api/universe).` }] };
  if (f.tickerStatus !== "active") return { ok: false, reasons: [{ code: "universe", message: `${sym} is in the universe but outside the free data plan — no prices, no signal, no ticket.` }] };
  if (!f.signal) return { ok: false, reasons: [{ code: "signal", message: `No signal row for ${sym} yet — the nightly pass has not reached it. Try after 23:00 UTC.` }] };
  const sig = f.signal;
  const open = f.positions.find((p) => p.symbol === sym && p.status === "open") ?? null;
  // Week 9: the small tier is ticketable once the rule is mature and nothing in the series is unexplained (decision 20).
  if (f.tier !== "core" && req.side === "open") {
    if (sig.quarantined) return { ok: false, reasons: [{ code: "quarantined", message: `${sym} is quarantined: ${sig.quarantined} No opening ticket until a splits row explains the jump (a split, or factor 1 for news); the tutor adds it.` }] };
    if (sig.state === "warming") return { ok: false, reasons: [{ code: "tier", message: `${sym} is in the small-cap tier and its rule is still warming up (${sig.days ?? "fewer than 128"} closes stored of the 128 the rule needs): no opening ticket yet.` }] };
  }

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

    // Week 9 (decision 20): the account's current value is the capital; the target is split between
    // the instruments the student runs; no more open positions than instruments.
    const instruments = Math.max(1, Math.min(SIZING.maxInstruments, f.student.instruments || 1));
    const target = targetFor(instruments);
    const cur = currentValue(f);
    const openCount = f.positions.filter((p) => p.status === "open").length;
    if (!open && openCount >= instruments) {
      reasons.push({ code: "concentration", message: `Concentration: your account runs ${instruments} instrument${instruments === 1 ? "" : "s"} and ${openCount} position${openCount === 1 ? " is" : "s are"} open (${f.positions.filter((p) => p.status === "open").map((p) => p.symbol).join(", ")}). Close one first, or ask the tutor to set more instruments — each position is then sized at ${SIZING.riskTargetPct}% ÷ N, so adding a name halves, or cuts by a third, the others' size next time they are opened.` });
    }

    // The size is judged whenever it can be, even when another rule already refuses (review F2): the
    // "Oversized" sentence is the week's exit check and must be readable by a student who already holds
    // the position and tries twice the size on purpose.
    let sizing: Sizing | null = null;
    let units = req.units ?? 0;
    if (sig.state === "long" && hasRisk && cur.value > 0) {
      sizing = sizePosition({ capital: cur.value, price: sig.close, instrumentRiskPct: sig.instrument_risk as number, targetPct: target });
      if (!sizing.ok) {
        // The cost check is "not checked" when no share fits — a non-reason, not shown (review N3).
        reasons.push(...sizing.checks.filter((c) => !c.ok && !(c.code === "cost" && !sizing!.checks[0].ok)).map((c) => ({ code: `size_${c.code}`, message: c.message })));
      } else {
        units = req.units ?? sizing.units;
        if (units > sizing.units) {
          const risk = sig.instrument_risk as number;
          const share = instruments > 1 ? ` (${SIZING.riskTargetPct}% ÷ ${instruments} instruments)` : "";
          reasons.push({ code: "oversized", message: `Oversized. At ${risk.toFixed(2)}% instrument risk and the ${fmtPct(target)}% target${share}, an account worth ${money(cur.value)} supports ${money(sizing.targetExposure)} of ${sym} — ${sizing.units} shares at ${money(sig.close)}. You asked for ${units} (${money(units * sig.close)}, ${((units * sig.close) / cur.value * 100).toFixed(0)}% of the account, carrying ${((units * sig.close) / cur.value * risk).toFixed(1)}% a year). The rule's size is the most you can hold; fewer is allowed.` });
        } else if (!reasons.some((r) => r.code === "held" || r.code === "concentration")) {
          // The budget after this ticket: what the open positions carry tonight plus this one, against the whole target
          // (plus the tolerance for whole shares). Not judged when "held" or "concentration" already refuses: its remedy
          // ("fewer shares") would cure neither (review F5 of v0.11.0); "oversized" above is still shown with them (F2).
          const adding = ((units * sig.close) / cur.value) * (sig.instrument_risk as number);
          const after = cur.riskUsedPct + adding;
          if (after > SIZING.riskTargetPct + SIZING.budgetTolerancePct + 1e-9) {
            reasons.push({ code: "budget", message: `Over the risk budget: the open positions carry ${cur.riskUsedPct.toFixed(1)}% a year tonight and ${units} share${units === 1 ? "" : "s"} of ${sym} would add ${adding.toFixed(1)}% — ${after.toFixed(1)}% against the ${SIZING.riskTargetPct}% target (tolerance ${SIZING.budgetTolerancePct} point). Fewer shares, or wait for a stop to do its work.` });
          }
        }
      }
    }
    if (reasons.length) return { ok: false, reasons };
    if (!sizing || !sizing.ok) return { ok: false, reasons: [{ code: "risk", message: `No instrument risk for ${sym} on ${sig.date}: the position cannot be sized.` }] };
    const exposure = units * sig.close;
    const cost = tradeCost(exposure);
    if (exposure + cost > cur.cash + 1e-9) {
      // How many would fit, cost included (review N3 of v0.11.0: the capped case — a share below 12% ÷ N a year — sizes
      // to the whole account, which the fee then exceeds by a few dollars; the sentence says what does fit).
      let fit = Math.min(units, Math.floor(cur.cash / sig.close));
      while (fit > 0 && fit * sig.close + tradeCost(fit * sig.close) > cur.cash + 1e-9) fit--;
      return { ok: false, reasons: [{ code: "cash", message: `Not enough cash: ${money(cur.cash)} available (${money(cur.marketValue)} in ${openCount} open position(s) at the latest close); ${units} shares of ${sym} at ${money(sig.close)} plus the ${money(cost)} cost is ${money(exposure + cost)}.${fit > 0 ? ` ${fit} share${fit === 1 ? "" : "s"} would fit, cost included.` : ""}` }] };
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
