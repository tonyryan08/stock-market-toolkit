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

### Week 4 — "What is a company worth?" / fundamentals ingestion
- **Lesson:** The three financial statements at a glance; EPS, book value, current ratio, debt; Graham's Mr. Market parable and margin of safety. *Reading: Intelligent Investor ch. 8.*
- **Feature shipped:** FMP fundamentals (income statement, balance sheet, key metrics) into D1 via the nightly job; computed ratios exposed at `GET /api/fundamentals/:ticker`.
- **Cloudflare focus:** Richer D1 queries and joins; extending the cron safely; first tests (Vitest + Workers test pool). *SAoC: D1 chapter continued.*
- **Exit check:** Ratios for the full universe match a hand-checked sample from published accounts.

### Week 5 — "The Graham checklist" / screener engine
- **Lesson:** The seven defensive-investor criteria and *why each exists* (size, financial strength, earnings stability, dividend record, growth, moderate P/E, moderate P/B — incl. the P/E × P/B ≤ 22.5 combination). Live in class: run the screen, argue about the survivors. What a screen cannot tell you. *Reading: Intelligent Investor ch. 14.*
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
- **Feature shipped:** Returns + EW volatility estimator over D1 price history; EWMAC(16,64) computation; nightly job writes a signals table; `GET /api/signals/:ticker` returns MAC state + instrument risk.
- **Cloudflare focus:** CPU limits and heavier compute in Workers — push calculation into scheduled jobs, serve precomputed results.
- **Exit check:** Signals for the universe reconcile with a spreadsheet re-implementation for 3 tickers.

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

- **Phase 1 →** Nightly cron green three consecutive nights; D1 holds the full universe with ≥2 years of daily closes; zero live-API calls on any student-facing route; CI deploys on merge.
- **Phase 2 →** Graham screen correct vs a hand-checked sample and served from cache in ~2s; explain route passes refusal tests (advice-seeking prompts get education, not recommendations); demo'd end-to-end to one friendly non-expert.
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

- **Students:** *The Intelligent Investor* chs. 8, 14, 20 across weeks 4–6; *Leveraged Trading* Starter System chapters across weeks 7–9 (unleveraged adaptation); optional wk-1 short on resulting/luck-vs-skill.
- **You:** *SAoC* by topic as mapped above; Cloudflare docs for Cron Triggers, AI Gateway, Vectorize, and Access.

---

## Decision log

| # | Decision | Status (11 Aug 2026) |
|---|----------|----------------------|
| 1 | Delivery model | **Sequential.** Build + personal appendix run Sept–Nov 2026 (aligning with LSE Michaelmas term). Taught course targeted for the new-year community-school term — with a hard look at the calendar first: spring 2027 collides with the Geel cutover ramp (July 2027 go-live), so autumn 2027 is the standing fallback. Confirm when the school publishes term dates. |
| 2 | Per-student state | **D1 with transactions** — one store, simple operations. Durable Objects retained as an optional wk-8/9 stretch for learning value only. |
| 3 | Tutor retrieval | **SQLite full-text search (FTS5) in D1.** Spike-test FTS5 availability in wk 10; fallback is trivial. Vectorize + embeddings documented as the upgrade path, not built. |
| 4 | Risk report delivery | **Rendered on the site only.** No Email Workers — keeps scope and permissions tight. |
| 5 | Universe | **Open — by design.** Gated on the wk-2 data-coverage check. Working assumption: US large-cap subset plus a shortlist of recognisable Irish/UK names, each verified per provider before being promised in class. |

---

*Appendix A — Personal Economics Refresher: 1984 → 2026 (tutor only): see `appendix-a-economics-refresher.md`.*
