# Intro to the Stock Market — course toolkit

A community-school course in good financial decision-making, and the Cloudflare Workers toolkit that powers it — built in public, one capability per week, over twelve weeks.

**We grade decisions, not outcomes.** Paper portfolios only. No tips, ever. **Education, not advice** — nothing in this repository is a recommendation to buy or sell anything.

## Status

**Phase 3 complete and closed out — week 9 shipped, v0.11.0 (5 Nov 2026); the Phase 3 gate met live (VC-21, 9–10 Nov); the end-of-phase review implemented, v0.11.1 (10 Nov 2026).** Phases 1–2 (weeks 1–6, the small-cap tier) are complete and twice reviewed; Phase 3 (a systematic, rules-based engine and paper portfolios, weeks 7–9) has the signal engine (week 7, reviewed and reconciled by hand — VC-19), the sizing, the stop and the paper tickets (week 8, verified live — VC-20), and now the paper account marked to market with the nightly risk report (week 9; the Phase 3 gate is VC-21).

What runs tonight, unattended: at 22:30 and 22:40 UTC the Worker refreshes five years of adjusted daily prices for the **core tier** — 38 household US names verified against the free plan — at 22:50 it refreshes the accounts of the 15 stalest companies, and at 23:00 it runs Carver's trend rule over every instrument (`/signals`: 16/64-day crossover, instrument risk, long or flat — decision #17). Everything a student touches is served from that D1 cache in single-digit milliseconds (the live fetch it replaced took 858 ms). On top of the cache: a books page per company (`/fundamentals/AAPL`), Graham's defensive screen (`/screen`, ch. 14 of *The Intelligent Investor*) and his enterprising screen (`/screen/enterprising`, ch. 15), a two-page checklist card (`/card`) printed from the same rules table the screens run on, "explain this stock" (`/explain/NVDA`) — a narrative written by Claude from a numbered fact sheet and checked by the toolkit before it is shown — and, from week 7, the signals page and the two averages drawn on every chart; from week 8, the position-size calculator (`/size`) and each student's paper tickets (`/tickets/<code>`), with the stop tracked nightly; from week 9, the account marked to market every night — cash, open P&L, the high-water mark and the drawdown, the risk the positions carry against the 12% budget — as a report in sentences on the student's page and at `/api/risk/<code>`, with the pre-trade checks (size on the current value at 12% ÷ N instruments, concentration, budget) that refuse a ticket in a sentence; the calculator takes the number of instruments too.

The **small-cap tier** — Graham's enterprising hunting ground, which the free FMP plan does not serve — has its own data spine: Alpha Vantage for as-traded prices and accounts, SEC EDGAR for diluted EPS with the filing named on every row, and dividend adjustment done by the toolkit. Alpha Vantage meters its free tier by sender address, so the tier is visited from the tutor's own computer (`npm run smallcaps`), not by the cron (I-4 in the record).

Two universes, one rule: a company is in the universe only when a probe has proved the plan serves it (`npm run verify-universe`, `npm run seed-small-caps`); refusals are documented, nothing is guessed.

The record: [`docs/syllabus.md`](docs/syllabus.md) (the plan and the decision log, 20 decisions) · [`BUILD-LOG.md`](BUILD-LOG.md) (how it was built, week by week) · [`docs/data-provider-checks.md`](docs/data-provider-checks.md) (every verification check, incident and key slip; the filled forms in [`docs/records/`](docs/records/)) · [`docs/reviews/`](docs/reviews/) (the independent reviews, findings reported before anything changed) · [`docs/OPEN-ITEMS.md`](docs/OPEN-ITEMS.md) (the register: every finding and where it stands) · [`docs/how-we-built-it-phase-1.md`](docs/how-we-built-it-phase-1.md), [`-phase-2.md`](docs/how-we-built-it-phase-2.md) and [`-phase-3.md`](docs/how-we-built-it-phase-3.md) (the story, for people who don't read code).

## Quickstart

Prerequisites: Node 20+. Four secrets (see `.dev.vars.example` and `docs/api-keys-guide.md`): two free data keys, a Claude API key (pre-paid, for the explain route — the site works without it), and an EDGAR User-Agent (not a key: the project name and an email, which the SEC's fair-access policy requires).

```sh
npm ci             # a fresh clone: installs exactly the lockfile (npm install under another npm rewrites it — Phase 3 review N16); `npm install` after a shipment that changes a pin
npm test           # 452 tests
npm run check      # wrangler types + tsc
npm run dev        # http://127.0.0.1:8787 (wrangler binds the IPv4 loopback; `localhost` can resolve to ::1 on Windows and not answer)
```

First-time data setup, in this order (the detail is in `docs/setup-guide.md`):

```sh
npm run verify-universe                                   # probe the candidates (~2 FMP calls each) → scripts/seed-universe.sql
npx wrangler d1 create stock-market-db                    # paste the database_id it prints into wrangler.jsonc
npx wrangler d1 migrations apply stock-market-db --local  # 0001 … 0010
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

**Rations.** Alpha Vantage free: 25 calls in any rolling 24 hours, 5 a minute, metered by key *and* by sender address. The small-cap visit plans within the rolling ration it reads from its own receipts — visits and live quotes of the last 24 hours plus a ten-minute margin (a receipt is stamped at a run's start; its calls follow over the next minutes), three kept back — and `--calls N` (default 20) is only a ceiling (v0.10.0, OI-51); a receipt it cannot read leaves a `ration_error` line and the ceiling is planned, as before; the tutor's live quote demo (`/api/quote/:ticker`) is capped at 3 a day on the same key (`QUOTE_DAILY_CAP`; `"0"` switches it off), answering 429 with the cached close once spent. FMP free: 250 a day; the nightly job counts its own fetches (45 per invocation, Workers Free's limit is 50) and resumes next night. Claude: one generation per company per fact-sheet fingerprint, 60 a day (`EXPLAIN_DAILY_CAP`), cost in hundredths of a cent per story. D1: 100k metered writes a day — each insert counts the table plus every index, which is why `migrations/0002` dropped one and why no later migration adds any.

**The nightly alarms** (`wrangler.jsonc` → `triggers.crons`): `30 22 * * *` and `40 22 * * *` are price runs (any `mm 22` line is; add a line to add 45 fetches of capacity), `50 22 * * *` is the accounts run, and `0 23 * * *` the **signals** pass followed by the **stop tracker** and then the **risk report** (all three D1 only, no provider calls: one row per instrument in the `signals` table, then every open paper position's trailing stop, then one `risk_reports` row per student per night (keyed on the night's latest close, not on a lagging position's), the account marked to the latest closes, the high-water mark carried from the last row, the flags — its own invocation so a fault in one phase never costs another, each pass fenced on its own). There is no small-cap cron: `10 23 * * *` is still understood by the handler for the PC visit, but it is not scheduled. Edit the crons line in Notepad; `npm run deploy` prints the schedules it registered.

**The doorbell (local runs).** With `npm run dev:cron` running, open in the browser: `http://127.0.0.1:8787/__scheduled?cron=30+22+*+*+*` (prices), `…?cron=50+22+*+*+*` (accounts), `…?cron=0+23+*+*+*` (signals, stops and the risk report — free, no calls), `…?cron=10+23+*+*+*` (small caps), `…?cron=*+*+*+*+*` (everything). On wrangler builds where that path 404s, the same query on `/cdn-cgi/handler/scheduled` is the current one; the visit script tries both. A company visited in the last six hours is skipped, so ringing twice costs nothing — but a *local* ring spends the shared Alpha Vantage key.

**The small-cap visit from your PC** (v0.8.1, I-4). Once: save `wrangler.smallcaps.example.jsonc` as `_wrangler.smallcaps.jsonc`, paste the `database_id` from `wrangler.jsonc` over the zeros (the underscore keeps it out of git). Then `npm run smallcaps -- --calls 18` (an unknown or malformed argument stops it before it rings — OI-50): it starts the Worker locally on port 8790 with the **live** database bound remotely (wrangler ≥ 4.37's `"remote": true`), rings the doorbell, polls the live `fetch_log` for up to 14 minutes, prints the receipt and stops the server. Expect `ok` + `fund_ok` per company visited, `avCalls ≤ N`, and `blocked` where Alpha Vantage has no series. Dividends refresh every 100 days on their own (one call); accounts every 400 (three calls); EPS gaps retry EDGAR-only at no Alpha Vantage cost; a 403 from EDGAR is a User-Agent problem and is not retried. Run it once a day while the tier fills (~10 runs), weekly after. **The ration is a rolling 24 hours, not a calendar day** (24 Oct: the 26th call since the previous evening was refused at 10:07 UTC; two runs in the following week were cut short by an early start). Since v0.10.0 the Worker counts the last 24 hours' calls from the receipts and plans within them, so the hour no longer matters: a run on a spent ration fetches nothing and the receipt says when the window frees. Never re-run a VC's preparation lines; a run stopped by the limit mid-visit puts that company first in the next run's queue.

**Enrolling students (weeks 8–9).** `npm run enrol -- --name "Ada Lovelace" --capital 10000` writes a row to the live `students` table through `wrangler d1 execute --remote` and prints the code once (`XXXX-XXXX`, no ambiguous characters); `npm run enrol -- --list` shows them again, with each account's instruments; `--local` does the same to the local database for a rehearsal. `--instruments N` (1–4, default 1) sets how many instruments the account runs — each position is sized at 12% ÷ N a year and the ticket refuses the (N + 1)th open position; `npm run enrol -- --set-instruments CODE N` changes it later (positions already open keep their size; the nightly report flags an account over the count or the budget). The code is the student's identity until Cloudflare Access in week 12: it is in their page's URL (`/tickets/<code>`) and on every ticket — and, from v0.11.0, nowhere in the page's text, so a screenshot of the page does not carry it (OI-56) — so the enrolment list stays off the repo like any other personal record. A paper account is between $500 and $1,000,000; the calculator shows what a small one cannot do.

**Reading the receipt.** Every provider call and every run is a row in `fetch_log`:
```sh
npx wrangler d1 execute stock-market-db --remote --command "SELECT run_at, symbol, outcome, substr(detail,1,160) AS d FROM fetch_log ORDER BY id DESC LIMIT 40"
```
Outcomes — prices: `ok` / `error` / `blocked` (the plan does not serve the symbol — permanent until reset) / `av_jump` (a >40% day in the adjusted series; for the small tier the signal pass quarantines the symbol until a `splits` row within four days of the date explains it — a split, or factor 1 with a note for news; an `av_jump` line is permanent, so the factor-1 row is the way out. The `splits` table is read by the stop tracker for **any tier**: a row for a core-tier name is the recovery path for a `split_unknown`, the quarantine is the small tier's only) / `realigned` / `dividends` (a dividends-only visit); accounts: `fund_ok` / `fund_partial` / `fund_error` / `fund_blocked` / `fund_eps_missing`, with `edgar_failed`, `edgar_ok` (a retry) and `edgar_mismatch` (EDGAR's net income more than 1% from Alpha Vantage's); run-level: `rate_limited`, `auth_failed`, `av_premium`, `fetch_budget`, `write_error`, `write_limited`, `write_budget`, `run_summary`; the explain route's `explain_ok` / `explain_capped` / `explain_rejected` / `explain_error`; the quote demo's `quote_demo`; the small-cap visit's `run_summary` with `ration_error` (the receipts could not be read; the ceiling is planned) and `smallcaps_error` (the fenced visit failed as a whole); the signal pass's `signals_error` / `signals_skipped`; the stop tracker's `stop_hit` / `realigned` / `split_realigned` / `split_unknown` (a re-alignment the tracker cannot explain — not dividend-sized, not an N-for-1, 1-for-N or p-for-q ≤ 5 ratio: the position is left untouched until a `splits` row settles it) / `stops_skipped` / `stops_error`; the risk report's `risk_flag` (one line per flagged student: value, mark, drawdown, risk used, the flags) / `risk_error` / `risk_skipped` (no signal rows to mark to yet). A `wrangler d1 execute --remote` that answers 7403 or 10000 is the control plane, not your data (I-2): retry the identical command, wait a minute, dashboard console, re-login — in that order.

**Resets.** Make a company due again: `UPDATE tickers SET fundamentals_as_of=NULL, last_price_fetch=NULL WHERE symbol='ETD'`. Retry a company marked `fundamentals_status='blocked'` (it is skipped until you do): `UPDATE tickers SET fundamentals_status=NULL WHERE symbol='X'`. Refetch five years for the core tier: `last_full_fetch=NULL` (the realign rotation does four a night anyway). Local D1 is `.wrangler/state` — delete it to start clean, then migrations and seeds again.

**Migrations** are the curriculum: `0001` init · `0002` the write budget · `0003` fundamentals · `0004` the value pool (tangible book) · `0005` explanations · `0006` the small-cap tier · `0007` dividends cadence + readings · `0008` signals · `0009` students, tickets, positions, splits (week 8) · `0010` `students.instruments`, `risk_reports`, `signals.quarantined` (week 9). Apply with `wrangler d1 migrations apply`, local then remote, never by hand.

**What comes next (Phase 4, weeks 10–12) and the upgrade path.** Week 10's tutor bot answers questions from the course's own notes: retrieval is SQLite full-text search (FTS5) in D1 — spike-tested first, with a plain `LIKE` search as the fallback (decision #3). **Vectorize + Workers AI embeddings are the documented upgrade path, not the plan**: if FTS5 ever fails the room (synonyms, paraphrase), the same notes go into a Vectorize index through Workers AI's embedding model and the retrieval route swaps the query — nothing else in the Worker changes. Week 11 is the real-world costs and tax; week 12 the logins (Cloudflare Access) and the takeaway kit.

**What never goes in the repo.** `.dev.vars`; any `key*.txt` / `ua.txt`; `_SHIPMENT-NOTES-*`, `_PATCH-NOTES-*`, VC forms in any format (`*VC-*form*.*`), every spreadsheet (`*.xlsx` — the filled VC-21 sheet, the VC-19 workbook and the `<ticker>-prices.csv.xlsx` sheets carry the test accounts' figures; no spreadsheet belongs in the repo, the decks are `.pptx`/`.pdf`) and `_wrangler.smallcaps.jsonc` — working notes whose record pastes are applied to BUILD-LOG / the decision log / the verification record, after which the notes stay local; account email, account id; anything from the tutor's day job. The D1 `database_id` in `wrangler.jsonc` is configuration, not a secret (decision #16). GitHub's push protection has refused one push (K-2); never press "bypass" — rotate the key and fold the commit.

## Repo map

```
src/index.ts              routes: landing, quote demo (capped), prices (+csv) + universe + fundamentals
                          APIs, chart (with the averages) and books pages, both screens, the card,
                          explain pages, signals API + page; the scheduled handler (cron → phase)
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
src/page.ts               the pages' shared skin
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
src/lib/narrative.ts      the Claude call (JSON schema, thinking off) and the plain template
src/landing.ts            the twelve-week ledger page
migrations/               0001–0010, one per capability
scripts/                  verify-universe.mjs, seed-small-caps.mjs, visit-small-caps.mjs, enrol.mjs,
                          universe-candidates.txt (+ the generated seeds and evidence JSON)
wrangler.jsonc            crons + D1 binding; wrangler.smallcaps.example.jsonc the PC-visit template
.dev.vars.example         the four secrets' names for a local .dev.vars (plus SMALLCAP_AV_CALLS)
docs/syllabus.md          the twelve-week plan, phase gates, decision log
docs/OPEN-ITEMS.md        the register: every finding, deferral and "later", and where it stands (built ≠ verified ≠ done)
docs/lessons/             lesson plans 1–9 with decks (.pptx and .pdf), the enterprising-screen segment, reading notes,
                          week-11-budget-2027-notes.md (the Budget 2027 notes for week 11's costs-and-tax lesson)
docs/research/paper-notes.md  the research notes behind the course's claims — a dated living file (its quantitative record is as of 16 Oct 2026)
docs/reviews/             the independent reviews (week 5, Phase 2, v0.8.2, v0.9.0, v0.10.0, v0.11.0, Phase 3) and the Phase 2 and Phase 3 briefs
docs/how-we-built-it-phase-{1,2,3}.md the story of the build, phase by phase
docs/setup-guide.md       builder-only: zero-to-live. docs/api-keys-guide.md: the four secrets
docs/data-provider-checks.md  the verification record; docs/record-addendum.md its 30 Sep closures;
                          docs/records/ the filled VC forms behind the closures
kit/                      the student takeaway kit (start with kit/student-quickstart.md)
BUILD-LOG.md              how this was built — weekly, honest, part of the product
```

## How this was built

This project doubles as a working demonstration of AI-assisted delivery: design decisions in Claude chat, implementation in Claude Code, Claude-powered product features from week 6, an independent review (a second model, a cold clone, findings before changes) before important weeks ship — with every step logged in [`BUILD-LOG.md`](BUILD-LOG.md) and everything verified by hand before it's trusted. The same standard the course asks of its students: process on the record, graded before the outcome is known. Nobody leaves their brain or autonomy at the door.

## License

MIT — see [`LICENSE`](LICENSE).
