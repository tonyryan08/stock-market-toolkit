# Patch v0.6.0: the enterprising screen (15 Oct 2026)

**Follow in order. Don't commit this file.** No migration, no new packages, no `npm install`. `wrangler.jsonc` is not in the zip, so your crons and database id stay as they are.

## What this patch does

1. **Graham's second investor.** `/screen/enterprising` (and `/api/screen/enterprising`) runs ch. 15's six requirements (pp. 385–386) over the same books as the defensive screen. The six are: a multiple of nine or less first; then current ratio ≥ 1.5 and debt ≤ 110% of working capital; no deficit in five years; some current dividend; latest EPS above five years ago; price under 120% of net tangible assets. There is **no size test.** A company passing all six is a **candidate**, the list from which Graham expected "a third selection … one out of five" by judgment. Financial companies skip test 2 and are scored out of 5. The rules live in one table (`ENTERPRISING` in `src/lib/graham.ts`) that drives the screen, the column headers and the new **page 2 of `/card`**, which prints on its own sheet. The two screens link to each other, and the landing page's week-5 row and "New this week" panel point to both.
2. **The sweep's ceiling stop is fixed** (the bug behind 14 Oct's unnamed C, CARR and F). The sweep now keeps room inside `--max-calls` for one profile call per green, so a budget stop still fetches names and sectors. Only an FMP limit or a bad key skips the profiles. I verified this against a stubbed FMP: an 8-name list with a 10-call ceiling stopped probing at 4, profiled both greens (sector included), and the second run finished the rest with all four named.
3. **Tests: 63** (was 47): 16 new hand-checked cases, all on paper-checkable numbers. They cover each threshold at its edge (9.0 passes and 9.1 fails; 110% passes and 111% fails; 366 days passes and 367 fails; 1.19× passes and 1.20× fails), a loss year, negative tangible book, the bank skip, "not yet held" intangibles showing as incomplete, and the no-size-test contrast with the defensive screen.
4. Tutor notes: `docs/lessons/the-enterprising-screen.md`. It has the relaxed-versus-stricter table, Graham's definitions with pages, and ETD worked through from its FY2026 10-K (fails 1, 5 and 6; tangible book 1.20×, a whisker over the line).

**What you'll see tonight.** The P/TBV column shows "?" for most companies until the accounts rotation (15 a night since v0.5.3) has refetched them with goodwill and intangibles. By Saturday the 38 are complete. Rows that already fail two tests still say "fails"; that is the defensive screen's rule too.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`; review in Desktop. `npm test` → **expect 63 passed**.
2. `npm run deploy`.
3. Open `/screen/enterprising` and `/card` (scroll to the second card). Print preview of `/card` should show two pages.
4. Commit *"v0.6.0: the enterprising screen (ch. 15), card page 2, sweep keeps room for profiles"* → push. Commit `docs/lessons/the-enterprising-screen.md` and the VC-13 and VC-14 closures with it.

## Paste: BUILD-LOG

```markdown
Week 5½: the enterprising screen · logged 15 Oct 2026
**Built (v0.6.0).** Graham's ch. 15 winnowing (pp. 385–386) as a second rules table on the same
engine: P/E ≤ 9 first, then CR ≥ 1.5 & LTD ≤ 110% WC, no deficit in 5 yrs, a dividend in the
last 12 months, latest EPS > 5 yrs ago, price < 1.2× tangible book; no size test. All-pass =
"candidate" (Graham's "third selection" by judgment). /screen/enterprising, /api/screen/enterprising,
/card page 2. Sweep fix: ceiling stop reserves profile calls (14 Oct's unnamed C/CARR/F).
63 tests. Verified in sandbox: fixture small cap 6/6 candidate; bank scored /5; pre-0004 rows
show "?" on P/TBV; pages checked at desktop and phone widths; print splits the card onto two pages.
**Data spine.** VC-13 closed (EDGAR serves ETD free with history; AV accounts agree with the
10-K). VC-14a: AV TIME_SERIES_DAILY compact served for ETD (last refreshed 2026-10-14, close
20.06). Decision 14 DECIDED. VC-14 b–f pending (line-by-line source choice).
```

## Paste: decision log (replace rows 13 and 14)

```markdown
| 13 | Two investors | **DECIDED (15 Oct 2026), shipped v0.6.0.** Graham's enterprising screen (TII ch. 15, pp. 385–386) beside the defensive one, on one engine. Effort, not risk appetite (p. 6). One adaptation: the multiplier uses the latest fiscal year, not the trailing 12 months. Survivors are called candidates (p. 386: the third selection is judgment). |
| 14 | Two data spines | **DECIDED (15 Oct 2026).** FMP for the 38 it serves. For the small-cap tier: Alpha Vantage as source (TIME_SERIES_DAILY compact in rotation, which VC-14a confirmed free; INCOME_STATEMENT/BALANCE_SHEET about once a year per company), EDGAR XBRL as audit trail and per-company verification probe. Rejected as primary: EDGAR, because tags drift within a filer and dimensioned facts (e.g. dual-class EPS) are absent. VC-14 b–f decide which line comes from which source; the build follows them. |
```
