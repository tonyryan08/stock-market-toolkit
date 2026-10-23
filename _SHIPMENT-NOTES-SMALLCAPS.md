# Small-cap tier — Apply Notes (v0.8.0: the second data spine)

**Follow in order. Don't commit this file or `_VC-16-form.md`.** Apply after the week-6 commit and v0.7.3. One migration, one new secret, one generated seed, one cron line, then VC-16. Nothing here touches the 38: their prices and accounts keep coming from FMP exactly as before.

## What this is

Decision 14, built. The FMP sweep served none of the 52 small caps (15 Oct), so they get their own spine:

| Stream | Source | How |
|---|---|---|
| Prices | **Alpha Vantage** `TIME_SERIES_DAILY` compact — the last ~100 trading days, **as traded** | stored in `daily_prices.close`; `adj_close` is **computed by the toolkit** from the dividend record (`src/lib/adjust.ts`, 7 tests) — the $3.00 special no longer paints a 13% cliff |
| Accounts | **Alpha Vantage** `INCOME_STATEMENT`, `BALANCE_SHEET`, `DIVIDENDS` | same `fundamentals_annual` and `dividends` tables, rows stamped `source='av'` |
| EPS | **SEC EDGAR** company-concept API, `EarningsPerShareDiluted` (fallback: net income ÷ diluted shares) | selected by period and form, never by `fy`; the filing is named on each row (`eps_source`) and on the books page |
| Cross-check | EDGAR's net income against Alpha Vantage's, per year | in the `fund_ok` receipt; a difference over 1% is logged as `edgar_mismatch` |

**Rations.** Alpha Vantage: 25 calls a day, 5 a minute, one key for the project. The nightly visit (`src/jobs/smallcaps.ts`) spends at most **20**, spaced 13 seconds apart, in its own cron invocation at **23:10 UTC**; EDGAR is free and uncapped (it wants a User-Agent naming the project and a contact). A visit costs 1 call (prices) or 4 (prices + the three account calls). Arithmetic for 52 names: ~5 full visits a night → the tier has books in **~11 nights**; then ~20 price refreshes a night → every company every 2–3 nights, inside the 100-day window. Accounts are refreshed yearly. Workers Free allows 5 cron triggers per account; this is the fourth.

**Two readings the toolkit makes of Alpha Vantage's "None", both printed in the receipt** (`balance readings:`): every debt line "None" → long-term debt **0** (Ethan Allen, debt-free, reports no debt line at all — VC-14b); every goodwill/intangibles line "None" → **0**. Without these, Graham's debt test would be unanswerable for exactly the companies that pass it best.

**What a company's status means now.** `tickers.status='blocked'` — Alpha Vantage has no daily series for the symbol (its `Error Message`), left alone. `fundamentals_status='blocked'` — prices served, statements not; skipped on later nights until you reset the status to NULL. Transient faults are `error` and retried. A daily-limit or paywall message stops the whole run for the night; nothing is marked.

**New:** `migrations/0006_small_caps.sql` · `src/providers-av.ts` (+11 tests) · `src/providers-edgar.ts` (+8) · `src/lib/adjust.ts` (+7) · `src/jobs/smallcaps.ts` (+7) · `scripts/seed-small-caps.mjs`
**Changed:** `src/jobs/nightly.ts` (tier filters; `smallcaps` phase; FMP rows now stamped `source='fmp'`) · `src/index.ts` (cron branch; `/api/universe` tier + CIK; books page "where these figures come from"; `s` marker on both screens; chart caption) · `scripts/universe-candidates.txt` (the `#TIER small` marker) · `package.json` (0.8.0; `seed-small-caps` script)

No new packages — no `npm install`, no approvals prompt.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`; review in Desktop. `npm test` → **expect 124 passed**.
2. Migration, local then remote:
   `npx wrangler d1 migrations apply stock-market-db --local`
   `npx wrangler d1 migrations apply stock-market-db --remote` → `0006_small_caps.sql ✅`
3. **EDGAR's User-Agent** (the one new secret — not a key, but it carries a contact address, so it stays out of the repo). Format: project name, space, an email you read. In Notepad: `stock-market-toolkit you@example.com` (your real address). Then:
   - locally, two lines in `.dev.vars`:
     `EDGAR_USER_AGENT="stock-market-toolkit you@example.com"`
     `SMALLCAP_AV_CALLS="4"` ← **keep this**: a local doorbell run then spends 4 Alpha Vantage calls (one full visit), not 20. The key is shared with production.
   - `.dev.vars.example` gets a blank `EDGAR_USER_AGENT=` line for the repo.
   - live: `type ua.txt | npx wrangler secret put EDGAR_USER_AGENT` (cmd.exe), then `npx wrangler secret list` → four names.
4. **The seed** — EDGAR lookups only, no Alpha Vantage calls: `npm run seed-small-caps` → one line per symbol with its CIK, EDGAR name and SIC sector; "N of 52 found". Writes `scripts/small-caps-seeded.json` (evidence) and `scripts/seed-small-caps.sql`. A symbol not on EDGAR's ticker map is reported, not seeded (acquired or delisted since the list was written — that is a finding).
   - **Local, ETD only** (so VC-16 visits the company we verified by hand): `npx wrangler d1 execute stock-market-db --local --command "INSERT INTO tickers (symbol, name, sector, status, tier, cik) VALUES ('ETD','Ethan Allen Interiors Inc','Household Furniture','active','small','0000896156') ON CONFLICT(symbol) DO UPDATE SET tier='small', cik='0000896156', status='active'"`
   - **Remote, the whole tier:** `npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-small-caps.sql` → "N commands executed" (the I-2 shape 7403 may appear; retry).
5. `wrangler.jsonc`, in Notepad: the crons line becomes `["30 22 * * *", "40 22 * * *", "50 22 * * *", "10 23 * * *"]` (keep whatever price lines you have; add the `10 23`).
6. `npm run deploy` → the readout lists the schedules including `10 23 * * *`.
7. **VC-16** (`_VC-16-form.md`): a–f tonight on localhost (4 Alpha Vantage calls), g–i tomorrow morning on the live site after the first 23:10 UTC run.
8. Commit *"Small-cap tier: Alpha Vantage + EDGAR as the second data spine (v0.8.0)"* → push. Commit `scripts/small-caps-seeded.json` and `scripts/seed-small-caps.sql` with it; never `.dev.vars`.

**Ration arithmetic for the day you apply:** 4 (local) + 20 (production at 23:10 UTC) = 24 of 25. Don't demo `/api/quote` that day, and don't ring the local doorbell twice.

## If EDGAR refuses the Worker

VC-16g's receipt would read `edgar failed: HTTP 403 …` and ETD's EPS would be empty. That is the fair-access policy (User-Agent), or EDGAR declining traffic from Cloudflare's addresses. Rung 1: check the secret (`npx wrangler secret list` shows the name; re-put it if in doubt) — the local run (VC-16b) proves the Worker's EDGAR code with your own address, so a live 403 is about the sender, not the code. Rung 2: tell me; the fallback is a script on your machine that fetches the EPS rows from EDGAR and writes a seed, which the Worker then only reads. The screens run without EPS meanwhile (the P/E tests show "?"; everything else is scored).

## Paste 1 — BUILD-LOG

```markdown
## Small-cap tier — the second data spine · logged [date]

**Designed (Claude chat).** Decision 14 as built: Alpha Vantage (25/day, 5/min) for the small
caps' prices (compact, as traded) and accounts; SEC EDGAR for EPS and as the audit trail (period
+ form selection, never fy; latest filing wins; net-income ÷ diluted-shares fallback; the filing
named on every row). Dividend adjustment done by the toolkit from the dividend record, as-traded
close kept beside it; re-done for the stored series when a new ex-date arrives. One cron
invocation at 23:10 UTC, 20 spaced calls a night, stalest-first visits (prices + accounts when
due), a company screenable the night it is visited. Alpha Vantage's "None" on debt and
intangibles read as 0, printed in the receipt. Core tier untouched.

**Built (Claude, sandboxed).** providers-av.ts (+11 tests), providers-edgar.ts (+8), lib/adjust.ts
(+7), jobs/smallcaps.ts (+7, the ration plan), migration 0006 (five columns, no indexes), seed
script (EDGAR ticker map + submissions: CIK, name, SIC → sector), tier filters in the nightly job,
sources line on the books page, tier marker on both screens, chart caption. 124 tests.

**Verified — machine (sandbox).** Type-check clean; 124/124. Against stubs standing in for Alpha
Vantage and EDGAR with Ethan Allen's FY2026 10-K figures: a four-company visit → ETD and a
second company screenable (EPS 1.56/2.01/2.49/4.13/4.05 with the 10-K named on each row; net
income agrees 5/5), a symbol AV does not serve → blocked after one call, a symbol with prices but
no statements → fund_blocked and skipped thereafter; the $3.00 special's cliff gone from the
adjusted series (23.20 → 20.20 as traded, 19.81 → 19.81 adjusted); a new ex-date → the stored
series re-adjusted; a second ring → nothing refetched; EDGAR 403 → fatal for the night, EPS
empty, page complete. Pages checked: books (sources line), both screens (marker), chart, explain.

**Verified — hand (gates "done").**
- [ ] `npm test` 124/124 on my machine
- [ ] migration 0006 local + remote; EDGAR_USER_AGENT in .dev.vars and as a secret; SMALLCAP_AV_CALLS=4 locally
- [ ] seed: N of 52 found on EDGAR; applied remote
- [ ] crons line has 10 23; deploy lists it
- [ ] VC-16 a–i
```

## Paste 2 — decision log (append to row 14)

```markdown
| 14 | *(implemented 20 Oct 2026, v0.8.0)* Alpha Vantage compact prices as traded + toolkit dividend adjustment; AV statements; EDGAR EPS with the filing named per row; 20 AV calls a night at 23:10 UTC; AV "None" on debt/intangibles read as 0 and printed in the receipt; companies AV does not serve are marked and left alone. |
```

## Paste 3 — verification record (after VC-16)

```markdown
## VC-16 — the small-cap tier — [date]
a seed ✓/✗ (N of 52 on EDGAR) · b first visit, local ✓/✗ · c ETD books page: EPS = the 10-K ✓/✗ · d adjustment ✓/✗ ·
e enterprising row ✓/✗ · f explain ✓/✗ · g first live run ✓/✗ (visited: ___; avCalls ___) · h live universe/screen ✓/✗ · i (optional) no-UA control ✓/✗.
Alpha Vantage calls spent on the day: ___ of 25. EDGAR from the Worker: served / 403.
```

## Paste 4 — data-provider-checks.md (a closure line)

```markdown
## D-1 — Alpha Vantage "None" readings — [date]
BALANCE_SHEET prints "None" where the filer reports no line. Read as 0 for long-term debt when
longTermDebt, longTermDebtNoncurrent, shortLongTermDebtTotal and currentDebt are all "None"
(ETD, VC-14b: "None or 0"), and for goodwill + intangibles when all three lines are "None".
Each reading is printed in the fund_ok receipt ("balance readings: …"). A debt figure under any
name is kept as a figure; a partial debt picture stays unknown, not 0.
```

## README lines (hand-edit)

Under the universe paragraph: *"Two data spines: the 38 household names come from FMP; the small-cap tier (Graham's enterprising hunting ground, which FMP's free plan does not serve) comes from Alpha Vantage, with EPS and an audit trail from SEC EDGAR — `npm run seed-small-caps`, decision 14."* Repo map: `src/providers-av.ts`, `src/providers-edgar.ts`, `src/lib/adjust.ts`, `src/jobs/smallcaps.ts`, `scripts/seed-small-caps.mjs`.
