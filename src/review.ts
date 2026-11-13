/**
 * Week 11: the process review — `GET /api/explain-my-portfolio/:code` (the
 * audit; with `?ai=1` the model's reading too — a GET spends nothing unless
 * asked, review F10 of v0.13.0), `GET /tickets/:code/review` (the page: the
 * audit always, the last stored reading, a button for a fresh one) and
 * `POST /tickets/:code/review` (the button: a reading, then a redirect to the
 * page carrying the row's id, so a refresh never spends a second one).
 *
 * The path of a reading: load the student's rows (positions, tickets, the
 * nightly reports, the latest close) → audit them against the rules (pure,
 * `src/lib/review.ts`) → no ticket yet: say so, no model call → the
 * student's or the class's daily budget spent: the audit only → write the
 * `pending` receipt first and count it (the tutor's shape, review F4 of
 * v0.12.0) → ask the model with the PROCESS sheet (no P&L on it) → validate
 * the JSON → check it (fact ids, uncited paragraphs, numbers, advice, OUTCOME
 * language) → a reading that fails ANY check is withheld (review F1), the
 * audit stands → update the receipt and write a `fetch_log` line. The prompt
 * version rides on every row.
 *
 * Composition is the Cloudflare lesson of the week: four D1 reads become one
 * grounded prompt; the per-student counter is a D1 count over `reviews`
 * (the syllabus said KV — one store is simpler and the pattern already
 * exists, decision #22); the audit never needs the model.
 */
import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, esc, SHARED_CSS } from "./page";
import { intSetting } from "./lib/settings";
import { DEFAULT_MODEL, claudeJson, extractJson } from "./lib/narrative";
import { ownerGate } from "./lib/access";
import { CODE, type Student, type PositionRow, type TicketRow } from "./lib/tickets";
import { SIZING } from "./lib/sizing";
import {
  REVIEW_PROMPT_VERSION, REVIEW_DAILY_CAP_DEFAULT, REVIEW_GLOBAL_CAP_DEFAULT, REVIEW_SYSTEM_PROMPT, REVIEW_SCHEMA,
  auditProcess, sheetAsText, describeAudit, validateReading, checkReading,
  type Audit, type Reading, type ReadingCheck, type RiskRowLite,
} from "./lib/review";

type Env = {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  EXPLAIN_MODEL?: string;
  EXPLAIN_API_URL?: string;
  REVIEW_DAILY_CAP?: string;
  REVIEW_GLOBAL_CAP?: string;
};

export const review = new Hono<{ Bindings: Env }>();

const NOTE = "Education, not advice. The review grades process against the rules the student chose — did you follow them? — and judges no outcome: the sheet the AI reads carries no profit, loss or account value. It recommends nothing.";

export type ReviewOutcome = "audit_only" | "answered" | "rejected" | "capped" | "error" | "nothing_yet" | "not_found" | "invalid";

export type ReviewResult = {
  code: string;
  name: string | null;
  outcome: ReviewOutcome;
  audit: Audit | null;
  reading: Reading | null;
  grounding: ReadingCheck | null;
  reason: string | null;
  meta: { model: string | null; tokens: { input: number; output: number } | null; ms: number | null; prompt_version: string; daily_cap: number; asked_at: string | null; used_today: number | null; row_id: number | null };
};

// ---------------------------------------------------------------------------
// The rows
// ---------------------------------------------------------------------------
async function loadStudent(db: D1Database, code: string): Promise<Student | null> {
  const s = await db.prepare("SELECT code, name, capital, instruments FROM students WHERE code = ?1").bind(code).first<Student>();
  return s ? { ...s, instruments: Math.max(1, Math.min(SIZING.maxInstruments, Number(s.instruments) || 1)) } : null;
}
async function loadRows(db: D1Database, code: string): Promise<{ positions: PositionRow[]; tickets: TicketRow[]; reports: RiskRowLite[]; night: string | null; calendar: string[] }> {
  const [positions, tickets, reports, night, calendar] = await Promise.all([
    db.prepare("SELECT * FROM positions WHERE code = ?1 ORDER BY id").bind(code).all<PositionRow>().then((r) => r.results),
    db.prepare("SELECT * FROM tickets WHERE code = ?1 ORDER BY id").bind(code).all<TicketRow>().then((r) => r.results),
    db.prepare("SELECT date, flags, stop_hits FROM risk_reports WHERE code = ?1 ORDER BY date DESC LIMIT 90").bind(code).all<RiskRowLite>().then((r) => r.results),
    db.prepare("SELECT MAX(date) AS d FROM signals").first<{ d: string | null }>().then((r) => r?.d ?? null),
    // the course's calendar: the nights the signal pass wrote, whatever happened to this student's own report row (review F6)
    db.prepare("SELECT DISTINCT date FROM signals ORDER BY date DESC LIMIT 260").all<{ date: string }>().then((r) => r.results.map((x) => x.date)).catch(() => [] as string[]),
  ]);
  return { positions, tickets, reports, night, calendar };
}
type StoredReading = { id: number; asked_at: string; as_of: string | null; prompt_version: string; outcome: string; audit: string | null; reading: string | null; grounding: string | null; model: string | null; input_tokens: number | null; output_tokens: number | null; ms: number | null };
const STORED_COLS = "id, asked_at, as_of, prompt_version, outcome, audit, reading, grounding, model, input_tokens, output_tokens, ms";
/** The last answered reading, with the facts of its own night (review F9: ids are positional, so a stored reading resolves against the facts it was written from). */
async function lastReading(db: D1Database, code: string): Promise<StoredReading | null> {
  try {
    return await db.prepare(`SELECT ${STORED_COLS} FROM reviews WHERE code = ?1 AND outcome = 'answered' ORDER BY id DESC LIMIT 1`).bind(code).first<StoredReading>();
  } catch { return null; }
}
/** One stored row by id — the one the button just wrote (the redirect carries its id; the code must match). */
async function storedRow(db: D1Database, code: string, id: number): Promise<StoredReading | null> {
  try {
    return await db.prepare(`SELECT ${STORED_COLS} FROM reviews WHERE id = ?1 AND code = ?2`).bind(id, code).first<StoredReading>();
  } catch { return null; }
}

/** The cap's own count: a student's readings in the last 24 hours that cost a call — an `error` row only when the model
 *  answered (it carries tokens; review N3). One string, so the page's budget line counts exactly what the cap counts. */
const USED_SQL = "SELECT COUNT(*) AS n FROM reviews WHERE code = ?1 AND asked_at >= ?2 AND (outcome IN ('answered','rejected','pending') OR (outcome = 'error' AND input_tokens IS NOT NULL))";
const sinceYesterday = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
/** The student's used count for a page render (OI-94): the page is always a GET since the redirect (N14), which returns
 *  before the cap's count, so the budget line had nothing to say. Null when the table is absent — the line then omits it. */
export async function usedToday(db: D1Database, code: string): Promise<number | null> {
  try { return (await db.prepare(USED_SQL).bind(code, sinceYesterday()).first<{ n: number }>())?.n ?? 0; } catch { return null; }
}

// ---------------------------------------------------------------------------
// The review
// ---------------------------------------------------------------------------
export async function reviewStudent(env: Env, rawCode: string, opts: { ai: boolean }): Promise<ReviewResult> {
  const code = String(rawCode ?? "").trim().toUpperCase();
  const cap = intSetting(env.REVIEW_DAILY_CAP, REVIEW_DAILY_CAP_DEFAULT);
  const globalCap = intSetting(env.REVIEW_GLOBAL_CAP, REVIEW_GLOBAL_CAP_DEFAULT);
  const model = env.EXPLAIN_MODEL || DEFAULT_MODEL;
  const base: ReviewResult = { code, name: null, outcome: "invalid", audit: null, reading: null, grounding: null, reason: null, meta: { model: null, tokens: null, ms: null, prompt_version: REVIEW_PROMPT_VERSION, daily_cap: cap, asked_at: null, used_today: null, row_id: null } };
  if (!CODE.test(code)) return { ...base, reason: "That doesn't look like a student code — eight characters like K7PM-4R2X." };
  const student = await loadStudent(env.DB, code);
  if (!student) return { ...base, outcome: "not_found", reason: "No student with that code. Codes come from the tutor's enrolment." };
  const { positions, tickets, reports, night, calendar } = await loadRows(env.DB, code);
  const audit = auditProcess(student, positions, tickets, reports, night, calendar);
  const withAudit: ReviewResult = { ...base, name: student.name, audit };
  if (audit.nothingYet) return { ...withAudit, outcome: "nothing_yet", reason: audit.items[0].what };
  if (!opts.ai) return { ...withAudit, outcome: "audit_only", reason: null };

  const log = async (outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, NULL, ?2, ?3, ?4)")
        .bind(new Date().toISOString(), outcome, rows, detail.slice(0, 300)).run();
    } catch { /* logging must never break the page */ }
  };
  const askedAt = new Date().toISOString();
  let pendingId: number | null = null;
  // `extra.reading` is the audit copy (OI-97): the model's reading stored on the row whatever the outcome, so a withheld one
  // can be read afterwards with a remote query. The page renders a row's reading only when its outcome is 'answered'.
  const record = async (r: ReviewResult, extra: { model?: string | null; input?: number; output?: number; ms?: number; reading?: Reading | null } = {}) => {
    const stored = extra.reading ?? r.reading;
    try {
      if (pendingId !== null) {
        await env.DB.prepare("UPDATE reviews SET outcome = ?1, audit = ?2, reading = ?3, grounding = ?4, model = ?5, input_tokens = ?6, output_tokens = ?7, ms = ?8 WHERE id = ?9")
          .bind(r.outcome, JSON.stringify(auditForRow(audit)), stored ? JSON.stringify(stored) : null, r.grounding ? JSON.stringify(r.grounding) : null, extra.model ?? null, extra.input ?? null, extra.output ?? null, extra.ms ?? null, pendingId).run();
        return;
      }
      await env.DB.prepare("INSERT INTO reviews (code, asked_at, as_of, prompt_version, outcome, audit, reading, grounding, model, input_tokens, output_tokens, ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)")
        .bind(code, askedAt, audit.asOf, REVIEW_PROMPT_VERSION, r.outcome, JSON.stringify(auditForRow(audit)), stored ? JSON.stringify(stored) : null, r.grounding ? JSON.stringify(r.grounding) : null, extra.model ?? null, extra.input ?? null, extra.output ?? null, extra.ms ?? null).run();
    } catch { /* the receipt is a convenience; the page still renders */ }
  };

  if (!env.ANTHROPIC_API_KEY) return { ...withAudit, outcome: "capped", reason: "No AI key is configured on this deployment, so the page shows the audit and no reading." };
  if (cap === 0 || globalCap === 0) return { ...withAudit, outcome: "capped", reason: "The AI's readings are switched off on this deployment (the daily budget is set to 0). The audit above is the review." };

  // The budgets: this student's readings in the last 24 hours, and the class's — this reading's own pending row counted.
  // An `error` row counts only when the model actually answered (it carries tokens): a provider outage must not spend a
  // student's day (review N3). If the table is missing (migration 0012 not applied) the review fails closed (N16).
  const since = sinceYesterday();
  let used = 1;
  let usedAll = 1;
  try {
    const ins = await env.DB.prepare("INSERT INTO reviews (code, asked_at, as_of, prompt_version, outcome) VALUES (?1, ?2, ?3, ?4, 'pending') RETURNING id")
      .bind(code, askedAt, audit.asOf, REVIEW_PROMPT_VERSION).first<{ id: number }>();
    pendingId = typeof ins?.id === "number" ? ins.id : null;
    used = (await env.DB.prepare(USED_SQL).bind(code, since).first<{ n: number }>())?.n ?? 1;
    usedAll = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reviews WHERE asked_at >= ?1 AND (outcome IN ('answered','rejected','pending') OR (outcome = 'error' AND input_tokens IS NOT NULL))").bind(since).first<{ n: number }>())?.n ?? 1;
  } catch {
    return { ...withAudit, outcome: "error", reason: "The review's table is not available on this deployment (migration 0012 not applied), so no reading was asked for. The audit above is the review." };
  }
  const meta0 = { ...base.meta, asked_at: askedAt, used_today: used, row_id: pendingId };
  if (used > cap) {
    const r: ReviewResult = { ...withAudit, outcome: "capped", reason: `Your readings for today are used (${cap} in 24 hours). The audit is the review until the budget resets; the last reading, if any, is below.`, meta: meta0 };
    await record(r);
    await log("review_capped", 0, `student cap ${cap} reached`);   // no code, not even a fragment, in a receipt
    return r;
  }
  if (usedAll > globalCap) {
    const r: ReviewResult = { ...withAudit, outcome: "capped", reason: `The class's readings for today are used (${globalCap} in 24 hours). The audit is the review until the budget resets.`, meta: meta0 };
    await record(r);
    await log("review_capped", 0, `class cap ${globalCap} reached`);
    return r;
  }

  const t0 = Date.now();
  const call = await claudeJson({ system: REVIEW_SYSTEM_PROMPT, user: sheetAsText(audit), schema: REVIEW_SCHEMA }, { apiKey: env.ANTHROPIC_API_KEY, model, apiUrl: env.EXPLAIN_API_URL || undefined });
  if (!call.ok) {
    const r: ReviewResult = { ...withAudit, outcome: "error", reason: `The AI call failed (${call.reason}). The audit above is the review.`, meta: { ...meta0, model, ms: call.ms } };
    await record(r, { model, ms: call.ms });
    await log("review_error", 0, call.reason);
    return r;
  }
  const reading = validateReading(extractJson(call.text));
  if (!reading) {
    const r: ReviewResult = { ...withAudit, outcome: "error", reason: `The AI's reply was malformed (stop_reason ${call.stopReason ?? "?"}). The audit above is the review.`, meta: { ...meta0, model, tokens: call.usage, ms: call.ms } };
    await record(r, { model, input: call.usage.input, output: call.usage.output, ms: call.ms });
    await log("review_error", 0, `malformed reading (stop_reason ${call.stopReason ?? "?"}) ${call.usage.input}/${call.usage.output} tokens`);
    return r;
  }
  const grounding = checkReading(reading, audit);
  const meta = { ...meta0, model, tokens: call.usage, ms: Date.now() - t0 };
  const tokens = `${call.usage.input}/${call.usage.output} tokens ${meta.ms} ms ${REVIEW_PROMPT_VERSION}`;
  const flags = [
    ...grounding.unknownFacts.map((u) => `facts ${u.ids.join(",")}`),
    ...(grounding.uncited.length ? [`uncited ${grounding.uncited.join(",")}`] : []),
    ...grounding.unsupportedNumbers.map((u) => `numbers ${u.numbers.join(",")}`),
  ];
  const flagged = flags.length ? ` — flagged: ${flags.join("; ")}` : "";   // empty when only the language families fired (the 16:12 receipt ended "— flagged: ")
  if (!grounding.clean) {
    // Any failed check withholds the reading (review F1): in a review of a student's own record a number from nowhere or a
    // fact that is not there is a wrong statement about them, not a footnote.
    const why = grounding.outcomeLanguage.length ? `outcome language: "${grounding.outcomeLanguage[0]}"`
      : grounding.recommendationLanguage.length ? `advice-shaped language: "${grounding.recommendationLanguage[0]}"`
      : grounding.unsupportedNumbers.length ? `a number in no fact on the sheet: ${grounding.unsupportedNumbers[0].numbers.join(", ")}`
      : grounding.unknownFacts.length ? `a citation to a fact not on the sheet: ${grounding.unknownFacts[0].ids.join(", ")}`
      : "a paragraph with no citation";
    const r: ReviewResult = { ...withAudit, outcome: "rejected", reading: null, grounding, reason: `The AI's reading was withheld by the course's checks (${why}). The audit above is the review — it needs no AI.`, meta };
    await record(r, { model, input: call.usage.input, output: call.usage.output, ms: meta.ms, reading });   // the audit copy (OI-97): kept on the row, shown to no one
    const words = [...grounding.outcomeLanguage, ...grounding.recommendationLanguage];
    await log("review_rejected", 1, `${model} ${tokens}${words.length ? ` — ${words.join("; ")}` : ""}${flagged}`);
    return r;
  }
  const r: ReviewResult = { ...withAudit, outcome: "answered", reading, grounding, reason: null, meta };
  await record(r, { model, input: call.usage.input, output: call.usage.output, ms: meta.ms });
  // OI-93: the receipt says when the model wrote its next-week sentence inside a paragraph as well (r2 did, every time) — so
  // the record shows whether r3 stopped it; the page prints what the model wrote, nothing is hidden or deduplicated.
  const repeated = nextWeekRepeated(reading) ? " — next week repeated" : "";
  await log("review_ok", 1, `${model} ${tokens} ${audit.breaches} breach${audit.breaches === 1 ? "" : "es"} ${audit.notes} note${audit.notes === 1 ? "" : "s"}${flagged}${repeated}`);
  return r;
}

/** True when the next-week sentence also appears as a paragraph (OI-93): compared without case, punctuation or the "For next week," lead-in. */
export function nextWeekRepeated(reading: Reading): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/^(?:for )?next week[,:]?\s*/i, "").replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  const nw = norm(reading.next_week);
  return nw.length > 0 && reading.paragraphs.some((p) => { const t = norm(p.text); return t === nw || (nw.length > 40 && t.endsWith(nw)); });   // the sentence alone, or tacked onto a paragraph
}

/** What the receipt row keeps of the audit: the items and the facts (the sheet the model read), not the rows. */
function auditForRow(a: Audit) { return { asOf: a.asOf, tickets: a.tickets, open: a.open, closed: a.closed, breaches: a.breaches, notes: a.notes, items: a.items, facts: a.facts }; }

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
review.get("/api/explain-my-portfolio/:code", async (c) => {
  // The audit by default; a reading only when asked for (`?ai=1`) — a GET that a link preview or a prefetch can issue
  // must not spend one of the student's three (review F10, OI-89).
  const ai = c.req.query("ai") === "1";
  const code = c.req.param("code").trim().toUpperCase();
  if (CODE.test(code)) {
    const { check } = await ownerGate(c, code);   // week 12: another student's audit is not served, nor is a reading spent on it
    if (!check.ok) return c.json({ error: check.reason }, check.status);
  }
  const r = await reviewStudent(c.env, code, { ai });
  const status = r.outcome === "invalid" ? 400 : r.outcome === "not_found" ? 404 : 200;
  return c.json({ ...r, note: NOTE }, status, { "cache-control": "no-store" });
});

review.get("/tickets/:code/review", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (CODE.test(code)) {
    const { check } = await ownerGate(c, code);   // week 12
    if (!check.ok) return c.html(emptyPage(check.reason), check.status);
  }
  const r0 = await reviewStudent(c.env, code, { ai: false });
  if (r0.outcome === "invalid" || r0.outcome === "not_found") return c.html(emptyPage(r0.reason ?? ""), r0.outcome === "invalid" ? 400 : 404);
  // the budget line's used count (OI-94): the audit-only path returns before the cap's count, so count here — one query
  const r: ReviewResult = { ...r0, meta: { ...r0.meta, used_today: await usedToday(c.env.DB, code) } };
  // `?r=<id>`: the row the button just wrote (Post/Redirect/Get, review N14) — shown as the fresh reading, or its reason
  const justId = Number(c.req.query("r") ?? "");
  const just = Number.isInteger(justId) && justId > 0 ? await storedRow(c.env.DB, code, justId) : null;
  const last = await lastReading(c.env.DB, code);
  return c.html(reviewPage(r, last, just), 200, { "cache-control": "no-store" });
});

review.post("/tickets/:code/review", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (CODE.test(code)) {
    const { check } = await ownerGate(c, code);   // week 12: the button spends nothing on another student's account
    if (!check.ok) return c.html(emptyPage(check.reason), check.status);
  }
  const r = await reviewStudent(c.env, code, { ai: true });
  if (r.outcome === "invalid" || r.outcome === "not_found") return c.html(emptyPage(r.reason ?? ""), r.outcome === "invalid" ? 400 : 404);
  // A refresh of the page must never spend a second reading: redirect to the page, the row's id in the query
  if (r.meta.row_id !== null) return c.redirect(`/tickets/${code}/review?r=${r.meta.row_id}`, 303);
  // no row (nothing yet, no key, switched off, the table missing): render the reason directly
  return c.html(reviewPage(r, await lastReading(c.env.DB, code), null), 200, { "cache-control": "no-store" });
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
function emptyPage(reason: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Process review</title><meta name="referrer" content="same-origin">${FONTS_HTML}<style>${PAGE_CSS} .empty{color:var(--stamp)}</style></head>
<body><main><p class="back"><a href="/">← course home</a></p><p class="eyebrow">Week 11 · the process review</p><h1>Did you follow your rules?</h1><p class="empty">${esc(reason)}</p><footer><p class="notice">${NOTE}</p></footer></main></body></html>`;
}

const SEV: Record<string, { label: string; cls: string }> = { breach: { label: "NOT FOLLOWED", cls: "breach" }, kept: { label: "FOLLOWED", cls: "kept" }, note: { label: "JOURNAL", cls: "note" }, fact: { label: "THE REPORT", cls: "fact" } };

/** A reading with its tags resolved against the facts it was written from — the stored row's, never today's (review F9). */
function readingHtml(reading: Reading, facts: { id: string; text: string }[], head: string, metaLine: string): string {
  const byId = new Map(facts.map((f) => [f.id, f.text]));
  const cite = (id: string) => `<span class="cite${byId.has(id) ? "" : " bad"}" title="${byId.has(id) ? esc(byId.get(id)!) : "not on the sheet"}">[${esc(id)}${byId.has(id) ? "" : " — not on the sheet"}]</span>`;
  return `<div class="reading"><p class="caption">${esc(head)}</p>${reading.paragraphs.map((p) => `<p>${esc(p.text)} ${p.facts.length ? p.facts.map(cite).join(" ") : `<span class="cite bad">[no citation]</span>`}</p>`).join("")}${reading.next_week ? `<p class="next"><b>Next week:</b> ${esc(reading.next_week)}</p>` : ""}<p class="caption">${esc(metaLine)}</p></div>`;
}

/** The facts a stored row was written from (its own audit's), or none. */
function storedFacts(row: StoredReading): { id: string; text: string }[] {
  try { const a = row.audit ? JSON.parse(row.audit) : null; return Array.isArray(a?.facts) ? a.facts : []; } catch { return []; }
}

function reviewPage(r: ReviewResult, last: StoredReading | null, just: StoredReading | null = null): string {
  const a = r.audit!;
  const lines = describeAudit(a);
  const order: Record<string, number> = { breach: 0, kept: 1, note: 2, fact: 3 };
  const items = [...a.items].sort((x, y) => order[x.severity] - order[y.severity]);
  const itemsHtml = a.nothingYet
    ? `<p class="empty">${esc(a.items[0].what)}</p>`
    : `<ul class="audit">${items.map((i) => `<li class="${SEV[i.severity].cls}"><span class="tag ${SEV[i.severity].cls}">${SEV[i.severity].label}</span> ${esc(i.what)}${i.severity !== "fact" ? `<span class="rule">The rule: ${esc(i.rule)}.</span>` : ""}</li>`).join("")}</ul>`;
  const used = r.meta.used_today;
  const budget = `budget ${r.meta.daily_cap} readings a day for this account${used !== null && r.meta.daily_cap > 0 ? ` · ${Math.min(used, r.meta.daily_cap)} used` : ""}`;
  let readingBlock = "";
  let shownLast = false;
  const metaOf = (row: StoredReading) => `Written by ${row.model ?? "?"} · ${row.input_tokens ?? "?"}/${row.output_tokens ?? "?"} tokens · ${row.ms ?? "?"} ms · prompt ${row.prompt_version} · ${budget}`;
  const parseGrounding = (row: StoredReading): ReadingCheck | null => { try { return row.grounding ? (JSON.parse(row.grounding) as ReadingCheck) : null; } catch { return null; } };
  if (just) {
    // the row the button just wrote, after the redirect (N14)
    const reading = just.outcome === "answered" && just.reading ? (() => { try { return validateReading(JSON.parse(just.reading!)); } catch { return null; } })() : null;
    if (reading) {
      readingBlock = readingHtml(reading, storedFacts(just), `A fresh reading, written ${just.asked_at.slice(11, 16)} UTC from the sheet below.`, metaOf(just));
      shownLast = true;
    } else {
      const g = parseGrounding(just);
      const why = just.outcome === "rejected" && g ? withheldReason(g) : just.outcome === "capped" ? `Your readings for today are used (${r.meta.daily_cap} in 24 hours). The audit is the review until the budget resets.` : `The AI call did not return a reading (${just.outcome}). The audit above is the review.`;
      readingBlock = `<p class="withheld">${esc(why)}</p>`;
      if (g && !g.clean) readingBlock += `<p class="flags">${esc(flagsOf(g))}</p>`;
    }
  } else if (r.outcome === "answered" && r.reading) {
    readingBlock = readingHtml(r.reading, a.facts, `A fresh reading, written now from the sheet below.`, `Written by ${r.meta.model} from ${a.facts.length} facts · ${r.meta.tokens ? `${r.meta.tokens.input}/${r.meta.tokens.output} tokens` : ""} · ${r.meta.ms ?? "?"} ms · prompt ${r.meta.prompt_version} · ${budget}`);
    shownLast = true;
  } else if (r.outcome === "rejected" || r.outcome === "capped" || r.outcome === "error") {
    readingBlock = `<p class="withheld">${esc(r.reason ?? "")}</p>`;
    if (r.grounding && !r.grounding.clean) readingBlock += `<p class="flags">${esc(flagsOf(r.grounding))}</p>`;
  }
  if (last && !shownLast && !(just && just.id === last.id)) {
    try {
      const reading = last.reading ? validateReading(JSON.parse(last.reading)) : null;
      if (reading) readingBlock += readingHtml(reading, storedFacts(last), `The last reading, written ${last.asked_at.slice(0, 16).replace("T", " ")} UTC as of the ${last.as_of ?? "—"} close — the audit above is as of ${a.asOf ?? "—"}; its tags point at the facts of its own night, kept with it.`, metaOf(last));
    } catch { /* an unreadable old row is skipped */ }
  }
  const canAsk = !a.nothingYet;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Process review — ${esc(r.name ?? "")}</title>
<meta name="referrer" content="same-origin">
${FONTS_HTML}
<style>
${PAGE_CSS}
${SHARED_CSS}
  main { max-width: 52rem; }
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.2rem; margin:1.6rem 0 .5rem; }
  .summary { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:.6rem 1rem; margin:.4rem 0 1rem; font-size:.9rem; }
  ul.audit { list-style:none; padding:0; margin:0; }
  ul.audit li { border-left:3px solid var(--rule); padding:.5rem .8rem; margin:.5rem 0; font-size:.9rem; }
  ul.audit li.breach { border-color:var(--stamp); background:rgba(180,56,46,.06); }
  ul.audit li.kept { border-color:var(--entry); background:rgba(62,107,84,.07); }
  ul.audit li.note { border-color:#b89b3a; background:rgba(241,235,214,.5); }
  .tag.breach { background:var(--stamp); color:#fff; } .tag.kept { background:var(--entry); color:#fff; } .tag.note { background:#F1EBD6; color:#6b5d2a; } .tag.fact { background:#E3E8E4; color:#3b4a42; }
  .rule { display:block; color:var(--faint); font-size:.78rem; margin-top:.3rem; }
  .reading { background:#fff; border:1px solid var(--rule); border-radius:6px; padding:.8rem 1.1rem; margin:.8rem 0; font-size:.95rem; line-height:1.55; }
  .reading .next { margin-top:.6rem; }
  .cite { font-family:"IBM Plex Mono",monospace; font-size:.7rem; color:var(--entry); cursor:help; } .cite.bad { color:var(--stamp); }
  .withheld { color:var(--stamp); font-size:.9rem; background:rgba(180,56,46,.06); border:1px solid var(--stamp); border-radius:6px; padding:.6rem 1rem; }
  .flags { color:#6b5d2a; font-size:.82rem; }
  form.ask button { font: inherit; padding:.5rem 1rem; border:1px solid var(--entry); background:var(--entry); color:#fff; border-radius:4px; cursor:pointer; }
  details { margin:1rem 0; font-size:.85rem; } details summary { cursor:pointer; color:var(--entry); }
  ol.sheet li { margin:.3rem 0; } ol.sheet code { font-family:"IBM Plex Mono",monospace; font-size:.75rem; color:var(--faint); }
  .empty { color:var(--faint); font-style:italic; }
</style></head>
<body><main>
  <p class="back"><a href="/">← course home</a> · <a href="/tickets/${esc(r.code)}">my page</a> · <a href="/signals">signals</a> · <a href="/costs">costs &amp; tax</a></p>
  <p class="eyebrow">Week 11 · the process review</p>
  <h1>${esc(r.name ?? "")} — did you follow your rules?</h1>
  <p class="lede">Your tickets, positions and nightly reports read against the rules you chose, as of the ${esc(a.asOf ?? "—")} close. Two parts: the audit (the rules applied to the rows — no AI) and, if you ask for it, a reading written by the course's AI from a sheet that carries <b>none of the toolkit's profit, loss, account-value or drawdown figures</b> — it can only talk about process, because that is all it was shown (your own journal words are on it, as you wrote them). Your job, as with the tutor: check every fact tag against the sheet.</p>
  <h2>The audit</h2>
  <div class="summary">${lines.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
  ${itemsHtml}
  <h2>The reading</h2>
  ${readingBlock || `<p class="empty">${canAsk ? "No reading asked for yet. The audit above is the review; the reading is a second opinion in plain words, checked." : "Nothing to read until a ticket exists."}</p>`}
  ${canAsk ? `<form class="ask" method="post" action="/tickets/${esc(r.code)}/review" onsubmit="var b=this.querySelector('button');if(b.disabled)return false;b.disabled=true;b.textContent='Reading…';"><button type="submit">Ask for a fresh reading</button> <span class="caption">${esc(budget)}</span></form>` : ""}
  ${a.nothingYet ? "" : `<details><summary>The sheet the AI reads — ${a.facts.length} process facts, numbered; every citation above should point at one of these</summary><ol class="sheet">${a.facts.map((f) => `<li><code>${esc(f.id)}</code> ${esc(f.text)}</li>`).join("")}</ol></details>`}
  <footer><p class="notice">${NOTE}</p><p>The audit's word tests on journal entries are tests of words, not of thinking: an entry can name no rule and still be a good decision — the note says what the template asks for, nothing more. A reading that names a number not on the sheet, cites a fact that is not there, cites nothing, praises or blames a result, or tips, is withheld; the audit stands on its own. The sheet carries your own journal entries, results included if you wrote them — the AI is told to quote them in fragments only and to repeat no result words; the net is partial by nature, so read what it says.</p></footer>
</main></body></html>`;
}

/** The sentence a withheld stored row prints, from its grounding (the same order as the route's). */
function withheldReason(g: ReadingCheck): string {
  const why = g.outcomeLanguage.length ? `outcome language: "${g.outcomeLanguage[0]}"`
    : g.recommendationLanguage.length ? `advice-shaped language: "${g.recommendationLanguage[0]}"`
    : g.unsupportedNumbers.length ? `a number in no fact on the sheet: ${g.unsupportedNumbers[0].numbers.join(", ")}`
    : g.unknownFacts.length ? `a citation to a fact not on the sheet: ${g.unknownFacts[0].ids.join(", ")}`
    : "a paragraph with no citation";
  return `The AI's reading was withheld by the course's checks (${why}). The audit above is the review — it needs no AI.`;
}

function flagsOf(g: ReadingCheck): string {
  const parts: string[] = [];
  if (g.unknownFacts.length) parts.push(`cites facts not on the sheet: ${g.unknownFacts.map((u) => `paragraph ${u.paragraph} — ${u.ids.join(", ")}`).join("; ")}`);
  if (g.uncited.length) parts.push(`paragraph${g.uncited.length === 1 ? "" : "s"} ${g.uncited.join(", ")} cite${g.uncited.length === 1 ? "s" : ""} nothing`);
  if (g.unsupportedNumbers.length) parts.push(`numbers in no fact: ${g.unsupportedNumbers.map((u) => `${u.where === "next_week" ? "the next-week line" : `paragraph ${u.paragraph}`} — ${u.numbers.join(", ")}`).join("; ")}`);
  if (g.outcomeLanguage.length) parts.push(`outcome language: ${g.outcomeLanguage.map((s) => `"${s}"`).join(", ")}`);
  if (g.recommendationLanguage.length) parts.push(`advice-shaped: ${g.recommendationLanguage.map((s) => `"${s}"`).join(", ")}`);
  return parts.length ? `Flagged — ${parts.join(". ")}.` : "";
}
