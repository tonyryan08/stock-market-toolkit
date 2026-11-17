-- OI-116 / OI-37 (17 Nov 2026): when Alpha Vantage's net income and the company's own SEC filing (EDGAR)
-- disagree by more than 1%, the small-cap tier stores EDGAR's figure in net_income and keeps
-- Alpha Vantage's here, so the books page can say the two sources differ. NULL when they agree,
-- when EDGAR has no figure for the year, and for the core tier (FMP; no EDGAR cross-check).
ALTER TABLE fundamentals_annual ADD COLUMN net_income_av REAL;
