# Patch v0.5.3 — the value pool (14 Oct 2026)

**Follow in order. Don't commit this file.** Nothing here changes a verdict on the current screen; it widens the pool the screens run over and starts collecting the one figure the enterprising-investor screen will need.

## What this patch does

1. **The sweep learns to resume, and to stop politely.** `npm run verify-universe` now skips every candidate already on record in `scripts/universe-verified.json` and merges new results into it, so adding names costs only their own calls. It stops itself at **150 calls** (`-- --max-calls N` to change) so the nightly robot keeps its share of the 250, and it stops on FMP's limit too; either way, run it again tomorrow and it carries on where it left off. (`-- --all` re-probes everything.) Also fixed: the sweep had the same classifier-order bug as the robot — a limit message says "upgrade your plan" too and was being recorded as a paywall. The 1 Oct run almost certainly never hit the limit, but the bug is gone.
2. **96 candidates** appended to `scripts/universe-candidates.txt`, in two tiers. A **value tier** of 44 mid-and-large unglamorous names (telecoms, carmakers, old industrials, materials, energy, food, a few banks and insurers, old-guard tech). A **small-cap tier** of 52 — furniture makers, regional grocers, tow trucks, pumps, uniforms, steel service centres, truckers — Graham's enterprising hunting ground ("we set no lower limit on the size", p. 386), weighted that way on your call of 14 Oct so the class has a pool to build a portfolio from. Whether the free plan serves *any* small cap is unknown; this tier is the experiment, and the evidence file will say. The names are from my memory as of mid-2026 — a few may have been acquired or stopped paying; the sweep and the screens will show it. Prune before you run it if you like.
3. **Price invocations scale by config.** Workers Free allows 50 fetches per invocation, so one invocation caps the universe at 45. Every `mm 22 * * *` cron except 22:50 is now a price run, and a later one skips whatever an earlier one fetched tonight (new column `tickers.last_price_fetch`). Two lines → ~90 companies; three → ~135. Accounts (22:50) go to 15 companies a night, the whole 45-fetch budget.
4. **Tangible book value.** The balance sheet's goodwill-and-intangibles line is now stored (`fundamentals_annual.goodwill_and_intangibles`), and the ratio engine computes tangible book per share and price-to-tangible-book. Graham's enterprising price test is "less than 120% of net tangible assets" (ch. 15, p. 386). The defensive screen doesn't use it; the enterprising screen will. It fills as the accounts rotation refetches each company.
5. **The screen's footer row**: how many companies fail each test. No more counting marks off a screenshot.

Migration: `0004_value_pool.sql` (two columns, no indexes). No new packages — no `npm install`, no approvals prompt.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`; review in Desktop. `npm test` → **expect 47 passed**.
2. `npx wrangler d1 migrations apply stock-market-db --local` → `0004_value_pool.sql ✅`, then the same with `--remote`.
3. **Notepad `wrangler.jsonc`** — the crons line becomes three entries:
   `"triggers": { "crons": ["30 22 * * *", "40 22 * * *", "50 22 * * *"] },`
4. `npm run deploy` → the readout lists **three** schedules.
5. **The sweep — mornings, two of them.** `npm run verify-universe`. Expect the first line to read *"144 listed, 48 already on record (skipped), 96 to probe: ~192 calls + profiles"*; it will stop itself at 150 calls with a message, and the second morning finishes the rest. After **each** morning, seed what's green so far:
   `npx wrangler d1 execute stock-market-db --local --file=scripts/seed-universe.sql`
   `npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-universe.sql`
   (It upserts all greens, old and new; re-running it is harmless.) **If the universe passes ~85, add `"45 22 * * *"` to the crons line** and redeploy — the code already treats it as a third price run.
6. **Refetch every company's accounts** so the new column fills for the original 31 too (15 a night; the whole universe in ~4 nights):
   `npx wrangler d1 execute stock-market-db --remote --command "UPDATE tickers SET fundamentals_as_of = NULL"`
7. Commit *"v0.5.3: value pool, resumable sweep, second price invocation, tangible book"* → push. Commit `universe-verified.json`, `seed-universe.sql` and the candidates file with it — the JSON is the evidence.

**What you'll see.** Tonight's 22:30 run backfills five years of prices for the new greens (stalest-first, ≤ 20k rows per invocation; 22:40 picks up the rest). `/api/universe` shows them with `days_of_history` climbing. Books arrive at 15 companies a night. By the weekend `/screen` runs over the whole pool — and the enterprising screen, which is the next shipment, has tangible book values to read.

**Budget arithmetic for a sweep morning:** sweep ≤ 150 + nightly (prices for the current universe + 45 accounts) — with 31–60 companies that's 226–255. Tight, by design; if the robot logs `rate_limited` that night it resumes the next, and nothing is lost. Every day after the sweep: ≤ 135 of the 250.

## Paste — BUILD-LOG

```markdown
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
```

## Paste — decision log

```markdown
| 12 | Universe, revisited | **DECIDED (14 Oct 2026).** The famous-31 stay (they teach why the famous names fail). A value pool is added via the sweep, weighted toward small caps — Graham's enterprising ground, and a pool the class can build a portfolio from — greens only, evidence in scripts/universe-verified.json. Capacity ~45 per price cron line. Utilities and REITs excluded (Graham's separate rules not implemented). Small caps fail defensive test 1 (size) by design — the two screens see different pools. |
| 13 | Two investors | **PROPOSED (14 Oct 2026).** A second screen for Graham's enterprising investor (TII ch. 15, pp. 385–386: low multiplier, then five relaxed tests, no size floor, price < 120% net tangible assets), taught beside the defensive screen. Graham's distinction is effort, not risk appetite (p. 6). Data groundwork in v0.5.3; screen in the next shipment. |
```
