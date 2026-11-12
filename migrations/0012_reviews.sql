-- 0012_reviews.sql — Week 11: explain-my-portfolio, the process review (decision log #22).
--
-- One table. `reviews` is the receipt per reading: who asked (the student's
-- code — the review is per account, unlike the anonymous tutor), when, the
-- night the audit was taken as of, the PROMPT VERSION (so a changed prompt
-- is told apart from a changed model), the deterministic audit, the model's
-- reading and what the checks said. The per-student daily cap counts these
-- rows (insert-first, as the tutor's `questions` does: a `pending` row is
-- written before the model call and counted, then updated). Primary keys
-- only (0002's lesson). IF NOT EXISTS; the runner applies 0012 once.

CREATE TABLE IF NOT EXISTS reviews (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL,          -- students.code
  asked_at        TEXT NOT NULL,
  as_of           TEXT,                   -- the latest close the audit was read against
  prompt_version  TEXT NOT NULL,          -- src/lib/review.ts REVIEW_PROMPT_VERSION
  outcome         TEXT NOT NULL,          -- pending | answered | rejected (outcome or advice language — withheld)
                                          -- | capped (the student's or the class's daily budget) | error (the call failed or the reply was malformed)
  audit           TEXT,                   -- JSON: the deterministic audit (items, breaches, the facts the model read)
  reading         TEXT,                   -- JSON: {paragraphs:[{text, facts}], next_week}
  grounding       TEXT,                   -- JSON: {unknownFacts, uncited, unsupportedNumbers, recommendationLanguage, outcomeLanguage, clean}
  model           TEXT,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  ms              INTEGER
);
