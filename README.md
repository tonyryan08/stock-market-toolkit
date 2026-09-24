# Intro to the Stock Market — course toolkit

A community-school course in good financial decision-making, and the Cloudflare Workers toolkit that powers it — built in public, one capability per week, over twelve weeks.

**We grade decisions, not outcomes.** Paper portfolios only. No tips, ever. **Education, not advice** — nothing in this repository is a recommendation to buy or sell anything.

## Status

**Week 2 of 12 — shipped.** The site now looks up live quotes: `GET /api/quote/:ticker` fetches prices from Alpha Vantage and company profiles from Financial Modeling Prep, in parallel, with honest warnings when either declines to play. Week 1's `GET /api/hello` lives on. The toolkit grows a capability a week, same as the students. The full plan is in [`docs/syllabus.md`](docs/syllabus.md); how each piece was built is in [`BUILD-LOG.md`](BUILD-LOG.md).

Live data needs two free API keys — copy `.dev.vars.example` to `.dev.vars` locally, and for the deployed site: `npx wrangler secret put ALPHAVANTAGE_API_KEY` (and again for `FMP_API_KEY`).

## Quickstart

Prerequisites: Node 20+.

```sh
npm install
npm run dev        # local dev server on http://localhost:8787
```

Open http://localhost:8787 for the site, or http://localhost:8787/api/hello for the route.

## Deploy

One-off, from your machine:

```sh
npx wrangler login
npm run deploy
```

## Deploy-on-merge (CI)

Every push to `main` type-checks and deploys via GitHub Actions ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)). One-time setup:

1. Create a Cloudflare API token (the **Edit Cloudflare Workers** template is sufficient) and note your **account ID** from the dashboard.
2. In the GitHub repo: **Settings → Secrets and variables → Actions**, add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
3. Push to `main`. Green run = live site.

Secrets never live in this repo — runtime secrets (arriving week 6) go in via `wrangler secret put`.

## Repo map

```
src/                  the Worker: routes (index.ts), landing page, data providers
wrangler.jsonc        Workers config (cron + D1 arrive week 3, per the comments)
.dev.vars.example     template for local API keys (the real .dev.vars is gitignored)
docs/syllabus.md      the twelve-week plan: lessons ↔ features, phase gates, decision log
docs/lessons/         one lesson plan per week as they ship
docs/setup-guide.md   builder-only: zero-to-live setup. Students do NOT need this
kit/                  the student takeaway kit, built as by-products week by week
                      (start with kit/student-quickstart.md — students need no setup)
BUILD-LOG.md          how this was built — weekly, honest, part of the product
```

## How this was built

This project doubles as a working demonstration of AI-assisted delivery: design decisions in Claude chat, implementation in Claude Code, and (from week 6) Claude-powered product features — with every step logged in [`BUILD-LOG.md`](BUILD-LOG.md) and everything verified by hand before it's trusted. The same standard the course asks of its students: process on the record, graded before the outcome is known.

## License

MIT — see [`LICENSE`](LICENSE).
