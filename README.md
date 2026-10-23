# Intro to the Stock Market — course toolkit

A community-school course in good financial decision-making, and the Cloudflare Workers toolkit that powers it — built in public, one capability per week, over twelve weeks.

**We grade decisions, not outcomes.** Paper portfolios only. No tips, ever. **Education, not advice** — nothing in this repository is a recommendation to buy or sell anything.

## Status

**Phase 2 complete — weeks 1–6 and the small-cap tier, v0.8.2 (23 Oct 2026).** Phase 3 (a systematic, rules-based engine and paper portfolios, weeks 7–9) is next.

What runs tonight, unattended: at 22:30 and 22:40 UTC the Worker refreshes five years of adjusted daily prices for the **core tier** — 38 household US names verified against the free plan — and at 22:50 it refreshes the accounts of the 15 stalest companies. Everything a student touches is served from that D1 cache in single-digit milliseconds (the live fetch it replaced took 858 ms). On top of the cache: a books page per company (`/fundamentals/AAPL`), Graham's defensive screen (`/screen`, ch. 14 of *The Intelligent Investor*) and his enterprising screen (`/screen/enterprising`, ch. 15), a two-page checklist card (`/card`) printed from the same rules table the screens run on, and "explain this stock" (`/explain/NVDA`) — a narrative written by Claude from a numbered fact sheet and checked by the toolkit before it is shown.

The **small-cap tier** — Graham's enterprising hunting ground, which the free FMP plan does not serve — has its own data spine: Alpha Vantage for as-traded prices and accounts, SEC EDGAR for diluted EPS with the filing named on every row, and dividend adjustment done by the toolkit. Alpha Vantage meters its free tier by sender address, so the tier is visited from the tutor's own computer (`npm run smallcaps`), not by the cron (I-4 in the record).

Two universes, one rule: a company is in the universe only when a probe has proved the plan serves it (`npm run verify-universe`, `npm run seed-small-caps`); refusals are documented, nothing is guessed.

The record: [`docs/syllabus.md`](docs/syllabus.md) (the plan and the decision log, 16 decisions) · [`BUILD-LOG.md`](BUILD-LOG.md) (how it was built, week by week) · [`docs/data-provider-checks.md`](docs/data-provider-checks.md) (every verification check, incident and key slip; the filled forms in [`docs/records/`](docs/records/)) · [`docs/reviews/`](docs/reviews/) (two independent reviews, findings reported before anything changed) · [`docs/how-we-built-it-phase-1.md`](docs/how-we-built-it-phase-1.md) and [`-phase-2.md`](docs/how-we-built-it-phase-2.md) (the story, for people who don't read code).

## Quickstart

Prerequisites: Node 20+. Four secrets (see `.dev.vars.example` and `docs/api-keys-guide.md`): two free data keys, a Claude API key (pre-paid, for the explain route — the site works without it), and an EDGAR User-Agent (not a key: the project name and an email, which the SEC's fair-access policy requires).

```sh
npm install
npm test           # 149 tests
npm run check      # wrangler types + tsc
npm run dev        # http://localhost:8787
```

First-time data setup, in this order (the detail is in `docs/setup-guide.md`):

```sh
npm run verify-universe                                   # probe the candidates (~2 FMP calls each) → scripts/seed-universe.sql
npx wrangler d1 create stock-market-db                    # paste the database_id it prints into wrangler.jsonc
npx wrangler d1 migrations apply stock-market-db --local  # 0001 … 0007
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

**Rations.** Alpha Vantage free: 25 calls a day, 5 a minute, metered by key *and* by sender address. The small-cap visit spends up to 20 (`--calls N` to spend less); the tutor's live quote demo (`/api/quote/:ticker`) is capped at 3 a day on the same key (`QUOTE_DAILY_CAP`), answering 429 with the cached close once spent. FMP free: 250 a day; the nightly job counts its own fetches (45 per invocation, Workers Free's limit is 50) and resumes next night. Claude: one generation per company per fact-sheet fingerprint, 60 a day (`EXPLAIN_DAILY_CAP`), cost in hundredths of a cent per story. D1: 100k metered writes a day — each insert counts the table plus every index, which is why `migrations/0002` dropped one and why no later migration adds any.

**The nightly alarms** (`wrangler.jsonc` → `triggers.crons`): `30 22 * * *` and `40 22 * * *` are price runs (any `mm 22` line is; add a line to add 45 fetches of capacity), `50 22 * * *` is the accounts run. There is no small-cap cron: `10 23 * * *` is still understood by the handler for the PC visit, but it is not scheduled. Edit the crons line in Notepad; `npm run deploy` prints the schedules it registered.

**The doorbell (local runs).** With `npm run dev:cron` running, open in the browser: `http://localhost:8787/__scheduled?cron=30+22+*+*+*` (prices), `…?cron=50+22+*+*+*` (accounts), `…?cron=10+23+*+*+*` (small caps), `…?cron=*+*+*+*+*` (everything). On wrangler builds where that path 404s, the same query on `/cdn-cgi/handler/scheduled` is the current one; the visit script tries both. A company visited in the last six hours is skipped, so ringing twice costs nothing — but a *local* ring spends the shared Alpha Vantage key.

**The small-cap visit from your PC** (v0.8.1, I-4). Once: save `wrangler.smallcaps.example.jsonc` as `_wrangler.smallcaps.jsonc`, paste the `database_id` from `wrangler.jsonc` over the zeros (the underscore keeps it out of git). Then `npm run smallcaps` (or `-- --calls 16`): it starts the Worker locally on port 8790 with the **live** database bound remotely (wrangler ≥ 4.37's `"remote": true`), rings the doorbell, polls the live `fetch_log` for up to 14 minutes, prints the receipt and stops the server. Expect `ok` + `fund_ok` per company visited, `avCalls ≤ N`, and `blocked` where Alpha Vantage has no series. Dividends refresh every 100 days on their own (one call); accounts every 400 (three calls); EPS gaps retry EDGAR-only at no Alpha Vantage cost; a 403 from EDGAR is a User-Agent problem and is not retried. Run it once a day while the tier fills (~10 runs), weekly after.

**Reading the receipt.** Every provider call and every run is a row in `fetch_log`:
```sh
npx wrangler d1 execute stock-market-db --remote --command "SELECT run_at, symbol, outcome, substr(detail,1,160) AS d FROM fetch_log ORDER BY id DESC LIMIT 40"
```
Outcomes: prices `ok` / `partial` / `error` / `blocked` (the plan does not serve the symbol — permanent until reset); accounts `fund_ok` / `fund_partial` / `fund_error` / `fund_blocked` / `fund_eps_missing`; run-level `rate_limited`, `auth_failed`, `av_premium`, `fetch_budget`, `run_summary`; the explain route's `explain_ok` / `explain_capped` / `explain_rejected` / `explain_error`; the quote demo's `quote_demo`; `edgar_mismatch` when EDGAR's net income disagrees with Alpha Vantage's by more than 1%. A `wrangler d1 execute --remote` that answers 7403 or 10000 is the control plane, not your data (I-2): retry the identical command, wait a minute, dashboard console, re-login — in that order.

**Resets.** Make a company due again: `UPDATE tickers SET fundamentals_as_of=NULL, last_price_fetch=NULL WHERE symbol='ETD'`. Retry a company marked `fundamentals_status='blocked'` (it is skipped until you do): `UPDATE tickers SET fundamentals_status=NULL WHERE symbol='X'`. Refetch five years for the core tier: `last_full_fetch=NULL` (the realign rotation does four a night anyway). Local D1 is `.wrangler/state` — delete it to start clean, then migrations and seeds again.

**Migrations** are the curriculum: `0001` init · `0002` the write budget · `0003` fundamentals · `0004` the value pool (tangible book) · `0005` explanations · `0006` the small-cap tier · `0007` dividends cadence + readings. Apply with `wrangler d1 migrations apply`, local then remote, never by hand.

**What never goes in the repo.** `.dev.vars`; any `key*.txt` / `ua.txt`; `_SHIPMENT-NOTES-*`, `_PATCH-NOTES-*`, VC forms (`*VC-*form*.md`) and `_wrangler.smallcaps.jsonc` — working notes whose record pastes are applied to BUILD-LOG / the decision log / the verification record, after which the notes stay local; account email, account id; anything from the tutor's day job. The D1 `database_id` in `wrangler.jsonc` is configuration, not a secret (decision #16). GitHub's push protection has refused one push (K-2); never press "bypass" — rotate the key and fold the commit.

## Repo map

```
src/index.ts              routes: landing, quote demo (capped), prices + universe + fundamentals
                          APIs, chart and books pages, both screens, the card, explain pages;
                          the scheduled handler (cron → phase)
src/jobs/nightly.ts       the core-tier cron: prices stalest-first, rolling realign, accounts
                          phase, budgets it counts itself, fetch_log evidence
src/jobs/smallcaps.ts     the small-cap visit: the ration plan, AV prices + accounts, EDGAR EPS,
                          dividend cadence, EDGAR-only retries, the readings
src/providers.ts          FMP (core tier) + Alpha Vantage quote (demo), the M-shape classifier
src/providers-av.ts       Alpha Vantage daily / statements / dividends; the lease rule (D-2)
src/providers-edgar.ts    SEC EDGAR company-concept: period + form selection, EPS fallback
src/lib/ratios.ts         the ratio engine (raw and display figures)
src/lib/graham.ts         ch. 14 and ch. 15 rules tables → screens, card, chips
src/lib/adjust.ts         dividend adjustment for the small tier
src/lib/explain.ts        the fact sheet and the grounding checks (numbers, ids, advice)
src/lib/narrative.ts      the Claude call (JSON schema, thinking off) and the plain template
src/landing.ts            the twelve-week ledger page
migrations/               0001–0007, one per capability
scripts/                  verify-universe.mjs, seed-small-caps.mjs, visit-small-caps.mjs,
                          universe-candidates.txt (+ the generated seeds and evidence JSON)
wrangler.jsonc            crons + D1 binding; wrangler.smallcaps.example.jsonc the PC-visit template
docs/syllabus.md          the twelve-week plan, phase gates, decision log
docs/lessons/             lesson plans 1–6 with decks, the enterprising-screen segment, reading notes
docs/reviews/             week-5 and Phase 2 independent reviews, and the Phase 2 brief
docs/how-we-built-it-phase-{1,2}.md   the story of the build, phase by phase
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
