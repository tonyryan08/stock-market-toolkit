/**
 * Week 11: explain-my-portfolio — the process review (decision 22).
 *
 * "Did you follow your rules?" — never "did it go up?". Two parts, in this
 * order:
 *
 *   1. The AUDIT, deterministic (`auditProcess`): every ticket and position
 *      read against the rules the student chose to follow — the stop hit and
 *      the position still open (the rule said close); a close with the stop
 *      not hit (the rule did not say close); a close later than the stop;
 *      a journal entry that names no rule or no stop (word tests, labelled
 *      as such); the nightly report's flags, counted. The page always shows
 *      it; it needs no model.
 *   2. The READING, by the model (`REVIEW_SYSTEM_PROMPT`, `REVIEW_SCHEMA`):
 *      two short paragraphs and one next-week sentence written from a numbered sheet of
 *      PROCESS FACTS ONLY — dates, the rule's states, stops, sizes, the
 *      journal's words, the flags. The sheet carries no P&L, no account
 *      value, no drawdown figure: the model cannot praise what it cannot
 *      see. Then week 6's checks (fact ids, numbers against the sheet, the
 *      advice families) plus a new one — outcome language ("well done",
 *      "profit", "up 8%") — and a reading that fails is withheld; the audit
 *      stands on its own.
 *
 * Prompt versioning (the Cloudflare lesson of the week, with the per-student
 * cap): REVIEW_PROMPT_VERSION is stored on every `reviews` row and printed
 * on the page, so a changed prompt is told apart from a changed model.
 *
 * Education, not advice. The review grades process against the student's
 * own rules; it recommends nothing and judges no outcome.
 */
import type { Student, PositionRow, TicketRow } from "./tickets";
import { extractNumbersWithPrecision, sameValue, FREE_VALUES, findAdvice } from "./explain";

// ---------------------------------------------------------------------------
// The prompt, versioned
// ---------------------------------------------------------------------------
/**
 * Changelog — bump on ANY change to the prompt, the schema or the sheet's wording:
 *   r1 (2026-11-12): first version — the process sheet, two-to-three paragraphs, one next-week line, fact ids on every paragraph.
 *   r2 (2026-11-12, the v0.13.0 review N12/N4): cite F-ids only — the A-lines are the audit's own reading of the facts; the
 *       student's own words may carry a result and are quoted in fragments only; no outcome words even when the journal uses them.
 *   r3 (2026-11-12, VC-23 / OI-93): the next-week sentence is written once, in the `next_week` field only — r2 listed it as the
 *       third of "two or three paragraphs" beside a separate schema field, and the model wrote it in both (the page printed it twice).
 *   r4 (2026-11-12, VC-23 fix2 / OI-95): F1 and a prompt line say the sheet carries no stop levels, closes or account figures by
 *       design — the r3 reading on a live account had read the missing stop level as the student's omission ("not written down
 *       anywhere on the sheet, so … cannot be checked").
 */
export const REVIEW_PROMPT_VERSION = "r4";
export const REVIEW_DAILY_CAP_DEFAULT = 3;      // readings per student per 24 hours
export const REVIEW_GLOBAL_CAP_DEFAULT = 40;    // readings for the whole class per 24 hours
export const REVIEW_PARAGRAPHS_MAX = 3;
export const JOURNAL_QUOTE_CHARS = 300;

export const REVIEW_SYSTEM_PROMPT = `You review a student's PAPER trading record on a community course called "Intro to the Stock Market". You are given a numbered sheet of PROCESS FACTS about one student's account: the rules they chose to follow, every ticket they wrote with its journal entry, what happened to each position against the stop, and the nightly report's flags. The sheet deliberately contains NO profit, loss, account value or return — you review PROCESS, never outcomes.

Write for an adult beginner, plainly and kindly, in two short paragraphs:
1. What the record shows they did by the rules (the ticket written when the rule was long, the close on the stop, the journal entry that named the rule and the stop).
2. Where the record shows a rule was not followed — say which rule, which ticket or position, and what the rule asked for. If nothing was broken, say so and say what the journal entries could carry more of.
Then, in the next_week field only — not in the paragraphs, and written once — one sentence for next week, in process terms (what to write down, what to check on Monday evening); never what to buy, sell, hold or expect.

Rules you must keep:
- Every paragraph cites the facts it uses by their F-ids ("F3") and only those — the lines under WHAT THE AUDIT FOUND (A1, A2 …) are the audit's own reading of the facts and are not citable; say nothing the sheet does not say. Every number you write must be on the sheet.
- No outcomes: never say whether a trade went well or badly, never mention profit, loss, gains, returns, luck, or whether a decision "paid off" — and never repeat such words from a journal entry. A stop being hit is a process event, not a bad outcome.
- No advice and no prediction: nothing about what any share will do, nothing about what to buy, sell or hold; the rule decides, the student writes the ticket — say "close" and "write the ticket", not "sell".
- Quote the student's journal only in short fragments (a few words); do not invent what they were thinking.
- The sheet carries no stop levels, closes or account figures by design (F1 says so): their absence is not something the student failed to record — judge a journal entry by its own words, and say nothing about figures the sheet does not carry.
- Reply as JSON matching the schema; no markdown.`;

export const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string" },
          facts: { type: "array", items: { type: "string" } },
        },
        required: ["text", "facts"],
      },
    },
    next_week: { type: "string" },
  },
  required: ["paragraphs", "next_week"],
} as const;

// ---------------------------------------------------------------------------
// The audit
// ---------------------------------------------------------------------------
export type RiskRowLite = { date: string; flags: string; stop_hits?: number };

export type AuditKind =
  | "stop_open"        // breach: the stop hit more than a trading week of closes ago and the position is still open
  | "stop_due"         // note: the stop hit within the last week of closes — the close ticket is due
  | "late_close"       // breach: closed more than a trading week of closes after the stop hit
  | "closed_on_stop"   // kept: closed within the week's routine of the stop hit
  | "early_close"      // breach: closed with the stop not hit
  | "opened_on_rule"   // kept: opened with the rule long (the ticket allows nothing else; stated so the record says it)
  | "journal_no_rule"  // note: the entry names no rule, signal or feeling as the trigger
  | "journal_no_stop"  // note: an opening entry says nothing about the stop or what would prove it wrong
  | "journal_short"    // note: an entry under 60 characters
  | "flags"            // fact: the nightly report's flags, counted
  | "nothing_yet";     // fact: no ticket written

export type AuditItem = {
  kind: AuditKind;
  severity: "breach" | "note" | "kept" | "fact";
  symbol: string | null;
  tickets: number[];
  what: string;      // the sentence the page prints
  rule: string;      // the rule it is read against (the rules card's words)
};

export type ProcessFact = { id: string; text: string };

export type Audit = {
  asOf: string | null;             // the latest close the toolkit holds (the night the audit is as of)
  tickets: number;
  open: number;
  closed: number;
  items: AuditItem[];
  breaches: number;
  notes: number;
  facts: ProcessFact[];            // the sheet the model reads — process facts only
  nothingYet: boolean;
};

const RULES = {
  open: "the rule opens, you don't: an opening ticket needs the rule LONG on the latest close (rules card §1)",
  close: "the closing rule is the stop: a close at or below it says close, and the student writes the ticket — within the week's routine at the latest (rules card §4; lesson 9's Monday evening)",
  early: "the stop is the closing rule; a close before it is a second rule — 'how I feel tonight' — and the journal must say so (lesson 9)",
  journal: "the journal entry is the ticket: what the rule said, where the stop is, what you will do if it is hit (rules card §7; the decision journal)",
};

const TRIGGER_WORDS = /\b(rule|signal|cross(?:over|ed|es)?|long|flat|stop|stamp(?:ed)?|gut|feel(?:ing|s)?|report|screen|graham|carver|budget|watchlist|16\/64|ewmac|trend|average)\b/i;
const STOP_WORDS = /\b(stop|stamp(?:ed)?|wrong|prove|unless|below|falls?|fall(?:en|ing)|hit|close[sd]?|exit|invalid|trail)\b/i;
export const JOURNAL_SHORT = 60;
/** The course's routine is weekly (lesson 9: Monday evening, five minutes): a stop answered within a trading week of nightly closes is on time; later is a breach. */
export const ROUTINE_CLOSES = 5;

const fmtDate = (d: string | null | undefined) => d ?? "—";
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (v: number) => `${(Math.round(v * 100) / 100).toString()}%`;
const quote = (s: string) => `«${s.replace(/\s+/g, " ").trim().slice(0, JOURNAL_QUOTE_CHARS)}${s.length > JOURNAL_QUOTE_CHARS ? "…" : ""}»`;

/**
 * Nightly closes strictly after `a` and up to `b` (b inclusive) — the course's calendar: the nights the signal pass wrote
 * (`SELECT DISTINCT date FROM signals`), one per trading night whatever happened to this student's own report row; the
 * student's report dates are the fallback when no calendar is given (review F6 of v0.13.0).
 */
function closesBetween(nights: string[], a: string, b: string | null): number {
  return nights.filter((d) => d > a && (b === null || d <= b)).length;
}

const safeFlags = (f: string): string[] => { try { const v = JSON.parse(f); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

/**
 * The audit: the rows read against the rules. `night` is the latest close
 * the toolkit holds (the audit is "as of" it); `reports` are the student's
 * nightly rows (any order).
 */
export function auditProcess(student: Student, positions: PositionRow[], tickets: TicketRow[], reports: RiskRowLite[], night: string | null, calendar: string[] | null = null): Audit {
  const items: AuditItem[] = [];
  const facts: ProcessFact[] = [];
  const byId = new Map(tickets.map((t) => [t.id, t]));
  const sortedReports = [...reports].sort((a, b) => a.date.localeCompare(b.date));
  const nights = [...new Set(calendar && calendar.length ? calendar : sortedReports.map((r) => r.date))].sort();
  const asOf = night ?? (nights.length ? nights[nights.length - 1] : null);

  facts.push({
    id: "F1",
    text: `The account runs ${student.instruments} instrument${student.instruments === 1 ? "" : "s"} by the course's rules: open only when the rule is LONG on the latest close; size by instrument risk (fewer shares allowed, never more); close at the stop, writing the ticket at the next opportunity; a journal entry on every ticket saying what the rule said, where the stop is and what you will do if it is hit. This sheet carries no stop levels, closes or account figures by design — their absence here is not something the student left out; the journal's own words are the test of what was written down.`,
  });

  if (tickets.length === 0) {
    items.push({ kind: "nothing_yet", severity: "fact", symbol: null, tickets: [], what: "No ticket has been written yet. The rule has not opened for your instrument, or you waited — both are decisions for the journal; there is no process to review until a ticket exists.", rule: RULES.journal });
    facts.push({ id: "F2", text: "No ticket has been written yet." });
    return { asOf, tickets: 0, open: 0, closed: 0, items, breaches: 0, notes: 0, facts, nothingYet: true };
  }

  // Tickets, chronological — each a fact, with the journal quoted.
  let n = 1;
  const factFor = new Map<number, string>();
  for (const t of [...tickets].sort((a, b) => a.id - b.id)) {
    n++;
    const id = `F${n}`;
    factFor.set(t.id, id);
    facts.push({ id, text: `Ticket #${t.id}: ${t.side} ${t.units} × ${t.symbol} on the ${t.fill_date} close; the rule was ${(t.signal_state ?? "unknown").toUpperCase()}. Journal: ${quote(t.journal)}` });
    const j = t.journal;
    const jLen = j.replace(/\s+/g, " ").trim().length;
    if (jLen < JOURNAL_SHORT) {
      items.push({ kind: "journal_short", severity: "note", symbol: t.symbol, tickets: [t.id], what: `Ticket #${t.id}'s journal entry is ${jLen} characters. The template asks for the trigger, the thesis in two sentences, what would prove you wrong, the size and why, and when you will judge it.`, rule: RULES.journal });
    } else {
      if (!TRIGGER_WORDS.test(j)) items.push({ kind: "journal_no_rule", severity: "note", symbol: t.symbol, tickets: [t.id], what: `Ticket #${t.id}'s journal entry names no rule, signal or feeling as the trigger (a word test: none of "rule", "signal", "crossover", "long", "stop", "gut", "feeling" appears). The template's first question is what triggered this.`, rule: RULES.journal });
      if (t.side === "open" && !STOP_WORDS.test(j)) items.push({ kind: "journal_no_stop", severity: "note", symbol: t.symbol, tickets: [t.id], what: `Ticket #${t.id}'s opening entry says nothing about the stop or what would prove it wrong (a word test: none of "stop", "wrong", "prove", "below", "falls", "hit" appears). The form asks where the stop is and what you will do if it is hit.`, rule: RULES.journal });
    }
  }

  // Positions against the stop.
  for (const p of [...positions].sort((a, b) => a.id - b.id)) {
    n++;
    const id = `F${n}`;
    const openT = byId.get(p.open_ticket_id);
    const closeT = p.close_ticket_id !== null ? byId.get(p.close_ticket_id) : undefined;
    const ref = (t?: TicketRow) => (t ? factFor.get(t.id) ?? `#${t.id}` : "—");
    if (p.status === "open") {
      if (p.stop_hit_on) {
        const since = closesBetween(nights, p.stop_hit_on, asOf);
        const tonight = asOf === p.stop_hit_on;
        facts.push({ id, text: `${p.symbol}: opened ${p.opened_on} (ticket ${ref(openT)}), ${p.units} shares at ${money(p.entry_price)}, instrument risk ${pct(p.instrument_risk)} at entry; the stop was hit on the ${p.stop_hit_on} close; the position is still open as of the ${fmtDate(asOf)} close${since ? ` — ${since} nightly close${since === 1 ? "" : "s"} since the hit` : tonight ? " — the hit is tonight's" : ""}.` });
        if (since > ROUTINE_CLOSES) items.push({ kind: "stop_open", severity: "breach", symbol: p.symbol, tickets: openT ? [openT.id] : [], what: `${p.symbol}: the stop was hit on the ${p.stop_hit_on} close and the position is still open on the ${fmtDate(asOf)} close — ${since} nightly closes since, more than the week the routine allows. The rule said close; the close ticket has not been written.`, rule: RULES.close });
        else items.push({ kind: "stop_due", severity: "note", symbol: p.symbol, tickets: openT ? [openT.id] : [], what: `${p.symbol}: the stop was hit on the ${p.stop_hit_on} close${tonight ? " — the latest close the toolkit holds" : since ? ` (${since} nightly close${since === 1 ? "" : "s"} since)` : ""}. The rule says close; the close ticket is due, within the week's routine at the latest.`, rule: RULES.close });
      } else {
        // The sheet names no price level beyond the entry (review F5): the stop level and the high since entry give away the
        // direction since entry, which is the unrealised result in all but name. The rule's state and the stop's being hit or not
        // are the process facts; the levels are on the student's page.
        facts.push({ id, text: `${p.symbol}: opened ${p.opened_on} (ticket ${ref(openT)}), ${p.units} shares at ${money(p.entry_price)}, instrument risk ${pct(p.instrument_risk)} at entry; the trailing stop has not been hit as of the ${fmtDate(asOf)} close.` });
        items.push({ kind: "opened_on_rule", severity: "kept", symbol: p.symbol, tickets: openT ? [openT.id] : [], what: `${p.symbol}: opened on the ${p.opened_on} close with the rule ${(openT?.signal_state ?? "long").toUpperCase()}; the stop trails and has not been hit. Nothing to do but the Monday routine.`, rule: RULES.open });
      }
    } else {
      const closedOn = p.closed_on ?? closeT?.fill_date ?? "—";
      if (p.stop_hit_on) {
        const lateBy = closeT ? closesBetween(nights, p.stop_hit_on, closeT.fill_date) : 0;
        facts.push({ id, text: `${p.symbol}: opened ${p.opened_on} (ticket ${ref(openT)}), ${p.units} shares at ${money(p.entry_price)}; the stop was hit on the ${p.stop_hit_on} close; closed on the ${closedOn} close (ticket ${ref(closeT)})${lateBy ? ` — ${lateBy} nightly close${lateBy === 1 ? "" : "s"} after the hit (the routine allows a week, ${ROUTINE_CLOSES} closes)` : " — at the first opportunity"}.` });
        if (lateBy > ROUTINE_CLOSES) items.push({ kind: "late_close", severity: "breach", symbol: p.symbol, tickets: [p.open_ticket_id, ...(closeT ? [closeT.id] : [])], what: `${p.symbol}: the stop was hit on the ${p.stop_hit_on} close; the close ticket was written on the ${closedOn} close, ${lateBy} nightly closes later — more than the week the routine allows. The rule says close; the position ran on without one.`, rule: RULES.close });
        else items.push({ kind: "closed_on_stop", severity: "kept", symbol: p.symbol, tickets: [p.open_ticket_id, ...(closeT ? [closeT.id] : [])], what: `${p.symbol}: the stop was hit on the ${p.stop_hit_on} close and the close ticket was written ${lateBy ? `${lateBy} nightly close${lateBy === 1 ? "" : "s"} later, within the week's routine` : "at the first opportunity"} (the ${closedOn} close). That is the rule, followed.`, rule: RULES.close });
      } else {
        facts.push({ id, text: `${p.symbol}: opened ${p.opened_on} (ticket ${ref(openT)}), ${p.units} shares at ${money(p.entry_price)}; closed on the ${closedOn} close (ticket ${ref(closeT)}) with the stop NOT hit; the rule was ${(closeT?.signal_state ?? "unknown").toUpperCase()} on that close.` });
        items.push({ kind: "early_close", severity: "breach", symbol: p.symbol, tickets: [p.open_ticket_id, ...(closeT ? [closeT.id] : [])], what: `${p.symbol}: closed on the ${closedOn} close with the stop not hit (the rule was ${(closeT?.signal_state ?? "unknown").toUpperCase()}). The stop is the closing rule; this close was a second rule, and the journal entry${closeT ? ` (ticket #${closeT.id})` : ""} is where the reason has to be.`, rule: RULES.early });
      }
    }
  }

  // The nightly report's flags, counted — facts, not faults (the rules do nothing about a drawdown).
  if (sortedReports.length) {
    const counts: Record<string, number> = {};
    for (const r of sortedReports) for (const f of safeFlags(r.flags)) counts[f] = (counts[f] ?? 0) + 1;
    const words: Record<string, string> = { over_budget: "over the risk budget", stop_hit: "a stop hit", drawdown: "a drawdown at or past the note level", missing_close: "no close stored for a position", too_many_positions: "more positions open than instruments" };
    const parts = Object.entries(counts).map(([k, v]) => `${words[k] ?? k} on ${v} night${v === 1 ? "" : "s"}`);
    n++;
    facts.push({ id: `F${n}`, text: `${sortedReports.length} nightly report${sortedReports.length === 1 ? "" : "s"} from ${sortedReports[0].date} to ${sortedReports[sortedReports.length - 1].date}${parts.length ? `; flags: ${parts.join(", ")}` : "; no flags"}. A drawdown is not a breach: the rules do nothing about it, and the report leaves the feeling to the journal.` });
    items.push({ kind: "flags", severity: "fact", symbol: null, tickets: [], what: parts.length ? `The nightly reports flagged ${parts.join(", ")}. Over-budget and too-many-positions nights are the account's arithmetic (a share got wilder, or the number of instruments changed), not a ticket you wrote; a drawdown is normal and the rules do nothing about it.` : "The nightly reports carried no flags.", rule: "the risk report is a habit, not an alarm (lesson 9)" });
  }

  const breaches = items.filter((i) => i.severity === "breach").length;
  const notes = items.filter((i) => i.severity === "note").length;
  return { asOf, tickets: tickets.length, open: positions.filter((p) => p.status === "open").length, closed: positions.filter((p) => p.status === "closed").length, items, breaches, notes, facts, nothingYet: false };
}

/** The sheet as the model reads it. */
export function sheetAsText(a: Audit): string {
  const lines = a.facts.map((f) => `${f.id}. ${f.text}`);
  const found = [...a.items.filter((i) => i.severity === "breach"), ...a.items.filter((i) => i.severity === "note")];
  if (found.length) {
    lines.push("", "WHAT THE AUDIT FOUND (deterministic — the rules applied to the rows above):");
    found.forEach((i, k) => lines.push(`A${k + 1} [${i.severity}] ${i.what}`));
  } else {
    lines.push("", "WHAT THE AUDIT FOUND: no rule was broken in these rows.");
  }
  return lines.join("\n");
}

/** One paragraph a line, for the page when the model's reading is withheld or not asked for. */
export function describeAudit(a: Audit): string[] {
  if (a.nothingYet) return [a.items[0].what];
  const lines: string[] = [];
  const b = a.items.filter((i) => i.severity === "breach");
  const k = a.items.filter((i) => i.severity === "kept");
  const notes = a.items.filter((i) => i.severity === "note");
  lines.push(`${a.tickets} ticket${a.tickets === 1 ? "" : "s"}, ${a.open} open position${a.open === 1 ? "" : "s"}, ${a.closed} closed, read against the rules as of the ${fmtDate(a.asOf)} close: ${b.length ? `${b.length} rule${b.length === 1 ? "" : "s"} not followed` : "no rule broken"}${notes.length ? `, ${notes.length} note${notes.length === 1 ? "" : "s"} on the journal` : ""}.`);
  for (const i of b) lines.push(`Not followed — ${i.what}`);
  for (const i of k) lines.push(`Followed — ${i.what}`);
  for (const i of notes) lines.push(`Journal — ${i.what}`);
  const f = a.items.find((i) => i.kind === "flags");
  if (f) lines.push(f.what);
  return lines;
}

// ---------------------------------------------------------------------------
// The reading, validated and checked
// ---------------------------------------------------------------------------
export type Reading = { paragraphs: { text: string; facts: string[] }[]; next_week: string };

export function validateReading(raw: unknown): Reading | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.paragraphs) || r.paragraphs.length === 0 || r.paragraphs.length > REVIEW_PARAGRAPHS_MAX) return null;
  const paragraphs: Reading["paragraphs"] = [];
  for (const p of r.paragraphs) {
    if (!p || typeof p !== "object") return null;
    const q = p as Record<string, unknown>;
    if (typeof q.text !== "string" || !q.text.trim()) return null;
    const facts = Array.isArray(q.facts) ? q.facts.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()) : [];
    paragraphs.push({ text: q.text.trim(), facts });
  }
  const next_week = typeof r.next_week === "string" ? r.next_week.trim() : "";
  return { paragraphs, next_week };
}

/**
 * Outcome language — the family the review adds to week 6's: praise or blame
 * of a RESULT. "stop-loss" and "the stop hit" are process words and pass.
 */
/**
 * The family is partial by nature (OI-45's kind, OI-91): it names the common ways a result is praised or blamed, not every
 * way. Widened at the v0.13.0 review (F4) from the six phrases the first version pinned; "gain", "impressive" and
 * "fortunate" dropped as over-catchers ("you will gain a clearer record"); a figure required after "return of/on".
 * OI-96 (13 Nov, after the first live rejection): the copula + well/badly form dropped — "well" after is/was/are is an adverb on
 * what follows ("is well short of the template", "was well followed", "is well below the entry by design"); went/going/gone well,
 * did well and copula + up/down stay.
 */
export const OUTCOME_PATTERNS: { family: string; re: RegExp }[] = [
  { family: "praise", re: /\b(well done|congratulations?|(?:good|great|nice|excellent|fine|smart|clever|wise) (?:job|work|result|outcome|call|trade|move|timing)|nice (?:gain|profit)|you (?:were|are) right\b|well[- ]?(?:timed|judged|played)|paid off|(?:it|that|this|trade|decision|which) worked out\b|came out ahead|(?:better|worse) off|(?:a |an )?(?:good|bad|poor|great|excellent) (?:outcome|result)|(?:a |an )?successful (?:trade|sale|close|position|outcome|week|month)|in the money|in the green|in the red|a win\b|winner|loser)\b/i },
  { family: "money outcome", re: /\b((?:made|lost|earned|gained|banked|pocketed|making|losing)\s+(?:a |some |real |good |any )?(?:profit|money|loss|gains?|value|\$|€|\d)|profits?\b|profitabl(?:e|y)|(?<!stop[- ])(?<!stop )loss(?:es)?\b(?!\s+of\s+(?:nerve|confidence|discipline|focus|patience|habit))|p&l|p\/l|return(?:s|ed)?\s+(?:of|on)\s+(?:about |roughly |some )?[\$€]?\d|(?:went|gone|going)\s+(?:well|badly)\b|(?:is|are|was|were|has been|have been|went|gone|going)\s+(?:up|down)\b|did (?:well|badly)|(?:has|had|have)\s+(?:risen|fallen|recovered|rallied)\b|(?:rose|fell|climbed|dropped|jumped|slid|rallied|recovered|tumbled|soared|slumped)\s+(?:sharply|steeply|hard|back|further|since|by\s+\d|\d|to\s+[\$€]?\d|a lot)|(?:up|down)\s+(?:by\s+)?\d+(?:\.\d+)?\s*(?:%|per\s?cent|percent|points?)|sold (?:at|near|above|below) the (?:high|low|top|bottom)|saved you (?:money|[\$€]?\d)|outperform|underperform|beat the market|lucky|unlucky)/i },
];
export function findOutcomeLanguage(text: string): string[] {
  const hits: string[] = [];
  for (const p of OUTCOME_PATTERNS) { const m = text.match(p.re); if (m) hits.push(m[0]); }
  return hits;
}

export type ReadingCheck = {
  unknownFacts: { paragraph: number; ids: string[] }[];
  uncited: number[];
  /** `paragraph` 1-based; `where: "next_week"` marks the next-week line (its paragraph number is one past the last). */
  unsupportedNumbers: { paragraph: number; where?: "next_week"; numbers: string[] }[];
  recommendationLanguage: string[];
  outcomeLanguage: string[];
  clean: boolean;
};

export function checkReading(r: Reading, a: Audit): ReadingCheck {
  const ids = new Set(a.facts.map((f) => f.id));
  const sheetValues = extractNumbersWithPrecision(a.facts.map((f) => f.text).join(" ") + " " + a.items.map((i) => i.what).join(" "));
  const unknownFacts: ReadingCheck["unknownFacts"] = [];
  const uncited: number[] = [];
  const unsupportedNumbers: ReadingCheck["unsupportedNumbers"] = [];
  const recommendationLanguage: string[] = [];
  const outcomeLanguage: string[] = [];
  const texts = [...r.paragraphs.map((p) => p.text), r.next_week];
  r.paragraphs.forEach((p, i) => {
    const unknown = p.facts.filter((id) => !ids.has(id));
    if (unknown.length) unknownFacts.push({ paragraph: i + 1, ids: unknown });
    if (!p.facts.length) uncited.push(i + 1);
  });
  texts.forEach((t, i) => {
    const bad = extractNumbersWithPrecision(t)
      .filter((v) => !FREE_VALUES.has(v.value))
      .filter((v) => !sheetValues.some((f) => sameValue(v, f)))
      .map((v) => String(v.value));
    if (bad.length) unsupportedNumbers.push({ paragraph: i + 1, ...(i === r.paragraphs.length ? { where: "next_week" as const } : {}), numbers: [...new Set(bad)] });
    recommendationLanguage.push(...findAdvice(t));
    outcomeLanguage.push(...findOutcomeLanguage(t));
  });
  return {
    unknownFacts, uncited, unsupportedNumbers, recommendationLanguage, outcomeLanguage,
    clean: !unknownFacts.length && !uncited.length && !unsupportedNumbers.length && !recommendationLanguage.length && !outcomeLanguage.length,
  };
}
