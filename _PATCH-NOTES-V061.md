# Patch v0.6.1: dividend gap rule and books-page consistency (16 Oct 2026)

**Don't commit this file.** No migration, no packages, and no `wrangler.jsonc` in the zip. If v0.6.0 isn't applied yet, apply it first; this zip is cut on top of it.

## What changes

1. **Dividend test (defensive test 4): "uninterrupted" now means no gap over 15 months between ex-dates**, as well as a dividend in each calendar year. This was review finding 9, decided 16 Oct. Ford's 2020–21 suspension read as unbroken because its last 2020 dividend went ex in January and the next in late 2021, so every calendar year had a payment. Ford's streak now counts from late 2021. A dividend that stopped more than 15 months ago counts zero. Annual payers whose dates drift up to 15 months are unaffected. The card's wording changes with it (same rules table). No verdict changes today: Ford already failed on stability and price.
2. **The books page no longer contradicts the screen for banks.** For Financial Services companies, the current-ratio card shows a grey "not applied to financials" chip, matching the screen's "–" on test 2. Previously Citi showed a red ✗ at 0.48.
3. **The P/E × P/B card explains the OR.** When P/B is already ≤ 1.5 it says the product isn't needed, so test 7 passes either way. Citi's red chip on 24 no longer reads as a fail.

**Tests: 67** (was 63): four gap-rule cases, including Ford's pattern, a drifting annual payer, a stopped dividend and a steady quarterly payer.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`. `npm test` → **67 passed**.
2. `npm run deploy`.
3. Check `/fundamentals/C` (grey chip on current ratio) and `/card` (test 4 wording).
4. Commit *"v0.6.1: dividend gap rule (≤15 months), books page matches the screen for financials"* → push.

## Paste: BUILD-LOG

```markdown
16 Oct 2026 · v0.6.1. First enterprising run: 0 candidates over 35 — all 35 fail P/E ≤ 9 on the
latest year. Verified on three: GM 25.6 (2025 charge year; best year still 11.4), Ford a 2025
loss (−2.06; Graham's p. 382 exception tested: 5-yr avg P/E ≈ 13.8, not cheap), Citi 17.6.
Reading "expensive" confirmed company by company. Fixed: dividend streak breaks at gaps over
15 months (review finding 9, Ford 2020–21); books page shows "not applied" for financials'
current ratio and explains the P/B-or-product OR. 67 tests.
```

## Paste: decision log (row 11 or wherever finding 9 is tracked)

```markdown
| — | Dividend "uninterrupted" | **DECIDED (16 Oct 2026).** Calendar-year streak AND no gap over 15 months between ex-dates (456 days); none in the last 15 months = 0. Closes review finding 9 (Ford 2020–21). |
```
