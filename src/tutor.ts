/**
 * Week 10: the tutor routes — `/tutor` (the page and its form), `POST /api/tutor`
 * (the same over JSON), `GET /api/tutor/recent` (what the class asked).
 *
 * The path of a question: validate → retrieve (FTS5 when the index exists,
 * the word match when it does not) → nothing matched: say so, no model call →
 * the day's budget spent: the passages only → ask the model with the
 * passages, numbered → validate the JSON → check it (labels, numbers,
 * advice) → advice-shaped: withhold the answer, show the passages → store the
 * receipt in `questions` and a line in `fetch_log`. Anonymous: no code is
 * asked for or stored. Every outcome renders; the page never goes dark.
 */

import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, esc, SHARED_CSS } from "./page";
import { intSetting } from "./lib/settings";
import { DEFAULT_MODEL, claudeJson, extractJson } from "./lib/narrative";
import {
  QUESTION_MIN, QUESTION_MAX, PASSAGES_PER_ANSWER, TUTOR_DAILY_CAP_DEFAULT, OFF_CORPUS,
  termsOf, ftsQuery, rankByTerms, passagesAsText, validateAnswer, checkAnswer, resolveLabels,
  TUTOR_SYSTEM_PROMPT, ANSWER_SCHEMA, type Passage, type Answer, type AnswerCheck,
} from "./lib/tutor";
export type { AnswerCheck };

type Env = {
  DB: D1Database;
  ANTHROPIC_API_KEY?: string;
  EXPLAIN_MODEL?: string;
  EXPLAIN_API_URL?: string;
  TUTOR_DAILY_CAP?: string;
};

export const tutor = new Hono<{ Bindings: Env }>();

const NOTE = "Education, not advice. The tutor answers from the course's own notes and cites the passages it read; it recommends nothing, and an answer is a reading of the notes, never a tip.";

export type Outcome = "answered" | "declined" | "off_corpus" | "rejected" | "capped" | "error" | "invalid";
export type Retrieval = "fts" | "like" | "none";

export type TutorResult = {
  question: string;
  outcome: Outcome;
  retrieval: Retrieval;
  passages: Passage[];
  /** The answer with its labels resolved to passage ids ("L8.9"); present for answered / declined / rejected. */
  answer: (Omit<Answer, "paragraphs"> & { paragraphs: { text: string; passages: string[]; labels: string[] }[] }) | null;
  grounding: AnswerCheck | null;
  reason: string | null;        // the sentence the page prints for every outcome that is not "answered"
  meta: { model: string | null; tokens: { input: number; output: number } | null; ms: number | null; daily_cap: number; notes: { passages: number; seeded_at: string | null } };
};

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------
/** How many FTS5 candidates the re-ranker reads. */
export const FTS_CANDIDATES = 30;

/**
 * FTS5 first — the index finds the candidates (stemmed, fast: the thirty best
 * by bm25) and `rankByTerms` orders them by how many of the question's words
 * each carries, heading and title first; the same ranker is the whole of the
 * fallback when the index is absent, so both paths order the same way. (Raw
 * bm25 over an OR of the words ranked a passage that merely repeats "stop"
 * above the section called "The stop" — seen at the build, 11 Nov 2026.)
 * Candidates the re-ranker cannot see (a stem only porter knows) keep their
 * bm25 order at the tail, so nothing the index found is thrown away.
 */
export async function searchNotes(db: D1Database, question: string): Promise<{ passages: Passage[]; retrieval: Retrieval; terms: string[] }> {
  const terms = termsOf(question);
  if (!terms.length) return { passages: [], retrieval: "none", terms };
  try {
    const rows = (await db.prepare(
      "SELECT n.id, n.source, n.title, n.heading, n.body, n.words, bm25(notes_fts, 0, 2.0, 3.0, 1.0) AS rank " +
      "FROM notes_fts JOIN notes n ON n.id = notes_fts.id WHERE notes_fts MATCH ?1 ORDER BY rank LIMIT ?2",
    ).bind(ftsQuery(terms), FTS_CANDIDATES).all<Passage>()).results;
    const ranked = rankByTerms(rows, terms);
    const seen = new Set(ranked.map((p) => p.id));
    const tail = rows.filter((r) => !seen.has(r.id)).map((r) => ({ ...r, rank: typeof r.rank === "number" ? Math.round(r.rank * 1000) / 1000 : undefined }));
    return { passages: [...ranked, ...tail].slice(0, PASSAGES_PER_ANSWER), retrieval: "fts", terms };
  } catch {
    const all = (await db.prepare("SELECT id, source, title, heading, body, words FROM notes").all<Passage>()).results;
    return { passages: rankByTerms(all, terms), retrieval: "like", terms };
  }
}

async function notesMeta(db: D1Database): Promise<{ passages: number; seeded_at: string | null }> {
  try {
    const r = await db.prepare("SELECT COUNT(*) AS n, MAX(seeded_at) AS s FROM notes").first<{ n: number; s: string | null }>();
    return { passages: r?.n ?? 0, seeded_at: r?.s ?? null };
  } catch { return { passages: 0, seeded_at: null }; }
}

// ---------------------------------------------------------------------------
// The question, end to end
// ---------------------------------------------------------------------------
export async function askTutor(env: Env, rawQuestion: unknown): Promise<TutorResult> {
  const question = String(rawQuestion ?? "").replace(/\s+/g, " ").trim().slice(0, QUESTION_MAX + 1);
  const cap = intSetting(env.TUTOR_DAILY_CAP, TUTOR_DAILY_CAP_DEFAULT);
  const model = env.EXPLAIN_MODEL || DEFAULT_MODEL;
  const notes = await notesMeta(env.DB);
  const base: TutorResult = {
    question, outcome: "invalid", retrieval: "none", passages: [], answer: null, grounding: null, reason: null,
    meta: { model: null, tokens: null, ms: null, daily_cap: cap, notes },
  };
  if (question.length < QUESTION_MIN) return { ...base, reason: "Type a question first — a few words are enough." };
  if (question.length > QUESTION_MAX) return { ...base, question: question.slice(0, QUESTION_MAX), reason: `A question is at most ${QUESTION_MAX} characters.` };

  const log = async (outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, NULL, ?2, ?3, ?4)")
        .bind(new Date().toISOString(), outcome, rows, detail.slice(0, 300)).run();
    } catch { /* logging must never break the page */ }
  };
  // The receipt row. Before a model call the row is written first as `pending` and the cap counts it (review F4 —
  // the OI-24 shape: insert, then count including yourself, so a burst of parallel questions cannot all pass a
  // read-then-insert check); the same row is then updated with the outcome. A row that stays `pending` (the
  // Worker died mid-call) holds one slot for 24 hours — the honest cost of the ordering.
  let pendingId: number | null = null;
  const record = async (r: TutorResult, extra: { model?: string | null; input?: number; output?: number; ms?: number } = {}) => {
    try {
      if (pendingId !== null) {
        await env.DB.prepare(
          "UPDATE questions SET outcome = ?1, answer = ?2, grounding = ?3, model = ?4, input_tokens = ?5, output_tokens = ?6, ms = ?7 WHERE id = ?8",
        ).bind(
          r.outcome, r.answer ? JSON.stringify(r.answer) : null, r.grounding ? JSON.stringify(r.grounding) : null,
          extra.model ?? null, extra.input ?? null, extra.output ?? null, extra.ms ?? null, pendingId,
        ).run();
        return;
      }
      await env.DB.prepare(
        "INSERT INTO questions (asked_at, question, outcome, retrieval, passages, answer, grounding, model, input_tokens, output_tokens, ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      ).bind(
        new Date().toISOString(), r.question, r.outcome, r.retrieval, JSON.stringify(r.passages.map((p) => p.id)),
        r.answer ? JSON.stringify(r.answer) : null, r.grounding ? JSON.stringify(r.grounding) : null,
        extra.model ?? null, extra.input ?? null, extra.output ?? null, extra.ms ?? null,
      ).run();
    } catch { /* the receipt is a convenience; the page still renders */ }
  };

  const { passages, retrieval } = await searchNotes(env.DB, question);
  if (!passages.length) {
    const r: TutorResult = { ...base, outcome: "off_corpus", retrieval, reason: OFF_CORPUS };
    await record(r);
    await log("tutor_off_corpus", 0, `${retrieval}: no passage matched "${question.slice(0, 80)}"`);
    return r;
  }

  const t0 = Date.now();
  if (!env.ANTHROPIC_API_KEY) {
    const r: TutorResult = { ...base, outcome: "capped", retrieval, passages, reason: "No AI key is configured on this deployment, so the tutor shows the passages it would have read and no answer." };
    await record(r);
    return r;
  }
  if (cap === 0) {
    // "0" is the deliberate off switch (the week after the course ends), not a spent budget (review N12)
    const r: TutorResult = { ...base, outcome: "capped", retrieval, passages, reason: "The tutor's answers are switched off on this deployment (the daily budget is set to 0). The passages the notes have for this question are below — the answer is in them." };
    await record(r);
    return r;
  }
  // the day's budget: model calls in the last 24 hours (whatever their outcome) — this question's own pending row included
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let used = 1;
  try {
    const ins = await env.DB.prepare(
      "INSERT INTO questions (asked_at, question, outcome, retrieval, passages) VALUES (?1, ?2, 'pending', ?3, ?4) RETURNING id",
    ).bind(new Date().toISOString(), question, retrieval, JSON.stringify(passages.map((p) => p.id))).first<{ id: number }>();
    pendingId = typeof ins?.id === "number" ? ins.id : null;
    used = (await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE asked_at >= ?1 AND outcome IN ('answered','declined','rejected','error','pending')").bind(since).first<{ n: number }>())?.n ?? 1;
  } catch { /* no table: treat as unused */ }
  if (used > cap) {
    const r: TutorResult = { ...base, outcome: "capped", retrieval, passages, reason: `Today's tutor budget (${cap} questions in 24 hours) is spent. The passages the tutor would have read are below — the answer is in them; it comes back when the budget resets.` };
    await record(r);
    await log("tutor_capped", 0, `cap ${cap} reached`);
    return r;
  }

  const call = await claudeJson({ system: TUTOR_SYSTEM_PROMPT, user: passagesAsText(question, passages), schema: ANSWER_SCHEMA },
    { apiKey: env.ANTHROPIC_API_KEY, model, apiUrl: env.EXPLAIN_API_URL || undefined });
  if (!call.ok) {
    const r: TutorResult = { ...base, outcome: "error", retrieval, passages, reason: `The AI call failed (${call.reason}). The passages the tutor would have read are below.`, meta: { ...base.meta, model, ms: call.ms } };
    await record(r, { model, ms: call.ms });
    await log("tutor_error", 0, call.reason);
    return r;
  }
  const answer = validateAnswer(extractJson(call.text));
  if (!answer) {
    const r: TutorResult = { ...base, outcome: "error", retrieval, passages, reason: `The AI's reply was malformed (stop_reason ${call.stopReason ?? "?"}). The passages the tutor would have read are below.`, meta: { ...base.meta, model, tokens: call.usage, ms: call.ms } };
    await record(r, { model, input: call.usage.input, output: call.usage.output, ms: call.ms });
    await log("tutor_error", 0, `malformed answer (stop_reason ${call.stopReason ?? "?"}) ${call.usage.input}/${call.usage.output} tokens`);
    return r;
  }
  const grounding = checkAnswer(answer, passages);
  const resolved = { ...answer, paragraphs: answer.paragraphs.map((p) => ({ text: p.text, labels: p.passages, passages: resolveLabels(p.passages, passages) })) };
  const meta = { ...base.meta, model, tokens: call.usage, ms: Date.now() - t0 };
  const tokens = `${call.usage.input}/${call.usage.output} tokens ${meta.ms} ms`;
  const flagged = grounding.clean ? "" : " — flagged: " + [
    ...grounding.unknownPassages.map((u) => `labels ${u.labels.join(",")}`),
    ...(grounding.uncited.length ? [`uncited ${grounding.uncited.join(",")}`] : []),
    ...grounding.unsupportedNumbers.map((u) => `numbers ${u.where ?? ""}${u.where ? " " : ""}${u.numbers.join(",")}`),
  ].join("; ");

  if (grounding.recommendationLanguage.length) {
    const r: TutorResult = { ...base, outcome: "rejected", retrieval, passages, answer: resolved, grounding, meta, reason: `The AI's answer was withheld by the course's checks (advice-shaped language: "${grounding.recommendationLanguage[0]}"). The passages it read are below; the answer is in them.` };
    await record(r, { model, input: call.usage.input, output: call.usage.output, ms: meta.ms });
    await log("tutor_rejected", 1, `${model} ${tokens} — ${grounding.recommendationLanguage.join("; ")}`);
    return r;
  }
  if (!answer.answered) {
    const r: TutorResult = { ...base, outcome: "declined", retrieval, passages, answer: resolved, grounding, meta, reason: answer.reason };
    await record(r, { model, input: call.usage.input, output: call.usage.output, ms: meta.ms });
    await log("tutor_declined", 1, `${model} ${tokens}${flagged} — ${answer.reason ?? ""}`);
    return r;
  }
  const r: TutorResult = { ...base, outcome: "answered", retrieval, passages, answer: resolved, grounding, meta, reason: null };
  await record(r, { model, input: call.usage.input, output: call.usage.output, ms: meta.ms });
  await log("tutor_ok", 1, `${model} ${tokens} ${retrieval} ${passages.length} passages${flagged}`);
  return r;
}

type RecentRow = { asked_at: string; question: string; outcome: string; retrieval: string; passages: string };
async function recent(db: D1Database, limit = 12): Promise<RecentRow[]> {
  try {
    return (await db.prepare("SELECT asked_at, question, outcome, retrieval, passages FROM questions WHERE outcome IN ('answered','declined','off_corpus') ORDER BY id DESC LIMIT ?1").bind(limit).all<RecentRow>()).results;
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
tutor.post("/api/tutor", async (c) => {
  let body: { question?: unknown } = {};
  try { body = (await c.req.json()) as { question?: unknown }; } catch { return c.json({ error: "Send JSON: {\"question\": \"…\"}" }, 400); }
  const r = await askTutor(c.env, body.question);
  // a withheld answer is withheld here too: the page prints the reason only, and so does the JSON (review F1); the audit copy is the questions row
  const out = r.outcome === "rejected" ? { ...r, answer: null } : r;
  return c.json({ ...out, meta: { ...r.meta, note: NOTE, source_note: "Retrieval over the course notes (FTS5 in D1, or a word match when the index is absent); the answer may say only what is in the passages shown, and grounding lists anything it said that is not." } }, r.outcome === "invalid" ? 400 : 200);
});

tutor.get("/api/tutor/recent", async (c) => {
  const rows = await recent(c.env.DB, 20);
  return c.json({ questions: rows.map((r) => ({ ...r, passages: JSON.parse(r.passages) as string[] })), note: "What the class asked, anonymously: the question, how it went, the passages the tutor read." });
});

tutor.get("/tutor", async (c) => {
  const q = c.req.query("q");
  if (q !== undefined) {
    // a link with ?q= shows the form filled in, nothing more: a question costs a model call, so it goes by the button
    return c.html(tutorPage(null, await recent(c.env.DB), await notesMeta(c.env.DB), q.slice(0, QUESTION_MAX)));
  }
  return c.html(tutorPage(null, await recent(c.env.DB), await notesMeta(c.env.DB), ""));
});

tutor.post("/tutor", async (c) => {
  const form = await c.req.parseBody();
  const r = await askTutor(c.env, form.question);
  return c.html(tutorPage(r, await recent(c.env.DB), r.meta.notes, r.question), r.outcome === "invalid" ? 400 : 200);
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const lessonOf = (p: Passage) => p.title.replace(/^Lesson\s+(\d+)\s+[—–-]\s+/, "L$1 · ").replace(/^Takeaway kit\s*[·—–-]\s*/i, "Kit · ");

function tutorPage(r: TutorResult | null, rows: RecentRow[], notes: { passages: number; seeded_at: string | null }, q: string): string {
  const given = new Set((r?.passages ?? []).map((p) => p.id));
  // a label the model was not given renders without a link and says so (review N5)
  const tag = (id: string, labels: string[], i: number) => given.has(id)
    ? `<a class="cite" href="#${esc(id)}" title="passage ${esc(labels[i] ?? "")}">[${esc(id)}]</a>`
    : `<span class="cite bad" title="not among the passages the tutor was given">[${esc(id)} — not given]</span>`;
  const flagsOf = (g: AnswerCheck | null) => !g || g.clean ? "" : `<p class="flag"><strong>Flagged by the checks:</strong> ${[
    ...g.unknownPassages.map((u) => `paragraph ${u.paragraph} cites a passage it was not given (${esc(u.labels.join(", "))})`),
    ...g.uncited.map((n) => `paragraph ${n} cites no passage`),
    ...g.unsupportedNumbers.map((u) => `${u.where === "reason" ? "the reason" : u.where === "check" ? "the check line" : `paragraph ${u.paragraph}`} has a number that is in none of the passages (${esc(u.numbers.join(", "))})`),
  ].join("; ")}. Treat that part as unverified.</p>`;
  const answerHtml = (() => {
    if (!r) return "";
    if (r.outcome === "answered" && r.answer) {
      const paras = r.answer.paragraphs.map((p) => `<p>${esc(p.text)} <span class="cites">${p.passages.length ? p.passages.map((id, i) => tag(id, p.labels, i)).join(" ") : `<span class="cite bad" title="this paragraph cites no passage">[no citation]</span>`}</span></p>`).join("");
      return `<section class="answer"><p class="q">${esc(r.question)}</p>${paras}${r.answer.check ? `<p class="check"><strong>Check for yourself:</strong> ${esc(r.answer.check)}</p>` : ""}${flagsOf(r.grounding)}</section>`;
    }
    // a decline's reason is the whole answer: its own flags (a number from nowhere) print under it (review F2)
    return `<section class="answer ${r.outcome}"><p class="q">${esc(r.question)}</p><p class="reason">${esc(r.reason ?? "")}</p>${r.outcome === "declined" ? flagsOf(r.grounding) : ""}</section>`;
  })();
  const passagesHtml = r && r.passages.length ? `<section class="passages">
    <h2>The passages the tutor read</h2>
    <p class="lede">In the order retrieval ranked them. Every claim in the answer should be here, in these words or close to them; a number should be here exactly. If it isn't, the answer is wrong — that is tonight's exercise.</p>
    ${r.passages.map((p, i) => `<article id="${esc(p.id)}"><h3><span class="pid">[${esc(p.id)}]</span> <span class="plabel">P${i + 1}</span> ${esc(lessonOf(p))} &rsaquo; ${esc(p.heading)}</h3><pre>${esc(p.body)}</pre></article>`).join("")}
  </section>` : "";
  const metaHtml = r && r.outcome !== "invalid" ? `<p class="caption">${r.outcome === "answered" ? `Answered by ${esc(r.meta.model ?? "")} from ${r.passages.length} passages` : `Outcome: ${esc(r.outcome.replace("_", " "))}`} · retrieval: ${r.retrieval === "fts" ? "full-text index" : r.retrieval === "like" ? "word match (no index)" : "—"}${r.meta.tokens ? ` · ${r.meta.tokens.input}/${r.meta.tokens.output} tokens` : ""}${r.meta.ms !== null ? ` · ${r.meta.ms} ms` : ""} · budget ${r.meta.daily_cap} a day</p>` : "";
  const recentHtml = rows.length ? `<section class="recent"><h2>What the class asked</h2><ul>${rows.map((x) => `<li><a href="/tutor?q=${encodeURIComponent(x.question)}">${esc(x.question)}</a> <span class="o">${x.outcome === "answered" ? "answered" : x.outcome === "declined" ? "not in the notes" : "no passage matched"}</span></li>`).join("")}</ul></section>` : "";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ask the tutor</title>
${FONTS_HTML}
<style>
${PAGE_CSS}
${SHARED_CSS}
  main { max-width: 46rem; }
  form.ask { margin: 1rem 0; }
  form.ask textarea { width:100%; min-height:4.5rem; font-family:"IBM Plex Sans",system-ui,sans-serif; font-size:1rem; padding:.5rem .6rem; border:1px solid var(--rule); border-radius:4px; background:#fff; color:var(--ink); }
  form.ask button { margin-top:.5rem; font-family:"IBM Plex Mono",monospace; font-size:.9rem; padding:.45rem .9rem; border:1px solid var(--entry); border-radius:4px; background:var(--entry); color:#fff; cursor:pointer; }
  .answer { background:rgba(255,255,255,.6); border:1px solid var(--rule); border-radius:6px; padding:1rem 1.1rem; margin:1rem 0; }
  .answer .q { font-family:"Libre Caslon Text",serif; font-size:1.1rem; margin-bottom:.6rem; }
  .answer p { margin:.5rem 0; }
  .answer .cites { font-family:"IBM Plex Mono",monospace; font-size:.75rem; }
  .cite { color:var(--entry); text-decoration:none; } a.cite:hover { text-decoration:underline; }
  .cite.bad { color:var(--stamp); text-decoration:line-through; cursor:help; }
  .answer .check { border-top:1px solid var(--rule); padding-top:.6rem; margin-top:.8rem; font-size:.92rem; }
  .answer .reason, .answer.rejected .reason, .answer.capped .reason, .answer.error .reason { color:var(--stamp); }
  .answer.declined .reason, .answer.off_corpus .reason { color:var(--ink); }
  .flag { color:var(--stamp); font-size:.9rem; }
  .passages h2, .recent h2 { font-family:"Libre Caslon Text",serif; font-size:1.2rem; margin:1.6rem 0 .3rem; }
  .passages article { border-top:1px solid var(--rule); padding:.7rem 0; }
  .passages h3 { font-size:.9rem; font-weight:600; margin-bottom:.3rem; }
  .pid { font-family:"IBM Plex Mono",monospace; color:var(--entry); } .plabel { font-family:"IBM Plex Mono",monospace; color:var(--faint); font-size:.75rem; margin-right:.3rem; }
  .passages pre { white-space:pre-wrap; font-family:"IBM Plex Sans",system-ui,sans-serif; font-size:.9rem; color:var(--ink); line-height:1.5; }
  .recent ul { padding-left:1.2rem; font-size:.9rem; } .recent .o { color:var(--faint); font-size:.8rem; margin-left:.4rem; }
  .how { background:rgba(255,255,255,.5); border:1px solid var(--rule); border-radius:6px; padding:.8rem 1rem; font-size:.88rem; margin:1rem 0; }
  .how ul { padding-left:1.2rem; margin:.3rem 0; }
</style></head>
<body><main>
  <p class="back"><a href="/">&larr; the twelve-week ledger</a></p>
  <p class="eyebrow">Phase 4 · week 10 · ask the tutor</p>
  <h1>Ask the tutor</h1>
  <p class="lede">A tutor that has read the course's notes — the lesson plans and the kit, ${notes.passages} passages${notes.seeded_at ? ` indexed ${esc(notes.seeded_at.slice(0, 10))}` : ""} — and nothing else. It answers from the passages it finds, cites them on every paragraph, and is checked: a number from nowhere or a tip gets flagged or withheld. Your job is to check the citations.</p>
  <form class="ask" method="post" action="/tutor">
    <label for="question" class="eyebrow">Your question</label>
    <textarea id="question" name="question" maxlength="${QUESTION_MAX}" placeholder="e.g. How is the stop calculated, and when does it move?" required>${esc(q)}</textarea>
    <button type="submit">Ask</button>
  </form>
  ${answerHtml}
  ${metaHtml}
  ${passagesHtml}
  <div class="how">
    <strong>How to ask well</strong> (lesson 10):
    <ul>
      <li><strong>Use the course's words.</strong> "the stop", "instrument risk", "the 12% target", "the defensive screen", "the drawdown", "the journal" — retrieval matches words, not meanings.</li>
      <li><strong>One thing at a time.</strong> "What is the stop gap and when does the stop move?" beats "explain everything about stops and sizing".</li>
      <li><strong>Check every citation.</strong> Click a tag; find the sentence; find the number. A confident answer with no passage behind it is wrong, however fluent.</li>
      <li><strong>Don't ask what to buy.</strong> The tutor won't say, by rule; it will tell you how the course decides, and that the decision is yours.</li>
    </ul>
  </div>
  ${recentHtml}
  <p class="caption"><a href="/api/tutor/recent">the class's questions (JSON)</a> · <a href="/signals">the signals</a> · <a href="/watchlist">the watchlist</a> · <a href="/card">the cards</a></p>
  <footer><p class="notice">${esc(NOTE)}</p></footer>
</main></body></html>`;
}
