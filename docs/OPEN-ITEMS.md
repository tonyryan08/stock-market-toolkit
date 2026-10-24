# Open items — the register

One line per finding, recommendation, deferral or "later", wherever it was raised (a review, a receipt, a conversation, a verification check). Nothing is closed by being built: **built** means the code or document shipped and the tests pass; **verified** means the VC closure is in `docs/data-provider-checks.md`; **done** means both. An item leaves this table only by being done, or by a recorded decision not to do it. IDs are kept for life; the source column says where the item came from (a review id such as S12, a VC, an incident, a patch note).

Read the top block first; it is the state of the project on the date shown.

## State — 23 Oct 2026, 23:00

| | |
|---|---|
| Live | v0.8.2 (deployed 21:01; migration 0007 applied remote; crons 22:30 / 22:40 / 22:50 UTC) — v0.8.3 to deploy with the Saturday apply |
| Repo | `fe9ab0a` v0.8.2, pushed 21:23; v0.8.3 shipped as a zip, not yet applied |
| Tests | 150, `tsc` clean |
| Reviewed | v0.8.2 verification review done (`docs/reviews/v082-verification-review.md`): go with one change; 1 must (V1, an instruction), 8 should, 11 notes; V2 fixed in v0.8.3 |
| Next step | apply v0.8.3 → VC-18 with the corrected prep (`_PATCH-NOTES-V083.md`) → VC-18 closure line into the record → commit/push → Week 7 |

## Items

| ID | Source | Item | Status | Evidence / where |
|---|---|---|---|---|
| OI-01 | v0.8.2 notes | VC-18 on the live site (a–h) after the first visit on v0.8.2; closure line appended to the record | **open** | `_PATCH-NOTES-V082.md` VC-18 |
| OI-02 | review S12 | Fake-D1 tests for `runSmallCaps` / `runNightly`: rate-limited stop, not_served → blocked, income not_served → fund_blocked, EDGAR fatal, the pruning DELETE, realign on a new ex-date (3–4 h) | deferred to Phase 3 | — |
| OI-03 | review method M15 | Mutation "delete the pruning DELETE" survives the suite (no test covers it) — closes with OI-02 | open | — |
| OI-04 | `npm install` 23 Oct | `npm audit`: 9 findings on Tony's lockfile, all in dev tooling; vitest 5 clears them in the sandbox with 149 passing — ship the bump with Week 7; never `npm audit fix --force` | built (sandbox), not shipped | Week 7 shipment |
| OI-05 | `npm install` 23 Oct | npm's allow-scripts warning for esbuild and workerd install scripts; harmless while the binaries exist; `npm approve-scripts esbuild workerd` if a future install leaves wrangler without workerd | note | — |
| OI-06 | review N11 | EDGAR from Cloudflare's addresses untested in anger (I-4 stopped every Worker run before EDGAR); the Worker's EDGAR path is exercised only locally | open | — |
| OI-07 | review N11 / Phase 3 | The small-cap tier fills only when the tutor runs `npm run smallcaps` (no cron); ~10 runs to cover the tier; weekly after | open — a chore, by design | README Runbook |
| OI-08 | review Phase 3 readiness | Split handling for the small tier: `suspiciousJumps` logs a ×0.4–×2.5 jump, nothing acts; needs a `splits` seed and a signals quarantine before small caps enter Phase 3 signals (week 9) | open | — |
| OI-09 | review Phase 3 readiness | Phase 3 decisions taken as defaults (12% risk target; EW vol ~32 d ×16; stop at half annual risk; €2 + FX; weekly Monday decisions on Friday's close; adjusted prices, entry adj close + realign date stored; whole shares; core tier wk 7–8, small caps wk 9; student codes now, Access wk 12) — to be confirmed in the Week 7 shipment notes | open | review resolution tail |
| OI-10 | review S1 / decision 16 | The D1 `database_id` stays in `wrangler.jsonc` (configuration) and out of documents; `docs/records/vc-16-results.md` redacted; the pushed record still carries `Rotation: ___` — the date (23 Oct 2026) is in the builder's master copy and ships with the next zip | built, not shipped | next shipment |
| OI-11 | wrangler banner | wrangler 4.122 → 4.152 available; the doorbell path moved between versions before (`/__scheduled` vs `/cdn-cgi/handler/scheduled`); the visit script tries both — update deliberately, in a shipment, with the doorbell re-checked | note | — |
| OI-12 | review N1 | Enterprising near-miss label for a multiplier-only fail (Graham applies the multiplier first); left and taught | decided — won't change | review resolution N1 |
| OI-13 | review N3 | "Some current dividend" = 366 days; the defensive rule allows 456; kept | decided — won't change | review resolution N3 |
| OI-14 | VC-12 | The week-4 balance-sheet / dividends pre-flight was never written up; the record says so (VC-12 section) | closed by record | `data-provider-checks.md` VC-12 |
| OI-15 | BUILD-LOG hand gates | Not recorded, stated as such: AAPL by-eye reconciliation (wk 4), KO dividend order and `/card` printed (wk 5), Console spend limit and six printed pages (wk 6) | closed by record (stated as not recorded) | BUILD-LOG |
| OI-16 | this register | Each shipment's notes start with the State block above, updated; each of the builder's replies during an apply ends with "You are at: step N of …" | process — standing | — |
| OI-17 | verification V1 | VC-18 prep: reset both `fundamentals_as_of` and `last_price_fetch` for BBW; `last_price_fetch` NULL on ANDE for the dividends-only path; `--calls 18` | **built** (notes v0.8.3) | `_PATCH-NOTES-V083.md` |
| OI-18 | verification V2 | A declared dividend with a future ex-date scaled the whole series; fixed — skipped until a close on or after the ex-date exists; realign after every price write | **built** v0.8.3, verify at VC-18 | `src/lib/adjust.ts`, `smallcaps.ts`; test "a DECLARED dividend…" |
| OI-19 | verification V3 | Advice net still narrow: 31 of 32 fresh tipster phrasings pass (imperatives, contractions, "will go up", "worth owning", "bullish", "top pick", "upside"…) — add the listed families, keep the guards | open — Week 7 | review V3 |
| OI-20 | verification V4 | Per-sentence advice tests pin sentences, not alternatives: 19 of 35 single-alternative removals survive — one sentence per alternative, asserting the family | open — Week 7 | review V4 |
| OI-21 | verification V5 | Five raw-vs-rounded boundaries untested (defensive debt/WC, product 22.5, growth 9%; enterprising CR 1.5, debt/WC 110%) — probe P3 has the cases | open — Week 7 | review V5 |
| OI-22 | verification V6 | Number check mis-fires: "a loss of $52m" v "−$52m"; "$1,912m" v "$1.9bn" (0.63% > 0.5%); "F13" read as 13; month-name dates; and any invented figure equal to a free value passes | open — Week 7 | review V6 |
| OI-23 | verification V7 | The na branch of the strength test prints no reading ("debt total reported without a lease line → long-term debt unknown" is exactly when the student needs it) — append `readingNote` to the na detail | open — Week 7 | review V7 |
| OI-24 | verification V8 | Quote cap is read-then-insert: concurrent requests all pass; `QUOTE_DAILY_CAP="0"` cannot switch the demo off — insert first and count including it; treat "0" as 0 | open — Week 7 | review V8 |
| OI-25 | verification V9 (= OI-02) | Nothing exercises `runSmallCaps`: eps_missing marking, step 0, the `dividends_as_of` stamp, readings column, pruning DELETE, `haltLog`, realign — mutations MS6a/b, MP5, MS8c, M15, MN6 survive | deferred to Phase 3 (with OI-02) | review V9 |
| OI-26 | verification V10 | `DIVIDEND_REFRESH_DAYS` tested relative to itself (100 → 400 passes) — assert the literal | open — Week 7 (5 min) | review V10 |
| OI-27 | verification V14 | EDGAR duration ceiling (380 days) not enforced by the 10-KT test — give the 385-day fact a later `filed` date | open — Week 7 (5 min) | review V14 |
| OI-28 | verification V15 | With the 100-day cadence an annual payer can read "more than 12 months ago" for ~103 days a year; none in the tier; refresh at ~330 days if one joins | note | review V15 |
| OI-29 | verification V16 | A `not_served` dividends answer never stamps `dividends_as_of` → that company is charged the call every visit; stamp on any non-transient answer | open — Week 7 (5 min) | review V16 |
| OI-30 | verification V17 | Books-page chips compare raw figures against literals (2, 15, 1.5, 22.5) rather than `GT.*` — the one place "change a threshold here and all three change" does not hold | open — Week 7 (5 min) | review V17 |
| OI-31 | verification V18 | Two harmless leftovers: a `C:\Users\…` path quoted in the Phase 2 review's S1 row; an S3 RequestId/HostId pair in `vc-14-results.md` — elide | open — Week 7 (5 min) | review V18 |
| OI-32 | verification V19 | Visit-script receipt column pads to 14; `fund_eps_missing` (16) overflows — `padEnd(17)` | open — Week 7 (1 min) | review V19 |
| OI-33 | verification V11–V13 | README outcome list, lesson 5's "47" → 48, the story's "everything … the same day" | **done** v0.8.3 | this shipment |
