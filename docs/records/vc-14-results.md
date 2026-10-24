# VC-14 — the small-cap data spine, second pre-flight (Alpha Vantage as source, EDGAR as audit trail)

**Purpose.** VC-13 showed Alpha Vantage serves ETD's accounts and EDGAR serves its filings, but left four things open before decision 14 can close: whether AV's *compact* price history is served (full is premium); whether AV's balance sheet carries the lines the screens need; whether AV's dividend record is free; and whether AV's reported EPS is GAAP diluted or something else. Four Alpha Vantage calls (a–d), two EDGAR calls for the record (e, f).

**How to use.** As VC-13: open each URL, fill the `>` lines, paste the fragment asked for or a screenshot. Blank is fine. Paste the file back whole.

**Before you start**

- Calls a–d spend **4 of today's 25** Alpha Vantage calls. e and f are EDGAR — free, no cap.
- **Replace the key with `KEY` in anything you paste back.**
- Acceptance values below come from ETD's **FY2026 Form 10-K, filed 3 Sept 2026** (balance sheet and income statement pages linked at the bottom) — the newest filing, so the expectations are current this time.

```
Executed by:  Tony Ryan        Date:                      Browser:
```

---

## VC-14a — Alpha Vantage: daily prices for ETD, compact

**URL:** `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=ETD&outputsize=compact&apikey=KEY`
**Tests:** the price spine. If this is served, a rolling fetch every few days keeps a gapless daily series from the day we start watching.
**Expected:** `"Meta Data"` with `"2. Symbol": "ETD"`, `"3. Last Refreshed"` = 14 or 15 Oct 2026, `"4. Output Size": "Compact"`; `"Time Series (Daily)"` with about 100 dated entries, newest first, oldest around late May 2026.
**Failure shapes:** `{"Information": "… premium …"}` → compact is paywalled too (the critical negative). `{"Information": "… 25 requests per day …"}` → budget; retry tomorrow. `{"Error Message": …}` → symbol not served.

```
> Time:15:50
> Shape (served / Information / Error Message): served
> "3. Last Refreshed": Last Refreshed": "2026-10-14"                     "4. Output Size":Output Size": "Compact"
> Newest date and its "4. close": Time Series (Daily)": {
        "2026-10-14": {
            "1. open": "20.2600",
            "2. high": "20.3200",
            "3. low": "19.8950",
            "4. close": "20.0600",
            "5. volume": "430491"
> Oldest date (Ctrl+2026-05-22": {
            "1. open": "19.6300",
            "2. high": "19.8300",
            "3. low": "19.6250",
            "4. close": "19.7400",
            "5. volume": "285124"End):                   Rough count of dated entries:
> Paste — the Meta Data block + the newest entry (or the mes{
    "Meta Data": {
        "1. Information": "Daily Prices (open, high, low, close) and Volumes",
        "2. Symbol": "ETD",
        "3. Last Refreshed": "2026-10-14",
        "4. Output Size": "Compact",
        "5. Time Zone": "US/Eastern"
    },
    "Time Series (Daily)": {
        "2026-10-14": {
            "1. open": "20.2600",
            "2. high": "20.3200",
            "3. low": "19.8950",
            "4. close": "20.0600",
            "5. volume": "430491"sage text):

> Result (PASS / FAIL / NOTE):pass
```

## VC-14b — Alpha Vantage: balance sheet for ETD

**URL:** `https://www.alphavantage.co/query?function=BALANCE_SHEET&symbol=ETD&apikey=KEY`
**Tests:** the lines tests 2 and 7 and the tangible-book test read: current assets and liabilities, debt, goodwill, intangibles, equity, shares.
**Expected (first annualReport, fiscalDateEnding 2026-06-30, from the 10-K balance sheet, USD):** `totalCurrentAssets` 305,453,000 · `totalCurrentLiabilities` 148,364,000 · `goodwill` 25,388,000 · `intangibleAssets` 19,740,000 (AV may put it under `intangibleAssetsExcludingGoodwill`; note which) · `totalShareholderEquity` 471,461,000 **or** 471,546,000 (the 10-K prints both: total, and Ethan Allen-only before a −85k noncontrolling interest — record which AV chose) · `longTermDebt` "None" or 0 (the company has no debt) · `cashAndCashEquivalentsAtCarryingValue` 73,628,000 · `totalAssets` 719,673,000 · `commonStockSharesOutstanding` — no acceptance value; record it. A difference of a few thousand is a NOTE; a different order of magnitude or a missing line is a FAIL for that line.

```
> Time:15:56
> Shape (served / Information / Error Message):served
> First annualReport fiscalDateEnding:
> totalCurrentAssets:                        (expected 305,453,000)
> totalCurrentLiabilities:                   (expected 148,364,000)
> goodwill:                                  (expected 25,388,000)
> intangibleAssets / intangibleAssetsExcludingGoodwill:          (expected 19,740,000)
> totalShareholderEquity:                    (expected 471,461,000 or 471,546,000 — which?)
> longTermDebt:                              (expected None / 0)
> totalAssets:                               (expected 719,673,000)
> commonStockSharesOutstanding:              (record)
> Number of annualReports (or oldest fiscalDateEnding):
> Paste — the first annualReport object (or the message text):{
    "symbol": "ETD",
    "annualReports": [
        {
            "fiscalDateEnding": "2026-06-30",
            "reportedCurrency": "USD",
            "totalAssets": "719673000",
            "totalCurrentAssets": "305453000",
            "cashAndCashEquivalentsAtCarryingValue": "73628000",
            "cashAndShortTermInvestments": "73628000",
            "inventory": "148463000",
            "currentNetReceivables": "4386000",
            "totalNonCurrentAssets": "414220000",
            "propertyPlantEquipment": "None",
            "accumulatedDepreciationAmortizationPPE": "None",
            "intangibleAssets": "19740000",
            "intangibleAssetsExcludingGoodwill": "19740000",
            "goodwill": "25388000",
            "investments": "None",
            "longTermInvestments": "54244000",
            "shortTermInvestments": "59622000",
            "otherCurrentAssets": "78976000",
            "otherNonCurrentAssets": "None",
            "totalLiabilities": "248212000",
            "totalCurrentLiabilities": "148364000",
            "currentAccountsPayable": "30120000",
            "deferredRevenue": "None",
            "currentDebt": "None",
            "shortTermDebt": "26910000",
            "totalNonCurrentLiabilities": "99847999",
            "capitalLeaseObligations": "120373000",
            "longTermDebt": "None",
            "currentLongTermDebt": "None",
            "longTermDebtNoncurrent": "None",
            "shortLongTermDebtTotal": "120373000",
            "otherCurrentLiabilities": "28604000",
            "otherNonCurrentLiabilities": "4026000",
            "totalShareholderEquity": "471461000",
            "treasuryStock": "None",
            "retainedEarnings": "778478000",
            "commonStock": "None",
            "commonStockSharesOutstanding": "25584000"
        },

> Result (PASS / FAIL / NOTE):pass
```

## VC-14c — Alpha Vantage: dividend record for ETD

**URL:** `https://www.alphavantage.co/query?function=DIVIDENDS&symbol=ETD&apikey=KEY`
**Tests:** whether the free plan gives the dividend record Graham's tests need ("some current dividend"; a payment streak). EDGAR is poor here: ETD stopped tagging dividends per share in 2020.
**Expected:** `{"symbol": "ETD", "data": [ … ]}` with entries carrying `ex_dividend_date`, `declaration_date`, `record_date`, `payment_date`, `amount`, newest first. The record must contain, among the regular 0.39s, the **0.40 special with an ex-date in August 2024** and the **0.25 special with an ex-date in August 2025** (both from the FY2025 results release). Note the newest entry and the oldest date.
**Failure shape:** `{"Information": "… premium …"}` → dividends come from EDGAR's cash-flow line instead (check e).

```
> Time:
> Shape (served / Information / Error Message):
> Newest entry (ex_dividend_date, amount):
> 0.40 special present, ex-date?            0.25 special present, ex-date?
> Oldest ex_dividend_date:                   Rough count of entries:
> Paste — the first three entries (or the message text):{
    "symbol": "ETD",
    "data": [
        {
            "ex_dividend_date": "2026-09-03",
            "declaration_date": "2026-08-19",
            "record_date": "2026-09-03",
            "payment_date": "2026-09-17",
            "amount": "3.0"
        },
        {
            "ex_dividend_date": "2026-08-12",
            "declaration_date": "2026-07-28",
            "record_date": "2026-08-12",
            "payment_date": "2026-08-26",
            "amount": "0.64"
        },
        {
            "ex_dividend_date": "2026-05-13",
            "declaration_date": "2026-04-28",
            "record_date": "2026-05-13",
            "payment_date": "2026-05-27",
            "amount": "0.39"

> Result (PASS / FAIL / NOTE):pass
```

## VC-14d — Alpha Vantage: EPS for ETD (is "reported EPS" GAAP diluted?)

**URL:** `https://www.alphavantage.co/query?function=EARNINGS&symbol=ETD&apikey=KEY`
**Tests:** INCOME_STATEMENT carries no EPS. This endpoint's `annualEarnings[].reportedEPS` is either GAAP diluted (usable) or the company's adjusted figure (not usable for Graham). The 10-K's diluted EPS: **FY2026 1.56 · FY2025 2.01 · FY2024 2.49 · FY2023 4.13**. If `reportedEPS` matches these, AV can supply EPS; if it runs higher (adjusted), EPS comes from EDGAR (`EarningsPerShareDiluted`, or net income ÷ diluted shares when that tag is dimensioned away).

```
> Time:16:00
> Shape (served / Information / Error Message): defaulted to Google search page 
> annualEarnings — 2026-06-30 reportedEPS:          (GAAP diluted 1.56)
>                  2025-06-30 reportedEPS:          (GAAP diluted 2.01)
>                  2024-06-30 reportedEPS:          (GAAP diluted 2.49)
>                  2023-06-30 reportedEPS:          (GAAP diluted 4.13)
> Oldest annualEarnings fiscalDateEnding:
> Paste — the first two annualEarnings entries (or the message text):

> Result (PASS = matches GAAP / NOTE = adjusted / FAIL): fail-
```

## VC-14e — EDGAR: dividends paid (the cash-flow fallback), free

**URL:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000896156/us-gaap/PaymentsOfDividends.json`
**If 404, try:** `…/us-gaap/PaymentsOfDividendsCommonStock.json` — record which tag worked.
**Tests:** a whitelist-free, per-year "did it pay" record. Coarser than per-share (total dollars), but enough for Graham's dividend tests.
**Expected:** 10-K entry start 2024-07-01, end 2025-06-30 → about **50,100,000** (regular $39.9m + special $10.2m per the FY2025 release). FY2026 (start 2025-07-01, end 2026-06-30): no acceptance value — record it.

```
> Time:  16:05
> Served? (JSON / 404 / other):  <Error>
<Code>NoSuchKey</Code>
<Message>The specified key does not exist.</Message>
<Key>api/xbrl/companyconcept/CIK0000896156/us-gaap/PaymentsOfDividends.json`</Key>
<RequestId>(elided)</RequestId>
<HostId>(elided)</HostId>
</Error>            Tag that worked:neither -second defaulted togooglesearch page 
> val for start 2024-07-01, end 2025-06-30:            (expected ≈ 50,100,000)
> val for start 2025-07-01, end 2026-06-30:            (record)
> Result (PASS / FAIL / NOTE):fail
```

## VC-14f — EDGAR, for the record: the two-source agreement in your browser

My reads from VC-13's closure, repeated by you so the evidence is yours. Both free.

**URL 1:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000896156/us-gaap/ProfitLoss.json` → entry start 2025-07-01, end 2026-06-30, form 10-K → `val: 39883000` (= AV's FY2026 netIncome).
**URL 2:** `https://data.sec.gov/api/xbrl/companyconcept/CIK0000896156/us-gaap/RevenueFromContractWithCustomerExcludingAssessedTax.json` → same period → `val: 579487000` (= AV's FY2026 totalRevenue).

```
> Time:16:06
> ProfitLoss FY2026 val:                    (expected 39,883,000)
> Revenue FY2026 val:                       (expected 579,487,000)
> Result (PASS / FAIL):Pass -first url---{
  "cik": 896156,
  "taxonomy": "us-gaap",
  "tag": "ProfitLoss",
  "label": "Net Income (Loss), Including Portion Attributable to Noncontrolling Interest",
  "description": "The consolidated profit or loss for the period, net of income taxes, including the portion attributable to the noncontrolling interest.",
  "entityName": "Ethan     Allen Interiors Inc.",
  "units": {
    "USD": [
      {
        "start": "2009-07-01",
        "end": "2010-06-30",
        "val": -44316000,
        "accn": "0001437749-12-008602",
        "fy": 2012,
        "fp": "FY",
        "form": "10-K",
        "filed": "2012-08-16",
        "frame": "CY2010"
      },
      {
        "start": "2010-07-01",
        "end": "2011-06-30",
        "val": 29250000,
        "accn": "0001437749-12-008602",
        "fy": 2012,
        "fp": "FY",
        "form": "10-K",
        "filed": "2012-08-16

"Secon url gave 
```

## Closure (I fill this)

| Check | What it decides                                                   | Result |
| ----- | ----------------------------------------------------------------- | ------ |
| a     | Prices for the small-cap tier come from AV compact, in rotation   |        |
| b     | Balance-sheet lines for tests 2, 7 and tangible book come from AV |        |
| c     | Dividend record from AV (else EDGAR cash flow, e)                 |        |
| d     | EPS from AV (if GAAP) or from EDGAR                               |        |
| e     | The dividend fallback exists                                      |        |
| f     | Two-source agreement is on your record                            |        |

**Decision rule, set in advance.** a PASS → decision 14 closes: AV as source for the small-cap tier, EDGAR as audit trail. a FAIL → prices need another source; accounts still proceed. b lines that reconcile → used; lines that don't → taken from EDGAR. c PASS → AV dividends; c FAIL → e. d matches GAAP → AV EPS; otherwise EDGAR EPS with the net-income ÷ shares fallback.

**Acceptance sources (FY2026 Form 10-K, filed 3 Sept 2026, accession 0001437749-26-029578):**

- Balance sheet at 30 June 2026 (USD thousands): cash 73,628; investments ST 59,622, LT 54,244; inventories 148,463; total current assets 305,453; goodwill 25,388; intangible assets 19,740; total assets 719,673; total current liabilities 148,364; no debt line; total liabilities 248,212; Ethan Allen-only equity 471,546; noncontrolling interests (85); total shareholders' equity 471,461: https://www.sec.gov/Archives/edgar/data/896156/000143774926029578/R2.htm
- Income statement FY2026 / FY2025 / FY2024 (USD thousands except per share): net sales 579,487 / 614,649 / 646,221; gross profit 354,771 / 372,121 / 393,062; operating income 45,016 / 61,988 / 77,991; net income 39,883 / 51,596 / 63,816; basic EPS 1.56 / 2.02 / 2.50; diluted EPS 1.56 / 2.01 / 2.49; diluted shares 25,584 / 25,634 / 25,644: https://www.sec.gov/Archives/edgar/data/896156/000143774926029578/R4.htm
- FY2023 diluted EPS 4.13: EDGAR `EarningsPerShareDiluted`, FY2025 10-K comparative.
- Specials: $0.40 paid Aug 2024, $0.25 declared 29 July 2025 — FY2025 results release (Exhibit 99.1): https://www.sec.gov/Archives/edgar/data/896156/000143774925023973/ex_845343.htm
- One known AV normalisation difference, for the record: AV's FY2026 `operatingIncome` 44,685,000 vs the 10-K's 45,016; revenue, gross profit and net income agree exactly. The screens don't use operating income.

*Education, not advice. ETD is a data-spine test case, not a pick.*
