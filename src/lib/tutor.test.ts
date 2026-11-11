/**
 * Week 10: the tutor's pure parts against the REAL corpus — the chunker reads
 * the lesson plans and the kit from the repository, so the gold set below is
 * run on what students will be served (the word-match fallback here; the
 * FTS5 path is exercised on the local Worker and recorded in BUILD-LOG).
 */
import { describe, it, expect } from "vitest";
import { loadCorpus, chunkMarkdown, plain, CORPUS, MAX_WORDS, MIN_WORDS } from "../../scripts/notes-chunker.mjs";
import {
  termsOf, ftsQuery, stemOf, rankByTerms, passagesAsText, validateAnswer, checkAnswer, resolveLabels,
  TUTOR_SYSTEM_PROMPT, ANSWER_SCHEMA, QUESTION_MAX, PASSAGES_PER_ANSWER, type Passage,
} from "./tutor";

const corpus: Passage[] = loadCorpus(process.cwd());

describe("the corpus (scripts/notes-chunker.mjs)", () => {
  it("every file in CORPUS yields passages; ids are unique and positional; no passage is over the size or under the floor (except a file's last)", () => {
    expect(CORPUS.length).toBe(16);
    expect(corpus.length).toBeGreaterThan(120);
    const ids = new Set(corpus.map((p) => p.id));
    expect(ids.size).toBe(corpus.length);
    for (const [file, prefix] of CORPUS) {
      const mine = corpus.filter((p) => p.source === file);
      expect(mine.length, file).toBeGreaterThan(2);
      mine.forEach((p, i) => expect(p.id).toBe(`${prefix}.${i + 1}`));
    }
    for (const p of corpus) expect(p.words, p.id).toBeLessThanOrEqual(MAX_WORDS + 60);   // one list item or paragraph may overrun
    const short = corpus.filter((p) => p.words! < MIN_WORDS);
    expect(short.length).toBeLessThan(8);                                                      // a closing line here and there
  });
  it("the H1 is the title, a running-order step is a heading without its timing, markdown marks are dropped, tables flatten", () => {
    const md = "# Lesson 8 — How Much to Bet\n\nIntro para with **bold** and a [link](https://x).\n\n## By the end\n\n1. one\n2. two\n\n**0:40 — The stop (10 min).** The Starter System has one closing rule.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n";
    const ps = chunkMarkdown(md, "T", "t.md");
    expect(ps.every((p) => p.title === "Lesson 8 — How Much to Bet")).toBe(true);
    expect(ps.map((p) => p.heading)).toEqual(["Overview", "By the end", "0:40 — The stop"]);
    expect(ps[0].body).toBe("Intro para with bold and a link.");
    expect(ps[2].body).toContain("The Starter System has one closing rule.");
    expect(ps[2].body).toContain("1 — 2");
    expect(plain("**x** *y* `z` [q](u) &mdash;")).toBe("x y `z` q —");
  });
});

describe("termsOf / ftsQuery / stemOf", () => {
  it("drops stop words and short words, keeps the course's nouns, tickers and numbers, lower-cases, de-duplicates, caps at twelve", () => {
    expect(termsOf("How is the stop calculated, and when does it move?")).toEqual(["stop", "calculated", "move"]);
    expect(termsOf("Why is the risk target 12%?")).toEqual(["risk", "target", "12%"]);
    expect(termsOf("Is KO long tonight? what about ko")).toEqual(["ko", "long", "tonight"]);
    expect(termsOf("the the the")).toEqual([]);
    expect(termsOf("one two three four five six seven eight nine ten eleven twelve thirteen fourteen").length).toBe(12);
    expect(termsOf("student's journal — what's in it?")).toEqual(["student", "journal"]);
  });
  it("the FTS expression quotes each term and ORs them; stems keep the first max(4, n−2) letters", () => {
    expect(ftsQuery(["stop", "calculated", "12%"])).toBe('"stop" OR "calculated" OR "12%"');
    expect(ftsQuery(['a"b'])).toBe('"ab"');
    expect(stemOf("calculated")).toBe("calculat");
    expect(stemOf("stops")).toBe("stop");
    expect(stemOf("stop")).toBe("stop");
    expect(stemOf("12")).toBe("12");
    // the fallback's stem agrees with the index's porter where the course's words are concerned (review N1)
    expect(stemOf("refusals")).toBe("refus");
    expect(stemOf("refuse")).toBe("refus");
    expect(stemOf("sizing")).toBe("siz");
    expect(stemOf("size")).toBe("siz");
    expect(stemOf("companies")).toBe("compan");
    expect(stemOf("prices")).toBe("pric");
    expect(stemOf("drawdown")).toBe("drawdown");
    expect(stemOf("p/e")).toBe("p/e");
    expect(rankByTerms(corpus, ["refusals"]).map((p) => p.heading)).toEqual(expect.arrayContaining([expect.stringMatching(/What the ticket will refuse/)]));
    // two-letter words are never terms (M1)
    expect(termsOf("is it ok")).toEqual([]);
    expect(termsOf("do it")).toEqual([]);
  });
});

describe("rankByTerms — the word-match fallback over the real corpus (the gold set, retrieval half)", () => {
  const top = (q: string) => rankByTerms(corpus, termsOf(q));
  const hit = (ps: Passage[], source: RegExp, heading: RegExp) => ps.some((p) => source.test(p.source) && heading.test(p.heading));
  // the gold set's own words; the section the gold set names (not any passage of the file — review F6); whether it must be FIRST
  const GOLD: [string, RegExp, RegExp, boolean][] = [
    ["How is the stop calculated, and when does it move?", /week-08|rules-card/, /^0:40 — The stop|closing rule/i, true],
    ["What is instrument risk?", /week-07|rules-card/, /^1:00 — Instrument risk|risk target|opening rule/i, true],
    ["Why is the risk target 12%?", /week-08|rules-card/, /^0:10 — Why 12%|risk target/i, true],
    ["What does the defensive screen test?", /week-05\.md/, /^0:20 — Walk the card/i, true],
    ["What is a drawdown, and what do the rules do about it?", /week-09|rules-card/, /^0:25 — Drawdowns are normal|risk target/i, true],
    ["What goes in the decision journal?", /decision-journal|week-01/, /Before the decision|^0:55 — The decision journal/i, true],
    ["How many shares does the calculator say I can hold?", /week-08|rules-card/, /^0:25 — The arithmetic|Position sizing/i, false],
    ["What will the ticket refuse?", /rules-card|week-09/, /What the ticket will refuse|Two new refusals/i, true],
    ["Where do prices come from, and what does data cost?", /week-02/, /What a quote actually is|Why is our data delayed|The ration book/i, true],
    ["What did Graham mean by Mr. Market and the margin of safety?", /week-04|week-05\.md/, /^0:40 — Mr\. Market|margin of safety|Walk the card/i, true],
  ];
  it.each(GOLD)("%s", (q, source, heading, first) => {
    const ps = top(q);
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.length).toBeLessThanOrEqual(PASSAGES_PER_ANSWER);
    const where = ps.map((p) => `${p.id} ${p.heading}`).join(" | ");
    expect(hit(ps, source, heading), where).toBe(true);
    if (first) expect(source.test(ps[0].source) && heading.test(ps[0].heading), `first: ${where}`).toBe(true);
  });
  it("the course's own notation can be asked about (review F7): 'What is P/E?' retrieves the P/E passages", () => {
    expect(termsOf("What is P/E?")).toEqual(["p/e"]);
    expect(termsOf("Is it cheap? What is P/B?")).toEqual(["cheap", "p/b"]);
    const ps = top("What is P/E?");
    expect(ps.length).toBeGreaterThan(2);
    expect(ps.some((p) => /P\/E/.test(p.heading) || /P\/E/.test(p.body))).toBe(true);
  });
  it("the corpus serves the student's notes only: no 'Tutor notes', 'Materials' or 'Exit check' passage (review N3)", () => {
    expect(corpus.some((p) => /^(Tutor notes|Materials|Exit check)/i.test(p.heading))).toBe(false);
    expect(corpus.some((p) => /wrangler d1 execute|npx wrangler/.test(p.body))).toBe(false);    // lesson 9's running order names `npm run enrol` once, as the lesson does
    expect(corpus.some((p) => p.body.includes("**"))).toBe(false);    // nested bold/italic marks dropped (review H8)
  });
  it("a question with no word in the notes retrieves nothing; a heading match outranks a body match", () => {
    expect(top("zxqv wq")).toEqual([]);
    expect(top("")).toEqual([]);
    const notes: Passage[] = [
      { id: "A.1", source: "a", title: "A", heading: "The stop", body: "nothing here" },
      { id: "A.2", source: "a", title: "A", heading: "Other", body: "the stop the stop the stop" },
    ];
    const r = rankByTerms(notes, ["stop"]);
    expect(r.map((p) => p.id)).toEqual(["A.1", "A.2"]);
    expect(r[0].rank).toBe(3);
    expect(r[1].rank).toBeCloseTo(1.2, 5);
    // the file's title counts too (2): "Where prices come from" finds lesson 2 by its name
    const titled = rankByTerms([{ id: "B.1", source: "b", title: "Lesson 2 — Where prices come from", heading: "Overview", body: "x" }], ["prices"]);
    expect(titled[0].rank).toBe(2);
  });
});

describe("the prompt and the answer's shape", () => {
  it("the system prompt binds the model: passages only, labels per paragraph, never recommend, the tip refusal, the check", () => {
    for (const rule of ["Use only the passages", "lists the passage labels", "Never recommend", "do not answer that", "education, not advice", "\"check\""]) expect(TUTOR_SYSTEM_PROMPT).toContain(rule);
    expect(ANSWER_SCHEMA.required).toEqual(["answered", "paragraphs", "reason", "check"]);
  });
  it("passagesAsText numbers the passages P1… with the lesson title and heading", () => {
    const t = passagesAsText("  Why 12%?  ", [{ id: "L8.5", source: "s", title: "Lesson 8 — How Much to Bet", heading: "0:10 — Why 12%? Risk targeting (1)", body: "Body." }]);
    expect(t).toBe("QUESTION: Why 12%?\n\nPASSAGES:\n\n[P1] Lesson 8 — How Much to Bet › 0:10 — Why 12%? Risk targeting (1)\nBody.");
  });
  it("validateAnswer accepts the two shapes and refuses the rest", () => {
    expect(validateAnswer({ answered: true, paragraphs: [{ text: "x", passages: ["p1", " P2 "] }], reason: null, check: "c" })).toEqual({ answered: true, paragraphs: [{ text: "x", passages: ["P1", "P2"] }], reason: null, check: "c" });
    expect(validateAnswer({ answered: false, paragraphs: [], reason: "not covered", check: null })).toEqual({ answered: false, paragraphs: [], reason: "not covered", check: null });
    expect(validateAnswer({ answered: false, paragraphs: [], reason: "", check: null })).toBeNull();      // a decline needs its sentence
    expect(validateAnswer({ answered: true, paragraphs: [], reason: null, check: null })).toBeNull();     // an answer needs a paragraph
    expect(validateAnswer({ answered: false, paragraphs: [{ text: "x", passages: [] }], reason: "r", check: null })).toBeNull();
    expect(validateAnswer({ answered: true, paragraphs: [{ text: "", passages: [] }], reason: null, check: null })).toBeNull();
    expect(validateAnswer({ answered: "yes", paragraphs: [] })).toBeNull();
    expect(validateAnswer(null)).toBeNull();
    expect(validateAnswer({ answered: true, paragraphs: Array(5).fill({ text: "x", passages: [] }), reason: null, check: null })).toBeNull();
    expect(validateAnswer({ answered: true, paragraphs: [{ text: "x".repeat(1200), passages: ["P1"] }], reason: null, check: null })).not.toBeNull();   // the cap is 1,200 characters (M11)
    expect(validateAnswer({ answered: true, paragraphs: [{ text: "x".repeat(1201), passages: ["P1"] }], reason: null, check: null })).toBeNull();
  });
  it("checkAnswer: an invented label, a number from nowhere, advice — each flagged; resolveLabels maps P-labels to ids", () => {
    const passages: Passage[] = [
      { id: "L8.9", source: "s", title: "L8", heading: "The stop", body: "The stop gap is ½ × instrument risk × the entry price: on an entry of $348.91 at 18.18% that is $31.72." },
      { id: "K-RULES.6", source: "k", title: "Kit", heading: "The closing rule", body: "The stop trails the highest close since entry and only ever moves up." },
    ];
    const clean = checkAnswer({ answered: true, paragraphs: [{ text: "The gap is half the instrument risk times the entry: $31.72 on an entry of $348.91. It trails the highest close and only moves up.", passages: ["P1", "P2"] }], reason: null, check: "Find the $31.72 in P1." }, passages);
    expect(clean.clean).toBe(true);
    const bad = checkAnswer({ answered: true, paragraphs: [{ text: "The gap is $40.00 on an entry of $348.91.", passages: ["P1", "P7"] }, { text: "You should buy before it moves.", passages: ["P2"] }], reason: null, check: null }, passages);
    expect(bad.unknownPassages).toEqual([{ paragraph: 1, labels: ["P7"] }]);
    expect(bad.unsupportedNumbers).toEqual([{ paragraph: 1, numbers: ["40"] }]);
    expect(bad.recommendationLanguage.length).toBeGreaterThan(0);
    expect(bad.clean).toBe(false);
    expect(resolveLabels(["P1", "P2", "P9", "x"], passages)).toEqual(["L8.9", "K-RULES.6", "P9", "x"]);
    // a tip in the check line is caught too
    expect(checkAnswer({ answered: true, paragraphs: [{ text: "Fine.", passages: ["P1"] }], reason: null, check: "Buy the dip before Monday." }, passages).recommendationLanguage.length).toBeGreaterThan(0);
    // a number from nowhere in a decline's reason or in the check line is flagged, with where (review F2)
    const dec = checkAnswer({ answered: false, paragraphs: [], reason: "The notes do not cover capital gains tax, which is charged at 33% on gains over €1,270.", check: null }, passages);
    expect(dec.unsupportedNumbers).toEqual([{ paragraph: 0, where: "reason", numbers: ["33", "1270"] }]);
    expect(dec.clean).toBe(false);
    const chk = checkAnswer({ answered: true, paragraphs: [{ text: "The gap is $31.72.", passages: ["P1"] }], reason: null, check: "Check that the gap is $45.10 in P1." }, passages);
    expect(chk.unsupportedNumbers).toEqual([{ paragraph: 0, where: "check", numbers: ["45.1"] }]);
    // a paragraph that cites nothing is flagged (review F3)
    const none = checkAnswer({ answered: true, paragraphs: [{ text: "The stop only ever moves up.", passages: [] }], reason: null, check: null }, passages);
    expect(none.uncited).toEqual([1]);
    expect(none.clean).toBe(false);
    // "P01" and a real id are not labels (review N5); duplicates are dropped at validation (review H7)
    expect(resolveLabels(["P01", "L8.9"], passages)).toEqual(["P01", "L8.9"]);
    expect(checkAnswer({ answered: true, paragraphs: [{ text: "Fine.", passages: ["P01"] }], reason: null, check: null }, passages).unknownPassages).toEqual([{ paragraph: 1, labels: ["P01"] }]);
    expect(validateAnswer({ answered: true, paragraphs: [{ text: "x", passages: ["P1", "p1", "P1"] }], reason: "", check: "" })).toEqual({ answered: true, paragraphs: [{ text: "x", passages: ["P1"] }], reason: null, check: null });
  });
  it("VC-22's two false flags, pinned (OI-81, OI-82): a range in the passage supports both ends; the sizing arithmetic's 'worth $' is not a tip", () => {
    const passages: Passage[] = [
      { id: "L9.8", source: "s", title: "L9", heading: "Drawdowns are normal", body: "A 12% target makes a 20–30% drawdown ordinary; one run in twenty reaches 40%. The rules do nothing about it: the stop closes a position, not the account." },
      { id: "L8.6", source: "s", title: "L8", heading: "The arithmetic, in full", body: "$10,000 × 12 ÷ 18.18 = $6,600.66 for Apple. Whole shares: $6,600.66 ÷ $348.91 = 18.9 → 18 shares, $6,280.38 — 62.8% of the account, carrying 11.42% a year." },
    ];
    // gold question 5, as the live page saw it: "20 to 30%" against the passage's "20–30%" — clean, not a flag on the 30
    const q5 = checkAnswer({ answered: true, paragraphs: [{ text: "A drawdown of 20 to 30% is ordinary at a 12% target, and one run in twenty reaches 40%. The rules do nothing: the stop closes a position, not the account.", passages: ["P1"] }], reason: null, check: "Find the 20–30% and the 40% in P1; the 30 is the top of the range." }, passages);
    expect(q5.unsupportedNumbers).toEqual([]);
    expect(q5.clean).toBe(true);
    // gold question 7, in the lesson's own words: a lot of shares, an account or a position "worth $…" is arithmetic, not a valuation
    const q7 = checkAnswer({ answered: true, paragraphs: [{ text: "An account worth $10,000.00 at 18.18% instrument risk supports $6,600.66 of Apple: 18 shares worth $6,280.38 at $348.91. The 18 shares are worth 62.8% of the account and carry 11.42% a year; the position is worth $6,280.38.", passages: ["P2"] }], reason: null, check: "Check the $6,600.66 and the 18 in P2." }, passages);
    expect(q7.recommendationLanguage).toEqual([]);
    expect(q7.unsupportedNumbers).toEqual([]);
    expect(q7.clean).toBe(true);
    // a verdict on the share still trips, in the same words
    expect(checkAnswer({ answered: true, paragraphs: [{ text: "Apple's shares are worth $400.", passages: ["P2"] }], reason: null, check: null }, passages).recommendationLanguage).toEqual(["are worth $4"]);
  });
  it("the schema asks for plain strings, empty when there is nothing to say (review N9)", () => {
    expect(ANSWER_SCHEMA.properties.reason).toEqual({ type: "string" });
    expect(ANSWER_SCHEMA.properties.check).toEqual({ type: "string" });
    expect(TUTOR_SYSTEM_PROMPT).toContain('"reason":"","check":"…"');
    expect(validateAnswer({ answered: false, paragraphs: [], reason: "not covered", check: "" })).toEqual({ answered: false, paragraphs: [], reason: "not covered", check: null });
  });
  it("QUESTION_MAX is 300", () => { expect(QUESTION_MAX).toBe(300); });
});
