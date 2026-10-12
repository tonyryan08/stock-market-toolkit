# Independent review — Week 5 shipment (Graham screen)

**Reviewer:** Claude (Fable 5.1), reviewing a build produced by Claude (Opus 5.5) · **Date:** 12 Oct 2026
**Scope:** `src/lib/graham.ts`, `graham.test.ts`, the `/screen` and `/card` routes in `src/index.ts`, `docs/lessons/week-05.md`, the week-5 deck — checked against *The Intelligent Investor* ch. 14 (course copy, 2003 revised ed., pp. 347–366) and Zweig's commentary (pp. 367–375), read in full from the uploaded PDF.
**Method:** read the source text first; then the shipped zip (not the sandbox copy); then eight probe cases run against the shipped code to confirm each suspected behaviour. Findings are reported, not fixed.

## Verdict

**Ship-worthy after a small patch. Do not regenerate.** The seven thresholds as coded match Graham's text exactly (2:1 current ratio; long-term debt ≤ working capital; 15× the *three-year average* earnings; 1.5× book, or P/E × P/B ≤ 22.5 with inclusive boundaries). Zweig's commentary specifically endorses the trailing three-year P/E the screen uses. The single-rules-table design does what it promises for the card and the screen. The 31 tests pass. Three correctness findings need fixing before class; the rest are fidelity, wording and teaching improvements.

## Findings

| # | Sev | Finding | Evidence | Graham / source | Recommendation |
|---|---|---|---|---|---|
| 1 | **High** | **Negative shareholders' equity is scored N/A on test 7, not a fail.** The verdict can then read "not screenable" instead of "fails". | Probe P1: equity −500 → `price_assets: na, "Book value not positive or not reported"`, verdict `insufficient 6/7`. Live in this universe: McDonald's, Home Depot, Starbucks and Boeing all report negative equity. | "Current price should not be more than 1½ times the book value last reported" (p. 349). A negative book value fails this on any reading. | Score equity ≤ 0 as **fail** with detail "Negative book value — no multiple of assets supports the price". Reserve N/A for *missing* data. Apply the same fix to the week-4 books page chip (`ratios.ts` → `pb`). |
| 2 | **High** | **Books page and screen disagree on test 6.** The week-4 books page computes P/E on the latest year's EPS and shows a "Graham bar ≤ 15" chip; the screen (correctly) uses the three-year average. Same company, two verdicts. | Probe P4: EPS 10 / 12 / 12.5, price 160 → books page P/E 16.0 (chip: fail); screen P/E 13.9 (pass). | "not more than 15 times average earnings of the past three years" (p. 349); Zweig p. 374: calculate it yourself "using Graham's formula of current price divided by average earnings over the past three years". | Make the books page's P/E and P/E×P/B chips use the three-year average, labelled "P/E (3-yr avg)". The "cannot disagree" promise then holds across books page, screen and card. |
| 3 | Medium | **Test 2's N/A for financials is keyed on missing data, not on sector.** If FMP populates current assets/liabilities for a bank (it sometimes does, with figures that mean nothing for a bank), JPM/BAC get scored on a meaningless current ratio. Also, the N/A message names "card networks"; Visa and Mastercard report current items and are screened normally. | `graham.ts` lines 206–210: N/A only when `currentRatio === null \|\| ltDebtToWc === null`. | Criterion 2 is explicitly "For industrial companies" (p. 348). On financials: "no very helpful remarks to offer … other than to counsel that the same arithmetical standards for price in relation to earnings and book value be applied" (p. 361). | Key test 2's N/A on sector (Financial Services → always N/A), cite Graham's words in the detail, drop "card networks". **Judgement call to settle:** a bank passing all six applicable tests currently reads "not screenable" (probe P2). Graham would apply the price tests and count the result. Consider a verdict "passes all 6 applicable" shown distinctly from a 7/7 survivor. |
| 4 | Medium | **The growth test's "same pace" claim is only true on a headline reading.** Graham's "+⅓ in ten years using three-year averages at the beginning and end" compares averages whose midpoints are **7** years apart, not 10. The code pro-rates over 10 (→ 9.0%); the midpoint-faithful conversion to our 3-year span is **13.1%**. | Probe P3: `requiredGrowthPct = 9`; 10-yr-span equivalent 9.0%; 7-yr-midpoint equivalent 13.1%. | p. 348 criterion 5. Zweig (p. 371): Graham's hurdle is "very low" (< 3%/yr); he floats 50% per decade as "a bit less conservative". | Either (a) adopt 13% and keep the "same pace" wording, or (b) keep 9% and reword the card: "Graham's +⅓ over ten years, pro-rated to our three-year window". State the choice in decision log #11. (a) is the more faithful reading. |
| 5 | Medium | **Lesson and deck overstate Graham's treatment of financials.** "Graham treated financials separately" / "handled banks and utilities with separate rules". | `week-05.md` lines 60, 80; deck slide 10. | Separate rules exist for **utilities** (size $50m total assets; debt ≤ 2× equity, p. 348). For **financials** Graham gives no separate rules — only the price tests (p. 361). | Reword: "Graham's financial-strength test is written for industrial companies; for banks he applied only the price tests." |
| 6 | Low | "Seven tests from 1949" (deck title, slide 9; lesson objective 4). The criteria as worded — $100m sales in 1971 dollars — are from Graham's 1971–72 revision. | Course copy p. vi: "The text reproduced here is the Fourth Revised Edition, updated by Graham in 1971–1972". | — | "Graham's seven tests" or "from Graham's 1972 revision". The course trades on provenance; this one is cheap to get right. |
| 7 | Low | The ×8 inflation factor on the size test is correct but uncited. | BLS CPI-U annual average: 1971 = 40.5; 2025 ≈ 322 → ×7.95 → $795m. Code: $800m. | Graham: "All our minimum figures must be arbitrary" (p. 348). Zweig's 2003 update used **market cap ≥ $2bn** instead (p. 369). | Add the CPI source line in `graham.ts` and on the card. Optionally note Zweig's market-cap alternative on the card as a second reading. |
| 8 | Low | Utilities rules not implemented (size by total assets; debt ≤ 2× equity). No utilities in the universe, so no effect today. | `universe-candidates.txt` contains none. | p. 348. | One comment in `graham.ts`: "utilities would need Graham's separate rules; none in the universe". |
| 9 | Low | Dividend streak counted by calendar year of ex-date: a dividend **suspended in mid-2025** still reads as an unbroken record in Oct 2026. | Probe P5: payments 2015–2025, none since → "11 consecutive years paid", pass. (Boeing's 2020 suspension and Disney's 2020–23 gap are caught correctly.) | "Uninterrupted payments" (p. 348). | Acceptable if documented. Tighter: also require a payment within the last ~15 months. |
| 10 | Low | The stored dividend record is capped at **60 rows**, not years: 15 years for quarterly payers, 5 for a monthly payer, 60 for annual. The `dividendYears: 10` threshold silently depends on this. | `nightly.ts` line 326. No monthly payers in the universe. | — | Comment the dependency beside the threshold; consider storing by date (≥ 21 years) in a later migration. |
| 11 | Low | Book value per share uses **weighted-average diluted shares** (income statement), not period-end shares outstanding. | `graham.ts`, `ratios.ts`. | "book value last reported" (p. 349). | Note only; small bias, consistent across companies. |
| 12 | Low | `rankScreen` test comments are wrong: price 80 fails **both** P/E and P/B (product 34.2), so "AAA" is 5/7 "fails", not a near miss, and "CCC" is 4/7. The assertion still passes (ordering by passes), but the near-miss tier is exercised only by the size test. One garbled comment in the 22.5-product test. | Probe P7. | — | Fix the comments; add an explicit near-miss ordering case. After fixes 1 and 3, add tests for negative equity and a sector-keyed bank. |
| 13 | Low | Tally label "fail 2+ tests" also catches rows with one fail and one N/A. | Probe P6: bank with pricey P/B → `fails 4/7`, 2 fails + 1 N/A — fine; but 1 fail + 1 N/A would also land here. | — | Relabel "fails" or "2+ tests failed or N/A". |
| 14 | Low | Each `/screen` load reads ~2,100 D1 rows. Free tier 5M rows read/day — a class of 20 is fine, but the project has been metered before, and the syllabus's own week-5 line ("caching hot results, Cache API or KV") isn't done. | `loadScreen`. | — | Optional: wrap the screen result in a 1-hour Cache API entry. |

## Verification item (not a finding — settles a silent risk)

The dividends ingestion keeps `rows.slice(0, 60)` **assuming FMP returns newest-first**. If it returned oldest-first, long-standing payers (KO, JNJ, PFE) would hold 1960s rows, read "0 consecutive years", and fail test 4 silently. One look settles it: on the **KO books page**, the "Dividends/share" row must show values in all five fiscal years. If it does, the order is right. Do this before class.

## What was checked and found correct

- All seven thresholds vs. pp. 348–349: match, including inclusive boundaries ("not more than") and the 22.5 product with the 3-year P/E.
- Stability uses "some earnings" = positive EPS, every year held; N/A below five years. Correct.
- Dividends: zero and null amounts don't count; a new payer (Google/Meta, 2024) fails rather than errors. Correct.
- Loss-maker: negative 3-year average EPS → no meaningful P/E → fail (not N/A). Correct, and Graham-consistent.
- Output escaping on the screen page (names from the provider) is safe.
- Page references in lesson and deck (ch. 14 p. 347; commentary p. 367; ch. 20 p. 512) match the course copy.
- "Expect very few survivors" is consistent with Graham's own result: **5 of 30** DJIA stocks passed all seven at end-1970 (p. 354).

## Teaching additions worth making (from the source text)

- **p. 354 — Graham's own screen result.** Only American Can, AT&T, Anaconda, Swift and Woolworth passed. Anaconda's Chilean mines were expropriated within the year; Woolworth declined for decades. It is the strongest possible evidence for "few survivors" *and* for "passing ≠ safe" — Horace in one slide.
- **p. 375 — Zweig's due diligence.** "Read at least five years' worth" of reports (which is exactly the books page), and: if you won't, "you are too defensive to be buying individual stocks at all. Get yourself out of the stock-picking business and into an index fund, where you belong." Plus his 90% index / 10% picks suggestion (p. 367). For a room of savers with €10–50k, that is the honest frame, and it matches the course's "a survivor earns a reading" line.
- **p. 374 — intangibles.** Zweig himself concedes that brands, patents and goodwill are excluded from book value, so "most companies today are priced at higher price-to-book multiples than in Graham's day". Slide 10's objection comes from inside the book; cite it.

## Decisions required before the patch

1. Growth: 13% (midpoint-faithful) or 9% (pro-rated) — finding 4.
2. Banks passing all six applicable tests: "passes all applicable" or "not screenable" — finding 3.

Everything else is a straight fix.

---

## Resolution — patch applied 12 Oct 2026 (v0.5.1)

Decisions taken by the tutor: **(a)** growth hurdle stays at 9%, card reworded to "pro-rated" (it is an earnings-growth hurdle, not a return target); **(b)** a company that passes every test that applies to it is a survivor — skipped tests never count against it; "incomplete data" is reserved for genuinely missing figures and labelled so it does not read as a fail.

| # | Status | What changed |
|---|---|---|
| 1 | **Fixed** | Negative book value → `fail` on test 7 with the per-share figure in the detail; books page shows "neg. book" with a fail chip. N/A now means missing data only. |
| 2 | **Fixed** | `ratios.ts` gains `epsAvg3` and `pe3`; the books page's P/E card and P/E×P/B chip use the three-year average, labelled "P/E (3-yr avg)", with the latest-year P/E shown in the gloss. Books page, screen and card now agree. |
| 3 | **Fixed** | Test 2 is skipped by **sector** (Financial Services), with Graham's p. 361 reason in the detail; "card networks" wording removed. New outcome `skip` (not counted) alongside `na` (data missing). Financials are scored out of 6; a bank passing six is a survivor. |
| 4 | **Documented** | 9% kept by decision. Derivation and the 13.1% alternative recorded in `graham.ts`; card and lesson say "pro-rated"; decision log #11 updated. |
| 5 | **Fixed** | Lesson, tutor notes and deck reworded: separate rules for utilities; price tests only for financials (p. 361). |
| 6 | **Fixed** | "1949" → "Graham's 1972 revision" on the screen lede, deck title and slide 9, lesson objective 4 and method line. |
| 7 | **Fixed** | CPI-U source cited in `graham.ts`; card now reads "× US inflation since 1971 (CPI ≈ ×8)" and notes Zweig's $2bn market-cap alternative. |
| 8 | **Documented** | Utilities rule noted as not implemented in the `graham.ts` header. |
| 9 | **Documented** | Calendar-year streak limitation noted in the header. |
| 10 | **Documented** | 60-row dependency noted beside the threshold. |
| 11 | **Documented** | Weighted-average-shares basis noted in the header. |
| 12 | **Fixed** | Test comments corrected; `rankScreen` test now exercises a true near miss; new tests for negative equity, sector-keyed skip, bank survivor 6/6, bank near miss 5/6, incomplete data, and two-fails-beat-N/A. Suite: 38 tests (27 screen + 11 ratios), all passing. |
| 13 | **Fixed** | Tally relabelled: "all tests passed · one fail · fail two or more · incomplete data"; score column shows passes/applicable. |
| 14 | **Deferred** | Screen-result caching left for a later week; row reads are well inside the free tier for a class. |
| Verify | **Open — tutor** | KO books page: Dividends/share row populated for all five years confirms the dividend record is stored newest-first. |

Teaching additions made: Graham's 5-of-30 result (p. 354) on the Horace slide and in lesson 0:40; Zweig's five-years-of-reports rule and index-fund line (p. 375) and 90/10 compromise (p. 367) on the limits slide and in lesson 1:15; Zweig's own intangibles concession (p. 374) cited on slide 10 and in the pairs exercise.

Re-verified after patch: type-check clean; 38/38 tests; sandbox screen over the five synthetic companies — bank now `near_miss 5/6` with test 2 skipped, loss-maker's negative book an explicit fail, books page P/E equals the screen's.
