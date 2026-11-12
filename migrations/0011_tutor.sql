-- 0011_tutor.sql — Week 10: the tutor bot on the course notes (decision log #3, #21).
--
-- Two tables. `notes` holds the course's own notes as passages — the ten
-- lesson plans, the two week-5 segments and the kit documents (week 11 added
-- its lesson and two kit pages: 194 passages), chunked
-- by scripts/notes-chunker.mjs and written by `npm run seed-notes` →
-- `wrangler d1 execute --file=scripts/seed-notes.sql` (the seed replaces the
-- rows and rebuilds the full-text index `notes_fts`, an FTS5 virtual table it
-- creates itself — the FTS5 spike decision #3 asked for is that seed step;
-- the plain variant of the file carries no index and the tutor's retrieval
-- falls back to a word match). `questions` is the tutor's receipt per
-- question: what was asked, which passages were retrieved and how, what the
-- model answered and what the checks said — anonymous (no student code; the
-- page never asks for one). Primary keys only (0002's lesson). Both CREATE
-- TABLE lines are IF NOT EXISTS; the runner applies 0011 once per database.

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,       -- "L8.3": lesson 8, passage 3; "K-RULES.2": the rules card, passage 2
  source     TEXT NOT NULL,          -- the repository path of the file the passage came from
  title      TEXT NOT NULL,          -- the file's H1 ("Lesson 8 — How Much to Bet")
  heading    TEXT NOT NULL,          -- the section or running-order step the passage sits under
  body       TEXT NOT NULL,          -- the passage, as plain text (markdown marks dropped)
  words      INTEGER NOT NULL,
  seeded_at  TEXT NOT NULL           -- when the seed file was generated: the page shows it
);

CREATE TABLE IF NOT EXISTS questions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  asked_at       TEXT NOT NULL,
  question       TEXT NOT NULL,      -- as typed, trimmed, at most 300 characters
  outcome        TEXT NOT NULL,      -- answered | declined (the model: the passages do not answer it) | off_corpus (nothing retrieved)
                                     -- | rejected (advice-shaped language — the passages are shown, the answer is not)
                                     -- | capped (the day's budget spent) | error (the call failed)
  retrieval      TEXT NOT NULL,      -- fts | like | none
  passages       TEXT NOT NULL,      -- JSON: the retrieved passages' ids, in rank order
  answer         TEXT,               -- JSON: {answered, paragraphs:[{text, passages}], reason, check}
  grounding      TEXT,               -- JSON: {unknownPassages, unsupportedNumbers, recommendationLanguage, clean}
  model          TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  ms             INTEGER
);
