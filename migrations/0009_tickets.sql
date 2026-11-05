-- 0009_tickets.sql — Week 8: how much to bet (decision log #18, #19).
--
-- Paper portfolios, the first half: who the students are, the tickets they
-- write, the positions those tickets open and close, and the stop the nightly
-- job trails. Week 9 adds cash, P&L and the risk report on the same tables.
-- Plus the splits table the small-cap adjuster was missing (OI-08/OI-52).
-- One store, simple operations: a ticket and its position change together in
-- one D1 batch. Primary keys only, no extra indexes (0002's lesson).

-- Per-student codes until Cloudflare Access arrives in week 12 (decision 18).
-- The tutor enrols with scripts/enrol.mjs; the code is the student's identity
-- on every ticket and on their page.
CREATE TABLE IF NOT EXISTS students (
  code        TEXT PRIMARY KEY,            -- XXXX-XXXX, no ambiguous characters
  name        TEXT NOT NULL,
  capital     REAL NOT NULL,               -- the paper account at enrolment, dollars (decision 19)
  created_at  TEXT NOT NULL
);

-- A ticket is a decision written down: open or close, how many, and WHY (the
-- journal entry the route refuses to accept blank). Accepted tickets only;
-- a rejected ticket is answered, not stored.
CREATE TABLE IF NOT EXISTS tickets (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL,             -- students.code
  symbol        TEXT NOT NULL,
  side          TEXT NOT NULL,             -- 'open' | 'close'
  units         INTEGER NOT NULL,
  fill_date     TEXT NOT NULL,             -- the close the ticket was filled at (the decision close)
  fill_price    REAL NOT NULL,             -- that adjusted close
  cost          REAL NOT NULL,             -- $2 + 0.25% of the value
  signal_state  TEXT,                      -- the rule's state on that close ('long' | 'flat' | 'warming')
  journal       TEXT NOT NULL,             -- the decision-journal entry, verbatim
  created_at    TEXT NOT NULL
);

-- One open position per student per instrument. Entry, high and stop are in
-- the ADJUSTED series; when the adjuster re-aligns a series (a dividend went
-- ex), the nightly tracker rescales them by the same factor and stamps
-- realign_date (decision 18: "entry adjusted close + realign date stored").
CREATE TABLE IF NOT EXISTS positions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  code            TEXT NOT NULL,
  symbol          TEXT NOT NULL,
  status          TEXT NOT NULL,           -- 'open' | 'closed'
  opened_on       TEXT NOT NULL,           -- the fill date of the opening ticket
  entry_price     REAL NOT NULL,           -- adjusted close at entry
  units           INTEGER NOT NULL,
  exposure        REAL NOT NULL,           -- units × entry_price
  stop_gap        REAL NOT NULL,           -- ½ × instrument risk × entry price, fixed at entry
  high_since      REAL NOT NULL,           -- highest adjusted close since entry (the tracker's)
  stop_level      REAL NOT NULL,           -- high_since − stop_gap
  stop_hit_on     TEXT,                    -- the first close at or below the stop, once seen
  instrument_risk REAL NOT NULL,           -- percent, at entry
  realign_date    TEXT,                    -- the series date the stored prices were last aligned to
  tracked_on      TEXT,                    -- the close the tracker last read
  closed_on       TEXT,
  exit_price      REAL,
  pnl             REAL,                    -- (exit − entry) × units − both tickets' costs
  open_ticket_id  INTEGER NOT NULL,
  close_ticket_id INTEGER
);

-- Stock splits the toolkit's adjuster applies to the small-cap tier's as-traded
-- series (the core tier arrives split-adjusted from its provider). A 2-for-1
-- split on date X divides every close BEFORE X by 2. First row: Mueller
-- Industries, found by the 31 Oct 2026 visit's av_jump line (OI-52).
CREATE TABLE IF NOT EXISTS splits (
  symbol  TEXT NOT NULL,
  date    TEXT NOT NULL,                   -- the first trading day at the new share count
  factor  REAL NOT NULL,                   -- new shares per old share (2 for a two-for-one)
  note    TEXT,
  PRIMARY KEY (symbol, date)
);
INSERT OR IGNORE INTO splits (symbol, date, factor, note) VALUES
  ('MLI', '2026-07-01', 2, 'two-for-one, announced 1 Jun 2026; the 31 Oct 2026 visit flagged ×0.467 on this date');
