# Intro to the Stock Market — 12-Week Syllabus & Toolkit Build Plan

**Community school course + Cloudflare/Claude toolkit · Tony Ryan · v0.2 — decisions locked 11 Aug 2026**

Course philosophy: good decision-making process over outcomes. Paper portfolios only — education, not advice. Success = process quality, cost/scam literacy, and a toolkit every student takes home.

---

## How to read this

Each week runs two parallel tracks:

- **Class track** — the student-facing lesson (assume one ~90-minute evening session per week). Written so it works whether you teach concurrently with the build or run the course after the toolkit is finished. If concurrent, stay **at least two weeks ahead** on the build so the class never depends on a feature you're debugging that morning.
- **Build track** — the tool feature that powers the lesson, plus the Cloudflare skill it teaches you. Anchored to Peacock's *Serverless Apps on Cloudflare* ("SAoC") by topic chapter, with Cloudflare docs where the book runs out (Cron Triggers, Access, Vectorize).

Design invariants:
1. Every lesson is powered by a feature; every feature exists to serve a lesson. No orphan engineering.
2. Kit items are produced as by-products of the week they belong to, never a separate workstream at the end.
3. Everything lands in the open GitHub repo from week 1. Secrets via `wrangler secret` only.
4. Students never hit live third-party APIs in class — everything is served from the D1 cache.
5. **The repo documents its own making.** A weekly `BUILD-LOG.md` entry records what was designed with Claude, what was built in Claude Code, and what was verified by hand — the same process-over-outcome standard the course asks of students, applied to the builder. Showcase surfaces: design decisions in Claude chat, implementation in Claude Code, and three Claude-API product features (explain-this-stock, tutor bot, explain-my-portfolio).

---

## At-a-glance map: lesson ↔ feature

| Wk | Phase | Class lesson | Toolkit feature shipped |
|----|-------|--------------|-------------------------|
| 1 | 1 | What a market is; luck vs skill; start the decision journal | Live course site skeleton + `GET /api/hello`, deployed via Wrangler + Git |
| 2 | 1 | Where prices come from; what data (and trading) costs | `GET /api/quote/:ticker` — live Alpha Vantage/FMP fetch, secrets, error handling |
| 3 | 1 | The nightly close; reading a price chart | Nightly cron → D1 cache; cache-first `GET /api/prices/:ticker` |
| 4 | 2 | What is a company worth? Mr. Market & margin of safety | Fundamentals ingestion (FMP) + ratio calculators in D1 |
| 5 | 2 | The Graham defensive-investor checklist | `GET /api/screen/graham` — pass/fail per criterion over the cached universe |
| 6 | 2 | Numbers into narrative; scam literacy I (stories vs figures) | Claude `GET /api/explain/:ticker`, grounded on D1 data with education-not-advice guardrails |
| 7 | 3 | Why systems beat gut feel; instrument risk (volatility) | Vol estimator + EWMAC(16,64) signal engine, `GET /api/signals/:ticker` |
| 8 | 3 | How much to bet: risk targeting, position sizing, stops | Position-size calculator, stop tracker, paper trade tickets |
| 9 | 3 | Running your paper portfolio; drawdowns are normal | Per-student portfolios + PraxiRisk-derived risk layer + nightly risk report |
| 10 | 4 | Review week: how to interrogate an AI tutor well | Tutor bot — retrieval over course notes, answers with citations |
| 11 | 4 | Real-world mechanics: DeGiro, Irish costs & tax; scam literacy II | Claude `GET /api/explain-my-portfolio` — process-first review of each student's book |
| 12 | 4 | Demo day: present one decision, judged on process | Cloudflare Access gating, student logins, kit assembly, repo tagged v1.0 |

---

## Phase 1 — Foundations & the data spine (weeks 1–3)

### Week 1 — "What is a market?" / Hello, Worker
- **Lesson:** What a stock and an exchange actually are; how prices form; why this course judges decisions by process, not outcome (luck vs skill, "resulting"). Students open their decision journal — every later trade gets an entry *before* execution.
- **Feature shipped:** Course site skeleton on Workers with `GET /api/hello`; public GitHub repo initialised; deploy-on-merge via GitHub Actions.
- **Cloudflare focus:** Wrangler install and project layout; first Worker; local dev vs deploy; Git/CI wiring. *SAoC: intro + first-Worker chapters.*
- **Exit check:** Live URL students can open on their phones; `git push` → deployed.
- **Kit output:** Decision journal template (page 1 of the kit); reading list seeded.

### Week 2 — "Where prices come from" / API pipeline v1
- **Lesson:** Quotes, OHLC, adjusted prices, splits and dividends; why free data is delayed; why data — like trading — is never actually free (first cost-literacy thread).
- **Feature shipped:** `GET /api/quote/:ticker` hitting Alpha Vantage (prices) and FMP (profile) live; typed responses; graceful failure on rate limits.
- **Cloudflare focus:** Hono routing; `wrangler secret` for API keys; outbound `fetch`; error handling patterns. *SAoC: routing chapter.*
- **Exit check:** Quote route works for 5 test tickers; keys nowhere in the repo.
- **Note:** This is deliberately throwaway plumbing — week 3 makes it obsolete, which is itself a lesson in iterative build.

### Week 3 — "The nightly close" / cron → D1 cache
- **Lesson:** What "the close" means; market hours from an Irish clock; indices; reading a daily price chart. Why we snapshot once a day instead of streaming — calm decisions come from calm data.
- **Feature shipped:** D1 schema (tickers, daily_prices, fundamentals, portfolios, trades, signals); Cron Trigger running a batched nightly refresh inside free-tier rate limits; cache-first `GET /api/prices/:ticker` with history.
- **Cloudflare focus:** D1 + migrations; Cron Triggers (Cloudflare docs — thin/absent in SAoC); batching and idempotent jobs; optionally Queues for fan-out. *SAoC: D1 chapter; Queues chapter if used.*
- **Exit check:** Phase 1 gate — see checkpoints below.

---

## Phase 2 — Graham value screener + explanations (weeks 4–6)

*Methodology: Benjamin Graham throughout — the implementable criteria from* The Intelligent Investor *ch. 14, the analytical reasoning from Graham & Dodd's* Security Analysis. *No other stock-picking school is taught; alternatives are named in week 5's discussion only so students can recognise them.*

### Week 4 — "What is a company worth?" / fundamentals ingestion
- **Lesson:** The three financial statements at a glance; EPS, book value, current ratio, debt; Graham's Mr. Market parable and margin of safety. *Reading: Intelligent Investor ch. 8; Security Analysis supplies the reasoning underneath — tutor-side grounding, not assigned.*
- **Feature shipped:** FMP fundamentals (income statement, balance sheet, key metrics) into D1 via the nightly job; computed ratios exposed at `GET /api/fundamentals/:ticker`.
- **Cloudflare focus:** Richer D1 queries and joins; extending the cron safely; first tests (Vitest + Workers test pool). *SAoC: D1 chapter continued.*
- **Exit check:** Ratios for the full universe match a hand-checked sample from published accounts.

### Week 5 — "The Graham checklist" / screener engine
- **Lesson:** The seven defensive-investor criteria and *why each exists* (size, financial strength, earnings stability, dividend record, growth, moderate P/E, moderate P/B — incl. the P/E × P/B ≤ 22.5 combination). Live in class: run the screen, argue about the survivors. What a screen cannot tell you. *Reading: Intelligent Investor ch. 14 — the source of the implemented criteria; Graham & Dodd's Security Analysis for why each one earns its place.*
- **Feature shipped:** `GET /api/screen/graham` — per-criterion pass/fail, ranked output, simple results page.
- **Cloudflare focus:** Query design and pagination; caching hot results (Cache API or KV). *SAoC: KV/caching chapter.*
- **Exit check:** Screen over the full universe returns from cache in under ~2s.
- **Kit output:** **Graham checklist card** — printed straight from the criteria as implemented, so card and code can never disagree.

### Week 6 — "Explain it to me" / Claude explain-this-stock
- **Lesson:** Turning numbers into narrative — and the danger of narrative without numbers. Scam literacy I: pump-and-dumps, finfluencers, "guaranteed returns". AI epistemics: the explainer is grounded on our own D1 data, can still be wrong, and is configured to refuse advice — students test the guardrail themselves.
- **Feature shipped:** `GET /api/explain/:ticker` — Claude API call from the Worker, prompt grounded on D1 fundamentals + screen results, hard "education, not advice" system prompt, refusal tests in CI.
- **Cloudflare focus:** Calling external AI APIs from Workers; AI Gateway for caching/logging/cost control (Cloudflare docs); streaming responses. *SAoC: AI chapter (adjacent — book uses Workers AI).*
- **Exit check:** Phase 2 gate — see checkpoints below.
- **Kit output:** Scam-spotting notes, part 1.

---

## Phase 3 — Carver systematic engine + paper portfolios (weeks 7–9)

*Students follow the Starter System from Carver's* Leveraged Trading, *adapted to unleveraged cash equities/ETFs (Carver's leverage-factor-1 variant) — appropriate for a community class and for later real-world DeGiro use.*

### Week 7 — "Why systems beat gut feel" / signal engine
- **Lesson:** Behavioural costs of discretionary trading; the case for one instrument, one rule; instrument risk (annualised volatility) as the number everything else hangs off; the MAC 16/64 opening rule. *Reading: Leveraged Trading, Starter System chapters begin.*
- **Feature shipped (v0.9.0, 24 Oct 2026):** EW volatility estimator and EWMAC(16,64) over the cached closes (`src/lib/signals.ts`, decision #17); the nightly job's `signals` phase writes one row per instrument (migration 0008); `GET /api/signals` (the universe), `GET /api/signals/:ticker` (state, forecast, instrument risk, the series), `/signals` (the page), the two averages and the long/flat strip on every `/prices/:ticker` chart, `/api/prices/:ticker?csv=1` for the spreadsheet check.
- **Cloudflare focus:** CPU limits and heavier compute in Workers — push calculation into scheduled jobs, serve precomputed results.
- **Exit check:** Signals for the universe reconcile with a spreadsheet re-implementation for 3 tickers (VC-19).

### Week 8 — "How much to bet" / sizing, stops, tickets
- **Lesson:** Risk targeting (why ~12% annualised); the position-sizing arithmetic; the stop-loss closing rule; minimum viable capital; why leverage is out of scope for this class.
- **Feature shipped:** `POST /api/position-size` (capital + ticker → units, stop level); stop tracker against nightly closes; paper trade ticket generator that forces a decision-journal entry field.
- **Cloudflare focus:** Input validation; portfolio/trade tables in D1 with transactions (decided — one store, simple operations). Durable Objects remain an optional stretch purely for the learning value. *SAoC: Durable Objects chapter if taken.*
- **Exit check:** An oversized ticket is rejected with a reason a student can understand.
- **Kit output:** **Starter System rules card** — open rule, close rule, sizing formula, weekly routine.

### Week 9 — "Your paper portfolio" / portfolios + risk layer
- **Lesson:** The weekly routine: check signal → check stop → journal → (maybe) trade. Drawdowns are normal and survivable; the risk report as a habit, not an alarm.
- **Feature shipped:** Per-student paper portfolios (positions, cash, P&L vs nightly closes); **risk layer adapted from Cian's PraxiRisk PoC** — pre-trade checks (size vs risk target, concentration cap) and a nightly per-student risk report (vol-target compliance, drawdown, stop distance).
- **Cloudflare focus:** Auth-light student identity for now (per-student codes; real logins arrive wk 12); scheduled risk job; rendering the report on the site.
- **Exit check:** Phase 3 gate — see checkpoints below.

---

## Phase 4 — Tutor, portfolio review, gated site (weeks 10–12)

### Week 10 — "Ask the tutor" / tutor bot on course notes
- **Lesson:** Consolidation week. Students revise by interrogating the tutor bot — and learn what good questions look like, how to spot a confident wrong answer, and to check citations back to the notes.
- **Feature shipped:** Course notes as markdown corpus (repo or R2); retrieval + Claude answers citing the specific note; `POST /api/tutor`.
- **Cloudflare focus:** R2 for content; retrieval via SQLite full-text search (FTS5) in D1 — decided; spike-test FTS5 availability on D1 first (fallback is trivial LIKE-based search). Vectorize + Workers AI embeddings stay documented in the README as the upgrade path, not the plan. *SAoC: R2 chapter, AI chapter.*
- **Exit check:** Bot answers a 10-question gold set with correct citations; declines gracefully off-corpus.

### Week 11 — "The real world" / explain-my-portfolio + costs & tax
- **Lesson:** DeGiro mechanics (account types, order types, fees, FX handling); Irish costs & tax walkthrough (CGT regime for shares vs the fund/ETF exit-tax regime, stamp duty, record-keeping — exact current rates to be confirmed when this lesson pack is written); total-cost-of-ownership worksheet. Scam literacy II: platform red flags, checking the Central Bank register.
- **Feature shipped:** `GET /api/explain-my-portfolio` — Claude reads the student's positions, trades, journal entries and risk report, and reviews **process adherence** ("did you follow your rules?") never outcomes ("well done, it went up").
- **Cloudflare focus:** Composing multiple D1 sources into one grounded prompt; per-student rate limiting (KV counters); prompt versioning.
- **Exit check:** Review of a deliberately rule-breaking test portfolio flags the breach, not the P&L.
- **Kit output:** **DeGiro mechanics + Irish costs/tax walkthrough**; scam-spotting notes, part 2.

### Week 12 — "Demo day" / Access gating + handover
- **Lesson:** Each student presents one decision from their journal, judged purely on process. Course retrospective. Kit handed over.
- **Feature shipped:** Cloudflare Access in front of the class site (email OTP for enrolled students = the real student logins); repo cleaned, README written including a "How this was built" section compiled from the BUILD-LOG, tagged v1.0; kit assembled (cards, rules, reading list, walkthroughs, journal template).
- **Cloudflare focus:** Zero Trust / Access policies (Cloudflare docs — outside SAoC scope); final CI polish; free-tier cost review.
- **Exit check:** Phase 4 gate — see checkpoints below.

---

## Phase gates (go/no-go before advancing)

- **Phase 1 →** Nightly cron green three consecutive nights; D1 holds the full universe with ≥2 years of daily closes; zero live-API calls on any student-facing route; manual deploy per decision #6 (CI parked). **Met, mid-October 2026** — after two landlord's meters (D1 writes, 2 Oct; 50 fetches per invocation, 12 Oct) were read from the diary and designed around.
- **Phase 2 →** Graham screen correct vs a hand-checked sample and served from cache in ~2s; explain route passes refusal tests (advice-seeking prompts get education, not recommendations); demo'd end-to-end to one friendly non-expert. **Independent review passed 23 Oct 2026** (`docs/reviews/phase-2-independent-review.md`; three musts, all closed in v0.8.2); the friendly-non-expert demo is the tutor's to log.
- **Phase 3 →** Every test student can open a rule-compliant paper position; risk layer blocks an oversized/concentrated ticket; nightly risk report renders per student.
- **Phase 4 →** Access policy admits only enrolled emails; tutor gold set passes; kit printed/linked; repo tagged v1.0 with a README a stranger could follow.

---

## Data & API budget constraints (bake into the week-3 design)

- **Alpha Vantage free tier is severely rate-limited** (of the order of 25 requests/day at last check — verify current limits in week 2). The nightly refresh must stagger the universe across nights or you budget for a paid key. Either way, the D1 cache is the product; live calls are plumbing.
- **Verify FMP free-tier endpoint coverage** for the exact statements/ratios the Graham screen needs *before* freezing the D1 schema in week 3 — their plan boundaries have shifted over time.
- **Universe definition affects everything:** a US large-cap subset is the safest data path; Irish/UK names students recognise (Euronext Dublin, LSE) have patchier coverage on both providers — verify per ticker in week 2 before promising them in class.
- Free-tier ceilings for Workers/D1/cron are comfortably above this workload, but note usage at each phase gate anyway — it becomes a cost-literacy talking point.

---

## Kit item → source week

| Kit item | Produced in |
|---|---|
| Decision journal template | Wk 1 |
| Reading list | Seeded wk 1, finalised wk 12 |
| Graham checklist card | Wk 5 (generated from the implemented criteria) |
| Scam-spotting notes | Wks 6 + 11, consolidated wk 12 |
| Starter System rules card | Wk 8 |
| DeGiro mechanics + Irish costs/tax walkthrough | Wk 11 |
| Student logins | Wk 12 (Access) |
| Open GitHub repo | Continuous, tagged v1.0 wk 12 |
| BUILD-LOG / "How this was built" | Weekly entries, compiled into the README wk 12 |

---

## Reading spine

- **Students:** *The Intelligent Investor* chs. 8, 14, 20 across weeks 4–6 (with *Security Analysis* offered as optional depth, never assigned); *Leveraged Trading* Starter System chapters across weeks 7–9 (unleveraged adaptation); optional wk-1 short on resulting/luck-vs-skill.
- **You:** *SAoC* by topic as mapped above; Cloudflare docs for Cron Triggers, AI Gateway, Vectorize, and Access.

---

## Decision log

| # | Decision | Status (23 Oct 2026) |
|---|----------|----------------------|
| 1 | Delivery model | **Sequential.** Build + personal appendix run Sept–Nov 2026 (aligning with LSE Michaelmas term). Taught course targeted for the new-year community-school term — with a hard look at the calendar first: spring 2027 collides with the day job's go-live ramp (mid-2027), so autumn 2027 is the standing fallback. Confirm when the school publishes term dates. |
| 2 | Per-student state | **D1 with transactions** — one store, simple operations. Durable Objects retained as an optional wk-8/9 stretch for learning value only. |
| 3 | Tutor retrieval | **SQLite full-text search (FTS5) in D1.** Spike-test FTS5 availability in wk 10; fallback is trivial. Vectorize + embeddings documented as the upgrade path, not built. |
| 4 | Risk report delivery | **Rendered on the site only.** No Email Workers — keeps scope and permissions tight. |
| 5 | Universe | **DECIDED (1 Oct 2026, evidence-based).** US-listed names that pass the free-plan whitelist, discovered by `npm run verify-universe` and published in `scripts/universe-verified.json`. VC-10 falsified the domicile rule (DVN blocked); nothing is promised until its probe is green. Irish-heritage US listings (RYAAY, CRH, FLUT…) are quotable live but blocked for history/statements → demoted to the live-demo set; the cached universe anchors on Cork-recognisable US employers (AAPL, PFE, JNJ, LLY…) plus household S&P names. Revisited in #12. |
| 6 | Deployment automation | **Parked (wk 2, by design).** Backup habit before automation: Desktop commit/push is the record; releases stay manual (`npm run deploy`) until the team *wants* the robot. Workflow file kept in the repo on manual trigger; reactivation = Part D secrets + restore the push trigger. |
| 7 | Price spine | **DECIDED (1 Oct 2026).** FMP `historical-price-eod/dividend-adjusted` (~5y, adjusted) is the sole cron source for the core tier; VC-09 evidence. Alpha Vantage exits the cron (adjusted history is premium, M-4) and serves only the tutor's rationed live-quote demo (capped at 3 a day from v0.8.2, review S7). Phase-1 "≥2 years" gate passes at ~5 years. |
| 8 | Fundamentals depth | **DECIDED (30 Sep 2026).** FMP free plan serves 5 annual periods (VC-07). Week 5's Graham earnings-stability criterion adapts to 5 years, openly footnoted on the checklist card — the adaptation taught as a data-literacy lesson. The small-cap tier keeps the same five (v0.8.1: Alpha Vantage serves ten; the job keeps the newest five so the card stays true). |
| 9 | Fundamentals cadence | **DECIDED (5 Oct 2026).** Accounts ride the nightly cron as a second phase: stalest symbols first × 3 calls (income, balance, dividends), 30-day staleness, auto-skipped when the price phase hits any wall. Ratios computed in-house from raw lines (tested, `npm test`) — never provider-precomputed. Since v0.5.2 (12 Oct) the accounts phase is its own cron invocation (22:50 UTC) because Workers Free allows 50 external fetches per invocation (I-1). |
| 10 | Dividend record source | **DECIDED (5 Oct 2026).** FMP `/stable/dividends` per symbol (~15y of ex-dates), stored raw; week 5's dividend-record criterion counts calendar years from it. TSLA is the standing negative control. Small-cap tier: Alpha Vantage `DIVIDENDS`, refreshed on its own 100-day cadence from v0.8.2 (review F2). |
| 11 | Graham screen rules | **DECIDED (12 Oct 2026, after independent review).** Ch. 14's seven tests in src/lib/graham.ts, a single source for the screen, the card and the books-page chips. Adapted openly: stability 5y (#8); dividends 10 consecutive calendar years; size ≥ $800m revenue (1971's $100m × CPI ≈ 8); growth ≥ +9.0% between 2-yr averages — Graham's +⅓/10y pro-rated (midpoint-faithful reading would be 13%; 9% chosen). P/E on 3-yr average EPS everywhere; P/B ≤ 1.5 or P/E×P/B ≤ 22.5; negative book value fails. Financials skip test 2 (Graham p. 361) and score out of 6; a company passing every applicable test is a survivor. Incomplete data is labelled, never scored as a fail. *(16 Oct, v0.6.1)* "uninterrupted" dividends = the calendar-year streak AND no gap over 15 months between ex-dates (456 days); none in the last 15 months = 0 (review finding 9, Ford 2020–21). *(23 Oct, v0.8.2)* every threshold is compared on the unrounded ratio; the display figure is rounded afterwards (review F3: 1.19875× is less than 120%). |
| 12 | Universe, revisited | **DECIDED (14 Oct 2026).** The famous-31 stay (they teach why the famous names fail). A value pool is added via the sweep, weighted toward small caps — Graham's enterprising ground, and a pool the class can build a portfolio from — greens only, evidence in scripts/universe-verified.json. Capacity ~45 per price cron line. Utilities and REITs excluded (Graham's separate rules not implemented). Small caps fail defensive test 1 (size) by design — the two screens see different pools. Outcome (15 Oct): 144 probed, 38 served, 0 of 52 small caps → the core tier is 38; the small caps get #14. |
| 13 | Two investors | **DECIDED (15 Oct 2026), shipped v0.6.0.** Graham's enterprising screen (TII ch. 15, pp. 385–386) beside the defensive one, on one engine. Effort, not risk appetite (p. 6). One adaptation: the multiplier uses the latest fiscal year, not the trailing 12 months. Growth = latest EPS above four fiscal years earlier (the oldest of the five years held — Graham's 1970 v 1966). Survivors are called candidates (p. 386: the third selection is judgment). Financials skip the two balance-sheet tests (p. 385's parenthesis, read with ch. 14 p. 361) and score out of 5. |
| 14 | Two data spines | **DECIDED (15 Oct 2026).** FMP for the 38 it serves. For the small-cap tier: Alpha Vantage as source (TIME_SERIES_DAILY compact in rotation, which VC-14a confirmed free; INCOME_STATEMENT/BALANCE_SHEET about once a year per company), EDGAR XBRL as audit trail and per-company verification probe. Rejected as primary: EDGAR, because tags drift within a filer and dimensioned facts (e.g. dual-class EPS) are absent. **EPS rule (16 Oct, VC-14d):** EPS from EDGAR (EarningsPerShareDiluted; fallback net income ÷ weighted diluted shares), never from AV's EARNINGS endpoint, which carries adjusted quarterly figures. *(implemented 20 Oct 2026, v0.8.0)* Alpha Vantage compact prices as traded + toolkit dividend adjustment; AV statements; EDGAR EPS with the filing named per row; AV "None" on debt/intangibles read as 0 and printed in the receipt; companies AV does not serve are marked and left alone. *(v0.8.1, 23 Oct)* five fiscal years for the tier, as the card says; borrowings exclude lease obligations (D-2); the visit runs from the tutor's PC against the live D1 (`npm run smallcaps`), once a day or week, because Alpha Vantage meters the free tier by sender address and refused the Worker at call 1 three nights running (I-4); the 23:10 cron is gone. *(v0.8.2)* the readings of a provider's "None" are stored on the row and shown on the books page and the test hover (review S8); EDGAR faults other than 403 are retried EDGAR-only on a later night (S6). |
| 15 | AI narrative, grounded | **DECIDED (19 Oct 2026).** "Explain this stock" is written by Claude from a numbered fact sheet computed by the toolkit, and from nothing else. Binding rules: cite fact ids per paragraph; no number that is not on a cited fact; no recommendation. The toolkit checks every narrative: invented numbers and unknown ids are flagged on the page; advice-shaped language is rejected and the plain template served. One generation per company per fact-sheet fingerprint, cached in D1; daily cap (60); receipts in fetch_log. The page is complete without a key. Model: claude-haiku-5-5 (configurable). What the checks cannot catch — wrong words, invented reasons — is the room's job, by design. *(23 Oct, v0.8.2, review S4/S13)* the advice check is seven pattern families in one exported list with a test per sentence; numbers are compared by value (units, minus signs and dates normalised); a page with a flagged number is still served, with the ⚠ explained on the page in plain words — flag-and-serve is the class exercise, and the page says so. |
| 16 | The record, and what goes in the repo | **DECIDED (23 Oct 2026, after the Phase 2 independent review).** The committed record is the record: BUILD-LOG, this log, the verification record and the review reports carry everything the story claims, or the story is softened to "in the live diary". Working notes (`_SHIPMENT-NOTES-*`, `_PATCH-NOTES-*`, VC forms, `_wrangler.smallcaps.jsonc`) are not committed — their record pastes are applied, then the notes stay local. The D1 `database_id` in `wrangler.jsonc` is configuration (it grants nothing without the account's token) and stays; it is still kept out of documents. Secrets: four (`ALPHAVANTAGE_API_KEY`, `FMP_API_KEY`, `ANTHROPIC_API_KEY`, `EDGAR_USER_AGENT`), never in files, staged for `wrangler secret put` only outside the project folder; any provider text pasted into a record is searched for the key string before it is saved (K-3). |
| 17 | The signal rule (Phase 3's first rule) | **DECIDED (24 Oct 2026), shipped v0.9.0.** Robert Carver's trend rule as the toolkit's one opening rule, in one table (`src/lib/signals.ts`) that runs the nightly job, the API, the `/signals` page and every chart's overlay. As Carver wrote it and as his open-source code (pysystemtrade, GPL, read 24 Oct) implements it: EWMAs by span 16 and 64 (λ = 2 ÷ (span + 1)); volatility = exponentially weighted σ of daily price changes, span 35; forecast = 3.75 × (fast − slow) ÷ σ, capped ±20 (his scalar for 16/64; average |forecast| ≈ 10); instrument risk = σ of daily % returns × 16 (256 trading days). Basis: the adjusted close (dividends inside the price). Adaptations, stated: **long-only** — a negative forecast is FLAT, never short, no leverage (a community class in cash equities); the variance recursion takes the mean as zero, with no floor and no blend (RiskMetrics convention; Carver's code subtracts a bias-corrected EW mean, floors σ at a 500-day 5% quantile and blends in a ten-year mean — measured against it on realistic series, the state never differs and the forecast's size differs by a few tenths of a point in a strong trend; a spreadsheet reproduces ours in one column); a series shorter than 128 closes is "warming up". The rule is computed in its own scheduled invocation (23:00 UTC, after the accounts; a fault in it costs no other phase) and served precomputed; the per-instrument history is computed on request. Alternatives considered: the Starter System's crossover as a bare state without the strength figure (whether Leveraged Trading's averages are simple or exponential is to be confirmed from the course copy, OI-40); a faster pair (8/32) — Carver says the pair matters less than writing it down first. |
| 18 | Phase 3 defaults | **DECIDED (23–24 Oct 2026), from the Phase 2 review's list.** Risk target 12% a year (Carver's Starter System); volatility estimator as in #17; stop at half the annual instrument risk below the high since entry, on the adjusted close; cost model €2 a trade plus FX; weekly decisions on Monday from Friday's close; adjusted prices for signals, volatility and paper fills, with the entry's adjusted close and the realign date stored; whole shares only; core tier for weeks 7–8, small caps from week 9 once they have 128 closes and split handling (OI-08); per-student codes now, Access in week 12. Each item is revisited when its week builds it. |

---

*Appendix A — Personal Economics Refresher: 1984 → 2026 (tutor only): see `appendix-a-economics-refresher.md`.*
