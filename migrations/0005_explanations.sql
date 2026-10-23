-- 0005_explanations.sql — week 6: numbers into narrative (19 Oct 2026).
--
-- One cached narrative per company per fact-sheet fingerprint. The sheet's
-- hash changes when a price or an account changes, so a company costs at
-- most one Claude call per data-day. No secondary index: the primary key
-- serves the only query, and D1 meters every index on every insert (the
-- lesson of 2 Oct).
CREATE TABLE explanations (
  symbol        TEXT NOT NULL,
  facts_hash    TEXT NOT NULL,          -- fingerprint of the fact sheet it was written from
  source        TEXT NOT NULL,          -- claude | rejected (advice language: kept for the record, never served)
  model         TEXT,
  created_at    TEXT NOT NULL,          -- ISO timestamp
  narrative     TEXT NOT NULL,          -- JSON: { paragraphs, question }
  grounding     TEXT,                   -- JSON: the grounding checks' result
  input_tokens  INTEGER,
  output_tokens INTEGER,
  ms            INTEGER,
  PRIMARY KEY (symbol, facts_hash)
);
