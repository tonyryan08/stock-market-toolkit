/**
 * Week 10 (OI-68): Graham ∩ Carver — the two existing rules read side by side.
 *
 * Graham answers WHAT (the screens, from the accounts, slowly); Carver
 * answers WHEN and HOW MUCH (the rule, from prices, nightly). The course
 * combines them as a gate, in that order: a name must pass a Graham screen
 * AND be LONG on the rule before it would be ticketed; the Starter System
 * sizes it; the stop closes it. No new rule lives here — this file only
 * reads the two that exist and says what they say together. On the 6 Nov
 * 2026 close the gate was empty (the syllabus, week 10): that is the lesson.
 */

import type { ScreenResult, EnterprisingResult, Verdict } from "./graham";
import { CRITERIA, ENTERPRISING } from "./graham";
import { RULE as SIGNAL_RULE } from "./signals";

/** One screen's score for one company, as the watchlist prints it. */
export type ScreenScore = {
  passes: number;
  applicable: number;
  verdict: Verdict;
  /** The failed criteria's short names ("P/E", "P/B"), in the screen's order. */
  failed: string[];
};

export type SignalFacts = {
  symbol: string; name: string | null; tier: string | null;
  date: string; close: number; state: string; state_since?: string | null; forecast: number | null; instrument_risk: number | null;
  days: number; quarantined?: string | null;
};

export type Gate = "open" | "near" | "closed" | "warming" | "quarantined" | "no_books";

export type GateRow = SignalFacts & {
  defensive: ScreenScore | null;
  enterprising: ScreenScore | null;
  /**
   * open: passes a screen outright AND long — what the course would ticket.
   * near: a near miss on a screen (one test short) AND long — the class's reading list.
   * closed: everything else with books and a mature rule.
   * quarantined / warming: the rule is not ready (the small tier) — these come first, whatever the books say;
   * no_books: a mature rule but no accounts cached yet.
   */
  gate: Gate;
};

export function scoreOf(r: ScreenResult | EnterprisingResult | undefined): ScreenScore | null {
  if (!r) return null;
  const names = new Map<string, string>([...CRITERIA, ...ENTERPRISING].map((c) => [c.id, c.short]));
  return {
    passes: r.passes,
    applicable: r.applicable,
    verdict: r.verdict,
    failed: r.results.filter((c) => c.outcome === "fail").map((c) => names.get(c.id) ?? c.id),
  };
}

export function gateOf(s: SignalFacts, defensive: ScreenScore | null, enterprising: ScreenScore | null): GateRow {
  const passes = (x: ScreenScore | null) => !!x && (x.verdict === "survivor" || x.verdict === "candidate");
  const near = (x: ScreenScore | null) => !!x && x.verdict === "near_miss";
  // the rule's own states first (they are about the price series), then the books
  let gate: Gate;
  if (s.quarantined) gate = "quarantined";
  else if (s.state === "warming") gate = "warming";
  else if (!defensive && !enterprising) gate = "no_books";
  else if (s.state === "long" && (passes(defensive) || passes(enterprising))) gate = "open";
  else if (s.state === "long" && (near(defensive) || near(enterprising))) gate = "near";
  else gate = "closed";
  return { ...s, defensive, enterprising, gate };
}

/** "4/7 · 5/6" — the two scores as the signals page prints them; "—" with no books. */
export function scoresText(r: { defensive: ScreenScore | null; enterprising: ScreenScore | null }): string {
  if (!r.defensive && !r.enterprising) return "—";
  const one = (x: ScreenScore | null) => (x ? `${x.passes}/${x.applicable}` : "—");
  return `${one(r.defensive)} · ${one(r.enterprising)}`;
}

export type Watchlist = {
  asOf: string | null;
  open: GateRow[];
  near: GateRow[];
  /** Long and mature, no near miss: the rule's longs that fail both screens, sorted by the most defensive tests passed. */
  longs: GateRow[];
  /** The small tier on its way to 128 closes, nearest first, with its scores. */
  maturing: GateRow[];
  /** Quarantined names (any state): named in the reading so the tutor sees what wants a splits row (review N7). */
  quarantined: GateRow[];
  counts: { rows: number; long: number; open: number; near: number; survivors: number; candidates: number; warming: number; quarantined: number };
};

export function buildWatchlist(rows: GateRow[]): Watchlist {
  const asOf = rows.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
  const byTests = (a: GateRow, b: GateRow) => (b.defensive?.passes ?? -1) - (a.defensive?.passes ?? -1) || (b.enterprising?.passes ?? -1) - (a.enterprising?.passes ?? -1) || a.symbol.localeCompare(b.symbol);
  const open = rows.filter((r) => r.gate === "open").sort(byTests);
  const near = rows.filter((r) => r.gate === "near").sort(byTests);
  const longs = rows.filter((r) => r.gate === "closed" && r.state === "long").sort(byTests);
  const maturing = rows.filter((r) => r.gate === "warming").sort((a, b) => b.days - a.days || a.symbol.localeCompare(b.symbol));
  const quarantined = rows.filter((r) => r.gate === "quarantined").sort((a, b) => a.symbol.localeCompare(b.symbol));
  return {
    asOf, open, near, longs, maturing, quarantined,
    counts: {
      rows: rows.length,
      long: rows.filter((r) => r.state === "long").length,
      open: open.length, near: near.length,
      survivors: rows.filter((r) => r.defensive?.verdict === "survivor").length,
      candidates: rows.filter((r) => r.enterprising?.verdict === "candidate").length,
      warming: rows.filter((r) => r.state === "warming").length,
      quarantined: rows.filter((r) => !!r.quarantined).length,
    },
  };
}

/** The watchlist's sentences — statements about the two rules' state tonight, never a pick. */
export function describeWatchlist(w: Watchlist): string[] {
  const out: string[] = [];
  const c = w.counts;
  if (c.open === 0) {
    out.push(`The gate tonight: nothing. ${c.survivors === 0 && c.candidates === 0 ? "No company passes either Graham screen" : `${c.survivors + c.candidates} name${c.survivors + c.candidates === 1 ? " passes" : "s pass"} a Graham screen but ${c.survivors + c.candidates === 1 ? "is" : "are"} not long on the rule`}, so there is no name the course would write a ticket for by both rules — the rules' answer is to hold cash, and a journal line that says "waiting".`);
  } else {
    out.push(`The gate tonight: ${c.open} name${c.open === 1 ? "" : "s"} pass${c.open === 1 ? "es" : ""} a Graham screen and ${c.open === 1 ? "is" : "are"} long on the rule — ${w.open.map((r) => r.symbol).join(", ")}. The Starter System sizes it; the stop closes it; the ticket is the student's.`);
  }
  // the caution prints every night, with or without a near miss (review H5: the lesson says it is on the page)
  out.push(c.near === 0
    ? "No near miss is long tonight. A near miss is a reading list, not a pick."
    : `${c.near} near miss${c.near === 1 ? " is" : "es are"} long — one Graham test short and the rule says so: ${w.near.map((r) => `${r.symbol} (${[r.defensive?.verdict === "near_miss" ? `defensive, fails ${r.defensive.failed.join(", ") || "—"}` : "", r.enterprising?.verdict === "near_miss" ? `enterprising, fails ${r.enterprising.failed.join(", ") || "—"}` : ""].filter(Boolean).join("; ")})`).join("; ")}. A near miss is a reading list, not a pick.`);
  if (w.longs.length) {
    const top = w.longs.slice(0, 4);
    // a screen that could not be completed (an unreadable test — "insufficient") is named as such, not as a fail (review N8)
    const incomplete = w.longs.filter((r) => r.defensive?.verdict === "insufficient" || r.enterprising?.verdict === "insufficient").length;
    out.push(`${c.long} name${c.long === 1 ? " is" : "s are"} long on the rule; ${w.longs.length} of ${c.long === 1 ? "it" : "them"} fail${w.longs.length === 1 ? "s" : ""}${incomplete ? ` (or, for ${incomplete}, cannot complete)` : ""} both screens. By defensive tests passed, the nearest: ${top.map((r) => `${r.symbol} ${scoresText(r)}`).join(", ")}. Lesson 10's point: P/E ≤ 15 and P/B ≤ 1.5 are 1970s bars against a 2026 US large-cap market, and the rule does not care.`);
  }
  if (w.maturing.length) {
    const first = w.maturing[0];
    out.push(`${c.warming} small cap${c.warming === 1 ? "" : "s"} still warming up (fewer than ${SIGNAL_RULE.minMatureDays} closes); the nearest, ${first.symbol}, has ${first.days} — ticketable once it has ${SIGNAL_RULE.minMatureDays} and no quarantine.`);
  }
  // a quarantined name is on no table (its rule is not trusted); the tutor must act on it, so it is named here (review N7)
  if (w.quarantined.length) {
    out.push(`${w.quarantined.length} quarantined tonight — ${w.quarantined.map((r) => r.symbol).join(", ")}: a jump in the series no splits row explains; no tickets until the row is added (the Q on the signals page has the reason).`);
  }
  return out;
}
