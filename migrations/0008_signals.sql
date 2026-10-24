-- 0008_signals.sql — Week 7: the signal engine (decision log #17).
--
-- One row per instrument per close: what Carver's rule said that night, so
-- the page serves precomputed results (Workers CPU limits) and Phase 3's
-- tickets (week 8) can name "the signal on Friday's close". No extra index
-- (0002's lesson): the primary key is the only one, ~40 rows a night.
CREATE TABLE IF NOT EXISTS signals (
  symbol          TEXT NOT NULL,
  date            TEXT NOT NULL,      -- the close the rule read (adjusted series)
  close           REAL NOT NULL,
  ewma_fast       REAL NOT NULL,      -- EWMA(16) of the close
  ewma_slow       REAL NOT NULL,      -- EWMA(64)
  sigma_px        REAL,               -- EW σ of daily price changes (span 35), price units
  sigma_pct       REAL,               -- EW σ of daily % returns, decimal
  instrument_risk REAL,               -- annualised, percent (σ% × 16)
  forecast        REAL,               -- 3.75 × (fast − slow) ÷ σ_px, capped ±20
  state           TEXT NOT NULL,      -- 'long' | 'flat' | 'warming'
  state_since     TEXT,               -- the close on which the current state began
  days            INTEGER NOT NULL,   -- closes the rule had
  computed_at     TEXT NOT NULL,
  PRIMARY KEY (symbol, date)
);
