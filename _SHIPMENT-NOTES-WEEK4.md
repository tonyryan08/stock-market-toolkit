# Week 4 Shipment — Apply Notes

**Follow in order; don't commit this file** (untick in Desktop or delete when done).

## What this is

The books, opened: fundamentals ingestion riding the nightly cron, a tested ratio engine, and a books page beside every chart. Three new data streams per company — income statement, balance sheet, dividend record — all through the same M-shape error handling, all inside the same budgets.

New: `migrations/0003_fundamentals.sql` · `src/lib/ratios.ts` · `src/lib/ratios.test.ts` · `docs/lessons/week-04.md`
Changed: `src/providers.ts` (three statement fetchers through one classifier) · `src/jobs/nightly.ts` (fundamentals phase: 12 stalest companies/night × 3 calls, skipped whenever the price phase hits a wall) · `src/index.ts` (`/api/fundamentals/:ticker` + the `/fundamentals/:ticker` books page, cross-linked with the chart page) · `src/landing.ts` (week-4 stamp) · `package.json` (vitest; `npm test`)

**Budget arithmetic:** fundamentals add ≤ 36 provider calls and ~800 inserts (≈1.6k metered writes) on the busiest night — both an order of magnitude inside the allowances. Full universe gains books within ~3 nights, then refreshes on a 30-day staleness rotation.

## VC-12 pre-flight (5 FMP calls, do before applying)

VC-07 verified income statements only. Two endpoints are new — test them in the browser with your key, record verbatim results in the verification record:

| Call | Expect |
|---|---|
| `financialmodelingprep.com/stable/balance-sheet-statement?symbol=AAPL&apikey=KEY` | 5 annual periods, fields incl. totalCurrentAssets, totalStockholdersEquity |
| same, `symbol=PFE` | 5 periods |
| `financialmodelingprep.com/stable/dividends?symbol=AAPL&apikey=KEY` | an array with dates + dividend amounts |
| same, `symbol=KO` | long record |
| same, `symbol=TSLA` | empty or near-empty (Tesla pays none — a good negative control) |

Any M-6 "Premium" refusal here → still apply (the code degrades to `partial` per symbol and says so) — but post me the wording before week 5, since the screener leans on these.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`; review in Desktop.
2. `npm install` (adds vitest), then **`npm test` — expect 25 passed**. That's the course's first test suite; the exit-check arithmetic lives in it.
3. `npx wrangler d1 migrations apply stock-market-db --local`
4. **Local look:** `npm run dev:cron` → with your real keys, trigger one run — **note the doorbell moved**: wrangler ≥4.145 answers at
   `http://localhost:8787/cdn-cgi/handler/scheduled?cron=30+22+*+*+*`
   (the old `/__scheduled` now 404s — update your bookmark; browser route still preferred). Watch it fetch fundamentals for the 12 stalest; then open `localhost:8787/fundamentals/AAPL` — four Graham-bar cards and the five-year table.
5. `npx wrangler d1 migrations apply stock-market-db --remote`
6. `npm run deploy` — production's books fill over the next ~3 nightly runs (12 companies/night). Patience remains the feature; pre-check before class per the lesson's tutor notes.
7. Commit *"Week 4: fundamentals, ratio engine + tests, books pages"* → push.

## Paste 1 — BUILD-LOG entry

```markdown
## Week 4 — What is a company worth? · logged [date]

**Designed (Claude chat).** Three fundamentals streams (income, balance, dividends) ride the
existing nightly cron as a second phase: 12 stalest companies/night × 3 calls, 30-day staleness
rotation, skipped automatically when the price phase hits auth/rate/write walls. Ratios computed
in our own tested code from stored raw lines — never provider-precomputed — so week 5's checklist
card and the code cannot disagree. fiscal_year stored as TEXT; no extra indexes (0002's lesson).
Dividend record ingested now for week 5's criterion. Source texts lodged: TII 2003 revised ed.
(page anchors in lesson 4), Security Analysis 1940 2nd ed.; Zweig-75 framing (digital Mr. Market).

**Built (Claude, sandboxed).** Migration 0003 (fundamentals_annual, dividends, 2 ticker columns);
three fetchers through one M-shape classifier with multi-spelling field fallbacks; ratio engine
(src/lib/ratios.ts) + 25 passing tests (`npm test`); /api/fundamentals + books page with
Graham-bar verdict chips, plain-word glosses, five-year table incl. dividend row; chart/books
cross-links; landing stamped wk 4.

**Verified — machine (sandbox; provider network blocked by design).** Type-check + 25/25 tests
green. Migration applies; schema matches code contract (13-column insert proven). Fundamentals
API hand-check vs paper: CR 1.06, P/E 20.2, P/B 39.9, growth 15.4% — all reconcile. Books page
renders; loss-year P/E shows a dash by design; three distinct no-data messages. Scheduled run
with bad key: price phase aborts after ONE call and summary records "fundamentals":"skipped".
Found in passing: wrangler ≥4.145 moved the scheduled-test endpoint to
/cdn-cgi/handler/scheduled (docs and bookmark updated).

**Verified — hand (gates "done").**
- [ ] VC-12 pre-flight recorded (balance-sheet + dividends endpoints, incl. TSLA negative control)
- [ ] `npm test` 25/25 on my machine
- [ ] Local run fetched real fundamentals; /fundamentals/AAPL reconciled BY EYE against Apple's
      latest annual report (the syllabus exit check)
- [ ] Migrations applied remote; deployed; books filling nightly (universe covered in ~3 nights)
- [ ] Live /fundamentals page on the phone; fundamentals_status visible in /api/universe
```

## Paste 2 — decision log additions (append rows)

```markdown
| 9 | Fundamentals cadence | **DECIDED (5 Oct 2026).** Accounts ride the nightly cron as a second phase: 12 stalest symbols/night × 3 calls (income, balance, dividends), 30-day staleness, auto-skipped when the price phase hits any wall. Ratios computed in-house from raw lines (tested, `npm test`) — never provider-precomputed. |
| 10 | Dividend record source | **DECIDED (5 Oct 2026).** FMP `/stable/dividends` per symbol (~15y of ex-dates), stored raw; week 5's dividend-record criterion counts calendar years from it. VC-12 verifies the endpoint; TSLA is the standing negative control. |
```

## Week 5 needs from this week

Books filled for the full universe (3 nights), VC-12 recorded, and one by-eye reconciliation of a books page against a real annual report. Then the screener is a SELECT over data we already trust — and the Graham checklist card prints from the same thresholds the chips already show.

*Context noted for the record: course audience confirmed as savers-to-investors (~€10k growing toward ~€50k, platform-agnostic on geography); Budget 2027 lands 7 Oct — week 11's costs/tax lesson absorbs whatever changed, and the lesson-4 tutor notes carry a one-line holding position.*
