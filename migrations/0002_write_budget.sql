-- 0002_write_budget.sql — the speeding-ticket migration (2 Oct 2026).
--
-- Night one, the robot exceeded D1's free allowance of 100,000 rows
-- written/day. Cause: every insert is metered once for the table and once
-- PER INDEX — and idx_prices_symbol_date duplicated the composite PRIMARY
-- KEY, so each price row cost ~3 metered writes. 38,874 inserts ≈ 116k.
--
-- Fix 1: drop the redundant index. The PK (symbol, date) already serves
-- every query we run. Inserts drop to ~2 metered writes.
DROP INDEX IF EXISTS idx_prices_symbol_date;

-- Fix 2: the Sunday full-refresh rewrote the whole universe in one night
-- (would breach the cap weekly). Replaced by a ROLLING realign — a few
-- symbols per night, tracked here. See src/jobs/nightly.ts.
ALTER TABLE tickers ADD COLUMN last_full_fetch TEXT;
