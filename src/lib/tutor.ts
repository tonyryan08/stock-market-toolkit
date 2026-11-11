/**
 * Week 10: the tutor bot — retrieval over the course notes, a bound answer.
 *
 * The shape is week 6's, turned on the notes instead of the accounts: the
 * question is matched to passages of the course's own lesson plans and kit
 * (the `notes` table, seeded from the repository — scripts/seed-notes.mjs);
 * the model is given those passages, numbered, and told in binding terms to
 * answer from them alone, to cite them on every paragraph and never to
 * recommend; then the answer is CHECKED — a passage label it invented, a
 * number that is in no passage it read, advice-shaped language — and the
 * flags are shown with the answer, or the answer is withheld (advice) and the
 * passages shown instead. The student's job this week is to check the
 * citations; the page makes that a click.
 *
 * Retrieval is SQLite full-text search (FTS5, decision #3) when the index
 * exists, and a plain word match over the same rows when it does not
 * (`rankByTerms`): the seed step is the spike, the fallback is this file.
 */

import { extractNumbersWithPrecision, sameValue, FREE_VALUES, findAdvice } from "./explain";

export type Passage = {
  id: string;            // "L8.9", "K-RULES.6"
  source: string;        // repository path
  title: string;         // the file's H1
  heading: string;       // the section or step
  body: string;
  words?: number;
  /** FTS5's bm25 (more negative = better) or the fallback's score (higher = better); informational. */
  rank?: number;
};

export const QUESTION_MIN = 3;
export const QUESTION_MAX = 300;
export const PASSAGES_PER_ANSWER = 6;
export const TUTOR_DAILY_CAP_DEFAULT = 60;

/** Words that carry no meaning for retrieval. The course's own nouns are deliberately NOT here (rule, stop, risk, size…). */
const STOPWORDS = new Set((
  "a an the and or but if then than so as of to in on at by for from with without about into over under between through " +
  "is are was were be been being am do does did done doing have has had having can could should would will shall may might must " +
  "i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those " +
  "what which who whom whose when where why how here there " +
  "not no nor only also just very really quite much many more most some any all each every either neither both few " +
  "mean means meant explain explains tell tells say says know knows understand please thanks thank " +
  "course toolkit page tutor bot question answer"
).split(/\s+/));

/**
 * The question → its searchable terms: words of three letters or more (a
 * ticker of two or more capitals; the course's own notation "P/E", "P/B",
 * "P/TBV" kept whole — review F7), lower-cased, stop words out,
 * de-duplicated, at most twelve.
 */
export function termsOf(question: string): string[] {
  const out: string[] = [];
  for (const raw of question.match(/[A-Za-z]\/[A-Za-z]{1,3}\b|[A-Za-z][A-Za-z'’.-]*|\d+(?:\.\d+)?%?/g) ?? []) {
    const w = raw.replace(/[’']s$/i, "").replace(/[’'.-]+$/g, "").replace(/^[’'.-]+/g, "");
    if (!w) continue;
    const isTicker = /^[A-Z]{1,5}$/.test(w) && w.length >= 2;
    const isRatio = /^[A-Za-z]\/[A-Za-z]{1,3}$/.test(w);
    const lower = w.toLowerCase();
    if (!isTicker && !isRatio && !/^\d/.test(w) && lower.length < 3) continue;
    if (STOPWORDS.has(lower)) continue;
    if (!out.includes(lower)) out.push(lower);
    if (out.length >= 12) break;
  }
  return out;
}

/** The FTS5 MATCH expression: each term quoted (punctuation-safe), joined by OR; bm25 ranks the passages with more of them higher. */
export function ftsQuery(terms: string[]): string {
  return terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ");
}

/** The suffixes the fallback's stem strips — a plural first, then one derivational ending, longest first: enough of Porter for the course's vocabulary (review N1). */
const PLURALS = ["ies", "es", "s"];
const SUFFIXES = ["ations", "ation", "ings", "ing", "ied", "ers", "er", "ed", "al", "ly"];
/**
 * A stem for the fallback, so "calculated" matches "calculation", "refusals"
 * matches "refuse", "sizing" matches "size", "companies" matches "company":
 * a plural stripped, then one suffix, each only when at least three letters
 * remain, then a trailing "e" dropped; a ratio ("p/e") and a number are
 * kept whole. The probe is a word-prefix match on the result. (The first
 * version kept the first max(4, n − 2) letters, which was asymmetric
 * against the index's porter stemmer — review N1.)
 */
export function stemOf(term: string): string {
  if (/^\d/.test(term) || term.includes("/")) return term;
  let w = term;
  for (const suf of PLURALS) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) { w = w.slice(0, -suf.length); break; }
  }
  for (const suf of SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 3) { w = w.slice(0, -suf.length); break; }
  }
  if (w.length > 3 && w.endsWith("e")) w = w.slice(0, -1);
  return w;
}

/**
 * The plain-word fallback: score = Σ over terms (3 × a match in the heading
 * + 2 × a match in the file's title + 1 × a match in the body, + a little
 * for repeats), highest first, ties by id — the same weights the FTS5 query
 * gives bm25. A passage with no term at all scores 0 and is never returned.
 */
export function rankByTerms(notes: Passage[], terms: string[], k = PASSAGES_PER_ANSWER): Passage[] {
  if (!terms.length) return [];
  const probes = terms.map((t) => new RegExp(`\\b${stemOf(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"));
  const scored = notes.map((p) => {
    let score = 0;
    for (const re of probes) {
      const inHeading = (p.heading.match(re) ?? []).length;
      const inTitle = (p.title.match(re) ?? []).length;
      const inBody = (p.body.match(re) ?? []).length;
      if (inHeading) score += 3;
      if (inTitle) score += 2;
      if (inBody) score += 1 + Math.min(0.5, 0.1 * (inBody - 1));
    }
    return { p, score };
  }).filter((x) => x.score > 0);
  scored.sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));
  return scored.slice(0, k).map((x) => ({ ...x.p, rank: Math.round(x.score * 100) / 100 }));
}

export const TUTOR_SYSTEM_PROMPT = `You are the tutor bot of a community course for adult beginners called "Intro to the Stock Market". You are given a student's QUESTION and a few numbered PASSAGES from the course's own notes (the lesson plans and the takeaway kit). Answer the question from the passages.

Rules, all binding:
1. Use only the passages. Add no fact, number, date, name, rule or example that is not in them. If the passages do not answer the question, set "answered" to false, write one sentence in "reason" saying what the notes do and do not cover for this question, and leave "paragraphs" empty.
2. Every paragraph lists the passage labels it rests on (P1, P2 …). Every number you write must appear in a passage you cite for that paragraph.
3. Never recommend. No buy, sell, hold, avoid, target, forecast, "undervalued", "overvalued", "bargain", "opportunity", and no prediction of price or earnings. If the question asks what to buy or sell, whether to buy or sell, or whether a company is a good investment, do not answer that: explain instead what the course's rules say about how such a decision is made, from the passages, and say that the decision is the student's.
4. Plain words, short sentences, British and Irish spelling. Address the student as "you". 50 to 160 words in 1 to 3 paragraphs. Gloss a term of art the first time if a passage glosses it.
5. The course grades decisions by process, not outcome, and its line is "education, not advice". Nothing you write may read as a tip.
6. Then "check": one thing the student should verify for themselves in the cited passages, at most 20 words — the lesson this week is checking the tutor's citations.

Output JSON only, exactly this shape:
{"answered":true,"paragraphs":[{"text":"…","passages":["P1","P3"]}],"reason":"","check":"…"}
or, when the passages do not answer it:
{"answered":false,"paragraphs":[],"reason":"…","check":""}`;

export const ANSWER_SCHEMA = {
  type: "object",
  properties: {
    answered: { type: "boolean" },
    paragraphs: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, passages: { type: "array", items: { type: "string" } } },
        required: ["text", "passages"],
        additionalProperties: false,
      },
    },
    // plain strings, empty when there is nothing to say: a nullable union is a shape the structured-output
    // endpoint has not been seen to accept (review N9), and an empty string costs nothing to read
    reason: { type: "string" },
    check: { type: "string" },
  },
  required: ["answered", "paragraphs", "reason", "check"],
  additionalProperties: false,
} as const;

/** The user message: the question, then the passages as "[P1] Lesson 8 — How Much to Bet › The stop" and the text. */
export function passagesAsText(question: string, passages: Passage[]): string {
  const lines = [`QUESTION: ${question.trim()}`, "", "PASSAGES:"];
  passages.forEach((p, i) => {
    lines.push("", `[P${i + 1}] ${p.title} › ${p.heading}`, p.body);
  });
  return lines.join("\n");
}

export type Answer = {
  answered: boolean;
  paragraphs: { text: string; passages: string[] }[];   // passage labels as the model wrote them: "P1"
  reason: string | null;
  check: string | null;
};

export function validateAnswer(raw: unknown): Answer | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { answered?: unknown; paragraphs?: unknown; reason?: unknown; check?: unknown };
  if (typeof o.answered !== "boolean") return null;
  if (!Array.isArray(o.paragraphs)) return null;
  const paragraphs: Answer["paragraphs"] = [];
  for (const p of o.paragraphs as unknown[]) {
    if (!p || typeof p !== "object") return null;
    const q = p as { text?: unknown; passages?: unknown };
    if (typeof q.text !== "string" || !q.text.trim() || q.text.length > 1200) return null;
    const passages = Array.isArray(q.passages) ? [...new Set(q.passages.filter((x): x is string => typeof x === "string").map((x) => x.trim().toUpperCase()))] : [];   // de-duplicated (review H7)
    paragraphs.push({ text: q.text.trim(), passages });
  }
  if (o.answered && (paragraphs.length < 1 || paragraphs.length > 4)) return null;
  if (!o.answered && paragraphs.length > 0) return null;
  // "" and null both mean "nothing to say" (the schema asks for strings — review N9)
  const reason = typeof o.reason === "string" && o.reason.trim() ? o.reason.trim().slice(0, 400) : null;
  const check = typeof o.check === "string" && o.check.trim() ? o.check.trim().slice(0, 240) : null;
  if (!o.answered && !reason) return null;
  return { answered: o.answered, paragraphs, reason, check };
}

export type AnswerCheck = {
  /** Labels the model cited that were not among the passages it was given, per paragraph. */
  unknownPassages: { paragraph: number; labels: string[] }[];
  /** Paragraphs that cite no passage at all — unverifiable by construction (review F3). */
  uncited: number[];
  /**
   * Numbers that appear in none of the passages the model read (free small counts excepted), per paragraph —
   * and in the decline's reason or the check line (`where`: "reason" / "check", paragraph 0 — review F2).
   */
  unsupportedNumbers: { paragraph: number; where?: "reason" | "check"; numbers: string[] }[];
  /** Advice-shaped language (the week-6 families), in the paragraphs, the check or the reason. */
  recommendationLanguage: string[];
  clean: boolean;
};

/** A label the model may use: "P1" … "P6" exactly — "P01" and a real id are not labels (review N5). */
export const LABEL = /^P[1-9]\d*$/;

/** Labels → the real passage ids ("P2" → "L8.9"); an unknown label is kept as it was written, so the page can mark it. */
export function resolveLabels(labels: string[], passages: Passage[]): string[] {
  return labels.map((l) => {
    const m = l.match(LABEL);
    const i = m ? parseInt(l.slice(1), 10) - 1 : -1;
    return i >= 0 && i < passages.length ? passages[i].id : l;
  });
}

export function checkAnswer(a: Answer, passages: Passage[]): AnswerCheck {
  const known = new Set(passages.map((_, i) => `P${i + 1}`));
  const unknownPassages: AnswerCheck["unknownPassages"] = [];
  const uncited: number[] = [];
  const unsupportedNumbers: AnswerCheck["unsupportedNumbers"] = [];
  const recommendationLanguage: string[] = [];
  // numbers are checked against every passage the model read (a label may be cited loosely; a number from nowhere is the
  // fault) — the bodies only: a running-order heading's "0:40" is a clock, not a figure
  const corpusValues = extractNumbersWithPrecision(passages.map((p) => p.body).join(" "));
  const strays = (text: string) => [...new Set(
    extractNumbersWithPrecision(text)
      .filter((v) => !FREE_VALUES.has(v.value))
      .filter((v) => !corpusValues.some((f) => sameValue(v, f)))
      .map((v) => String(v.value)),
  )];
  a.paragraphs.forEach((p, i) => {
    const unknown = p.passages.filter((l) => !known.has(l));
    if (unknown.length) unknownPassages.push({ paragraph: i + 1, labels: unknown });
    if (!p.passages.length) uncited.push(i + 1);
    const bad = strays(p.text);
    if (bad.length) unsupportedNumbers.push({ paragraph: i + 1, numbers: bad });
    recommendationLanguage.push(...findAdvice(p.text));
  });
  // the decline's reason is printed as the whole answer and the check line under it: both are checked for numbers and advice
  if (a.reason) {
    const bad = strays(a.reason);
    if (bad.length) unsupportedNumbers.push({ paragraph: 0, where: "reason", numbers: bad });
    recommendationLanguage.push(...findAdvice(a.reason));
  }
  if (a.check) {
    const bad = strays(a.check);
    if (bad.length) unsupportedNumbers.push({ paragraph: 0, where: "check", numbers: bad });
    recommendationLanguage.push(...findAdvice(a.check));
  }
  return {
    unknownPassages, uncited, unsupportedNumbers, recommendationLanguage,
    clean: !unknownPassages.length && !uncited.length && !unsupportedNumbers.length && !recommendationLanguage.length,
  };
}

/** The sentence the page prints when nothing in the notes matched the question. */
export const OFF_CORPUS = "The course notes don't have a passage that matches this question, so the tutor has nothing to answer from. Try the course's own words — the rule, the stop, the size, the screen, the drawdown, the journal — or ask in class.";
