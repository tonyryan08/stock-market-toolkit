/**
 * Week 11: the process-review routes on the fake D1 with a stubbed Claude.
 * The audit renders with no model; a reading that praises a result is
 * withheld; the per-student and class budgets count the pending row first;
 * the receipts land in `reviews` and `fetch_log` with the prompt version;
 * the student page links here; the costs worksheet needs no table at all.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";
import { REVIEW_PROMPT_VERSION } from "./lib/review";
import { nextWeekRepeated } from "./review";

const CODE = "K7PM-4R2X";
const STUDENT = { code: CODE, name: "Test Student", capital: 10000, instruments: 2 };
const TICKETS = [
  { id: 1, code: CODE, symbol: "AAPL", side: "open", units: 18, fill_date: "2026-10-20", fill_price: 348.91, cost: 17.7, signal_state: "long", journal: "The rule went long on the 16/64 crossover; the stop is at $317.19; if it is hit I close the next morning.", created_at: "2026-10-20T20:00:00.000Z" },
  { id: 2, code: CODE, symbol: "KO", side: "open", units: 29, fill_date: "2026-10-20", fill_price: 94.08, cost: 8.82, signal_state: "long", journal: "Bought because it seemed cheap and I liked the brand. Everyone drinks it.", created_at: "2026-10-20T20:01:00.000Z" },
  { id: 3, code: CODE, symbol: "KO", side: "close", units: 29, fill_date: "2026-11-02", fill_price: 101, cost: 9.32, signal_state: "long", journal: "Nervous about the market this week, taking the money while it is there.", created_at: "2026-11-02T20:00:00.000Z" },
];
const POSITIONS = [
  { id: 1, code: CODE, symbol: "AAPL", status: "open", opened_on: "2026-10-20", entry_price: 348.91, units: 18, exposure: 6280.38, stop_gap: 31.72, high_since: 360, stop_level: 328.28, stop_hit_on: "2026-10-28", instrument_risk: 18.18, realign_date: null, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null },
  { id: 2, code: CODE, symbol: "KO", status: "closed", opened_on: "2026-10-20", entry_price: 94.08, units: 29, exposure: 2728.32, stop_gap: 9.93, high_since: 101, stop_level: 91.07, stop_hit_on: null, instrument_risk: 21.11, realign_date: null, closed_on: "2026-11-02", exit_price: 101, pnl: 182.54, open_ticket_id: 2, close_ticket_id: 3 },
];
const NIGHTS = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"];
const REPORTS = NIGHTS.map((date) => ({ date, flags: JSON.stringify(date >= "2026-10-28" ? ["stop_hit"] : []), stop_hits: date >= "2026-10-28" ? 1 : 0 })).reverse();

const reply = (json: unknown, status = 200, usage = { input_tokens: 1400, output_tokens: 260 }) =>
  new Response(JSON.stringify(status === 200 ? { content: [{ type: "text", text: JSON.stringify(json) }], usage, stop_reason: "end_turn" } : { error: { type: "api_error", message: "boom" } }), { status, headers: { "content-type": "application/json" } });

const db = (opts: { used?: number; usedAll?: number; tickets?: unknown[]; positions?: unknown[]; last?: unknown[]; just?: unknown[]; student?: unknown; noTable?: boolean } = {}) => fakeD1()
  .on("FROM students WHERE code", () => ({ results: opts.student === null ? [] : [opts.student ?? STUDENT] }))
  .on("FROM positions WHERE code", () => ({ results: (opts.positions ?? POSITIONS) as never[] }))
  .on("FROM tickets WHERE code", () => ({ results: (opts.tickets ?? TICKETS) as never[] }))
  .on("FROM risk_reports WHERE code", () => ({ results: REPORTS as never[] }))
  .on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: "2026-11-10" }] }))
  .on("SELECT DISTINCT date FROM signals", () => ({ results: NIGHTS.map((date) => ({ date })).reverse() }))
  .on("VALUES (?1, ?2, ?3, ?4, 'pending') RETURNING id", () => { if (opts.noTable) throw new Error("D1_ERROR: no such table: reviews"); return { results: [{ id: 5 }] }; })
  .on("FROM reviews WHERE code = ?1 AND asked_at >= ?2 AND (outcome IN", () => { if (opts.noTable) throw new Error("D1_ERROR: no such table: reviews"); return { results: [{ n: opts.used ?? 1 }] }; })
  .on("FROM reviews WHERE asked_at >= ?1 AND (outcome IN", () => ({ results: [{ n: opts.usedAll ?? 1 }] }))
  .on("FROM reviews WHERE code = ?1 AND outcome = 'answered'", () => ({ results: (opts.last ?? []) as never[] }))
  .on("FROM reviews WHERE id = ?1 AND code = ?2", () => ({ results: (opts.just ?? []) as never[] }));

const env = (d: FakeD1, over: Record<string, string> = {}) => ({ DB: asD1(d), ANTHROPIC_API_KEY: "sk-test-not-a-real-key", ...over }) as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const get = (d: FakeD1, path: string, over: Record<string, string> = {}) => worker.fetch(new Request(`http://localhost${path}`), env(d, over), ctx);
const post = (d: FakeD1, path: string, over: Record<string, string> = {}) => worker.fetch(new Request(`http://localhost${path}`, { method: "POST" }), env(d, over), ctx);

const GOOD = { paragraphs: [
  { text: "You opened both positions with the rule long and wrote an entry on each ticket.", facts: ["F2", "F3"] },
  { text: "Two rules were not followed: AAPL's stop was hit on the 2026-10-28 close and the position is still open; KO was closed on the 2026-11-02 close with the stop not hit, and the entry says «Nervous about the market».", facts: ["F5", "F6", "F4"] },
], next_week: "On Monday evening, read the stop line first and write the close ticket the day the report says the stop was hit." };
const PRAISE = { paragraphs: [{ text: "Well done on KO — selling early made a profit, which paid off.", facts: ["F6"] }], next_week: "Keep trusting your instincts." };
/** r2's habit (OI-93): the next-week sentence written as the last paragraph as well as in its field. */
const REPEAT = { paragraphs: [...GOOD.paragraphs, { text: "For next week, on Monday evening, read the stop line first and write the close ticket the day the report says the stop was hit.", facts: ["F1"] }], next_week: GOOD.next_week };
/** Every fetch_log line the route writes carries no code — not even a fragment (review F8). */
const noCodeInReceipts = (d: FakeD1) => { for (const l of d.ran("INSERT INTO fetch_log")) { expect(String(l.binds[3])).not.toContain(CODE); expect(String(l.binds[3])).not.toContain(CODE.slice(0, 4)); } };
const api = (d: FakeD1, over: Record<string, string> = {}) => get(d, `/api/explain-my-portfolio/${CODE}?ai=1`, over);

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/explain-my-portfolio/:code", () => {
  it("a bad code is 400, an unknown one 404 — neither reaches the model", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await get(db(), "/api/explain-my-portfolio/nope")).status).toBe(400);
    const r = await get(db({ student: null }), `/api/explain-my-portfolio/${CODE}`);
    expect(r.status).toBe(404);
    expect(((await r.json()) as any).outcome).toBe("not_found");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the plain GET is the audit alone (review F10 — a link preview must spend nothing): the breaches, the sheet with no P&L, no model call, no row written, no-store", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = db();
    const r = await get(d, `/api/explain-my-portfolio/${CODE}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const j = (await r.json()) as any;
    expect(j.outcome).toBe("audit_only");
    expect(JSON.stringify(j.audit.facts)).not.toMatch(/high of|101/);   // no price level beyond the entry (F5)
    expect(j.audit.breaches).toBe(2);
    expect(j.audit.items.map((i: any) => i.kind)).toEqual(expect.arrayContaining(["stop_open", "early_close"]));
    expect(JSON.stringify(j.audit.facts)).not.toMatch(/182\.54|P&L|profit/);
    expect(j.meta.prompt_version).toBe(REVIEW_PROMPT_VERSION);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.ran("INSERT INTO reviews")).toHaveLength(0);
  });
  it("no ticket yet: 'nothing yet', no model call, no row", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ tickets: [], positions: [] });
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("nothing_yet");
    expect(j.reason).toMatch(/No ticket has been written yet/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.ran("INSERT INTO reviews")).toHaveLength(0);
  });
  it("?ai=1 asks for a reading; a clean one is answered: the pending row first, then the update with the tokens and the prompt version; a review_ok receipt with no code in it", async () => {
    let sent: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return reply(GOOD); }));
    const d = db();
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("answered");
    expect(j.reading.paragraphs).toHaveLength(2);
    expect(j.grounding.clean).toBe(true);
    expect(j.meta.tokens).toEqual({ input: 1400, output: 260 });
    expect(j.meta.used_today).toBe(1);
    expect(j.meta.row_id).toBe(5);
    noCodeInReceipts(d);
    // the model saw the process sheet and no P&L
    expect(sent.system).toMatch(/review PROCESS, never outcomes/);
    expect(sent.messages[0].content).toMatch(/^F1\. The account runs 2 instruments/);
    expect(sent.messages[0].content).not.toMatch(/182\.54|profit|P&L/);
    expect(sent.output_config.format.schema.required).toEqual(["paragraphs", "next_week"]);
    const pending = d.ran("VALUES (?1, ?2, ?3, ?4, 'pending') RETURNING id");
    expect(pending).toHaveLength(1);
    expect(pending[0].binds[3]).toBe(REVIEW_PROMPT_VERSION);
    const upd = d.ran("UPDATE reviews SET outcome");
    expect(upd).toHaveLength(1);
    expect(upd[0].binds[0]).toBe("answered");
    expect(upd[0].binds[8]).toBe(5);
    expect(d.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("review_ok");
    expect(String(d.ran("INSERT INTO fetch_log")[0].binds[3])).not.toMatch(/next week repeated/);
  });
  it("a next-week sentence written as a paragraph too (r2's habit, OI-93) is still answered and shown as written — the review_ok receipt says 'next week repeated'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(REPEAT)));
    const d = db();
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("answered");
    expect(j.reading.paragraphs).toHaveLength(3);
    expect(j.reading.next_week).toBe(GOOD.next_week);
    expect(String(d.ran("INSERT INTO fetch_log")[0].binds[3])).toMatch(/ — next week repeated$/);
    noCodeInReceipts(d);
    expect(nextWeekRepeated(REPEAT as any)).toBe(true);
    expect(nextWeekRepeated(GOOD as any)).toBe(false);
    expect(nextWeekRepeated({ paragraphs: [{ text: "Nothing was broken. " + GOOD.next_week, facts: ["F1"] }], next_week: GOOD.next_week })).toBe(true);   // tacked onto a paragraph
    expect(nextWeekRepeated({ paragraphs: [{ text: "Read the stop line first.", facts: ["F1"] }], next_week: "Read the stop line first, then the journal." })).toBe(false);
  });
  it("praise of a result is withheld: rejected, the reading null, the audit still there, a review_rejected receipt naming the words", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(PRAISE)));
    const d = db();
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("rejected");
    expect(j.reading).toBeNull();
    expect(j.reason).toMatch(/outcome language: "Well done"/);
    expect(j.audit.breaches).toBe(2);
    expect(j.grounding.outcomeLanguage.length).toBeGreaterThan(0);
    const log = d.ran("INSERT INTO fetch_log");
    expect(log[0].binds[1]).toBe("review_rejected");
    expect(String(log[0].binds[3])).toMatch(/Well done/);
    noCodeInReceipts(d);
    // OI-97: the withheld reading is kept on the row as the audit copy — the API answered null, the row has the words
    const upd = d.ran("UPDATE reviews SET outcome")[0];
    expect(upd.binds[0]).toBe("rejected");
    expect(String(upd.binds[2])).toMatch(/Well done on KO/);
    expect(JSON.parse(String(upd.binds[2]))).toEqual(PRAISE);
    // a rejection on language alone carries no empty "flagged:" (the 16:12 live receipt did)
    vi.stubGlobal("fetch", vi.fn(async () => reply({ paragraphs: [{ text: "The trade went well, by the record.", facts: ["F1"] }], next_week: "Read the stop line first." })));
    const d2 = db();
    expect(((await (await api(d2)).json()) as any).outcome).toBe("rejected");
    const detail = String(d2.ran("INSERT INTO fetch_log")[0].binds[3]);
    expect(detail).toMatch(/ — went well$/);
    expect(detail).not.toMatch(/flagged/);
  });
  it("any failed check withholds (review F1): a number from nowhere, a fact not on the sheet, an uncited paragraph — each rejected with its reason, the audit intact", async () => {
    const cases: [unknown, RegExp][] = [
      [{ paragraphs: [{ text: "AAPL's stop was hit and the position has been open for 14 nights since.", facts: ["F1", "F2"] }], next_week: "Read the stop line first." }, /a number in no fact on the sheet: 14/],
      [{ paragraphs: [{ text: "AAPL's stop was hit on the 2026-10-28 close.", facts: ["F42", "F1"] }], next_week: "Read the stop line first." }, /a citation to a fact not on the sheet: F42/],
      [{ paragraphs: [{ text: "AAPL's stop was hit on the 2026-10-28 close.", facts: [] }], next_week: "Read the stop line first." }, /a paragraph with no citation/],
      [{ paragraphs: [{ text: "AAPL's stop was hit on the 2026-10-28 close.", facts: ["A1"] }], next_week: "Read the stop line first." }, /a citation to a fact not on the sheet: A1/],
    ];
    for (const [reading, why] of cases) {
      vi.stubGlobal("fetch", vi.fn(async () => reply(reading)));
      const d = db();
      const j = (await (await api(d)).json()) as any;
      expect(j.outcome, String(why)).toBe("rejected");
      expect(j.reading).toBeNull();
      expect(j.reason).toMatch(why);
      expect(j.audit.breaches).toBe(2);
      expect(d.ran("UPDATE reviews SET outcome")[0].binds[0]).toBe("rejected");
      expect(d.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("review_rejected");
      vi.unstubAllGlobals();
    }
  });
  it("the caps at their edges (review F7): the third reading today is answered, the fourth capped; the class's fortieth answered, forty-first capped; '0' on either is the off switch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    expect(((await (await api(db({ used: 3 }))).json()) as any).outcome).toBe("answered");
    expect(((await (await api(db({ usedAll: 40 }))).json()) as any).outcome).toBe("answered");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ used: 4 });
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("capped");
    expect(j.reason).toMatch(/Your readings for today are used \(3 in 24 hours\)/);
    expect(j.audit.breaches).toBe(2);
    noCodeInReceipts(d);
    const k = (await (await api(db({ usedAll: 41 }))).json()) as any;
    expect(k.outcome).toBe("capped");
    expect(k.reason).toMatch(/class's readings/);
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const over of [{ REVIEW_DAILY_CAP: "0" }, { REVIEW_GLOBAL_CAP: "0" }]) {
      const z = (await (await api(db(), over)).json()) as any;
      expect(z.outcome).toBe("capped");
      expect(z.reason).toMatch(/switched off/);
    }
    // the cap's count names the outcomes that cost a call: an error row counts only with tokens (review N3).
    // This call is under the cap, so it reaches the model: the stub answers (a stub with no reply would
    // throw inside claudeJson and surface as an 'error' outcome — a trace on stderr, not a failure).
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    const e = db();
    expect(((await (await api(e)).json()) as any).outcome).toBe("answered");
    expect(e.ran("FROM reviews WHERE code = ?1 AND asked_at >= ?2")[0].sql).toMatch(/outcome IN \('answered','rejected','pending'\) OR \(outcome = 'error' AND input_tokens IS NOT NULL\)/);
  });
  it("no key, and no reviews table (migration 0012 not applied): the audit with the reason, no call (review N16)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const noKey = (await (await api(db(), { ANTHROPIC_API_KEY: "" })).json()) as any;
    expect(noKey.outcome).toBe("capped");
    expect(noKey.reason).toMatch(/No AI key/);
    const noTable = (await (await api(db({ noTable: true }))).json()) as any;
    expect(noTable.outcome).toBe("error");
    expect(noTable.reason).toMatch(/migration 0012 not applied/);
    expect(noTable.audit.breaches).toBe(2);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("a failed call and a malformed reply are 'error' with the audit intact", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(null, 500)));
    const d = db();
    const j = (await (await api(d)).json()) as any;
    expect(j.outcome).toBe("error");
    expect(j.audit.breaches).toBe(2);
    noCodeInReceipts(d);
    vi.stubGlobal("fetch", vi.fn(async () => reply({ paragraphs: [] })));
    const k = (await (await api(db())).json()) as any;
    expect(k.outcome).toBe("error");
    expect(k.reason).toMatch(/malformed/);
    vi.stubGlobal("fetch", vi.fn(async () => reply({ paragraphs: Array(4).fill({ text: "x", facts: ["F1"] }), next_week: "" })));
    const four = (await (await api(db())).json()) as any;
    expect(four.outcome).toBe("error");   // three paragraphs at most (review N1)
  });
});

describe("the pages", () => {
  it("GET /tickets/:code/review renders the audit with no model call, the sheet in a details block, and the button", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await get(db(), `/tickets/${CODE}/review`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/did you follow your rules\?/);
    expect(html).toMatch(/NOT FOLLOWED/);
    expect(html).toMatch(/AAPL: the stop was hit on the 2026-10-28 close/);
    expect(html).toMatch(/No reading asked for yet/);
    expect(html).toMatch(/Ask for a fresh reading/);
    expect(html).toMatch(/<details>/);
    expect(html).not.toMatch(/182\.54/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("the page's budget line carries the day's used count on a plain GET (OI-94): the cap's own count, one query, no model call; omitted when the table is absent", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ used: 2 });
    const html = await (await get(d, `/tickets/${CODE}/review`)).text();
    expect(html).toMatch(/budget 3 readings a day for this account · 2 used/);
    expect(d.ran("FROM reviews WHERE code = ?1 AND asked_at >= ?2")).toHaveLength(1);
    expect(d.ran("INSERT INTO reviews")).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    const none = await (await get(db({ used: 0 }), `/tickets/${CODE}/review`)).text();
    expect(none).toMatch(/budget 3 readings a day for this account · 0 used/);
    const over = await (await get(db({ used: 5 }), `/tickets/${CODE}/review`)).text();
    expect(over).toMatch(/· 3 used/);                                            // never more than the budget
    const noTable = await (await get(db({ noTable: true }), `/tickets/${CODE}/review`)).text();
    expect(noTable).toMatch(/budget 3 readings a day for this account</);          // the audit renders; no count to show
    expect(noTable).toMatch(/NOT FOLLOWED/);
    const off = await (await get(db({ used: 1 }), `/tickets/${CODE}/review`, { REVIEW_DAILY_CAP: "0" })).text();
    expect(off).not.toMatch(/used</);                                            // switched off: no count either
  });
  it("the page shows the last stored reading with its night and prompt version, its tags resolved against the facts of its own night (review F9)", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const storedAudit = { facts: [{ id: "F1", text: "the rules, as they were" }, { id: "F2", text: "Ticket #1 of that night" }, { id: "F5", text: "KO of that night" }] };
    const last = [{ id: 3, asked_at: "2026-11-09T19:00:00.000Z", as_of: "2026-11-06", prompt_version: "r1", outcome: "answered", audit: JSON.stringify(storedAudit), reading: JSON.stringify(GOOD), grounding: null, model: "claude-haiku-5-5", input_tokens: 1300, output_tokens: 240, ms: 2100 }];
    const html = await (await get(db({ last }), `/tickets/${CODE}/review`)).text();
    expect(html).toMatch(/The last reading, written 2026-11-09 19:00 UTC as of the 2026-11-06 close/);
    expect(html).toMatch(/prompt r1/);
    expect(html).toMatch(/title="KO of that night">\[F5\]/);          // the stored night's fact, not today's
    expect(html).toMatch(/\[F6 — not on the sheet\]/);                  // a tag the stored night had no fact for
  });
  it("POST /tickets/:code/review asks for a fresh reading and redirects to the page with the row's id (review N14); the page then renders that row", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    const r = await post(db(), `/tickets/${CODE}/review`);
    expect(r.status).toBe(303);
    expect(r.headers.get("location")).toBe(`/tickets/${CODE}/review?r=5`);
    const just = [{ id: 5, asked_at: "2026-11-12T13:00:00.000Z", as_of: "2026-11-10", prompt_version: REVIEW_PROMPT_VERSION, outcome: "answered", audit: JSON.stringify({ facts: [{ id: "F2", text: "t" }, { id: "F3", text: "t" }, { id: "F4", text: "t" }, { id: "F5", text: "KO" }, { id: "F6", text: "t" }] }), reading: JSON.stringify(GOOD), grounding: null, model: "claude-haiku-5-5", input_tokens: 1400, output_tokens: 260, ms: 2000 }];
    const html = await (await get(db({ just }), `/tickets/${CODE}/review?r=5`)).text();
    expect(html).toMatch(/A fresh reading, written 13:00 UTC/);
    expect(html).toMatch(/\[F5\]/);
    expect(html).toMatch(/Next week:/);
    expect(html).toMatch(new RegExp(`prompt ${REVIEW_PROMPT_VERSION}`));
    expect(html.match(/The last reading/g)).toBeNull();
  });
  it("a withheld reading redirects too, and the page renders the stored row's reason and the audit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(PRAISE)));
    const r = await post(db(), `/tickets/${CODE}/review`);
    expect(r.status).toBe(303);
    const grounding = { unknownFacts: [], uncited: [], unsupportedNumbers: [], recommendationLanguage: [], outcomeLanguage: ["Well done", "made a profit"], clean: false };
    // the row carries the withheld reading as the audit copy (OI-97) — the page must show its reason and none of its words
    const just = [{ id: 5, asked_at: "2026-11-12T13:00:00.000Z", as_of: "2026-11-10", prompt_version: REVIEW_PROMPT_VERSION, outcome: "rejected", audit: "{}", reading: JSON.stringify(PRAISE), grounding: JSON.stringify(grounding), model: "claude-haiku-5-5", input_tokens: 1400, output_tokens: 260, ms: 2000 }];
    const html = await (await get(db({ just }), `/tickets/${CODE}/review?r=5`)).text();
    expect(html).toMatch(/was withheld by the course's checks \(outcome language: &quot;Well done&quot;/);
    expect(html).toMatch(/NOT FOLLOWED/);
    expect(html).not.toMatch(/selling early made a profit|Keep trusting your instincts/);
    // nor can a withheld row become "the last reading": the query that picks it selects answered rows only (the fake answers any row it is handed, so the pin is the SQL)
    const d2 = db({ just });
    await get(d2, `/tickets/${CODE}/review?r=5`);
    expect(d2.ran("FROM reviews WHERE code = ?1 AND outcome = 'answered'")).toHaveLength(1);
    // a row of another student's is not shown
    const other = await (await get(db({ just: [{ ...just[0], code: "Q2WD-8HJ3" }] }), `/tickets/${CODE}/review?r=5`)).text();
    expect(other).toMatch(/withheld/);   // the fake answers any id; the route binds the code — the SQL carries it
  });
  it("the student page links to the review and the worksheet", async () => {
    const d = db().on("SELECT * FROM risk_reports", () => ({ results: [] })).on("FROM signals WHERE symbol", () => ({ results: [] }));
    const html = await (await get(d, `/tickets/${CODE}`)).text();
    expect(html).toMatch(new RegExp(`/tickets/${CODE}/review`));
    // v1.2.0 review F1: the sheet carries none of the toolkit's result figures — the student's own words may (lesson 11)
    const page = await (await get(db(), `/tickets/${CODE}/review`)).text();
    expect(page).toContain("carries <b>none of the toolkit's profit, loss, account-value or drawdown figures</b>");
    expect(page).toContain("your own journal words are on the sheet as you wrote them, results included if you wrote them");
    // v1.2: the links are buttons in the page body (the old grey back line is gone), and the header is on every page
    expect(html).toMatch(/<a class="btn alt" href="\/costs">Costs &amp; tax<\/a>/);
    expect(html).toContain('<nav class="top" aria-label="The course site">');
    expect(html).toContain('<a href="/me" aria-current="page">Your page</a>');
  });
});

describe("/costs — the worksheet", () => {
  it("renders with the defaults and no table, and with a query; a bad field is 400 with the defaults shown", async () => {
    const d = fakeD1();
    const r = await get(d, "/costs");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/What a trade really costs/);
    expect(html).toMatch(/Bill — not yet law/);
    expect(html).toMatch(/€1,270/);
    expect(d.log).toHaveLength(0);
    const q = await (await get(d, "/costs?invested=5000&gainPct=10&years=0&market=IE")).text();
    expect(q).toMatch(/Stamp duty \(Irish shares\)/);
    expect(q).toMatch(/38% of the whole gain/);
    const bad = await get(d, "/costs?invested=-5");
    expect(bad.status).toBe(400);
    expect(await bad.text()).toMatch(/invested must be a number from 100 to 1000000/);
  });
  it("GET /api/costs returns the worksheet with the three regimes and the rules", async () => {
    const j = (await (await get(fakeD1(), "/api/costs?invested=10000&gainPct=30&years=3")).json()) as any;
    expect(j.gain).toBe(3000);
    expect(j.tax.shares.tax).toBe(536.3);
    expect(j.tax.etf.tax).toBe(1050);
    expect(j.tax.iia.tax).toBe(0);
    expect(j.rules.cgt.ratePct).toBe(31);
    expect(j.trade.share.total).toBeGreaterThan(0);
    const bad = await get(fakeD1(), "/api/costs?years=99");
    expect(bad.status).toBe(400);
  });
});
