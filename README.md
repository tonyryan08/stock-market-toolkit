# Intro to the Stock Market — course toolkit

A community-school course in good financial decision-making, and the Cloudflare Workers toolkit that powers it — built in public, one capability per week, over twelve weeks.

**We grade decisions, not outcomes.** Paper portfolios only. No tips, ever. **Education, not advice** — nothing in this repository is a recommendation to buy or sell anything.

## Status

**Week 3 of 12 — shipped.** The data spine is live: a nightly cron snapshots the whole course universe into a D1 cache after the US close, and everything students touch is served from that cache — adjusted five-year price charts at [`/prices/AAPL`](./), the inspectable universe at `/api/universe`, raw history at `/api/prices/:ticker`. Live-fetch latency was 858 ms; the cache serves in single-digit milliseconds. Week 2's rationed live quote (`/api/quote/:ticker`) survives as the tutor's demo of the difference.

The universe is a **verified list**: free-plan data coverage turned out to be a whitelist (see `docs/data-provider-checks.md`), so `npm run verify-universe` probes every candidate and publishes the evidence — greens become the universe, refusals are documented, nothing is guessed.

Full plan: [`docs/syllabus.md`](docs/syllabus.md) · how it was built: [`BUILD-LOG.md`](BUILD-LOG.md).

## Quickstart

Prerequisites: Node 20+. Two free API keys (see `.dev.vars.example`).

```sh
npm install
npm run dev        # local dev server on http://localhost:8787
```

First-time data setup (one-off, order matters):

```sh
npm run verify-universe                                   # discover the universe (~130 FMP calls)
npx wrangler d1 create stock-market-db                    # then paste the database_id into wrangler.jsonc
npx wrangler d1 migrations apply stock-market-db --local
npx wrangler d1 execute stock-market-db --local --file=scripts/seed-universe.sql
npm run dev:cron                                          # then trigger one run: see shipment notes
```

## Deploy

```sh
npx wrangler login
npx wrangler d1 migrations apply stock-market-db --remote
npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-universe.sql
npm run deploy
```

Production fills itself: the cron runs nightly at 22:30 UTC (23:30 Irish), and its first run backfills ~5 years of history for the whole universe in one pass. Runtime secrets go in via `wrangler secret put ALPHAVANTAGE_API_KEY` and `FMP_API_KEY` — never in files.

Deploy-on-merge CI exists but is **parked by decision** (`.github/workflows/deploy.yml`, manual trigger only); releasing is `npm run deploy` until the team wants the robot.

## Repo map

```
src/index.ts          routes: landing, live quote (rationed demo), cache-first prices,
                      universe, chart pages — plus the nightly scheduled handler
src/jobs/nightly.ts   the cron: incremental refresh, Sunday realign, M-shape error map,
                      budget cap, fetch_log evidence
src/providers.ts      Alpha Vantage quote (demo), FMP profile + adjusted history (spine)
src/landing.ts        the twelve-week ledger page
migrations/           D1 schema, one migration per capability as the weeks ship
scripts/              verify-universe.mjs (the whitelist detector), candidates, seed SQL
wrangler.jsonc        Workers config: cron trigger, D1 binding
docs/syllabus.md      the twelve-week plan: lessons ↔ features, phase gates, decision log
docs/lessons/         one lesson plan per week as they ship
docs/setup-guide.md   builder-only: zero-to-live setup. Students do NOT need this
docs/api-keys-guide.md        builder-only: API keys, step by step
docs/data-provider-checks.md  the verification record — evidence behind every data decision
kit/                  the student takeaway kit (start with kit/student-quickstart.md)
BUILD-LOG.md          how this was built — weekly, honest, part of the product
```

## How this was built

This project doubles as a working demonstration of AI-assisted delivery: design decisions in Claude chat, implementation in Claude Code, and (from week 6) Claude-powered product features — with every step logged in [`BUILD-LOG.md`](BUILD-LOG.md) and everything verified by hand before it's trusted. The same standard the course asks of its students: process on the record, graded before the outcome is known.

## License

MIT — see [`LICENSE`](LICENSE).
