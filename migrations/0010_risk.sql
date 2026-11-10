-- 0010_risk.sql — Week 9: running your paper portfolio (decision log #18, #20).
--
-- The second half of the paper portfolios: the account marked to market, the
-- number of instruments a student runs (the risk budget is split equally
-- between them — Carver's equal instrument weights with the diversification
-- multiplier at 1), the nightly risk report, and the small-cap quarantine the
-- week-7 register promised (OI-08: an unexplained jump keeps a small cap out
-- of tickets until a splits row explains it). CREATE TABLE is IF NOT EXISTS;
-- the two ALTER TABLE … ADD COLUMN lines are NOT re-runnable by hand (a second
-- run answers "duplicate column name") — the migration runner applies 0010
-- once per database, which is the only way it should run. Primary keys only
-- (0002's lesson).

-- How many instruments the student has chosen to run: each open position is
-- sized at (risk target ÷ instruments), so the account's risk stays at the
-- target whatever the number (decision 20). The tutor sets it with
-- `npm run enrol -- --set-instruments CODE N`; 1 is the Starter System.
ALTER TABLE students ADD COLUMN instruments INTEGER NOT NULL DEFAULT 1;

-- The nightly risk report, one row per student per close (the PraxiRisk-
-- derived layer, decision 20): the account marked to the latest closes, the
-- high-water mark and drawdown, the risk the open positions carry against
-- the target, the nearest stop, and the flags the page turns into sentences.
CREATE TABLE IF NOT EXISTS risk_reports (
  code            TEXT NOT NULL,           -- students.code
  date            TEXT NOT NULL,           -- the latest close the report is marked to
  account_value   REAL NOT NULL,           -- cash + Σ units × latest adjusted close
  cash            REAL NOT NULL,
  market_value    REAL NOT NULL,           -- Σ units × latest close of the open positions
  open_pnl        REAL NOT NULL,           -- Σ (latest close − entry) × units
  realised_pnl    REAL NOT NULL,           -- Σ pnl of closed positions
  hwm             REAL NOT NULL,           -- high-water mark of account_value, from enrolment
  drawdown_pct    REAL NOT NULL,           -- (hwm − account_value) ÷ hwm × 100
  risk_used_pct   REAL NOT NULL,           -- Σ (units × close ÷ account_value × instrument risk), percent a year
  risk_target_pct REAL NOT NULL,           -- the account's target (12)
  instruments     INTEGER NOT NULL,        -- students.instruments that night
  open_positions  INTEGER NOT NULL,
  nearest_stop_pct REAL,                   -- the smallest distance to a stop among open positions, percent of the close
  stop_hits       INTEGER NOT NULL,        -- open positions with a stop stamped
  flags           TEXT NOT NULL,           -- JSON array of flag codes
  computed_at     TEXT NOT NULL,
  PRIMARY KEY (code, date)
);

-- The small-cap quarantine (OI-08, decision 20): the signal pass marks a
-- small-tier symbol whose stored series shows a jump the toolkit cannot
-- explain — an av_jump receipt with no splits row within four days of its
-- date. A quarantined symbol keeps its signal row (informational) but the
-- ticket route and the calculator refuse it. A jump that was news, not a
-- split, is cleared by a splits row with factor 1 and a note: the adjuster
-- changes nothing for factor 1 and the quarantine sees the jump explained.
ALTER TABLE signals ADD COLUMN quarantined TEXT;
