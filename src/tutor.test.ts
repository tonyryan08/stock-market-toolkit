/**
 * Week 10: the tutor routes on the fake D1 with a stubbed Claude. Every
 * outcome renders; the model is never called when nothing matched or the
 * budget is spent; the FTS path is taken when the index answers and the
 * word match when it throws; the receipts land in `questions` and `fetch_log`.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";

const NOTES = [
  { id: "L8.9", source: "docs/lessons/week-08.md", title: "Lesson 8 — How Much to Bet", heading: "0:40 — The stop (1)", body: "The Starter System has one closing rule: the trailing stop. The stop gap is ½ × instrument risk × the entry price — $31.72 on an entry of $348.91 at 18.18%. The stop trails the highest close since entry and only ever moves up.", words: 45 },
  { id: "K-RULES.6", source: "kit/starter-system-rules-card.md", title: "Takeaway kit · Starter System rules card", heading: "4 · The closing rule — the stop", body: "stop gap = ½ × instrument risk × entry price (fixed on the day). stop level = highest close since entry − stop gap. A close at or below the stop says close; the student writes the ticket.", words: 40 },
  { id: "L9.8", source: "docs/lessons/week-09.md", title: "Lesson 9 — Running Your Paper Portfolio", heading: "0:25 — Drawdowns are normal (1)", body: "A 12% target means a 12% year is ordinary. A one-in-twenty year is about −20%. What the rules do about a drawdown: nothing.", words: 30 },
];

const reply = (json: unknown, status = 200, usage = { input_tokens: 900, output_tokens: 150 }) =>
  new Response(JSON.stringify(status === 200 ? { content: [{ type: "text", text: JSON.stringify(json) }], usage, stop_reason: "end_turn" } : { error: { type: "api_error", message: "boom" } }), { status, headers: { "content-type": "application/json" } });

/**
 * A fake D1 for the tutor: FTS throws (or answers), `notes` holds NOTES, the pending row gets id 7, and the cap
 * query — the one that names the five outcomes, pending included (review F4 / M16) — answers `used` (this
 * question's own row counted, as the real query would).
 */
const db = (opts: { fts?: "throw" | typeof NOTES; used?: number; recent?: unknown[] } = {}) => fakeD1()
  .on("FROM notes_fts", () => { if (!opts.fts || opts.fts === "throw") throw new Error("no such module: fts5"); return { results: opts.fts.map((n, i) => ({ ...n, rank: -(10 - i) })) }; })
  .on("SELECT COUNT(*) AS n, MAX(seeded_at) AS s FROM notes", () => ({ results: [{ n: 175, s: "2026-11-11T09:00:00.000Z" }] }))
  .on("SELECT id, source, title, heading, body, words FROM notes", () => ({ results: NOTES }))
  .on("VALUES (?1, ?2, 'pending', ?3, ?4) RETURNING id", () => ({ results: [{ id: 7 }] }))
  .on("outcome IN ('answered','declined','rejected','error','pending')", () => ({ results: [{ n: opts.used ?? 1 }] }))
  .on("FROM questions WHERE outcome IN", () => ({ results: (opts.recent ?? []) as never[] }));

const env = (d: FakeD1, over: Record<string, string> = {}) => ({ DB: asD1(d), ANTHROPIC_API_KEY: "sk-test-not-a-real-key", ...over }) as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const ask = (d: FakeD1, question: unknown, over: Record<string, string> = {}) =>
  worker.fetch(new Request("http://localhost/api/tutor", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question }) }), env(d, over), ctx);
const askForm = (d: FakeD1, question: string, over: Record<string, string> = {}) =>
  worker.fetch(new Request("http://localhost/tutor", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ question }).toString() }), env(d, over), ctx);
const get = (d: FakeD1, path: string) => worker.fetch(new Request(`http://localhost${path}`), env(d), ctx);

const GOOD = { answered: true, paragraphs: [{ text: "The stop gap is half the instrument risk times the entry price: $31.72 on an entry of $348.91. The stop trails the highest close and only ever moves up.", passages: ["P1", "P2"] }], reason: null, check: "Find the $31.72 in P1 and the words 'only ever moves up'." };

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/tutor — the outcomes", () => {
  it("a question too short is 400 and reaches no table; too long is 400", async () => {
    const d = db();
    const r = await ask(d, "hi");
    expect(r.status).toBe(400);
    expect(((await r.json()) as any).reason).toMatch(/Type a question first/);
    expect(d.ran("INSERT INTO questions").length).toBe(0);
    const long = await ask(d, "x".repeat(301));
    expect(long.status).toBe(400);
    expect(((await long.json()) as any).reason).toMatch(/at most 300 characters/);
    expect((await ask(d, undefined)).status).toBe(400);
  });
  it("nothing matched → off_corpus, no model call, a questions row and a receipt", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
    const d = fakeD1()
      .on("FROM notes_fts", () => ({ results: [] }))
      .on("SELECT COUNT(*) AS n, MAX(seeded_at) AS s FROM notes", () => ({ results: [{ n: 175, s: null }] }));
    const r = await ask(d, "what is the capital of zxqv");
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j.outcome).toBe("off_corpus");
    expect(j.retrieval).toBe("fts");
    expect(j.passages).toEqual([]);
    expect(j.reason).toMatch(/don't have a passage/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.ran("INSERT INTO questions")[0].binds.slice(2, 5)).toEqual(["off_corpus", "fts", "[]"]);
    expect(d.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("tutor_off_corpus");
  });
  it("the FTS index throws → the word match over `notes` answers (retrieval: like); the budget spent → capped with the passages and no model call", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ fts: "throw", used: 61 });                                      // 60 before this one, plus its own pending row
    const j = (await (await ask(d, "How is the stop calculated?")).json()) as any;
    expect(j.outcome).toBe("capped");
    expect(j.retrieval).toBe("like");
    expect(j.passages.map((p: any) => p.id)).toEqual(["K-RULES.6", "L8.9"]);        // heading matches both, "stop" three times in each body: a tie, broken by id
    expect(j.reason).toMatch(/budget \(60 questions in 24 hours\) is spent/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("tutor_capped");
    // the row was written FIRST as pending and then updated to capped (review F4): the count a parallel question sees includes it
    expect(d.ran("INSERT INTO questions")[0].binds.slice(0, 4).slice(1)).toEqual(["How is the stop calculated?", "like", JSON.stringify(["K-RULES.6", "L8.9"])]);
    expect(d.ran("UPDATE questions SET outcome")[0].binds[0]).toBe("capped");
    expect(d.ran("UPDATE questions SET outcome")[0].binds[7]).toBe(7);
    // exactly at the cap counting itself: the 60th question answers, the 61st does not
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    const at = db({ fts: NOTES, used: 60 });
    expect(((await (await ask(at, "How is the stop calculated?")).json()) as any).outcome).toBe("answered");
    // "0" is the off switch, with its own sentence (review N12): no pending row, no call
    const d0 = db({ used: 0 });
    const j0 = (await (await ask(d0, "How is the stop calculated?", { TUTOR_DAILY_CAP: "0" })).json()) as any;
    expect(j0.outcome).toBe("capped");
    expect(j0.meta.daily_cap).toBe(0);
    expect(j0.reason).toMatch(/switched off on this deployment \(the daily budget is set to 0\)/);
    expect(d0.ran("RETURNING id").length).toBe(0);
  });
  it("no key → the passages only, no call, no receipt line", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ fts: NOTES });
    const j = (await (await ask(d, "How is the stop calculated?", { ANTHROPIC_API_KEY: "" })).json()) as any;
    expect(j.outcome).toBe("capped");
    expect(j.reason).toMatch(/No AI key/);
    expect(j.passages.length).toBe(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it("answered: the FTS rows go to the model numbered, the labels come back resolved to ids, the check is kept, the receipts say ok", async () => {
    let sent: any = null;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return reply(GOOD); }));
    const d = db({ fts: NOTES });
    const j = (await (await ask(d, "How is the stop calculated, and when does it move?")).json()) as any;
    expect(j.outcome).toBe("answered");
    expect(j.retrieval).toBe("fts");
    expect(sent.system).toContain("Never recommend");
    expect(sent.messages[0].content).toContain("QUESTION: How is the stop calculated, and when does it move?");
    expect(sent.messages[0].content).toContain("[P1] Lesson 8 — How Much to Bet › 0:40 — The stop (1)");
    expect(sent.output_config.format.type).toBe("json_schema");
    expect(sent.thinking).toEqual({ type: "disabled" });
    expect(j.answer.paragraphs[0].passages).toEqual(["L8.9", "K-RULES.6"]);
    expect(j.answer.paragraphs[0].labels).toEqual(["P1", "P2"]);
    expect(j.answer.check).toMatch(/Find the \$31\.72/);
    expect(j.grounding.clean).toBe(true);
    expect(j.meta.tokens).toEqual({ input: 900, output: 150 });
    expect(j.meta.model).toBe("claude-haiku-5-5");
    expect(j.meta.note).toMatch(/Education, not advice/);
    const q = d.ran("INSERT INTO questions")[0].binds;                               // the pending row: question, retrieval, passages
    expect(q.slice(1, 4)).toEqual(["How is the stop calculated, and when does it move?", "fts", JSON.stringify(["L8.9", "K-RULES.6", "L9.8"])]);
    const u = d.ran("UPDATE questions SET outcome")[0].binds;                        // then the outcome on the same row
    expect(u[0]).toBe("answered"); expect(u[3]).toBe("claude-haiku-5-5"); expect(u[4]).toBe(900); expect(u[5]).toBe(150); expect(u[7]).toBe(7);
    const log = d.ran("INSERT INTO fetch_log")[0].binds;
    expect(log[1]).toBe("tutor_ok");
    expect(String(log[3])).toMatch(/^claude-haiku-5-5 900\/150 tokens \d+ ms fts 3 passages$/);
  });
  it("a number from nowhere and an invented label are flagged on an otherwise served answer; advice is withheld (rejected); the model's own decline is 'declined'", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: true, paragraphs: [{ text: "The stop gap is $40.00 on an entry of $348.91.", passages: ["P1", "P9"] }], reason: null, check: null })));
    const d = db({ fts: NOTES });
    const j = (await (await ask(d, "How is the stop calculated?")).json()) as any;
    expect(j.outcome).toBe("answered");
    expect(j.grounding).toMatchObject({ clean: false, unknownPassages: [{ paragraph: 1, labels: ["P9"] }], unsupportedNumbers: [{ paragraph: 1, numbers: ["40"] }] });
    expect(String(d.ran("INSERT INTO fetch_log")[0].binds[3])).toMatch(/flagged: labels P9; numbers 40/);

    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: true, paragraphs: [{ text: "You should buy KO before the stop moves.", passages: ["P1"] }], reason: null, check: null })));
    const d2 = db({ fts: NOTES });
    const j2 = (await (await ask(d2, "Should I buy KO?")).json()) as any;
    expect(j2.outcome).toBe("rejected");
    expect(j2.reason).toMatch(/withheld by the course's checks \(advice-shaped language: "/);
    expect(j2.passages.length).toBe(3);
    expect(d2.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("tutor_rejected");
    // the API withholds it too (review F1): no paragraph, no check, nothing but the reason's quoted phrase; the audit copy is the questions row
    expect(j2.answer).toBeNull();
    expect(JSON.stringify(j2)).not.toContain("You should buy KO");
    expect(String(d2.ran("UPDATE questions SET outcome")[0].binds[1])).toContain("You should buy KO");
    // a tip in a decline's reason is caught (M8)
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: false, paragraphs: [], reason: "The notes do not say, but Coca-Cola is a good buy at these levels.", check: "" })));
    const d4 = db({ fts: NOTES });
    const j4 = (await (await ask(d4, "Is KO a good investment?")).json()) as any;
    expect(j4.outcome).toBe("rejected");
    expect(j4.answer).toBeNull();
    expect(JSON.stringify(j4)).not.toContain("Coca-Cola is a good buy");             // the reason quotes the matched phrase only

    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: false, paragraphs: [], reason: "The notes cover the stop and the size, not tax.", check: null })));
    const d3 = db({ fts: NOTES });
    const j3 = (await (await ask(d3, "How is capital gains tax charged on the stop?")).json()) as any;
    expect(j3.outcome).toBe("declined");
    expect(j3.reason).toBe("The notes cover the stop and the size, not tax.");
    expect(d3.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("tutor_declined");
    // a number from nowhere in the decline's reason is flagged (review F2) — the outcome stays declined, the grounding says where
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: false, paragraphs: [], reason: "The notes do not cover capital gains tax, which is charged at 33% on gains over €1,270.", check: "" })));
    const d5 = db({ fts: NOTES });
    const j5 = (await (await ask(d5, "How is capital gains tax charged?")).json()) as any;
    expect(j5.outcome).toBe("declined");
    expect(j5.grounding.unsupportedNumbers).toEqual([{ paragraph: 0, where: "reason", numbers: ["33", "1270"] }]);
    expect(String(d5.ran("INSERT INTO fetch_log")[0].binds[3])).toMatch(/flagged: numbers reason 33,1270/);
    // an uncited paragraph is flagged (review F3)
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: true, paragraphs: [{ text: "The stop only ever moves up.", passages: [] }], reason: "", check: "" })));
    const d6 = db({ fts: NOTES });
    const j6 = (await (await ask(d6, "When does the stop move?")).json()) as any;
    expect(j6.outcome).toBe("answered");
    expect(j6.grounding.uncited).toEqual([1]);
    expect(j6.grounding.clean).toBe(false);
  });
  it("the FTS candidates are re-ranked by the question's words, not served in bm25 order (M18)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    const d = db({ fts: [...NOTES].reverse() });                                    // the index's order: L9.8, K-RULES.6, L8.9
    const j = (await (await ask(d, "How is the stop calculated, and when does it move?")).json()) as any;
    expect(j.passages.map((p: any) => p.id)).toEqual(["L8.9", "K-RULES.6", "L9.8"]);   // the stop's section first; the drawdown passage (no term) at the tail
    expect(j.answer.paragraphs[0].passages).toEqual(["L8.9", "K-RULES.6"]);
  });
  it("the API fails (500) or answers nonsense → error, the passages shown, a receipt; the key is never in the reason", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(null, 500)));
    const d = db({ fts: NOTES });
    const j = (await (await ask(d, "How is the stop calculated?")).json()) as any;
    expect(j.outcome).toBe("error");
    expect(j.reason).toMatch(/The AI call failed \(HTTP 500 api_error boom\)/);
    expect(JSON.stringify(j)).not.toContain("sk-test");
    expect(d.ran("INSERT INTO fetch_log")[0].binds[1]).toBe("tutor_error");
    vi.stubGlobal("fetch", vi.fn(async () => reply({ nonsense: true })));
    const d2 = db({ fts: NOTES });
    const j2 = (await (await ask(d2, "How is the stop calculated?")).json()) as any;
    expect(j2.outcome).toBe("error");
    expect(j2.reason).toMatch(/malformed/);
  });
});

describe("the page", () => {
  it("GET /tutor renders the form, the how-to box and the class's questions; ?q= fills the form without a model call", async () => {
    const fetchSpy = vi.fn(() => { throw new Error("must not be called"); });
    vi.stubGlobal("fetch", fetchSpy);
    const d = db({ recent: [{ asked_at: "2026-11-11T10:00:00Z", question: "What is a drawdown?", outcome: "answered", retrieval: "fts", passages: '["L9.8"]' }] });
    const html = await (await get(d, "/tutor?q=How%20is%20the%20stop%20calculated%3F")).text();
    expect(html).toContain('<textarea id="question" name="question" maxlength="300"');
    expect(html).toContain(">How is the stop calculated?</textarea>");
    expect(html).toContain("How to ask well");
    expect(html).toContain("What the class asked");
    expect(html).toContain("What is a drawdown?");
    expect(html).toContain("175 passages indexed 2026-11-11");
    expect(html).toContain("Education, not advice");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(d.ran("INSERT INTO questions").length).toBe(0);
    // an attempt at markup in the query is escaped
    const x = await (await get(d, "/tutor?q=%3Cscript%3Ealert(1)%3C%2Fscript%3E")).text();
    expect(x).not.toContain("<script>alert");
  });
  it("POST /tutor (the form) renders the answer with cite tags, the check, and the passages with anchors", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(GOOD)));
    const d = db({ fts: NOTES });
    const r = await askForm(d, "How is the stop calculated, and when does it move?");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain('<a class="cite" href="#L8.9" title="passage P1">[L8.9]</a>');
    expect(html).toContain('<a class="cite" href="#K-RULES.6" title="passage P2">[K-RULES.6]</a>');
    expect(html).toContain("Check for yourself:");
    expect(html).toContain('<article id="L8.9">');
    expect(html).toContain("L8 · How Much to Bet &rsaquo; 0:40 — The stop (1)");
    expect(html).toContain("Answered by claude-haiku-5-5 from 3 passages · retrieval: full-text index");
    expect(html).not.toContain("sk-test");
    // an invented label renders unlinked and says so; an uncited paragraph says so; a decline's number flag prints (reviews N5, F3, F2)
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: true, paragraphs: [{ text: "The gap is half the risk.", passages: ["P1", "P9"] }, { text: "It only moves up.", passages: [] }], reason: "", check: "" })));
    const h2 = await (await askForm(db({ fts: NOTES }), "How is the stop calculated?")).text();
    expect(h2).toContain('<span class="cite bad" title="not among the passages the tutor was given">[P9 — not given]</span>');
    expect(h2).not.toContain('href="#P9"');
    expect(h2).toContain('[no citation]</span>');
    expect(h2).toContain("paragraph 1 cites a passage it was not given (P9); paragraph 2 cites no passage");
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: false, paragraphs: [], reason: "The notes do not cover tax, which is 33%.", check: "" })));
    const h3 = await (await askForm(db({ fts: NOTES }), "How is capital gains tax charged?")).text();
    expect(h3).toContain('<section class="answer declined">');
    expect(h3).toContain("the reason has a number that is in none of the passages (33)");
  });
  it("a withheld answer renders the reason in the stamp colour and the passages; a too-short question is a 400 page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply({ answered: true, paragraphs: [{ text: "Buy it now.", passages: ["P1"] }], reason: null, check: null })));
    const d = db({ fts: NOTES });
    const html = await (await askForm(d, "Should I buy?")).text();
    expect(html).toContain('<section class="answer rejected">');
    expect(html).toContain("withheld by the course's checks");
    expect(html).toContain("The passages the tutor read");
    expect(html).not.toContain("Buy it now.");
    const short = await askForm(db(), "hi");
    expect(short.status).toBe(400);
    expect(await short.text()).toContain("Type a question first");
  });
  it("GET /api/tutor/recent lists the class's questions with their passages parsed", async () => {
    const d = db({ recent: [{ asked_at: "2026-11-11T10:00:00Z", question: "What is a drawdown?", outcome: "answered", retrieval: "fts", passages: '["L9.8","K-RULES.3"]' }] });
    const j = (await (await get(d, "/api/tutor/recent")).json()) as any;
    expect(j.questions[0]).toMatchObject({ question: "What is a drawdown?", outcome: "answered", passages: ["L9.8", "K-RULES.3"] });
  });
});
