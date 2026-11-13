-- v1.1 (decision 24): one saved plan per paper account — the planner's inputs and picks as the user left them.
-- The plan is the user's working sheet, not a ticket: nothing in it is a position until the ticket route accepts it.
CREATE TABLE IF NOT EXISTS plans (
  code      TEXT PRIMARY KEY REFERENCES students(code),
  body      TEXT NOT NULL,           -- JSON: { inputs: { capital, positions, eurUsd, spreadPct }, picks: [{ symbol, units, journal }] }
  as_of     TEXT,                    -- the signal date the plan was last built on
  saved_at  TEXT NOT NULL
);
