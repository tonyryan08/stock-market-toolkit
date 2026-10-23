# VC-16 — the small-cap tier, verified (second data spine live)

**Purpose.** Decision 14 is built (v0.8.0). Before the tier fills, prove on Ethan Allen (ETD) — the company VC-13/14 verified by hand — that the Worker's Alpha Vantage and EDGAR paths produce the 10-K's figures, that the toolkit's dividend adjustment removes the cliff you saw in VC-14a, that both screens score the company, and then that the live 23:10 UTC run behaves inside its rations.

**How to use.** As before: fill the `>` lines, paste the fragments or screenshots, replace any key with `KEY`. a–f tonight on localhost (**4 Alpha Vantage calls**); g–i tomorrow morning on the live site. Acceptance values are from ETD's FY2026 Form 10-K (filed 3 Sept 2026, accession 0001437749-26-029578), the same primary source as VC-14.

```
Executed by:  Tony Ryan        Date:                      wrangler:
```

---

## VC-16a — the seed (EDGAR only; 0 Alpha Vantage calls)

**Do:** `npm run seed-small-caps`.
**Expected:** one line per symbol; `✓ ETD    CIK 0000896156  Ethan Allen Interiors Inc   Household Furniture` (sector is EDGAR's SIC description, title-cased); a closing line "N of 52 found on EDGAR". Any `✗` names a symbol not on EDGAR's ticker map — record it; it is not seeded.

```
> N of 52 found: 48 of 52 found on EDGAR      ✗ symbols, if any: RYI    not on EDGAR's ticker map, ZEUS   not on EDGAR's ticker map
> ETD line as printed:✓ ETD    CIK 0000896156  Ethan Allen Interiors Inc          Wood Household Furniture, (no Upholstered)
> Result (PASS / FAIL / NOTE): Pass
```

## VC-16b — the first visit, local (4 Alpha Vantage calls)

**Do:** `.dev.vars` has `EDGAR_USER_AGENT` and `SMALLCAP_AV_CALLS="4"`; ETD seeded locally (apply notes step 4). `npm run dev:cron`, then ring `http://localhost:8787/__scheduled?cron=10+23+*+*+*` once. Wait a minute (calls are 13 s apart), then:
`npx wrangler d1 execute stock-market-db --local --command "SELECT symbol, outcome, rows_written, substr(detail,1,200) AS d FROM fetch_log ORDER BY id DESC LIMIT 6"`
**Expected rows (newest first):** `run_summary` with `"phase":"smallcaps"`, `"avCalls":4`, `"edgarCalls":3` or 4 · `ETD fund_ok` with `dividends N (+N new) · income 5y+balance · edgar: eps 5/5 (EarningsPerShareDiluted) · net income agrees 5/5 · balance readings: no debt line reported → long-term debt 0` · `ETD ok` with `av compact ~100 days … as traded; N days dividend-adjusted by the toolkit`. If EDGAR answered 403 locally, `edgar failed: HTTP 403` → the User-Agent has no email in it; fix `.dev.vars`, reset ETD (`UPDATE tickers SET fundamentals_as_of=NULL, last_price_fetch=NULL WHERE symbol='ETD'`) and ring again tomorrow (ration).

```
> run_summary avCalls / edgarCalls: run_summary │ 100          │ {"phase":"smallcaps","tickers":1,"planned":1,"withAccounts":1,"skippedFresh":0,"skippedBlocked":0,"avCalls":4,"edgarCalls":3,"fetches":7,"inserts":100,"outcomes":{"ok":1,"fund_ok":1},"ms":41741}
> fund_ok detail (paste):  fund_ok     │ 10           │ dividends 80 (+80 new) · income 10y+balance · edgar: eps 10/10 (EarningsPerShareDiluted) · net income agrees 8/8
> ok detail (paste): ok          │ 100          │ av compact 100 days 2026-06-01→2026-10-21, as traded; 66 days dividend-adjusted by the toolkit
> Result (PASS / FAIL / NOTE):Pass
```

## VC-16c — the books page: the Worker's figures against the 10-K

**URL:** `http://localhost:8787/fundamentals/ETD`
**Expected:** the `SMALL-CAP TIER` tag beside the last close; the line *Where these figures come from* naming **EarningsPerShareDiluted 10-K filed 2026-09-03 accn 0001437749-26-029578**; the five-years table:

|               | FY2022 | FY2023   | FY2024   | FY2025   | FY2026   |
| ------------- | ------ | -------- | -------- | -------- | -------- |
| Revenue       | record | 791m     | 646m     | 615m     | **579m** |
| Net income    | record | 103m     | 64m      | 52m      | **40m**  |
| EPS (diluted) | record | **4.13** | **2.49** | **2.01** | **1.56** |
| Equity (book) | record | record   | 483m     | 482m     | **471m** |

Cards: **current ratio 2.06** (305,453 ÷ 148,364); P/B about close ÷ 18.43; the P/E card's "latest year alone" = close ÷ 1.56.

```
> EPS row as shown (FY2022→FY2026): EPS (diluted)	1.29	1.32	0.96	0.34	2.37	4.05	4.13	2.49	2.01	1.56
> Sources line names the 10-K filed 2026-09-03?            Current ratio:2.06
> Anything that does not match (line, value shown, value expected):{
  "ticker": "ETD",
  "name": "Ethan Allen Interiors Inc",
  "last_close": {
    "date": "2026-10-21",
    "adj_close": 19.78
  },
  "years": [
    {
      "fiscalYear": "2026",
      "periodEnd": "2026-06-30",
      "revenue": 579487000,
      "netIncome": 39883000,
      "epsDiluted": 1.56,
      "currentAssets": 305453000,
      "currentLiabilities": 148364000,
      "totalAssets": 719673000,
      "totalLiabilities": 248212000,
      "longTermDebt": null,
      "equity": 471461000,
      "sharesDiluted": 25584000,
      "goodwillAndIntangibles": 45128000
    },
> Result (PASS / FAIL / NOTE):
```

## VC-16d — the adjustment: the $3.00 special's cliff is gone

**Do:** find the special's ex-date, then look at the stored rows either side of it:
`npx wrangler d1 execute stock-market-db --local --command "SELECT ex_date, amount FROM dividends WHERE symbol='ETD' AND amount >= 1 ORDER BY ex_date DESC LIMIT 3"`
`npx wrangler d1 execute stock-market-db --local --command "SELECT date, close, adj_close FROM daily_prices WHERE symbol='ETD' AND date BETWEEN date('<EX-DATE>','-7 days') AND date('<EX-DATE>','+2 days') ORDER BY date"`
**Expected:** `close` (as traded) drops by about $3 on the ex-date; `adj_close` does not — the day before and the ex-date sit within pennies of each other; every `adj_close` before the ex-date = `close × (1 − 3.00 ÷ the close on the last day before it)`, which you can check on a calculator for one row. On `http://localhost:8787/prices/ETD` the caption reads *as traded (Alpha Vantage), dividend-adjusted by the toolkit; not adjusted for splits*, and the chart shows no cliff where VC-14a's data had one. The newest row has `close = adj_close` (nothing after it to adjust for).

```
> Special's ex-date and amount:
> Day before: close / adj_close:            Ex-date: close / adj_close:
> One row checked by calculator (date, close, factor, adj_close):
> Chart caption as shown:
> Result (PASS / FAIL / NOTE): FAIL - error givem "C:\Dev\stock-market-toolkit>npx wrangler d1 execute stock-market-db --local --command "SELECT date, close, adj_close FROM daily_prices WHERE symbol='ETD' AND date BETWEEN date('<EX-DATE>','-7 days') AND date('<EX-DATE>','+2 days') ORDER BY date"`

 ⛅️ wrangler 4.122.0 (update available 4.151.3)
───────────────────────────────────────────────
Resource location: local

Use --remote if you want to access the remote instance.

🌀 Executing on local database stock-market-db (<database_id>) from .wrangler\state\v3\d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.

X [ERROR] unrecognized token: "`" at offset 157: SQLITE_ERROR"
```

## VC-16e — the enterprising screen scores it

**URL:** `http://localhost:8787/screen/enterprising` (and `/screen`)
**Expected:** ETD with a small `s` marker (hover: the tier's sources). Test 1 (P/E ≤ 9) **fails** — the hover shows close ÷ 1.56. Test 2 (strength) **passes** — CR 2.06, long-term debt 0. Test 3 **passes** (five positive years). Test 4 **passes** (ex-date within a year). Test 5 (growth) **fails** — 1.56 now vs the EPS four years earlier. Test 6 (price < 1.2 × tangible book): tangible book per share = (471,461 − 45,128) ÷ 25,584 = **$16.66**, so the test passes **at or below $19.99** — whichever side of that the close is, the hover shows the arithmetic. On `/screen`: size fails (revenue $579m against $800m); the rest as above.

```
> Row as shown (marks 1–6, score, verdict): mostly correct Test 2 give a ?
> Hover on test 6 (the numbers shown): Test 6 has different numbers 1.19X tangible book
> Result (PASS / FAIL / NOTE):FAIL
```

## VC-16f — explain this stock, small-cap edition

**URL:** `http://localhost:8787/explain/ETD`
**Expected:** both chips; the story (AI if `.dev.vars` has the key, plain otherwise); kinds include **Below the defensive size floor**; fact F7 reads *long-term debt $0m*; F5 lists the five EPS figures above.

```
> Kinds listed:                              F5 as shown:
> Result (PASS / FAIL / NOTE): FAIL Test "The plain version — the course's own sentences, assembled from the sheet. Why: the AI call failed (HTTP 401 authentication_error invalid x-api-key); the plain version is shown."
```

## VC-16g — the first live run (next morning)

**Do:** `npx wrangler d1 execute stock-market-db --remote --command "SELECT run_at, symbol, outcome, substr(detail,1,160) AS d FROM fetch_log WHERE run_at >= datetime('now','-12 hours') ORDER BY id DESC LIMIT 30"`
**Expected:** a `run_summary` with `"phase":"smallcaps"`, `"avCalls"` ≤ 20, about 5 companies visited (alphabetical among the tier: AE, ANDE, APOG, AVD, BBW …), each with `ok` + `fund_ok` — or `blocked` (Alpha Vantage has no series: one call spent, left alone) or `fund_blocked` (prices but no statements). Any `edgar_mismatch` rows name the year and both figures: a NOTE, not a fail. If every `fund_ok` says `edgar failed: HTTP 403`, see the apply notes ("If EDGAR refuses the Worker"). The 22:30/22:50 runs for the 38 should look exactly as they did before.

```
> Visited (symbols and outcomes):
> avCalls / edgarCalls / fetches:
> EDGAR from the Worker: served / 403:
> Result (PASS / FAIL / NOTE):
```

## VC-16h — the live site

**URLs:** `/api/universe` → small-tier rows carry `"tier":"small"` and a `cik`; `/screen/enterprising` → the visited companies appear with the `s` marker and a score; `/fundamentals/<one of them>` → the sources line names its 10-K. Over the next ~11 nights the whole tier appears; the footer's "Run tonight over N companies' books" grows by about five a night.

```
> Small-tier rows in /api/universe:           With books tonight:
> Result (PASS / FAIL / NOTE):
```

## VC-16i — optional negative control (4 more calls — only if the day's ration allows)

Remove `EDGAR_USER_AGENT` from `.dev.vars`, reset ETD locally (the UPDATE in b), ring once. **Expected:** `fund_ok` with `edgar skipped: EDGAR_USER_AGENT not set — EPS stays empty`; the books page shows EPS "—" and *EPS: not available …*; the screens show `?` on the P/E tests and score the rest. Put the line back afterwards.

```
> Result (PASS / FAIL / NOTE / skipped):
```

---

## Closure (I fill this)

| Check | What it decides                                               | Result |
| ----- | ------------------------------------------------------------- | ------ |
| a     | the tier is seeded from EDGAR's own register                  |        |
| b     | the Worker reaches both sources with its own rations          |        |
| c     | the Worker's figures are the 10-K's                           |        |
| d     | the toolkit's dividend adjustment is right                    |        |
| e, f  | the screens and the explainer treat the tier like any company |        |
| g, h  | the nightly run holds inside 20 calls and fills the tier      |        |
| i     | the no-UA path fails honestly                                 |        |

**Decision rule, set in advance.** c PASS and d PASS → decision 14 is verified live; the tier fills on its own. c FAIL on EPS → EDGAR selection bug: send the paste, nothing else changes. d FAIL → the adjustment arithmetic is wrong: send the rows. g 403 → rung 2 in the apply notes. b or g "rate_limited" on the first call → the day's ration was already spent; try tomorrow.

*Education, not advice. ETD is a data-spine test case, not a pick.*
