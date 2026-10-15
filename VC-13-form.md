# VC-13 — second data spine pre-flight (EDGAR + Alpha Vantage)

**Purpose.** FMP's free plan serves none of the 52 small caps (sweep closed 15 Oct 2026: 144 probed, 38 served). Before decision 14 ("two data spines"), verify that the two candidate sources actually serve a small cap FMP blocks — Ethan Allen Interiors (ETD), the first name on the small-cap tier — and that an EDGAR figure agrees with one we already hold from FMP (Ford).

**How to use this file.** Open each URL in the browser. Fill the `>` lines under each check as you go; paste the fragments asked for (or a screenshot of the region — either reads fine). Leave anything you didn't get to blank. Paste the whole file back when done; I'll write the closure block for `docs/data-provider-checks.md` and the row for decision 14.

**Before you start**

- EDGAR calls need no key and have no daily cap. Alpha Vantage calls (d, e) spend **2 of today's 25** — don't demo `/api/quote` on the site until tomorrow.
- **Never paste or screenshot the Alpha Vantage key.** Replace it with `KEY` in any URL you copy back. (The AV notice echoed the key once before — the record is key-free.)
- Edge/Chrome show these JSON files pretty-printed with a tree; Ctrl+F works on that view. If you see one long line, click the "Pretty-print" box at the top left.
- Acceptance values below were set **before execution**, from the primary sources listed at the bottom.

```
Executed by:  Tony Ryan        Date:  15 Oct 2026        Browser:
```

---

## VC-13a — EDGAR ticker map

**URL:** `https://www.sec.gov/files/company_tickers.json`
**Tests:** the free symbol → CIK map the Worker will need (EDGAR is keyed by CIK, not ticker).
**Expected:** a large JSON object keyed `"0"`, `"1"`, … each entry `{cik_str, ticker, title}`. Ctrl+F `"ETD"` → `cik_str: 896156`, `title: "ETHAN ALLEN INTERIORS INC"`.

```
> Time:09:59
> Served? (JSON / error / other): JSON
> ETD entry as shown (cik_str, ticker, title):yes
> Result (PASS / FAIL / NOTE): pass
```

## VC-13b — EDGAR: diluted EPS history for ETD

**URL:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000896156/us-gaap/EarningsPerShareDiluted.json`
**Tests:** EDGAR serves an FMP-blocked small cap's accounts, with history, free.
**Expected:** `"cik": 896156`, `"entityName": "ETHAN ALLEN INTERIORS INC"`, `"units": { "USD/shares": [ … ] }`. Entries carry `start`, `end`, `val`, `fy`, `fp`, `form`, `filed`. Find the entry with **`start: 2024-07-01`, `end: 2025-06-30`** (ETD's year ends 30 June) → `val: 2.01`. The entry with `start: 2023-07-01`, `end: 2024-06-30` → `val: 2.49`.
*Gotcha to note, not to fix:* `fy` is the year of the **filing**, not of the period — a 10-K for FY2025 also carries FY2024 and FY2023 values all labelled `fy: 2025`. The build must select by `start`/`end`, never by `fy`.

```
> Time:10:05
> Served? (JSON / 404 / other): yes
> entityName shown: Ethan Allen Interiors
> val for start 2024-07-01, end 2025-06-30:  2.01           (expected 2.01)
> val for start 2023-07-01, end 2024-06-30:  2.49         (expected 2.49)
> Oldest "end" date anywhere in the array: 2010-06-30            (depth of history)
> Paste — the newest 3 entries of the array (or the error text):  "entityName": "Ethan     Allen Interiors Inc.",
  "units": {
    "USD/shares": [
      {
        "start": "2009-07-01",
        "end": "2010-06-30",
        "val": -1.53,
        "accn": "0001437749-12-008602",
        "fy": 2012,
        "fp": "FY",
        "form": "10-K",
        "filed": "2012-08-16",
        "frame": "CY2010"
      },
      {
        "start": "2010-07-01",
        "end": "2010-09-30",
        "val": 0.13,
        "accn": "0001437749-11-007962",
        "fy": 2012,
        "fp": "Q1",
        "form": "10-Q",
        "filed": "2011-11-02"
      },
      {
        "start": "2010-07-01",
        "end": "2010-09-30",
        "val": 0.13,
        "accn": "0001437749-13-011027",
        "fy": 2013,
        "fp": "FY",
        "form": "10-K",
        "filed": "2013-08-16",
        "frame": "CY2010Q3"

> Result (PASS / FAIL / NOTE):Pass
```

## VC-13c — EDGAR: shareholders' equity for ETD

**URL:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000896156/us-gaap/StockholdersEquity.json`
**If that 404s, try:** `…/us-gaap/StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest.json` and record which tag worked — the "tag zoo" is the known cost of EDGAR.
**Tests:** a balance-sheet instant (no `start`, only `end`) — the shape the book-value and tangible-book tests need.
**Expected:** `units: { "USD": [ … ] }`; entry with `end: 2025-06-30` → `val: 482269000`; `end: 2024-06-30` → `val: 482916000`.

```
> Time: 10:19
> Served? (JSON / 404 / other):   json         Tag that worked:
> val at end 2025-06-30: "end": "2025-06-30",
        "val": 482355000,                  (expected 482,269,000)
> val at end 2024-06-30:"end": "2024-06-30",
        "val": 482980000,                   (expected 482,916,000)
> Paste — the entries for those two dates (or the error text):

> Result (PASS / FAIL / NOTE):note-data ford ates but differs from expected 
```

## VC-13d — Alpha Vantage: daily prices for ETD, full history

**URL:** `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=ETD&outputsize=full&apikey=KEY`
**Tests:** the price spine for the small-cap tier — does the free plan serve a name FMP blocks, and how deep.
**Expected:** `"Meta Data"` with `"2. Symbol": "ETD"`, `"3. Last Refreshed"` = yesterday's or today's date, `"4. Output Size": "Full size"`; then `"Time Series (Daily)"` keyed by date, newest first, each with open/high/low/close/volume; oldest date around 1999–2000 (anything ≥ 5 years back is enough).
**Failure shapes, each a finding in its own right:** `{"Information": "… premium …"}` → full history is now paywalled; retry with `outputsize=compact` (100 days) and record both. `{"Information": "… 25 requests per day …"}` → budget, not coverage; retry tomorrow. `{"Error Message": "Invalid API call …"}` → the symbol is not served — the critical negative.

```
> Time:10:27
> Shape (served / Information / Error Message): {
  "Information": "Thank you for using Alpha Vantage! The outputsize=full parameter value is a premium feature for the TIME_SERIES_DAILY endpoint. You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly unlock all premium features"
}
> "3. Last Refreshed":
> Newest date and its "4. close":
> Oldest date (Ctrl+End):
> Paste — the Meta Data block + the newest dated entry (or the message text):

> Result (PASS / FAIL / NOTE):fail
```

## VC-13e — Alpha Vantage: income statement for ETD

**URL:** `https://www.alphavantage.co/query?function=INCOME_STATEMENT&symbol=ETD&apikey=KEY`
**Tests:** Alpha Vantage as a fallback accounts source for small caps (simpler shape than XBRL, if it serves them).
**Expected:** `{"symbol": "ETD", "annualReports": [ … ], "quarterlyReports": [ … ]}`; first annual report `fiscalDateEnding: "2025-06-30"`, `totalRevenue: "614649000"`, `netIncome: "51596000"` (AV normalises — a small difference is a NOTE, a different order of magnitude is a FAIL). No EPS in this endpoint; that is expected.

```
> Time:11:19
> Shape (served / Information / Error Message): served
> First annualReport — fiscalDateEnding: 2026-06-30           totalRevenue: 579487000           netIncome:
> Number of annualReports (or oldest fiscalDateEnding):"fiscalDateEnding": "2006-06-30"
> Paste — the first annualReport object (or the message text):{
  "symbol": "ETD",
  "annualReports": [
    {
      "fiscalDateEnding": "2026-06-30",
      "reportedCurrency": "USD",
      "grossProfit": "354771000",
      "totalRevenue": "579487000",
      "costOfRevenue": "224716000",
      "costofGoodsAndServicesSold": "224716000",
      "operatingIncome": "44685000",
      "sellingGeneralAndAdministrative": "288832000",
      "researchAndDevelopment": "None",
      "operatingExpenses": "308646000",
      "investmentIncomeNet": "None",
      "netInterestIncome": "8161000",
      "interestIncome": "8388000",
      "interestExpense": "227000",
      "nonInterestIncome": "None",
      "otherNonOperatingIncome": "None",
      "depreciation": "None",
      "depreciationAndAmortization": "15244000",
      "incomeBeforeTax": "53177000",
      "incomeTaxExpense": "13294000",
      "interestAndDebtExpense": "None",
      "netIncomeFromContinuingOperations": "39883000",
      "comprehensiveIncomeNetOfTax": "None",
      "ebit": "46125000",
      "ebitda": "61369000",
      "netIncome": "39883000"
    },

> Result (PASS / FAIL / NOTE):pass
```

## VC-13f — Cross-check: Ford's diluted EPS, EDGAR vs the books page (FMP)

**URL 1:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000037996/us-gaap/EarningsPerShareDiluted.json`
**URL 2:** your site, `/fundamentals/F` (books fetched night of 14 Oct).
**Tests:** two independent sources, one figure we already hold. Also tells us whether FMP's stored EPS is diluted (Ford 2024: diluted 1.46, basic 1.48 — a usable discriminator).
**Expected:** EDGAR entry `start: 2024-01-01`, `end: 2024-12-31` → `val: 1.46`; 2023 → `1.08`; 2022 → `-0.49`. Books page 2024 EPS → `1.46`.

```
> Time:11:23
> EDGAR val 2024:            2023:            2022:            (expected 1.46 / 1.08 / -0.49)
> Books page EPS 2024:                                        (expected 1.46; if 1.48, FMP stores basic)
> Books page EPS 2023 and 2022:
> Result (PASS / FAIL / NOTE):FAIL -my screen ok. URL 1 returned {
  "cik": 37996,
  "taxonomy": "us-gaap",
  "tag": "EarningsPerShareDiluted",
  "label": "Earnings Per Share, Diluted",
  "description": "The amount of net income (loss) for the period available to each share of common stock or common unit outstanding during the reporting period and to each share or unit that would have been outstanding assuming the issuance of common shares or units for all dilutive potential common shares or units outstanding during the reporting period.",
  "entityName": "Ford Motor Co",
  "units": {
    "USD/shares": {

    }
  }
}
```

## VC-13g — optional, no calls spent: the tag inventory

**URL:** `https://data.sec.gov/api/xbrl/companyfacts/CIK0000896156.json`
**Do:** Ctrl+S → save as `ETD-companyfacts.json` → attach it to the chat. It lists every XBRL concept ETD has ever reported (a few MB). I'll map the tags the two screens need (revenue, current assets/liabilities, long-term debt, goodwill, intangibles, diluted shares, dividends) and find out how many fallbacks the mapping layer needs before a line of it is written.

```
> Saved and attached? (yes / no / later): page unresponsive
```

---

## Closure (I fill this from your entries)

| Check | What it decides                                           | Result |
| ----- | --------------------------------------------------------- | ------ |
| a     | CIK lookup is free and works                              |        |
| b, c  | EDGAR serves a FMP-blocked small cap, with history        |        |
| d     | AV prices serve it, and how deep                          |        |
| e     | AV accounts serve it (fallback spine)                     |        |
| f     | EDGAR and FMP agree on a figure we hold; diluted vs basic |        |
| g     | Tag-mapping scope known                                   |        |

**Decision rule, set in advance.**

- b, c and d PASS → decision 14 proceeds: FMP for the famous 31 and the value tier; EDGAR (accounts) + Alpha Vantage (prices) for the small-cap tier. Cost: an XBRL tag-mapping layer and a slower rotation (25 AV calls/day → a tier of ~20 refreshed daily, or larger in rotation).
- b, c PASS but d FAIL → accounts are solved, prices are not; the small-cap tier waits for a price source and the enterprising screen runs on the 38 meanwhile.
- b or c FAIL → stop and look: EDGAR covers every SEC filer, so a fail is almost certainly a tag name or a browser/User-Agent quirk, not coverage.

**Design notes the build will need, whatever the result** (record with the check):

- EDGAR's fair-access policy: every request must send a `User-Agent` naming the project and a contact address, and stay under 10 requests/second. Browsers do this for you; the Worker must do it explicitly.
- Select XBRL values by `start`/`end` and `form` (10-K), never by `fy`.
- Alpha Vantage: 25 calls/day **and** 5/minute — the nightly schedule must space them.

**Reference figures (acceptance criteria) and where they came from:**

- Ethan Allen FY2025 results press release, filed on EDGAR as Exhibit 99.1 — net sales $614,649k (FY2024 $646,221k); net income $51,596k ($63,816k); diluted EPS $2.01 ($2.49); total shareholders' equity $482,269k at 30 Jun 2025 ($482,916k at 30 Jun 2024); current assets $309,933k; current liabilities $152,851k; no debt; goodwill $25,388k; intangibles $19,740k; diluted shares 25,634k: https://www.sec.gov/Archives/edgar/data/896156/000143774925023973/ex_845343.htm
- Ethan Allen Form 10-K FY2025 (the audited source behind the release): https://www.sec.gov/Archives/edgar/data/896156/000143774925027594/eth20250630_10k.htm
- Ford Q4/FY2024 results press release — diluted EPS 2024 $1.46, 2023 $1.08, 2022 $(0.49); net income attributable $5,879m: https://s205.q4cdn.com/882619693/files/doc_news/2025/Feb/Ford-Q4-2024-Earnings-Press-Release.pdf — and the Form 10-K FY2024: https://www.sec.gov/Archives/edgar/data/37996/000003799625000013/f-20241231.htm
- CIKs confirmed from EDGAR archive paths: Ethan Allen 896156, Ford 37996.

*Education, not advice. ETD is a data-spine test case, not a pick; the enterprising screen will say what it says.*
