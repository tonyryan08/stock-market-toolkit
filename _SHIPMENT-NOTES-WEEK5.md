# Week 5 Shipment — Apply Notes (v0.5.1, post-review)

**Follow in order. Don't commit this file** (untick it in Desktop, or delete it when you're done).

## This zip supersedes the earlier week-5 zip

An independent review against *The Intelligent Investor* ch. 14 was run on the first build before anything was applied; the findings and their resolution are in `docs/reviews/week-05-independent-review.md`, which ships in this zip. If you already extracted the first zip, extract this one over it — it simply overwrites. Three things changed that you will see on screen: negative book value is now a **fail** on test 7 (McDonald's, Home Depot, Starbucks, Boeing); financial companies (JPM, BAC, V) **skip** test 2 by Graham's own rule and are scored out of six; and the books page's P/E is now the **three-year average**, so it matches the screen.

## What this is

The Graham screen: the seven defensive-investor tests from *The Intelligent Investor* ch. 14, run over the cached books, plus a printable checklist card generated from **the same rules table** (`src/lib/graham.ts`), so the card and the screen cannot disagree.

**New:** `src/lib/graham.ts` (the rules + evaluation) · `src/lib/graham.test.ts` (27 hand-checkable cases) · `docs/lessons/week-05.md` · `docs/lessons/week-05-the-graham-checklist.pptx` · `docs/reviews/week-05-independent-review.md`
**Changed:** `src/index.ts` (`/screen`, `/card`, `/api/screen/graham`; books page P/E on the 3-year average; negative book value shown as a fail) · `src/lib/ratios.ts` + `ratios.test.ts` (adds `epsAvg3`/`pe3`) · `src/landing.ts` (week-5 stamp) · `package.json` (v0.5.1; your `description` line restored) · `tsconfig.json` (keeps test files out of the Worker type-check)

**No migration, no new packages.** So no `npm install` is needed, and npm won't ask you to approve scripts again.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`. Review the diff in Desktop.
2. `npm test`. **Expect 38 passed** (11 ratio + 27 screen).
3. `npm run dev` → **localhost:8787/screen** (your local books from week 4 feed it) → then **/card**.
4. Hand check (the syllabus exit check): hover one ✗ on a famous company and confirm the number against its `/fundamentals/` page.
   **Also, once:** open `/fundamentals/KO` and confirm the Dividends/share row has a value in all five years. That proves the dividend record is stored newest-first; if it were blank, every long-standing payer would fail test 4 silently.
5. `npm run deploy` → open the live `/screen` on your phone. Print the live `/card` for the kit (Print → Save as PDF).
6. Commit *"Week 5: Graham screen + checklist card"* → push.

## The rules as built (decision log #11)

| # | Test | Graham (ch. 14) | We apply | Adapted? |
|---|---|---|---|---|
| 1 | Size | Sales ≥ $100m (1971) | Revenue ≥ $800m (×~8 for US inflation) | yes |
| 2 | Strength | CR ≥ 2; LT debt ≤ net current assets | Same for industrials. **Skipped** for Financial Services (Graham applied only the price tests to financials, p. 361); not counted; they score out of 6 | no |
| 3 | Stability | Earnings in each of 10 yrs | Positive EPS in all 5 years held | yes (#8) |
| 4 | Dividends | 20 yrs unbroken | 10 consecutive calendar years (record holds ~15) | yes |
| 5 | Growth | +⅓ EPS over 10 yrs, 3-yr averages | ≥ +9.0% between 2-yr averages — Graham's +⅓ pro-rated to our window (a stricter midpoint reading would be 13%; 9% chosen) | yes |
| 6 | P/E | ≤ 15× avg EPS of last 3 yrs | Same | no |
| 7 | P/B | ≤ 1.5, or P/E × P/B ≤ 22.5 | Same (using the 3-yr P/E). Negative book value = fail | no |

**Verdicts:** survivor = every applicable test passed (7/7, or 6/6 for financials) · near miss = exactly one fail · fails = two or more · incomplete data = a figure is missing on a test that could still change the answer. **Expect very few survivors** in a mega-cap universe. That's by design, and lesson 5 is built around it; Graham himself got 5 of 30 in 1970.

## Paste 1 — BUILD-LOG entry

```markdown
## Week 5 — The Graham checklist · logged [date]

**Designed (Claude chat).** One rules table (src/lib/graham.ts) drives the screen, its column
headers and the printable card, so card and code cannot disagree (syllabus wk-5 promise).
Seven ch. 14 tests; four adapted openly where free data is shorter than Graham's windows
(stability 5y, dividends 10y, size inflated ×~8 to $800m, growth at Graham's pace over our
3-yr span = +9.0%); P/E uses the 3-yr average EPS, as Graham specified. Financials marked
N/A on test 2 rather than failed. The screen is computed on request from three batched D1
queries, with no new tables or writes.

**Reviewed (independent, same day).** Second model read ch. 14 from the course PDF and the shipped zip,
ran probe cases, reported 14 findings before anything changed (docs/reviews/). Three correctness
fixes: negative book value scored as a fail (was N/A); books-page P/E moved to Graham's 3-year
average so it agrees with the screen; financials skip test 2 by sector (Graham p. 361) and score
out of 6. Decisions: growth hurdle stays 9% (pro-rated, documented); a company passing every
applicable test is a survivor. Wording fixes (1972 not 1949; utilities vs financials), CPI cited,
teaching additions from pp. 354, 367, 374, 375.

**Built (Claude, sandboxed).** graham.ts + 27 tests (38 in total with ratios); /api/screen/graham,
/screen (tally, ✓/✗/– grid with hover detail, sticky company column for phones), /card
(print-ready, adapted rules flagged with Graham's originals); books pages link to the screen;
landing stamped wk 5; lesson 5 + deck.

**Verified — machine (sandbox).** Type-check clean; 38/38 tests. Five synthetic companies
built to hit every path: survivor 7/7 (VAL), bank skipped on test 2 → near miss 5/6 (BNK),
no-dividend (NOD), expensive + weak (PRC), loss-maker with negative book → explicit fail (LSS).
All verdicts matched the hand predictions. Screen served in 7–66 ms. Desktop, phone-width and
card pages visually checked before and after the patch.

**Verified — hand (gates "done").**
- [ ] `npm test` 38/38 on my machine
- [ ] KO books page shows dividends in all five years (dividend record order confirmed)
- [ ] Local /screen over real books; one ✗ reconciled against its /fundamentals/ page
- [ ] Deployed; live /screen on the phone; /card printed for the kit
- [ ] Survivor count noted for the lesson pre-check
```

## Paste 2 — decision log row

```markdown
| 11 | Graham screen rules | **DECIDED (12 Oct 2026, after independent review).** Ch. 14's seven tests in src/lib/graham.ts, a single source for the screen, the card and the books-page chips. Adapted openly: stability 5y (#8); dividends 10 consecutive calendar years; size ≥ $800m revenue (1971's $100m × CPI ≈ 8); growth ≥ +9.0% between 2-yr averages — Graham's +⅓/10y pro-rated (midpoint-faithful reading would be 13%; 9% chosen). P/E on 3-yr average EPS everywhere; P/B ≤ 1.5 or P/E×P/B ≤ 22.5; negative book value fails. Financials skip test 2 (Graham p. 361) and score out of 6; a company passing every applicable test is a survivor. Incomplete data is labelled, never scored as a fail. |
```

## Week 6 needs from this week

Nothing extra. "Explain this stock" will read the books page and the screen verdict as its grounding facts. Week 6's one new dependency is a Claude API key, which goes in via `wrangler secret put`. The week-6 notes will walk through it in the API-keys-guide style.
