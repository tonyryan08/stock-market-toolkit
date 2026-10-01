-- 0001_init.sql — week 3: the data spine.
-- Deliberately only the tables week 3 uses. fundamentals arrives as
-- migration 0002 in week 4 (after we've seen real statement JSON);
-- portfolios/trades/signals arrive in their own weeks. Migrations ARE
-- the curriculum: the schema grows a capability a week, same as the site.

CREATE TABLE tickers (
  symbol    TEXT PRIMARY KEY,            -- US listings only (decision #5): one namespace
  name      TEXT,
  sector    TEXT,
  status    TEXT NOT NULL DEFAULT 'active',  -- active | blocked | retired
  added_on  TEXT NOT NULL DEFAULT (date('now')),
  notes     TEXT
);

CREATE TABLE daily_prices (
  symbol    TEXT NOT NULL,
  date      TEXT NOT NULL,               -- YYYY-MM-DD
  adj_open  REAL,
  adj_high  REAL,
  adj_low   REAL,
  adj_close REAL NOT NULL,               -- dividend- and split-adjusted (lesson 2: charts longer than a season)
  volume    INTEGER,
  PRIMARY KEY (symbol, date)
);
CREATE INDEX idx_prices_symbol_date ON daily_prices (symbol, date DESC);

-- Every nightly run leaves evidence. This table is the BUILD-LOG's
-- machine-written cousin, and the data behind "cron green three nights".
CREATE TABLE fetch_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  run_at        TEXT NOT NULL,           -- ISO timestamp
  symbol        TEXT,                    -- NULL for the per-run summary row
  outcome       TEXT NOT NULL,           -- ok | blocked | rate_limited | auth_failed | error | run_summary
  rows_written  INTEGER NOT NULL DEFAULT 0,
  detail        TEXT
);
CREATE INDEX idx_fetch_log_run ON fetch_log (run_at DESC);
