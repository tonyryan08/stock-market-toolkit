/**
 * Week 10: the course notes as a corpus — the chunker.
 *
 * The tutor answers only from passages of the course's own notes: the ten
 * lesson plans, the two week-5 segments and the four kit documents. This
 * module turns a markdown file into passages a student can be shown and a
 * model can cite — one per section or running-order step, split at paragraph
 * boundaries when a section runs long, each with a stable id ("L8.3": lesson
 * 8, third passage; "K-RULES.2": the rules card, second). The seed script
 * (seed-notes.mjs) writes them to D1; the tests read them straight from the
 * files; nothing in the Worker reads markdown at runtime.
 *
 * Plain JavaScript on purpose: the seed script and vitest both import it.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The corpus: file → the id prefix its passages carry. Order is the order on the /tutor page. */
export const CORPUS = [
  ["docs/lessons/week-01.md", "L1"],
  ["docs/lessons/week-02.md", "L2"],
  ["docs/lessons/week-03.md", "L3"],
  ["docs/lessons/week-04.md", "L4"],
  ["docs/lessons/week-05.md", "L5"],
  ["docs/lessons/week-05-reading-the-screen.md", "L5R"],
  ["docs/lessons/the-enterprising-screen.md", "L5E"],
  ["docs/lessons/week-06.md", "L6"],
  ["docs/lessons/week-07.md", "L7"],
  ["docs/lessons/week-08.md", "L8"],
  ["docs/lessons/week-09.md", "L9"],
  ["docs/lessons/week-10.md", "L10"],
  ["kit/starter-system-rules-card.md", "K-RULES"],
  ["kit/student-quickstart.md", "K-START"],
  ["kit/decision-journal.md", "K-JOURNAL"],
  ["kit/reading-list.md", "K-READING"],
];

/** A passage longer than this (in words) is split at the next paragraph break. */
export const MAX_WORDS = 230;
/** A passage shorter than this is merged into the one that follows (a heading with one line under it). */
export const MIN_WORDS = 25;
/**
 * Sections written for the tutor, not the student — pre-check commands, the enrolment list, the scripted answers,
 * the VC recipes — are left out of the corpus (review N3): a student asking the tutor gets the course's notes, not
 * its admin notes. The files are public either way; this is about what the bot serves.
 */
export const TUTOR_ONLY = /^(?:Tutor notes|Materials|Exit check)\b/i;

const words = (s) => (s.match(/\S+/g) ?? []).length;

/** Markdown → plain text a reader (or a model) sees: bold/italic markers and links dropped, code names kept, tables flattened. */
export function plain(md) {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")                      // images
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")                 // links → text
    .replace(/\*\*(.+?)\*\*/g, "$1")                            // bold (the lazy match crosses an inner italic — review H8)
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, "$1$2")          // italic
    .replace(/^\s*\|?\s*-{3,}[\s|:-]*$/gm, "")                 // table rules
    .replace(/^\s*\|(.*)\|\s*$/gm, (_, r) => r.split("|").map((c) => c.trim()).filter(Boolean).join(" — "))   // table rows
    .replace(/^#{1,6}\s+/gm, "")                                // heading marks
    .replace(/&mdash;/g, "—").replace(/&middot;/g, "·").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The file → passages. A passage begins at an H2 ("## …"), at a running-order
 * step ("**0:25 — Drawdowns are normal (15 min).**") or at an H3, and ends at
 * the next one; a long passage is split at paragraph breaks; a short one is
 * merged forward. The H1 is the title of every passage from the file; the
 * front matter before the first H2 is a passage of its own ("Overview").
 */
export function chunkMarkdown(md, prefix, source) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let title = source;
  const sections = [];          // { heading, lines[] }
  let cur = { heading: "Overview", lines: [] };
  for (const line of lines) {
    const h1 = line.match(/^#\s+(.*)$/);
    if (h1 && sections.length === 0 && cur.lines.every((l) => !l.trim())) { title = h1[1].trim(); continue; }
    const h2 = line.match(/^##{1,2}\s+(.*)$/);
    const step = line.match(/^\*\*(\d{1,2}:\d{2}\s*[—–-]\s*[^*]+?)\*\*\s*(.*)$/);
    if (h2 || step) {
      sections.push(cur);
      const heading = h2 ? h2[1].trim() : step[1].replace(/\s*\(\d+\s*min\)\.?\s*$/i, "").replace(/\.$/, "").trim();
      cur = { heading, lines: step && step[2] ? [step[2]] : [] };
      continue;
    }
    if (/^---\s*$/.test(line)) continue;                        // horizontal rules
    cur.lines.push(line);
  }
  sections.push(cur);

  // units within a section (a paragraph, or one list item), packed to size
  const passages = [];
  for (const s of sections) {
    if (TUTOR_ONLY.test(s.heading)) continue;
    const text = plain(s.lines.join("\n"));
    if (!text) continue;
    const units = [];
    for (const para of text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
      let u = [];
      for (const line of para.split("\n")) {
        if (/^\s*(?:[-*•]|\d{1,2}[.)])\s/.test(line) && u.length) { units.push(u.join("\n")); u = []; }
        u.push(line);
      }
      if (u.length) units.push(u.join("\n"));
    }
    let buf = [];
    let n = 0;
    const flush = () => { if (buf.length) { passages.push({ heading: plain(s.heading), body: buf.join("\n") }); buf = []; n = 0; } };
    for (const u of units) {
      const w = words(u);
      if (n && n + w > MAX_WORDS) flush();
      buf.push(u); n += w;
      if (n >= MAX_WORDS) flush();
    }
    flush();
  }
  // merge a short passage into the next of the same heading (or the previous one, at a section's end)
  const merged = [];
  for (let i = 0; i < passages.length; i++) {
    const p = passages[i];
    if (words(p.body) < MIN_WORDS && i + 1 < passages.length && passages[i + 1].heading === p.heading) {
      passages[i + 1] = { heading: p.heading, body: p.body + "\n\n" + passages[i + 1].body };
      continue;
    }
    if (words(p.body) < MIN_WORDS && merged.length && merged[merged.length - 1].heading === p.heading) {
      merged[merged.length - 1].body += "\n\n" + p.body;
      continue;
    }
    merged.push({ ...p });
  }
  // the same heading split in two gets " (1)", " (2)" so a citation names the part
  const byHeading = new Map();
  for (const p of merged) byHeading.set(p.heading, (byHeading.get(p.heading) ?? 0) + 1);
  const seen = new Map();
  return merged.map((p, i) => {
    const k = (seen.get(p.heading) ?? 0) + 1; seen.set(p.heading, k);
    const heading = byHeading.get(p.heading) > 1 ? `${p.heading} (${k})` : p.heading;
    return { id: `${prefix}.${i + 1}`, source, title, heading, body: p.body, words: words(p.body) };
  });
}

/** Every passage of the corpus, read from the repository root. */
export function loadCorpus(root = process.cwd()) {
  const out = [];
  for (const [file, prefix] of CORPUS) out.push(...chunkMarkdown(readFileSync(join(root, file), "utf8"), prefix, file));
  return out;
}

/** A SQL string literal (single quotes doubled). */
export const sqlLiteral = (s) => `'${String(s).replace(/'/g, "''")}'`;
