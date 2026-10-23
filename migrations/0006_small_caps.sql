-- 0006_small_caps.sql — the small-cap tier: two data spines (decision 14, 19 Oct 2026).
--
-- The free FMP plan serves none of the 52 small companies on the candidate
-- list (sweep closed 15 Oct: 144 probed, 38 served, 0 of 52 small caps).
-- Graham's enterprising investor hunts exactly there ("we set no lower limit
-- on the size of the enterprise", TII ch. 15 p. 386), so a second spine:
--   prices and accounts  → Alpha Vantage (25 calls/day, 5/minute; compact
--                          daily history = the last ~100 trading days,
--                          UNADJUSTED; income statement, balance sheet and
--                          dividend record served free — VC-13/VC-14)
--   EPS and the audit     → SEC EDGAR's XBRL API (free, no key, a User-Agent
--   trail                   naming the project; selected by period and form,
--                          never by fy — VC-13 gotcha)
-- Five columns, no indexes (0002's lesson). Existing rows default to the
-- core tier, so nothing changes for the 38 until small caps are seeded.

ALTER TABLE tickers ADD COLUMN tier TEXT NOT NULL DEFAULT 'core';   -- core = FMP · small = Alpha Vantage + EDGAR
ALTER TABLE tickers ADD COLUMN cik TEXT;                            -- EDGAR Central Index Key, 10 digits, small tier only

-- Alpha Vantage's daily series is as traded. We keep that figure (close) and
-- COMPUTE adj_close from it with the dividend record, so a $3.00 special no
-- longer paints a 13% cliff on the chart (VC-14 finding). FMP rows leave
-- close NULL: their adj_close arrives adjusted from the provider.
ALTER TABLE daily_prices ADD COLUMN close REAL;

-- Where each year's lines came from, on the row itself — the audit trail the
-- books page prints. source: 'fmp' | 'av'. eps_source: 'fmp' for the core
-- tier; for the small tier the EDGAR tag, form, filing date and accession,
-- e.g. 'edgar:EarningsPerShareDiluted 10-K filed 2026-09-03 accn 0001437749-26-029578'.
ALTER TABLE fundamentals_annual ADD COLUMN source TEXT;
ALTER TABLE fundamentals_annual ADD COLUMN eps_source TEXT;
