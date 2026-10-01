# Week 3 Shipment — Apply Notes

**Read this, follow the steps in order, don't commit this file** (untick it in Desktop, or delete when done).

## What this is

The data spine: nightly cron → D1 cache, with the universe discovered by evidence rather than assumed. VC-10's verdict (DVN blocked: the free plan is a whitelist, not a domicile rule) is built in — the shipment includes the **universe verifier**, and the universe is whatever it proves.

New: `migrations/0001_init.sql` · `src/jobs/nightly.ts` · `scripts/verify-universe.mjs` · `scripts/universe-candidates.txt` · `docs/lessons/week-03.md`
Changed: `src/index.ts` (cache routes, chart pages, favicon, scheduled handler) · `src/providers.ts` (key-scrub fix + history fetcher + M-shape classifier) · `src/landing.ts` (wk-3 stamp, chart form, **real GitHub footer link**) · `wrangler.jsonc` (cron + D1 binding) · `package.json` (new scripts) · `README.md`
Not included: `BUILD-LOG.md` (paste below) · `docs/syllabus.md` (two row-pastes below) · your verification record (append the VC-10 closure below).

**Note on overwrites:** if you hand-edited `src/index.ts` (favicon) or the landing footer, this shipment supersedes both — the favicon route and your real repo link are built in. Desktop's diff shows it all before anything commits.

## Before committing anything — the key check (30 seconds)

Your verification-record pastes contained the Alpha Vantage key in AV's own M-1b message text. In Notepad, open `docs\data-provider-checks.md`, Ctrl+H the key string → `[key hidden]`, save. If a file containing the key was **already pushed**, the key lives in public git history: claim a fresh AV key, update `.dev.vars`, `npx wrangler secret put ALPHAVANTAGE_API_KEY`, and carry on — the shipped `providers.ts` now scrubs keys out of provider notices at source, so this class of leak is closed either way.

## Apply, in order

1. **Extract the zip over `C:\Dev\stock-market-toolkit`**, letting it overwrite. Review in Desktop.
2. `npm install` (no new packages; refreshes the lockfile timestamp at most).
3. **Discover the universe** (~130 FMP calls — run before the cron ever spends the budget, i.e. today):
   `npm run verify-universe`
   Watch the verdict table. Expect: AAPL/PFE/JNJ green, **DVN blocked** (the control proving the sweep works), and an honest verdict on everything else. It writes `scripts/universe-verified.json` (evidence) and `scripts/seed-universe.sql` (the universe). Edit `scripts/universe-candidates.txt` and re-run any day you want to test more names.
4. **Create the database:** `npx wrangler d1 create stock-market-db` → copy the `database_id` it prints → paste it over the placeholder in `wrangler.jsonc`.
5. **Schema + seed, locally:**
   `npx wrangler d1 migrations apply stock-market-db --local`
   `npx wrangler d1 execute stock-market-db --local --file=scripts/seed-universe.sql`
6. **First backfill, locally** (real network, real data — ~1 FMP call per green):
   `npm run dev:cron` → in a second terminal:
   `curl.exe "http://localhost:8787/__scheduled?cron=30+22+*+*+*"`
   (PowerShell needs `curl.exe`, not `curl`.) Give it a couple of minutes — watch the dev window log each symbol. Then look at **http://localhost:8787/prices/AAPL** — five years of chart, from your own cache, with the serve-time in milliseconds printed under it. That's the 858 ms → single-digits moment.
   Spot-checks: `/api/universe` (days_of_history filled in), `/prices/DVN` (the blocked explanation), `/prices/ZZZZ` (not-in-universe).
7. **Production:**
   `npx wrangler d1 migrations apply stock-market-db --remote`
   `npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-universe.sql`
   `npm run deploy`
   Production backfills **itself tonight at 23:30 Irish** — the first cron run fetches everything. Tomorrow morning, open `/prices/AAPL` on your phone. (Impatient option: it's fine to wait — patience is the feature this week teaches.)
8. **Docs:** paste the three blocks below where indicated; Ctrl+H key check from above if not already done.
9. **Commit** (untick this notes file): *"Week 3: nightly cron, D1 cache, verified universe"* → Push. **Session ends with a push — house rule.**

## Paste 1 — BUILD-LOG entry (top of the log, under the intro)

```markdown
## Week 3 — The nightly close · logged [date]

**Designed (Claude chat).** VC-10 falsified the domicile hypothesis (DVN — US-domiciled — blocked
alongside RYAAY/AZN, while AAPL/PFE/JNJ pass): FMP free-plan coverage is a whitelist, discoverable
only empirically. Consequence: the universe is *measured*, not declared — a verifier script probes
every candidate and publishes the evidence; greens become the universe. Decision #7 confirmed: FMP
dividend-adjusted EOD (~5y) is the price spine; Alpha Vantage exits the cron (its adjusted history
is premium, M-4 captured) and remains the tutor's live-demo route only. Schema ships minimal
(tickers, daily_prices, fetch_log); fundamentals arrives as migration 0002 in week 4 — migrations
are the curriculum. First cron run doubles as the backfill; Sundays refetch in full because
dividend adjustment rewrites history. Error handling is the verification record's M-shape map,
executed: blocked = permanent per symbol; rate-limit = resume tomorrow; auth = abort the run.

**Built (Claude, sandboxed).** Migration 0001; nightly job (incremental from last-date−7d, budget
cap 200 calls, 40-row D1 batches, fetch_log evidence incl. per-run summary); cache-first
/api/prices and /api/universe; server-rendered SVG chart pages at /prices/:ticker (hover crosshair,
range links, last-10 table, serve-time caption); universe verifier + candidates file + seed-SQL
generator; landing stamped wk 3 with chart form; favicon route; providers key-scrub (closes the
M-1b echo leak at source).

**Verified — machine (sandbox; provider network blocked by design).** Type-check clean. Migration
applies; universe + prices routes serve from local D1 in ~9–12 ms (vs 858 ms live — the lesson's
number); chart page renders; three distinct 404 explanations (no-history-yet / blocked /
not-in-universe); scheduled trigger with no key → one graceful log row; with unusable key → HTTP 403
classified auth_failed, run aborted after ONE call (no budget wasted), run_summary written.

**Verified — hand (gates "done").**
- [ ] Key-echo check: record redacted; rotation done IF the key was ever pushed
- [ ] `verify-universe` run; verdict table sane; DVN blocked (control); evidence + seed committed
- [ ] D1 created; database_id in wrangler.jsonc; migrations applied local + remote; seed applied both
- [ ] Local cron trigger backfilled ~5y; /prices/AAPL chart renders with ms caption
- [ ] Deployed; production cron ran overnight; /prices/AAPL on the phone next morning
- [ ] Phase-1 gate: fetch_log green three consecutive nights; zero live-API calls on student routes
```

## Paste 2 — syllabus decision-log rows (replace row 5; add rows 7–8)

```markdown
| 5 | Universe | **DECIDED (1 Oct 2026, evidence-based).** US-listed names that pass the free-plan whitelist, discovered by `npm run verify-universe` and published in `scripts/universe-verified.json`. VC-10 falsified the domicile rule (DVN blocked); nothing is promised until its probe is green. Irish-heritage US listings (RYAAY, CRH, FLUT…) are quotable live but blocked for history/statements → demoted to the live-demo set; the cached universe anchors on Cork-recognisable US employers (AAPL, PFE, JNJ, LLY…) plus household S&P names. |
| 7 | Price spine | **DECIDED (1 Oct 2026).** FMP `historical-price-eod/dividend-adjusted` (~5y, adjusted) is the sole cron source; VC-09 evidence. Alpha Vantage exits the cron (adjusted history is premium, M-4) and serves only the tutor's rationed live-quote demo. Phase-1 "≥2 years" gate passes at ~5 years. |
| 8 | Fundamentals depth | **DECIDED (30 Sep 2026).** FMP free plan serves 5 annual periods (VC-07). Week 5's Graham earnings-stability criterion adapts to 5 years, openly footnoted on the checklist card — the adaptation taught as a data-literacy lesson. |
```

Also in the syllabus's phase-1 gate line, mentally (or literally) swap "CI deploys on merge" for "manual deploy per decision #6" — CI stays parked.

## Paste 3 — verification-record closure (append at the record's bottom)

```markdown
## VC-10 closure — 1 Oct 2026
Findings: PFE ✓5y statements, JNJ ✓5y, PFE ✓5y adjusted history; DVN ✗ blocked (M-6) on statements.
**Hypothesis falsified** — DVN is US-domiciled. Verdict: free-plan coverage is a per-symbol
whitelist, not derivable from domicile, listing, or size. Resolution: universe membership is now
discovered by `scripts/verify-universe.mjs` (2 probes/candidate + profile for greens; DVN retained
as the permanent blocked control); evidence lives in `scripts/universe-verified.json`, refreshed
whenever candidates change. Record closed — further coverage questions are answered by re-running
the sweep, not by new VC rows.
```

## What week 4 needs from this week

Three consecutive green nights in fetch_log (the phase-1 gate), plus the committed `universe-verified.json`. Week 4 reads real income-statement JSON for the greens and freezes the fundamentals schema (migration 0002) around what's actually there.
