# Independent review — Phase 2 (weeks 4–6 and the small-cap tier) — brief

**Commissioned:** 22 Oct 2026, before Phase 3 (Carver) begins on Monday 26 Oct.
**Rule:** findings only, reported before anything is changed. The reviewer did not build the work and starts from the repository as committed, not from the builder's working copy. Decisions on findings are the tutor's.

## What is under review

**Software** (the public repository at the v0.8.1 commit):
1. Fidelity to Graham. Both screens (`src/lib/graham.ts`) against *The Intelligent Investor* ch. 14 (defensive, course copy pp. 347–366) and ch. 15 (enterprising, pp. 385–387): every threshold, every adaptation, every "not applied" branch. The enterprising screen has not had an independent read; the defensive screen was reviewed on 12 Oct and its findings resolved — check the resolutions held.
2. The data layer. FMP and Alpha Vantage parsing; EDGAR fact selection (period/form, latest filing, fallback EPS); the readings of "None" (debt, leases, intangibles); the dividend adjustment and realignment; the five-year window; the fiscal-year labels across a June year-end.
3. The nightly jobs and their rations: D1 writes, Workers fetches, FMP calls, Alpha Vantage calls, EDGAR fair access; what happens at every stop; what is retried and what is marked for good; the PC-run visit (`scripts/visit-small-caps.mjs`).
4. The explainer (`src/lib/explain.ts`, `narrative.ts`, the route): what reaches the model, what the grounding check catches and misses, the advice regex against plausible phrasings, the cache and cap, cost bounds, the failure paths.
5. Security and hygiene: secrets handling and scrubbing, nothing identifying in the public repository (keys, account or database ids, email addresses), the ticker regex as the only student input, the EDGAR User-Agent.
6. Tests: do they test the rules or the implementation; any assertion that cannot fail; the gaps (what has no test).
7. Operability: could a successor run this from the guides alone (setup guide, API-keys guide, shipment notes, the records); version-dependent steps (the doorbell path); the migrations as a sequence.

**Content** (`docs/lessons/`, the card, the decks, `docs/how-we-built-it/`, the kit):
8. Lessons 4, 5, 6, `the-enterprising-screen.md`, `week-05-reading-the-screen.md`: factual accuracy; every page citation against the course copy (2003 revision); internal consistency (ten vs twenty years, 1972 not 1949, five-year adaptations); the scripted answers; anything a careful reader would call a tip or a forecast.
9. The checklist card, both pages, against the code's thresholds and the lessons' wording — the "cannot disagree" promise.
10. The Phase 2 story: every claim against the record (build log, verification records, fetch_log receipts, this review's own findings).
11. Education, not advice: the line on every page; nothing that reads as a recommendation, including in the AI narratives' prompt and the template sentences.

**Phase 3 readiness:**
12. What Phase 3 (Carver: trend rules, volatility targeting, position sizing, paper portfolios) needs from Phase 2 and whether it exists: price history depth and adjustment for the 38 (five years, provider-adjusted) and for the small caps (100 days, toolkit-adjusted, accumulating); a per-student state model; costs and the risk-target decision; open items carried from Phase 2 (the tier filling from the PC; EDGAR from Cloudflare untested in anger; anything this review opens).

## Method
- Read the source texts first (ch. 14, 15 and Zweig's commentaries), then the code, then the content; write probe tests for any suspicion before recording it, as the week-5 review did.
- Severity: **must fix** (wrong result or unsafe), **should fix** (misleading or fragile), **note** (record it; no change needed). Every finding: evidence (file and line, or page), the rule it breaks, a recommendation, and what it would cost to fix.
- Output: `docs/reviews/phase-2-independent-review.md` — verdict, findings table, what was checked and found correct, decisions required, Phase 3 readiness. Nothing changed.

## Timetable
- Friday evening: v0.8.1 committed; the reviewer is given the repository, the course copy of TII, the decks and the verification record.
- Saturday: the review runs; findings reported to the tutor by Saturday afternoon.
- Sunday: the tutor's decisions; the resolution patch (v0.8.2) and content fixes; applied and committed.
- Monday: Phase 3, week 7.
