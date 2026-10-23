# Research notes — the end-of-project paper

**Status: living file, started 16 Oct 2026.** Owner: Tony Ryan. Drafted by Claude from the project record; every claim below points at an artefact that exists independently of this file. Tony decides what the paper argues; this file keeps the evidence from going cold.

**Working title (placeholder):** *Graham in the room: building and teaching a value-investing course with an AI collaborator — a validation practitioner's case study.*

**Venue in mind:** Information Systems Education Journal (ISEDJ), via the ISCAP annual conference. Facts verified 16 Oct 2026 from isedj.org: double-blind peer review, minimum three reviewers, acceptance rate stated as "below 34%", published five to six times a year, first published 2003; the journal takes the top conference papers in the pedagogy and curriculum areas, and award-winning conference papers are assessed first. Focus topics listed include "IS Teaching Cases" and "Exploratory Pedagogical Research." The teaching-case track page found was the 2017 one (deadlines then: 15 June for the Best Case award and ISEDJ consideration, 15 July for ISEDJ consideration, 15 August for proceedings); **the current call must be checked on iscap.info** — the old edsigcon.org domain has lapsed and now serves unrelated content. Contacts on the journal site: editor@isedj.org, publisher@isedj.org.

---

## 1. Two routes into ISEDJ, and what each needs

**Route A — teaching case (the "lab exercise" type).** The 2017 track description accepted "lab exercises or other technology-based experiences" as well as scenario cases. Package: a student document (≤ 5,000 words), an instructor document, and materials (slides, data, the repo). The instructor document must carry: a hook, an abstract, prerequisite terms and skills, discussion questions with possible responses, pre- and post-case assessment questions, **teaching tips based on piloting**, target audience, number of classroom uses, preparation time, student completion time. Cases are written in the past tense, open-ended, free of the author's value judgments, with identifying details disguised.

*What we have for it already:* the toolkit itself (deployable from the public repo with two free API keys), the weekly tutor notes, the checklist cards, the verification record, the decision log, and a verbatim development log. *What we do not have yet:* classroom piloting (see §3 — delivery is decoupled from the build by decision #1), and a student-facing case text.

**Route B — exploratory pedagogical research paper.** A design-based-research account of the course: iterative cycles, real context, design principles as the output. Needs the same artefacts plus the research questions below answered with evidence, and the threats to validity stated.

A single project can yield both; the paper's spine should be the development method (§2, RQ2), with finance (RQ1) and education (RQ3) as the two outcome strands and the toolkit as the artefact (RQ4). For double-blind review note that the public GitHub repository identifies the author; the anonymised submission can cite it as "[repository withheld for review]".

---

## 2. The research questions — claims, evidence, gaps

### RQ1 (finance). Is Graham's methodology still useful and relevant?

**What 12 weeks and free data cannot answer:** whether the screens produce returns. That is the value-premium literature, needs decades and survivorship-free data, and a paper-portfolio return over weeks is noise. Say so.

**What the record can answer:** what the two checklists do when applied mechanically to today's large companies, test by test, and why.
- Defensive screen (ch. 14, seven tests): 0 survivors of 31 on 13 Oct 2026 and 0 of 35 on 16 Oct; per-test fail counts 0 / 26 / 5 / 13 / 18 / 32 / 31 (size, strength, stability, dividends, growth, P/E ≤ 15, P/B) on 16 Oct. Nobody passed both price tests on any run.
- Enterprising screen (ch. 15, six requirements): 0 candidates of 35 on 16 Oct; **all 35 fail the first cut, P/E ≤ 9**; per-test fails 35 / 25 / 5 / 7 / 12 / 30. Three verified by hand against the books (GM 25.6× on a charge year, best year still 11.4×; Ford a 2025 loss, Graham's p. 382 exception tested and failing at ~13.8× five-year average; Citi 17.6×).
- The strength inversion: cash-rich technology companies pass the working-capital test; the consumer giants fail it (negative working capital by design, buybacks funded by debt). Graham wrote test 2 "for industrial companies" (p. 348); the balance sheets have changed shape since.
- Book value: 31 of 35 fail test 7. Zweig conceded intangibles in 2003 (p. 374); the tangible-book test of ch. 15 makes it worse by design. This connects to a live argument: Lev & Srivastava on intangibles explaining value's weak decade, Arnott, Harvey, Kalesnik & Linnainmaa's reply (both to verify and cite properly).
- The eight meanings of ✗ (`docs/lessons/week-05-reading-the-screen.md`, point 4): a screen reports that a test failed, never why; the first live table held every kind of why.

**The reframe to argue:** the thresholds are a 1972 artefact; the framework survived (Mr. Market, margin of safety, defensive vs enterprising as effort not nerve, a screen earns a reading not a purchase). The screen's rejection rate reads as a valuation gauge of the market. Three data points: Graham's own five of thirty in 1970 (p. 354), Zweig's 2003 commentary (about 120 of the S&P 500 passing the 2:1 test alone, p. 369), ours in 2026.

**Limits to state:** 38 companies chosen by recognisability and a free-tier whitelist (`scripts/universe-verified.json` documents the selection bias: 144 probed, 38 served, 0 of 52 small caps); US-only; one season; five fiscal years where Graham asked ten (decision #8); financials scored on six tests.

**To collect from now:** weekly snapshots of both screens (§3); the small-cap tier once it exists; the week-12 reading of the time series.

### RQ2 (IT/AI). What did the iterative development with an AI contribute, and teach?

**The angle:** a validation practitioner's discipline (GAMP 5 / CSA habits) applied to AI-assisted development, and whether it makes the result auditable. The record was a design decision, not a retrofit: syllabus v0.2 of 11 Aug 2026 added design invariant 5, *"the repo documents its own making"* — a weekly BUILD-LOG recording what was designed with the AI, what was built, what was verified by hand.

**Evidence held (all in the repo unless noted):**
- Decision log, rows 1–14 plus the dividend-gap row, each PROPOSED or DECIDED with a date and the human reason.
- Verification record `docs/data-provider-checks.md`: VC-01 to VC-14 (VC-11 is not in the exported log; check the record), with acceptance criteria written before execution from VC-13 onward (the two filled forms are evidence of the method and of its faults).
- Infrastructure incidents I-1 to I-3, plus the first "speeding ticket" of 2 Oct (migration `0002_write_budget.sql`).
- Independent review of week 5 (`docs/reviews/week-05-independent-review.md`, 12 Oct): 14 findings, 3 must-fix, verdict "ship-worthy after a small patch; do not regenerate", findings reported before any change.
- Patch notes per shipment, test suite growth, `fetch_log` in D1 (every nightly run since 1 Oct), commit history.
- `docs/how-we-built-it/build-conversation-log.md`: 169 turn headers (84 Tony, 84 Claude, one brief), ~35,000 words, 11 Aug – 12 Oct 2026; tool actions marked: 70 `[ran:]`, 43 `[created:]`, 14 `[sent:]`, 10 `[searched the web:]`. Scrubbed for the public repo (account identifiers, a client project, two turns omitted). The turns after 12 Oct are not yet exported.

**Findings already supportable:**
1. *Rhythm.* Tony states the want → Claude ships a package with an expected result beside every step → Tony runs it and pastes what happened verbatim → the discrepancy is the next unit of work. Every verification ran in Tony's own browser; the AI's reads were labelled as the AI's.
2. *Where the AI was reliable:* code against a written spec, tests with paper-checkable numbers, Graham's text when read from the PDF, platform diagnosis when the error text was pasted.
3. *Where it was not (the AI error log, §4.3):* recent facts (knowledge cutoff), figures from memory, "absence" claims from long documents, its own predictions, and budget arithmetic on platform limits it had not verified.
4. *Human decisions were the hinge points* (§4.4) — none of the thresholds, scorings or scope changes were the AI's to make, and the log shows them being made.
5. *Context is not durable.* The AI's conversation memory compacts; the repo is the system of record. The export of the conversation as research notes was itself a response to a compaction (12 Oct).
6. *Independence is partial.* The week-5 review ran on a different model instance with the shipped zip and the PDF; it found real defects, but same vendor, same training. State it as a limitation.

**Literature to position against (verify each before citing):** Dell'Acqua et al. 2023, "Navigating the Jagged Technological Frontier" (HBS working paper); Peng, Kalliamvakou, Cihon & Demirer 2023 (Copilot productivity); METR 2025 RCT (experienced open-source developers slower with AI tools); Barke, James & Polikarpova 2023, "Grounded Copilot" (acceleration vs exploration modes); Bird et al. 2023 CACM; GAMP 5 second edition on critical thinking and agile; COPE 2023 position on AI authorship (AI cannot be an author; disclose in methods and acknowledgements).

**Measures to extract at week 12:** shipments and patches per course week; tests over time; defects by who found them (platform meter / test / review / production screen / Tony's eye / the AI's own check); AI proposals vs human decisions (code the log); hours (only if logged from now, §3).

### RQ3 (education). What was unique about the curriculum development and delivery?

**Design features already evidenced:**
- The toolkit is the syllabus made executable: each week's feature is that lesson's prop; exit checks per week.
- One source of truth: the card, the screen and the code cannot disagree (`src/lib/graham.ts` drives all three). Students are told to argue with the tool, not consult it.
- Process over outcomes, instrumented: sealed prediction slips before the reveal, decision journals, pre-mortems (Klein 2007), calibration habits (Tetlock & Gardner 2015).
- Primary texts anchored to page numbers in the course copy (TII 2003 revised edition; Security Analysis 1940 for reasoning).
- Lessons revised from live results: the week-5 tutor notes were rewritten from the first run (`week-05-reading-the-screen.md`, ten teaching points with pages), and the pairs exercise gained its fallback after zero survivors.
- Audience: adult learners at a community school, small Irish savers (~€10k–€50k), paper portfolios only, "no tips, ever"; Zweig's 10% cap and a year on paper (pp. 396–397) as house rules.

**Delivery evidence does not exist yet.** Decision #1 (11 Aug 2026) decoupled the build from the teaching date: the taught course was targeted at the new-year term, with autumn 2027 the standing fallback. The "12-week project" is the build. For ISEDJ's "teaching tips based on piloting" and for any pre/post measure, the paper needs at least one delivered cohort. This is the schedule's critical path (§5).

**Instruments to decide before the first class:** consent form for use of anonymised slips, journals and quiz results; a pre/post with the Lusardi–Mitchell "Big Three" financial-literacy questions; calibration of the week-5 prediction slips; a journal-quality rubric. Keep n small and honest.

**Literature (verify):** Design-Based Research Collective 2003; Fernandes, Lynch & Netemeyer 2014 (small effects of financial education); Kaiser, Lusardi, Menkhoff & Urban 2022 (larger effects for practice-based, just-in-time teaching); OECD/INFE financial literacy framework.

### RQ4. Is there scope for a prototype application?

What exists is a working prototype: a Cloudflare Worker with D1, three nightly cron invocations, 14 routes, four migrations, two screens, two printable cards, a books page and a price chart, on free tiers with two API keys. The question is which prototype it is.

- **A tutor's toolkit** for other community courses: replicable from the repo in a weekend; the verification record is the manual; the free-data whitelist evidence and the EDGAR findings (tag drift within a filer, dimensioned facts omitted, proxy forms leaking facts) are reusable knowledge. Recommended scope for the paper.
- **A saver's app** is a different product: accounts, personal data, GDPR, and a regulatory line — personalised screening results edge toward investment advice under Irish and EU rules. "Education, not advice" has to remain structural. State it as out of scope and why.

---

## 3. Instruments to start now (cheap, and cannot be reconstructed later)

1. **Weekly snapshot of both screens.** Each Saturday save `/api/screen/graham` and `/api/screen/enterprising` as `docs/results/YYYY-MM-DD-graham.json` and `-enterprising.json`. The footer counts are RQ1's time series.
2. **Hours per week** in the BUILD-LOG: Tony's time on build, verification, lesson writing. One line a week.
3. **Keep `fetch_log` whole.** Never prune it; it is the longest-running instrument.
4. **Model identity log.** Record which model built which shipment and ran which review, as the chat shows it (the serving model can differ from the selected one; say so). Known so far: the week-5 review ran on Fable 5.1 after a switch on 12 Oct; parts of the v0.6.0 wiring on 15 Oct ran on Opus 5.5 before a switch back.
5. **Export the conversation from 12 Oct onward** at the next natural pause, same scrubs as before.
6. **Consent and measures** settled before the first class (RQ3).
7. **Pre-registration** — fill in before week 6 ships:

```
PRE-REGISTERED (date: ______ )
By the end of week 12 I expect the defensive screen to show ___ survivors of ___,
and the enterprising screen ___ candidates of ___, unless ______________________.
I expect the small-cap tier to change this by ______________________________.
Signed: Tony Ryan
```

---

## 4. Backfill — the record so far

### 4.1 Timeline

| Date (2026) | Event | Artefact |
|---|---|---|
| 11 Aug | Brief and syllabus; v0.2 locks decisions #1–#5, incl. design invariant 5 "the repo documents its own making" | log Part 0 |
| 12–13 Aug | Week 1: Hello, Worker — landing page, `/api/hello` | Part 1 |
| 24 Aug – 24 Sep | Week 2: quote route, keys, Desktop workflow; CI parked (decision #6: push = backup, deploy = release); AV rate limit met (VC-02); Irish tickers settled (VC-06) → US-only universe | Part 2 |
| 30 Sep – 1 Oct | Verification record populated; domicile hypothesis falsified (VC-10: DVN blocked); sweep: 48 probed, 31 green — the "famous 31" | Part 3; `universe-verified.json` |
| 1 Oct | Week 3: nightly close; D1 created after an Authentication 10000 on `d1 create` | Part 4 |
| 2 Oct | First speeding ticket: D1 100,000 rows/day exceeded on night one (redundant index tripled metered writes; 38,874 inserts ≈ 116k) → migration 0002 | Part 5 |
| 5 Oct | Week 4: the books opened; VC-12 pre-flight (TSLA as negative control); 25 tests | Part 6 |
| 5–7 Oct | Source texts paginated; Budget 2027 lines for week 11 | Part 7 |
| 12 Oct | Week 5: Graham screen shipped (31 tests); independent review (14 findings); patch v0.5.1; first live run: 21 with books, 10 blocked → I-1 (Workers Free 50 fetches/invocation) → v0.5.2 (two cron invocations, 43 tests); I-2 (D1 7403, retry) | Parts 8–9 |
| 13 Oct | First complete run: 31/31, 0 survivors; per-test fails 0/23/4/9/15/29/30 | screenshots; reading-the-screen |
| 14 Oct | Value pool: 96 candidates added; v0.5.3 (resumable sweep, third cron, tangible book, footer; 47 tests); migration 0004 | patch notes |
| 15 Oct | Sweep complete: 144 probed, 38 served, 0 of 52 small caps; I-3 (D1 import 10000, retry); VC-13 (EDGAR + AV) and VC-14a–c, e, f; decision #14 (two data spines) DECIDED; v0.6.0 enterprising screen (63 tests) | VC forms; patch notes |
| 16 Oct | First enterprising run: 0 of 35, all fail P/E ≤ 9; GM/F/C verified by hand; v0.6.1 (15-month dividend gap rule, books page consistency; 67 tests) | patch notes |

Build cadence: five course weeks in nine calendar weeks, including a September gap for other work; the project was planned for Sept–Nov 2026 with teaching decoupled (decision #1).

### 4.2 Quantitative record (as of 16 Oct 2026)

- Code: ~3,770 lines across `src/`, `scripts/`, `migrations/` (3,309 at v0.5.3); 14 routes; 4 migrations; 5 D1 tables.
- Tests: 25 (5 Oct) → 31 (12 Oct) → 43 (v0.5.2) → 47 (v0.5.3) → 63 (v0.6.0) → 67 (v0.6.1).
- Versions since the review: v0.5.1, 0.5.2, 0.5.3, 0.6.0, 0.6.1 (five patches in five days).
- Universe: 48 → 31 (1 Oct); 144 → 38 (15 Oct); small caps served by FMP free: 0 of 52.
- Budgets designed around: FMP 250 calls/day; Alpha Vantage 25/day and 5/minute; Workers Free 50 external fetches per invocation; D1 Free 100,000 rows written/day (metered per table and per index); cron at 22:30, 22:40 (prices) and 22:50 (accounts, 15 companies a night).
- Decision log: rows 1–14 plus the dividend-gap row. Known wording: #1 sequential delivery, teaching decoupled; #2 per-student state in D1; #3 tutor retrieval FTS5 in D1; #4 risk report on site only; #5 universe open by design, later US-only; #6 CI parked; #8 ten years adapted to five; #11 9% growth hurdle kept over the review's 13.1%; #12 universe revisited, small-cap weighting; #13 two investors; #14 two data spines; dividend "uninterrupted" = no gap over 15 months. Rows 7, 9, 10: see the log.
- Verification checks: VC-01–VC-10 (weeks 2–3), VC-12 (week 4), VC-13 and VC-14 (15–16 Oct). Incidents: 2 Oct D1 write cap; I-1 Workers fetch cap (12 Oct); I-2 D1 7403 (12 Oct); I-3 D1 import 10000 (15 Oct) — three of four cleared by a retry or a one-line config change.
- Conversation log: 169 turn headers, ~35,000 words, 221 KB, 11 Aug – 12 Oct; 52 dated Tony turns across 7 working days from 30 Sep.

### 4.3 The AI error log (keep adding; this is what makes the paper credible)

| Date | Error | Found by |
|---|---|---|
| 2 Oct | Redundant index on `daily_prices` tripled metered writes; D1 cap breached on night one | the platform's meter |
| 12 Oct | Classifier tested paywall phrases before "limit" — FMP's limit message also says "upgrade your plan" | independent review / test |
| 12 Oct | Test-2 message named "card networks" as skipped; Visa and Mastercard report current items | self-reported, confirmed by review |
| 12 Oct | Prediction that XOM would pass both price tests on full data; it didn't | the data; left on record |
| 12 Oct | Designed for one nightly invocation without verifying the 50-fetch limit | production (I-1) |
| 14 Oct | Sweep's ceiling stop skipped the profile step → C, CARR, F seeded without names or sectors; Citi scored as an industrial | the 15 Oct screen |
| 15 Oct | VC-13 acceptance criteria one fiscal year stale (knowledge cutoff: ETD's FY2026 10-K filed 3 Sept 2026) | the data |
| 15 Oct | Equity reference used the total incl. noncontrolling interest; the XBRL tag is parent-only ($86k apart) | reconciliation to the 10-K |
| 15 Oct | ETD FY2024 EPS recalled as 2.48; the filing says 2.49 | the filing |
| 15 Oct | VC-14 form put URLs inside backticks; two checks failed because the backtick was copied | the operator's error text |
| 15 Oct | Assumed wrangler 4.122 on Tony's machine; it was 4.145 since 5 Oct | the log |
| 16 Oct | Said Ford fails test 4 when it fails test 3 | self-corrected next turn |

Pattern: failures cluster on recent facts, figures from memory, unverified platform limits and the AI's own predictions; they were caught by the meter, the tests, the review, the screen and Tony's pastes — the method, not luck.

### 4.4 Human decisions on the record (the hinge points)

11 Aug: the five founding decisions and the audit-trail invariant · Sept: CI parked; US-only universe · 1 Oct: ship on free tiers, universe = what the sweep serves · 12 Oct: "in my world I always require an independent review"; 9% growth kept; a bank passing its six passes; the conversation exported as research notes · 14 Oct: widen the pool, weight small caps, "risk appetite" read as effort · 15 Oct: proceed with the AV-as-source recommendation; Week 5 edits approved; VC forms executed by hand · 16 Oct: 15-month gap rule adopted; this file commissioned, ISEDJ named.

### 4.5 Where each artefact lives

`BUILD-LOG.md` (weekly entries + deviations) · decision log · `docs/data-provider-checks.md` (VC and I records) · `docs/reviews/week-05-independent-review.md` · `docs/how-we-built-it/build-conversation-log.md` · `docs/lessons/*.md` · `_PATCH-NOTES-*.md` (not committed — consider archiving them under `docs/patches/` for the paper) · `scripts/universe-verified.json` and `seed-universe.sql` · D1 `fetch_log` · the two VC forms (`VC-13-form.md`, `VC-14-form.md`, filled) · decks under `docs/decks/` or wherever kept · git history.

---

## 5. Tentative schedule

- Build weeks 6–12: Oct 2026 → roughly Jan 2027 at the current cadence.
- Teaching: new-year term 2027 if decision #1's date holds; otherwise autumn 2027.
- ISCAP deadlines (2017 pattern, verify for 2027): mid-June for award and ISEDJ consideration, mid-July for ISEDJ consideration, mid-August for proceedings; conference in the autumn; journal issue the following year.
- Consequence: a 2027 submission with delivery evidence needs the January cohort; an autumn-2027 cohort pushes a delivery-based paper to the 2028 cycle, though a build-and-design paper (RQ2, RQ4) could still go in 2027.

## 6. Questions for the supervisor

1. Route A (teaching case), Route B (pedagogical research), or both — and which journal cycle?
2. Is a single case with three strands acceptable, or should RQ2 carry the paper alone?
3. Consent and ethics for a community-school cohort: whose approval, if any, is needed?
4. How to cite an AI collaborator's contribution under the journal's policy, and whether the public development log can be referenced in a double-blind submission.

*Education, not advice — and this file is notes, not findings.*
