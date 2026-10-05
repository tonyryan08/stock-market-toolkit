-- 0003_fundamentals.sql — week 4: the books, opened.
--
-- Five annual periods per symbol (the free plan's depth, VC-07), raw lines
-- only: every ratio is COMPUTED from these in src/lib/ratios.ts — tested
-- code the students can read — so the week-5 checklist card and the code
-- can never disagree. fiscal_year is TEXT (provider-faithful labels).
-- No extra indexes (migration 0002's lesson): the composite PK is enough,
-- and every index is a metered write on every insert.

CREATE TABLE fundamentals_annual (
  symbol               TEXT NOT NULL,
  fiscal_year          TEXT NOT NULL,
  period_end           TEXT,            -- YYYY-MM-DD
  revenue              REAL,
  net_income           REAL,
  eps_diluted          REAL,
  current_assets       REAL,
  current_liabilities  REAL,
  total_assets         REAL,
  total_liabilities    REAL,
  long_term_debt       REAL,
  shareholders_equity  REAL,
  shares_diluted       REAL,
  PRIMARY KEY (symbol, fiscal_year)
);

-- Dividend record — week 5's "dividend record" criterion reads this.
CREATE TABLE dividends (
  symbol  TEXT NOT NULL,
  ex_date TEXT NOT NULL,               -- YYYY-MM-DD
  amount  REAL,
  PRIMARY KEY (symbol, ex_date)
);

-- Fundamentals freshness rides on the ticker row, like last_full_fetch.
ALTER TABLE tickers ADD COLUMN fundamentals_as_of TEXT;
ALTER TABLE tickers ADD COLUMN fundamentals_status TEXT;  -- ok | partial | blocked
