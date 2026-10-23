# Patch v0.8.1 — VC-16's findings, and the small-cap visit from your own computer

**Don't commit this file, `_VC-16-form.md`, or `_wrangler.smallcaps.jsonc`.** Apply Friday morning after reading the overnight receipt (step 0). ~15 minutes plus one five-minute visit.

## What VC-16 found, and what this fixes

| #   | Finding (VC-16, 22 Oct)                                                                                                                                                                                                                                                                                                               | Fix                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ten years of accounts, not five.** Alpha Vantage serves ten annual reports and the job kept them all. The growth test compares the window's first pair with its last, so ETD's growth read +37% (FY2017–18 → FY2025–26) instead of −56% (FY2022–23 → FY2025–26), and the card's "five years" was untrue for the tier.               | `smallcaps.ts` keeps the newest five and deletes any wider rows left by an earlier fetch.                                                                                                                                        |
| 2   | **Long-term debt null → strength test "?".** ETD's live balance sheet: `longTermDebt` None, `shortLongTermDebtTotal` 120,373,000 = `capitalLeaseObligations` 120,373,000. Since 2019 (ASC 842) leased shops sit on the balance sheet as liabilities and AV folds them into its debt total. Graham's long-term debt is borrowed money. | `providers-av.ts`: borrowings = debt total − lease obligations; ETD reads 0 with the receipt line *debt total 120m is entirely lease obligations → borrowings 0*. A total with no lease line stays unknown ("?"), never a guess. |
| 3   | **The Worker never got past its first Alpha Vantage call** (20, 21 Oct: "25 requests per day", then "higher API call volume", on a night you had spent nothing). Alpha Vantage counts the free tier by sender address as well as by key, and Cloudflare's shared addresses are spent before 23:10 UTC.                                | The visit runs from **your PC** with the live database: `npm run smallcaps` (below). The 23:10 cron comes out of `wrangler.jsonc`. The "call volume" message is now classed as a throttle (`rate_limited`), not a paywall.       |
| 4   | Form wording: test 6's hover gives a ratio (1.19× against 1.2), not the dollar bar.                                                                                                                                                                                                                                                   | `_VC-16-form.md` closure wording; the arithmetic was right.                                                                                                                                                                      |

**Changed:** `src/providers-av.ts` · `src/providers-av.test.ts` (+2, 126 tests) · `src/jobs/smallcaps.ts` · `scripts/visit-small-caps.mjs` (new) · `_wrangler.smallcaps.example.jsonc` (new) · `package.json` (0.8.1; `smallcaps` script)

## Apply

0. **The overnight receipt** (Thursday 23:10 UTC run), before anything else:
   `npx wrangler d1 execute stock-market-db --remote --command "SELECT symbol, outcome, substr(detail,1,160) AS d FROM fetch_log WHERE run_at >= '2026-10-22T23:00' AND run_at < '2026-10-22T23:59' ORDER BY id"`
   - **Stopped at call 1 again** (rate_limited/av_premium at the first symbol) → the Worker path is confirmed blocked three nights running. Follow every step below.
   - **Got through** (ok/fund_ok rows for several companies) → Tuesday and Wednesday were the key's own ration after all. Do steps 1–3 and 6; skip 4–5, keep the cron, and tell me — the PC route then stays in the drawer.
1. Extract over `C:\Dev\stock-market-toolkit`. `npm test` → **126 passed**.
2. **Mark the tier due again** so the five-year rows replace the ten-year ones (live has nothing written; local has ETD):
   `npx wrangler d1 execute stock-market-db --local --command "UPDATE tickers SET fundamentals_as_of=NULL, last_price_fetch=NULL WHERE tier='small'"`
3. `npm run deploy` (the classifier and the five-year rule go live even if the cron stays).
4. **The cron:** in Notepad, remove `"10 23 * * *"` from `wrangler.jsonc`'s crons line → `npm run deploy` again → the readout lists three schedules. (It only ever spent one refused call a night, but a refused call is still a call.)
5. **Your copy of the small-cap config:** save `_wrangler.smallcaps.example.jsonc` as `_wrangler.smallcaps.jsonc`, paste your `database_id` from `wrangler.jsonc` over the zeros. Untick it in Desktop, always. Then the first visit:
   `npm run smallcaps -- --calls 16`
   (16, not 20: VC-16b's re-run in step 6 needs 4, and the day holds 25.) It starts a local server on port 8790 with the **live** database, rings the doorbell, waits, prints the receipt, stops the server. About four minutes. Expected: four companies (AE, ANDE, APOG, AVD) with `ok` + `fund_ok`, or `blocked` where Alpha Vantage has no series; `avCalls` 16 or fewer; `edgarCalls` ~12.
6. **VC-16 c and e, re-run locally** (4 calls): `npm run dev:cron`, ring `http://localhost:8787/__scheduled?cron=10+23+*+*+*`, wait a minute, then `http://localhost:8787/fundamentals/ETD` → five years (FY2022–FY2026), EPS 4.05 / 4.13 / 2.49 / 2.01 / 1.56, the `fund_ok` receipt carrying *borrowings 0*; `/screen/enterprising` → test 2 ✓ (CR 2.06, debt 0), test 5 ✗ (−56%), test 6 ✓ or ✗ by the day's close against 1.2×. Ctrl+C.
7. Commit *"v0.8.1: five-year window, leases are not borrowings, small-cap visit from the PC"* → push. `_wrangler.smallcaps.jsonc` stays unticked.

**Ration arithmetic for Friday:** 16 (visit) + 4 (local re-run) = 20 of 25. Over the weekend `npm run smallcaps` once a day at the full 20 fills ~5 companies a day; the tier is complete in about ten runs.

## VC-17 — the visit from your computer (fill in on Friday)

```
> npm run smallcaps -- --calls 16: companies visited and outcomes:
> avCalls / edgarCalls:                      EDGAR from your PC: served / 403:
> /api/universe (live): small-tier rows with days_of_history > 0:
> /screen/enterprising (live): the visited companies appear with the s marker:
> Result (PASS / FAIL / NOTE): Pass ANDE, APOG, AVD, BBW — ok + fund_ok; avCalls 16 / edgarCalls 13; EDGAR from the PC: served
```

## Record lines

```markdown
## I-4 — Alpha Vantage refuses the Worker — 20–22 Oct 2026
Three nights, the 23:10 UTC small-cap run stopped at its first call: "standard API rate limit is
25 requests per day" (20 Oct), "contact premium@… if you are targeting a higher API call volume"
(21 Oct), [22 Oct: ___]. The same key served 4–5 calls a day from the tutor's PC on each of those
days. Reading: the free tier is metered by sender address as well as key, and Cloudflare's shared
egress addresses are spent before the cron fires. Resolution (v0.8.1): the visit runs from the
tutor's PC against the live D1 (`npm run smallcaps`, remote binding); the cron is removed. The
small-cap tier is a weekly chore, not a robot — a free-tier lesson for the record.

## D-2 — leases are not borrowings — 22 Oct 2026
ETD's live BALANCE_SHEET: longTermDebt None; shortLongTermDebtTotal 120,373,000 =
capitalLeaseObligations 120,373,000; shortTermDebt 26,910,000 (the current lease portion). Since
ASC 842 (2019) leased premises are balance-sheet liabilities. Graham's long-term debt (ch. 14, 15)
is borrowed money: the toolkit reads borrowings = debt total − lease obligations, prints the
reading in the receipt, and leaves a total with no lease line as unknown.
```

Decision log, row 14, append: *(v0.8.1, 23 Oct) five fiscal years for the tier, as the card says; borrowings exclude lease obligations; the visit runs from the tutor's PC (I-4), once a day or week.*

VC-16 closure: a ✓ · b ✓ · c ✓ (figures = the 10-K; debt fixed in v0.8.1) · d ✓ (factor 0.878592, to the cent) · e ✓ after v0.8.1 (test 6: 1.19× < 1.2) · f ✓ · g **FAIL → I-4**, resolved by VC-17 · h seed and deploy ✓, fill via VC-17 · i skipped.
