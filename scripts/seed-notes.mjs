/**
 * Week 10: write the course notes to the tutor's corpus — `scripts/seed-notes.sql`.
 *
 *   npm run seed-notes
 *   npx wrangler d1 execute stock-market-db --local  --file=scripts/seed-notes.sql
 *   npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-notes.sql
 *
 * The file replaces the `notes` table's rows with the passages the chunker
 * makes of the lesson plans and the kit (scripts/notes-chunker.mjs), then
 * rebuilds the full-text index `notes_fts` from them (SQLite FTS5 — decision
 * #3; the index is created here, not in a migration, so the FTS5 spike is this
 * step: if the remote database refuses the virtual table, run
 * `scripts/seed-notes-plain.sql` instead — the same rows without the index —
 * and the tutor's retrieval falls back to a plain word match by itself).
 *
 * Re-run after any lesson or kit file changes: the ids are positional within
 * a file, so a passage's id can move when a file is edited — the receipts
 * carry the heading as well as the id for that reason.
 */

import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadCorpus, sqlLiteral, CORPUS } from "./notes-chunker.mjs";

const ROWS_PER_STATEMENT = 8;                 // each statement stays far under D1's 100 KB statement limit

/**
 * The two seed files from the passages and a timestamp — pure, so the suite can regenerate the committed files with
 * the header's own timestamp and compare them byte for byte (a stale seed fails the suite: v0.13.0 review F2).
 */
export function buildSeed(passages, seededAt) {
  const rows = [];
  for (let i = 0; i < passages.length; i += ROWS_PER_STATEMENT) {
    const vals = passages.slice(i, i + ROWS_PER_STATEMENT).map((p) =>
      `(${[p.id, p.source, p.title, p.heading, p.body, p.words, seededAt].map((v) => (typeof v === "number" ? v : sqlLiteral(v))).join(", ")})`,
    );
    rows.push(`INSERT INTO notes (id, source, title, heading, body, words, seeded_at) VALUES\n  ${vals.join(",\n  ")};`);
  }
  const header = `-- seed-notes.sql — the tutor's corpus: ${passages.length} passages from ${CORPUS.length} files, generated ${seededAt} by scripts/seed-notes.mjs. Do not edit; re-run \`npm run seed-notes\`.\n`;
  const plainRows = `${header}DELETE FROM notes;\n${rows.join("\n")}\n`;
  // the plain variant drops any index left from an earlier seed, so the tutor's retrieval falls back cleanly (and says so)
  const plain = `${plainRows}DROP TABLE IF EXISTS notes_fts;\n`;
  const fts = `${plainRows}
-- The full-text index (FTS5, decision #3): rebuilt from the rows above. Porter stemming so "calculated" finds "calculation"; the title and the heading are columns of their own so a match there outranks one in the body (bm25 weights 2, 3, 1 in the query).
DROP TABLE IF EXISTS notes_fts;
CREATE VIRTUAL TABLE notes_fts USING fts5(id UNINDEXED, title, heading, body, tokenize='porter unicode61');
INSERT INTO notes_fts (id, title, heading, body) SELECT id, title, heading, body FROM notes;
`;
  return { fts, plain, statements: rows.length + 4, plainStatements: rows.length + 2 };
}

/** The timestamp a seed file was generated with, from its header line. */
export function seededAtOf(seedText) {
  return (seedText.match(/generated (\S+) by scripts\/seed-notes\.mjs/) ?? [])[1] ?? null;
}

// Run as a script (`npm run seed-notes`, on any OS — the path compared as a file URL); imported by the suite for buildSeed.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const passages = loadCorpus();
  const seededAt = new Date().toISOString();
  const { fts, plain, statements } = buildSeed(passages, seededAt);
  writeFileSync(new URL("./seed-notes.sql", import.meta.url), fts);
  writeFileSync(new URL("./seed-notes-plain.sql", import.meta.url), plain);
  const bySource = new Map();
  for (const p of passages) bySource.set(p.source, (bySource.get(p.source) ?? 0) + 1);
  console.log(`scripts/seed-notes.sql: ${passages.length} passages, ${passages.reduce((a, p) => a + p.words, 0)} words, ${statements} statements (and seed-notes-plain.sql without the index)`);
  for (const [src, n] of bySource) console.log(`  ${String(n).padStart(3)}  ${src}`);
}
