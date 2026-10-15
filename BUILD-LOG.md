# BUILD-LOG

How this toolkit is being built, one honest entry per week. Design invariant 5 from the syllabus: *the repo documents its own making* — what was designed with Claude, what was built with Claude Code, and what was verified by hand before being trusted. Same standard the course asks of students: process on the record, graded before the outcome is known.

Entry format: **Designed** (decisions and their reasoning) · **Built** (what shipped, and by what means) · **Verified** (machine checks that ran, and the hand checks that gate "done").

---

## Week 1 — Hello, Worker · logged 12 Aug 2026

**Designed (Claude chat).** Syllabus v0.2 with the lesson↔feature map, phase gates and decision log; Appendix A (tutor's economics refresher); this week's scope held deliberately minimal — raw Worker, no router (Hono is week 2's lesson, so week 1 doesn't get it early), no tests yet (week 4's lesson). Landing page designed as a "twelve-week ledger": the build's own progress is the page's content, which makes the build-in-the-open promise self-evidencing.

**Built (Claude, sandboxed).** Repo scaffold: `src/index.ts` (landing page + `GET /api/hello` + JSON 404), `wrangler.jsonc` with placeholder comments for week 3's cron and D1, TypeScript via wrangler-generated runtime types, deploy-on-merge GitHub Actions workflow, MIT license. Course documents: lesson plan 1, decision-journal template (kit p.1), seeded reading list. One real course correction, logged because that's the point: the scaffold first pinned `@cloudflare/workers-types` alongside wrangler and hit a peer-dependency conflict on install; switched to the current practice of `wrangler types` generating `worker-configuration.d.ts` (gitignored, regenerated in CI by `npm run check`).

**Verified — machine (in the build sandbox).**

- `npm install` clean, 0 vulnerabilities; `wrangler types` + `tsc --noEmit` pass.
- `wrangler dev` boots; `GET /` → 200 HTML; `GET /api/hello` → 200 JSON with the week-1 payload; unknown route → 404 JSON.

**Verified — hand (gates "done"; tick before class).**

- [ ] `npm run dev` works on my own machine; site renders correctly on a phone-width screen.
- [ ] Deployed to my Cloudflare account (`npx wrangler login && npm run deploy`); live URL opens on my phone over mobile data.
- [ ] GitHub repo public; `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` secrets set; a trivial push to `main` produces a green Actions run and a visible change on the live site.
- [ ] Landing-page GitHub placeholder replaced with the real repo URL.
- [ ] Journal template prints cleanly; one stack printed for lesson 1.

Deviation (wk 3, closed): production backfill breached D1's 100k/day metered-write
allowance — each insert counts the table plus every index, and idx_prices_symbol_date
duplicated the PK (≈3 writes/row × 38,874 ≈ 116k). Fix: migration 0002 drops the
redundant index (~2 writes/row); Sunday full refresh replaced by rolling realign
(4 symbols/night, last_full_fetch-tracked); insert budget + write-failure abort added
to the cron. Verified in sandbox: index gone, realign set selects stalest-first,
auth abort after one call, summary records the realign list. Alphabetical tail of
night-one backfill (≈TSLA–XOM) self-heals on the next run. Cost: €0 then, €0 now —
the free tier remains the design, and the limit notification is now teaching material.

Week 5½ — the value pool · logged 14 Oct 2026
**Finding.** 31 of 31 fail Graham's defensive screen; 29 fail each price test; none pass both.
Reading: a glamour universe (chosen for recognisability and free-tier coverage) screened by
tests written to reject glamour (TII p. 349) — the screen working, on an expensive market.
**Decided.** Widen the pool with the unglamorous end — 44 mid/large value names and 52 small
caps, Graham's enterprising hunting ground (p. 386), weighted small so the class can build a
paper portfolio from it; the sweep decides which the free plan serves. Build Graham's
enterprising-investor screen (ch. 15) alongside the defensive one.
**Built (v0.5.3).** Resumable sweep (+ classifier-order fix); second price cron invocation with
last_price_fetch guard (capacity ~90); accounts 15/night; goodwill & intangibles stored →
tangible book per share and P/TBV in the ratio engine (ch. 15's price test); fail-count footer
on /screen. Migration 0004. 47 tests. Verified in sandbox: second invocation skips what the
first fetched (doneTonight: 3, fetches: 2); footer renders; sweep resume/merge tested with a
stubbed network, including stop-on-limit and carry-on-tomorrow.
