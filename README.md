# Intro to the Stock Market — course toolkit

A community-school course in good financial decision-making, and the Cloudflare Workers toolkit that powers it — built in public, one capability per week, over twelve weeks.

**We grade decisions, not outcomes.** Paper portfolios only. No tips, ever. **Education, not advice** — nothing in this repository is a recommendation to buy or sell anything.

## Status

**Phase 4 — week 11 shipped, v0.13.0 (12 Nov 2026): explain-my-portfolio (the process review) and the costs-and-tax worksheet; deployed 12 Nov, the week-11 exit check (VC-23) met on the live site the same afternoon, two findings for decision (OI-93, OI-94).** Week 10 shipped v0.12.0 (11 Nov): the tutor bot on the course notes and the Graham ∩ Carver watchlist. Phases 1–2 (weeks 1–6, the small-cap tier) are complete and twice reviewed; Phase 3 (a systematic, rules-based engine and paper portfolios, weeks 7–9) is complete and closed out — the signal engine (week 7, reconciled by hand, VC-19), the sizing, the stop and the paper tickets (week 8, VC-20), the account marked to market with the nightly risk report (week 9; the Phase 3 gate, VC-21, met live 9–10 Nov), the end-of-phase review implemented (v0.11.1). Week 10 adds a tutor that answers only from the course's own notes and cites the passage on every paragraph (`/tutor`), and the two rules read side by side as a gate (`/watchlist`) — verified live 11 Nov (VC-22: the week-10 exit check met; two findings, the page over-catching, fixed and re-run the same day — the gold set answers 10 of 10). Week 11 adds the **process review** (`/tickets/<code>/review`, `GET /api/explain-my-portfolio/<code>`): every ticket and position read against the rules the student chose by an audit that needs no AI, and a reading by the course's AI from a sheet that carries no P&L — it reviews process, never outcomes, by construction — and the **costs-and-tax worksheet** (`/costs`): the same paper trade priced in euro, the gain taxed three ways with every rate dated and the Bill marked as a Bill; the live check is VC-23.

What runs tonight, unattended: at 22:30 and 22:40 UTC the Worker refreshes five years of adjusted daily prices for the **core tier** — 38 household US names verified against the free plan — at 22:50 it refreshes the accounts of the 15 stalest companies, and at 23:00 it runs Carver's trend rule over every instrument (`/signals`: 16/64-day crossover, instrument risk, long or flat — decision #17). Everything a student touches is served from that D1 cache in single-digit milliseconds (the live fetch it replaced took 858 ms). On top of the cache: a books page per company (`/fundamentals/AAPL`), Graham's defensive screen (`/screen`, ch. 14 of *The Intelligent Investor*) and his enterprising screen (`/screen/enterprising`, ch. 15), a two-page checklist card (`/card`) printed from the same rules table the screens run on, "explain this stock" (`/explain/NVDA`) — a narrative written by Claude from a numbered fact sheet and checked by the toolkit before it is shown — and, from week 7, the signals page and the two averages drawn on every chart; from week 8, the position-size calculator (`/size`) and each student's paper tickets (`/tickets/<code>`), with the stop tracked nightly; from week 9, the account marked to market every night — cash, open P&L, the high-water mark and the drawdown, the risk the positions carry against the 12% budget — as a report in sentences on the student's page and at `/api/risk/<code>`, with the pre-trade checks (size on the current value at 12% ÷ N instruments, concentration, budget) that refuse a ticket in a sentence; the calculator takes the number of instruments too; from week 10, **ask the tutor** (`/tutor`) — a question in the course's words is matched to passages of the lesson plans and the kit (SQLite full-text search in D1, decision #3), answered by Claude from those passages alone with a citation on every paragraph, and checked before it is shown (an invented passage or a number from nowhere is flagged; a tip is withheld) — and **the watchlist** (`/watchlist`): Graham's screens and Carver's rule read together as a gate, with each company's Graham tests passed beside its state on the signals page; from week 11, **the process review** on each student's page (the audit — a stop hit and the position still open, a close with the stop not hit, a journal entry that names no rule — and a reading written from process facts only, with outcome language withheld like a tip) and **the worksheet** (`/costs`, no database, no model).

The **small-cap tier** — Graham's enterprising hunting ground, which the free FMP plan does not serve — has its own data spine: Alpha Vantage for as-traded prices and accounts, SEC EDGAR for diluted EPS with the filing named on every row, and dividend adjustment done by the toolkit. Alpha Vantage meters its free tier by sender address, so the tier is visited from the tutor's own computer (`npm run smallcaps`), not by the cron (I-4 in the record).

Two universes, one rule: a company is in the universe only when a probe has proved the plan serves it (`npm run verify-universe`, `npm run seed-small-caps`); refusals are documented, nothing is guessed.

The record: [`docs/syllabus.md`](docs/syllabus.md) (the plan and the decision log, 22 decisions) · [`BUILD-LOG.md`](BUILD-LOG.md) (how it was built, week by week) · [`docs/data-provider-checks.md`](docs/data-provider-checks.md) (every verification check, incident and key slip; the filled forms in [`docs/records/`](docs/records/)) · [`docs/reviews/`](docs/reviews/) (the independent reviews, findings reported before anything changed) · [`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md) (the register: every finding and where it stands) · [`docs/how-we-built-it-phase-1.md`](docs/how-we-built-it-phase-1.md), [`-phase-2.md`](docs/how-we-built-it-phase-2.md) and [`-phase-3.md`](docs/how-we-built-it-phase-3.md) (the story, for people who don't read code).

## Quickstart

Prerequisites: Node 20+. Four secrets (see `.dev.vars.example` and `docs/api-keys-guide.md`): two free data keys, a Claude API key (pre-paid, for the explain route — the site works without it), and an EDGAR User-Agent (not a key: the project name and an email, which the SEC's fair-access policy requires).

```sh
npm ci             # a fresh clone: installs exactly the lockfile (npm install under another npm rewrites it — Phase 3 review N16); `npm install` after a shipment that changes a pin
npm test           # 567 tests
npm run check      # wrangler types + tsc
npm run dev        # http://127.0.0.1:8787 (wrangler binds the IPv4 loopback; `localhost` can resolve to ::1 on Windows and not answer)
```

First-time data setup, in this order (the detail is in `docs/setup-guide.md`):

```sh
npm run verify-universe                                   # probe the candidates (~2 FMP calls each) → scripts/seed-universe.sql
npx wrangler d1 create stock-market-db                    # paste the database_id it prints into wrangler.jsonc
npx wrangler d1 migrations apply stock-market-db --local  # 0001 … 0012
npx wrangler d1 execute stock-market-db --local --file=scripts/seed-universe.sql
npm run seed-small-caps                                   # EDGAR lookups only → scripts/seed-small-caps.sql
npx wrangler d1 execute stock-market-db --local --file=scripts/seed-small-caps.sql
npm run dev:cron                                          # then ring the doorbell (Runbook → "The doorbell")
```

## Deploy

```sh
npx wrangler login
npx wrangler d1 migrations apply stock-market-db --remote
npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-universe.sql
npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-small-caps.sql
npm run deploy
```

Production fills itself: the first 22:30 UTC run backfills the core tier (stalest first, 45 fetches per invocation, the rest the next night — two landlord's meters taught us that, see the record), accounts arrive at 15 companies a night, and the small-cap tier fills at ~5 companies per `npm run smallcaps`. Releasing is `npm run deploy`; GitHub Desktop commit + push is the backup habit. Deploy-on-merge CI exists but is **parked by decision #6** (`.github/workflows/deploy.yml`, manual trigger only).

## Runbook

The things a successor needs that the weekly lessons do not say. Everything below is also in the shipment notes that built it, but those are not in the repo (decision #16).

**Secrets — four, never in files.** Live: `npx wrangler secret put NAME` for `ALPHAVANTAGE_API_KEY`, `FMP_API_KEY`, `ANTHROPIC_API_KEY`, `EDGAR_USER_AGENT`; `npx wrangler secret list` shows the four names. Local: the same four in `.dev.vars` (gitignored), plus `SMALLCAP_AV_CALLS="4"` so a local small-cap run spends 4 Alpha Vantage calls, not 20 — the key is shared with production. Stage a value for `secret put` in a text file **outside** the project folder (`type C:\Users\you\Desktop\key.txt | npx wrangler secret put NAME` on Windows), never inside it: K-2 in the record is what happens otherwise, and `.gitignore` now refuses `key*.txt` and `ua.txt` anyway. A key that has been on a screen is no longer a key: rotate it.

**Rations.** Alpha Vantage free: 25 calls in any rolling 24 hours, 5 a minute, metered by key *and* by sender address. The small-cap visit plans within the rolling ration it reads from its own receipts — visits and live quotes of the last 24 hours plus a ten-minute margin (a receipt is stamped at a run's start; its calls follow over the next minutes), three kept back — and `--calls N` (default 20) is only a ceiling (v0.10.0, OI-51); a receipt it cannot read leaves a `ration_error` line and the ceiling is planned, as before; the tutor's live quote demo (`/api/quote/:ticker`) is capped at 3 a day on the same key (`QUOTE_DAILY_CAP`; `"0"` switches it off), answering 429 with the cached close once spent. FMP free: 250 a day; the nightly job counts its own fetches (45 per invocation, Workers Free's limit is 50) and resumes next night. Claude: one generation per company per fact-sheet fingerprint, 60 a day (`EXPLAIN_DAILY_CAP`), cost in hundredths of a cent per story; the tutor, 60 questions a day (`TUTOR_DAILY_CAP`; `"0"` shows the passages only), about three thousand input tokens each (the prompt and six passages — 2,200–3,400 measured at VC-22) — nothing is called when no passage matches, and the budget is counted before the call (a `pending` row, so a burst cannot walk through it); the process review, 3 readings a day per student (`REVIEW_DAILY_CAP`) and 40 for the class (`REVIEW_GLOBAL_CAP`; `"0"` on either shows the audit only), counted the same way in `reviews` — a failed call that returned nothing is not counted, so an outage cannot spend a student's day — about 1,500–2,500 input tokens each; the audit and the worksheet call nothing. D1: 100k metered writes a day — each insert counts the table plus every index, which is why `migrations/0002` dropped one and why no later migration adds any.

**The nightly alarms** (`wrangler.jsonc` → `triggers.crons`): `30 22 * * *` and `40 22 * * *` are price runs (any `mm 22` line is; add a line to add 45 fetches of capacity), `50 22 * * *` is the accounts run, and `0 23 * * *` the **signals** pass followed by the **stop tracker** and then the **risk report** (all three D1 only, no provider calls: one row per instrument in the `signals` table, then every open paper position's trailing stop, then one `risk_reports` row per student per night (keyed on the night's latest close, not on a lagging position's), the account marked to the latest closes, the high-water mark carried from the last row, the flags — its own invocation so a fault in one phase never costs another, each pass fenced on its own). There is no small-cap cron: `10 23 * * *` is still understood by the handler for the PC visit, but it is not scheduled. Edit the crons line in Notepad; `npm run deploy` prints the schedules it registered.

**The doorbell (local runs).** With `npm run dev:cron` running, open in the browser: `http://127.0.0.1:8787/__scheduled?cron=30+22+*+*+*` (prices), `…?cron=50+22+*+*+*` (accounts), `…?cron=0+23+*+*+*` (signals, stops and the risk report — free, no calls), `…?cron=10+23+*+*+*` (small caps), `…?cron=*+*+*+*+*` (everything). On wrangler builds where that path 404s, the same query on `/cdn-cgi/handler/scheduled` is the current one; the visit script tries both. A company visited in the last six hours is skipped, so ringing twice costs nothing — but a *local* ring spends the shared Alpha Vantage key.

**The small-cap visit from your PC** (v0.8.1, I-4). Once: save `wrangler.smallcaps.example.jsonc` as `_wrangler.smallcaps.jsonc`, paste the `database_id` from `wrangler.jsonc` over the zeros (the underscore keeps it out of git). Then `npm run smallcaps -- --calls 18` (an unknown or malformed argument stops it before it rings — OI-50): it starts the Worker locally on port 8790 with the **live** database bound remotely (wrangler ≥ 4.37's `"remote": true`), rings the doorbell, polls the live `fetch_log` for up to 14 minutes, prints the receipt and stops the server. Expect `ok` + `fund_ok` per company visited, `avCalls ≤ N`, and `blocked` where Alpha Vantage has no series. Dividends refresh every 100 days on their own (one call); accounts every 400 (three calls); EPS gaps retry EDGAR-only at no Alpha Vantage cost; a 403 from EDGAR is a User-Agent problem and is not retried. **Run it once a day** — while the tier fills (~10 runs), while it matures to 128 closes (the stored series grows only on a visit, and a small cap's rule reads from the close of its last visit), and after, because a small-cap ticket prices on that close too; weekly leaves the tier up to a week stale (OI-07, amended at week 11). **The ration is a rolling 24 hours, not a calendar day** (24 Oct: the 26th call since the previous evening was refused at 10:07 UTC; two runs in the following week were cut short by an early start). Since v0.10.0 the Worker counts the last 24 hours' calls from the receipts and plans within them, so the hour no longer matters: a run on a spent ration fetches nothing and the receipt says when the window frees. Never re-run a VC's preparation lines; a run stopped by the limit mid-visit puts that company first in the next run's queue.

**Enrolling students (weeks 8–9).** `npm run enrol -- --name "Ada Lovelace" --capital 10000` writes a row to the live `students` table through `wrangler d1 execute --remote` and prints the code once (`XXXX-XXXX`, no ambiguous characters); `npm run enrol -- --list` shows them again, with each account's instruments; `--local` does the same to the local database for a rehearsal. `--instruments N` (1–4, default 1) sets how many instruments the account runs — each position is sized at 12% ÷ N a year and the ticket refuses the (N + 1)th open position; `npm run enrol -- --set-instruments CODE N` changes it later (positions already open keep their size; the nightly report flags an account over the count or the budget). The code is the student's identity until Cloudflare Access in week 12: it is in their page's URL (`/tickets/<code>`) and on every ticket — and, from v0.11.0, nowhere in the page's text, so a screenshot of the page does not carry it (OI-56) — so the enrolment list stays off the repo like any other personal record. A paper account is between $500 and $1,000,000; the calculator shows what a small one cannot do.

**The tutor's notes (week 10).** The tutor reads the `notes` table, not the files: after any edit to a lesson plan or a kit document, `npm run seed-notes` regenerates `scripts/seed-notes.sql` (the passages, then the FTS5 index rebuilt from them) and `npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-notes.sql` applies it — local first with `--local`. Passage ids are positional within a file (`L8.9`), so an edit can move them; the `questions` table keeps the ids each answer cited and the page shows the passage text. If the live database refuses the virtual table (the FTS5 spike), apply `scripts/seed-notes-plain.sql` instead: the same rows, no index, and the tutor ranks them by a plain word match on its own — the page's retrieval line says which it used. What the class asked is at `/api/tutor/recent` (anonymous). Retire a test account: `npm run enrol -- --retire CODE` shows what would go, `--yes` deletes the student and their tickets, positions and reports (no undo).

**The process review (week 11).** `/tickets/<code>/review` shows the audit (no model) and the last reading; the button asks for a fresh one and lands back on the page with it (a refresh spends nothing). `GET /api/explain-my-portfolio/<code>` is the audit as JSON; `?ai=1` asks for a reading — a plain GET spends nothing, so a link preview or a prefetch cannot. The sheet the model reads is on the page under "The sheet the AI reads": process facts only — none of the toolkit's P&L, account-value or drawdown figures, no price level beyond the entry; the student's own journal words are on it as written. A reading that fails any check (a fact not on the sheet, a paragraph citing nothing, a number from nowhere, a tip, outcome language) is withheld and the page says why; the audit stands. Every reading is a `reviews` row with its prompt version (`REVIEW_PROMPT_VERSION` in `src/lib/review.ts`, `r3` — bump it on any change to the prompt, the schema or the sheet's wording, so an old reading says which prompt wrote it) and the facts of its own night (an old reading's tags open those). The audit's thresholds: a stop answered within five nightly closes (the week's routine, counted on the universe's nights from the `signals` table) is on time; the journal notes are word tests. **The worksheet (week 11).** `/costs` and `/api/costs` price a paper trade in euro from `TAX_RULES` and `BROKER` in `src/lib/costs.ts` — every rate with its date and a `basis` of "Bill" or "current"; every mark and sentence on the page is derived from the basis, so when the Finance Act is law, set `checkedOn` and the three `basis` fields to "current" and the page follows (the rules' own `note` texts — "as announced", "drafted in the Bill" — are hand-edited at the same time; OI-86 lists them); confirm the broker's schedule the week of the lesson.

**Reading the receipt.** Every provider call and every run is a row in `fetch_log`:
```sh
npx wrangler d1 execute stock-market-db --remote --command "SELECT run_at, symbol, outcome, substr(detail,1,160) AS d FROM fetch_log ORDER BY id DESC LIMIT 40"
```
Outcomes — prices: `ok` / `error` / `blocked` (the plan does not serve the symbol — permanent until reset) / `av_jump` (a >40% day in the adjusted series; for the small tier the signal pass quarantines the symbol until a `splits` row within four days of the date explains it — a split, or factor 1 with a note for news; an `av_jump` line is permanent, so the factor-1 row is the way out. The `splits` table is read by the stop tracker for **any tier**: a row for a core-tier name is the recovery path for a `split_unknown`, the quarantine is the small tier's only) / `realigned` / `dividends` (a dividends-only visit); accounts: `fund_ok` / `fund_partial` / `fund_error` / `fund_blocked` / `fund_eps_missing`, with `edgar_failed`, `edgar_ok` (a retry) and `edgar_mismatch` (EDGAR's net income more than 1% from Alpha Vantage's); run-level: `rate_limited`, `auth_failed`, `av_premium`, `fetch_budget`, `write_error`, `write_limited`, `write_budget`, `run_summary`; the explain route's `explain_ok` / `explain_capped` / `explain_rejected` / `explain_error`; the tutor's `tutor_ok` (with the tokens, the retrieval mode and any flags) / `tutor_declined` (the model: the passages do not answer it) / `tutor_off_corpus` (no passage matched — no call) / `tutor_rejected` (advice-shaped language — withheld, on the page and in the API; the audit copy is the `questions` row) / `tutor_capped` / `tutor_error` (a deployment with no key writes a `questions` row and no log line); the process review's `review_ok` (the tokens, the prompt version, the breaches and notes counted, any flags) / `review_rejected` (outcome or advice language — the reading withheld; the audit stands) / `review_capped` / `review_error` (the audit alone writes nothing); the quote demo's `quote_demo`; the small-cap visit's `run_summary` with `ration_error` (the receipts could not be read; the ceiling is planned) and `smallcaps_error` (the fenced visit failed as a whole); the signal pass's `signals_error` / `signals_skipped`; the stop tracker's `stop_hit` / `realigned` / `split_realigned` / `split_unknown` (a re-alignment the tracker cannot explain — not dividend-sized, not an N-for-1, 1-for-N or p-for-q ≤ 5 ratio: the position is left untouched until a `splits` row settles it) / `stops_skipped` / `stops_error`; the risk report's `risk_flag` (one line per flagged student: value, mark, drawdown, risk used, the flags) / `risk_error` / `risk_skipped` (no signal rows to mark to yet). A `wrangler d1 execute --remote` that answers 7403 or 10000 is the control plane, not your data (I-2): retry the identical command, wait a minute, dashboard console, re-login — in that order.

**Resets.** Make a company due again: `UPDATE tickers SET fundamentals_as_of=NULL, last_price_fetch=NULL WHERE symbol='ETD'`. Retry a company marked `fundamentals_status='blocked'` (it is skipped until you do): `UPDATE tickers SET fundamentals_status=NULL WHERE symbol='X'`. Refetch five years for the core tier: `last_full_fetch=NULL` (the realign rotation does four a night anyway). Local D1 is `.wrangler/state` — delete it to start clean, then migrations and seeds again.

**Migrations** are the curriculum: `0001` init · `0002` the write budget · `0003` fundamentals · `0004` the value pool (tangible book) · `0005` explanations · `0006` the small-cap tier · `0007` dividends cadence + readings · `0008` signals · `0009` students, tickets, positions, splits (week 8) · `0010` `students.instruments`, `risk_reports`, `signals.quarantined` (week 9) · `0011` `notes`, `questions` (week 10; the FTS5 index is the seed's, not the migration's) · `0012` `reviews` (week 11). Apply with `wrangler d1 migrations apply`, local then remote, never by hand.

**What comes next (weeks 11–12) and the upgrade path.** The tutor's retrieval is SQLite full-text search (FTS5) in D1, with a plain word match as the fallback (decision #3; the design is #21). **Vectorize + Workers AI embeddings are the documented upgrade path, not the plan**: if FTS5 ever fails the room (synonyms, paraphrase — the week-10 habit "use the course's words" is the mitigation), the same `notes` rows go into a Vectorize index through Workers AI's embedding model and `searchNotes()` in `src/tutor.ts` swaps its query — nothing else in the Worker changes. Week 11 (built) is the real world — costs and tax, and "explain my portfolio"; a sentence-level support check on the tutor's and the review's citations (does the cited passage carry the sentence?) is the same upgrade path's second step, not the plan (OI-83). Week 12 is the logins (Cloudflare Access) and the takeaway kit.

**What never goes in the repo.** `.dev.vars`; any `key*.txt` / `ua.txt`; any file whose name starts with an underscore (`_SHIPMENT-NOTES-*`, `_PATCH-NOTES-*`, `_wrangler.smallcaps.jsonc`, a builder's `_seed-*.sql` or `_stub-*.mjs` — `.gitignore` refuses `_*`), VC forms in any format (`*VC-*form*.*`), every spreadsheet (`*.xlsx` — the filled VC-21 sheet, the VC-19 workbook and the `<ticker>-prices.csv.xlsx` sheets carry the test accounts' figures; no spreadsheet belongs in the repo, the decks are `.pptx`/`.pdf`) and `_wrangler.smallcaps.jsonc` — working notes whose record pastes are applied to BUILD-LOG / the decision log / the verification record, after which the notes stay local; account email, account id; anything from the tutor's day job. The D1 `database_id` in `wrangler.jsonc` is configuration, not a secret (decision #16). GitHub's push protection has refused one push (K-2); never press "bypass" — rotate the key and fold the commit.

## Repo map

```
src/index.ts              routes: landing, quote demo (capped), prices (+csv) + universe + fundamentals
                          APIs, chart (with the averages) and books pages, both screens, the card,
                          explain pages, signals API + page (with the Graham column), the watchlist;
                          the scheduled handler (cron → phase)
src/tutor.ts              week 10's routes: /tutor (the page and its form), POST /api/tutor, /api/tutor/recent —
                          retrieval (FTS5, the word-match fallback), the call, the checks, the receipts
src/review.ts             week 11's routes: /tickets/:code/review (the page, the button), GET /api/explain-my-portfolio/:code —
                          the rows composed into one sheet, the caps counted insert-first, the call, the checks, the receipts
src/costs.ts              week 11's worksheet: /costs and /api/costs — no database, no model
src/jobs/nightly.ts       the core-tier cron: prices stalest-first, rolling realign, accounts
                          phase, budgets it counts itself, fetch_log evidence
src/jobs/smallcaps.ts     the small-cap visit: the ration plan, AV prices + accounts, EDGAR EPS,
                          dividend cadence, EDGAR-only retries, the readings
src/jobs/signals.ts       the nightly signal pass: Carver's rule over every instrument → the signals table
src/jobs/stops.ts         the nightly stop tracker: the trailing stop per open paper position, the stamp, re-alignment
src/jobs/risk.ts          the nightly risk report: one risk_reports row per student, the mark carried, the flags, the receipts
src/jobs/fake-d1.ts       an in-memory stand-in for D1, for job tests
src/portfolio.ts          weeks 8–9's routes: the calculator, the tickets (API and form), the student's page with the
                          account strip, the risk report and the nightly rows; GET /api/risk/:code
src/page.ts               the pages' shared skin (the palette, the type, the classes several pages share)
src/providers.ts          FMP (core tier) + Alpha Vantage quote (demo), the M-shape classifier
src/providers-av.ts       Alpha Vantage daily / statements / dividends; the lease rule (D-2)
src/providers-edgar.ts    SEC EDGAR company-concept: period + form selection, EPS fallback
src/lib/ratios.ts         the ratio engine (raw and display figures)
src/lib/graham.ts         ch. 14 and ch. 15 rules tables → screens, card, chips
src/lib/adjust.ts         dividend and split adjustment for the small tier
src/lib/explain.ts        the fact sheet and the grounding checks (numbers, ids, advice)
src/lib/signals.ts        Carver's rule: EWMAs, EW volatility, the forecast, the state — one table
src/lib/sizing.ts         the Starter System's sizing and stop: risk target, units, gap, costs, minimum account — one table
src/lib/tickets.ts        the ticket's checks (the rule opens, the tier and the quarantine, concentration, size on the current
                          value, the budget, cash, journal) and the ledger; currentValue()
src/lib/risk.ts           the account marked to market, the report (hwm, drawdown, risk used, flags) and its sentences
src/lib/tutor.ts          the tutor's pure parts: the question's terms, the FTS expression, the word-match ranker, the
                          binding prompt, the answer's schema and validation, the checks (labels, numbers, advice)
src/lib/gate.ts           Graham ∩ Carver: the gate per company, the watchlist and its sentences — no rule of its own
src/lib/review.ts         the process review's pure parts: the audit (the rules applied to the rows), the sheet with no P&L, the
                          versioned prompt and schema, the reading's validation and checks (facts, numbers, advice, outcome language)
src/lib/costs.ts          TAX_RULES (every rate with its date and basis), BROKER, the trade's and the holding's costs, the gain taxed three ways
src/lib/narrative.ts      the Claude call (JSON schema, thinking off; claudeJson, shared by the narrative and the tutor) and the plain template
src/landing.ts            the twelve-week ledger page
migrations/               0001–0012, one per capability
scripts/                  verify-universe.mjs, seed-small-caps.mjs, visit-small-caps.mjs, enrol.mjs (+ --retire),
                          notes-chunker.mjs + seed-notes.mjs → seed-notes.sql (the tutor's corpus and its index),
                          universe-candidates.txt (+ the generated seeds and evidence JSON)
wrangler.jsonc            crons + D1 binding; wrangler.smallcaps.example.jsonc the PC-visit template
.dev.vars.example         the four secrets' names for a local .dev.vars (plus SMALLCAP_AV_CALLS; the optional caps)
docs/syllabus.md          the twelve-week plan, phase gates, decision log
docs/OPEN-ITEMS.md        the register: every finding, deferral and "later", and where it stands (built ≠ verified ≠ done)
docs/lessons/             lesson plans 1–11 with decks (.pptx and .pdf), the enterprising-screen segment, reading notes,
                          week-10-gold-set.md (the tutor's ten questions and the two it must not answer),
                          week-11-budget-2027-notes.md (Budget 2027 and the Finance (No. 2) Bill 2026, verified 12 Nov; the open questions)
docs/research/paper-notes.md  the research notes behind the course's claims — a dated living file (its quantitative record is as of 16 Oct 2026)
docs/reviews/             the independent reviews (week 5, Phase 2, v0.8.2, v0.9.0, v0.10.0, v0.11.0, Phase 3) and the Phase 2 and Phase 3 briefs
docs/how-we-built-it-phase-{1,2,3}.md the story of the build, phase by phase
docs/setup-guide.md       builder-only: zero-to-live. docs/api-keys-guide.md: the four secrets
docs/data-provider-checks.md  the verification record; docs/record-addendum.md its 30 Sep closures;
                          docs/records/ the filled VC forms behind the closures
kit/                      the student takeaway kit (start with kit/student-quickstart.md): the rules card, the decision journal, the
                          reading list, costs-and-tax-walkthrough.md and scam-spotting-notes.md (week 11)
BUILD-LOG.md              how this was built — weekly, honest, part of the product
```

## How this was built

This project doubles as a working demonstration of AI-assisted delivery: design decisions in Claude chat, implementation in Claude Code, Claude-powered product features from week 6, an independent review (a second model, a cold clone, findings before changes) before important weeks ship — with every step logged in [`BUILD-LOG.md`](BUILD-LOG.md) and everything verified by hand before it's trusted. The same standard the course asks of its students: process on the record, graded before the outcome is known. Nobody leaves their brain or autonomy at the door.

## License

MIT — see [`LICENSE`](LICENSE).
