-- 0007_review_fixes.sql — after the Phase 2 independent review (23 Oct 2026).
--
-- Two columns, no indexes (0002's lesson):
--   tickers.dividends_as_of — when the dividend record was last fetched. The
--     small-cap tier fetched dividends only with the accounts (every 400
--     days), but "some current dividend" needs an ex-date within 366: from
--     mid-2027 every small-cap payer would have failed it for months (review
--     F2). Dividends now refresh on their own cadence (100 days), one call.
--   fundamentals_annual.readings — the toolkit's readings of a provider's
--     "None" on that year's balance sheet ("no debt line reported → 0"),
--     so a pass that rests on a reading says so on the books page and in the
--     test hover, not only in the fetch_log receipt (review S8).
ALTER TABLE tickers ADD COLUMN dividends_as_of TEXT;
ALTER TABLE fundamentals_annual ADD COLUMN readings TEXT;

-- The core tier refreshes dividends with its accounts every 30 days, which is
-- inside the window; stamp its rows so the new column has a meaning for every tier.
UPDATE tickers SET dividends_as_of = fundamentals_as_of WHERE tier = 'core' AND fundamentals_as_of IS NOT NULL;
