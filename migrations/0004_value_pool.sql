-- 0004_value_pool.sql — the value pool and the enterprising investor (14 Oct 2026).
--
-- Two columns, no indexes (0002's lesson):
--   tickers.last_price_fetch — when the price phase last succeeded for the
--     symbol. Lets the nightly price phase run as MORE THAN ONE cron
--     invocation (Workers Free: 50 fetches each) without refetching what an
--     earlier invocation already did tonight. The universe can now exceed 45.
--   fundamentals_annual.goodwill_and_intangibles — from the balance sheet.
--     Graham's enterprising-investor price test is "less than 120% net
--     tangible assets" (TII ch. 15, p. 386): equity minus goodwill and
--     intangibles. The defensive screen never needed it; the enterprising
--     screen does. Existing rows fill as the accounts rotation refetches them.
ALTER TABLE tickers ADD COLUMN last_price_fetch TEXT;
ALTER TABLE fundamentals_annual ADD COLUMN goodwill_and_intangibles REAL;
