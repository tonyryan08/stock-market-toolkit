# Patch — the speeding ticket (D1 write limit, 2 Oct 2026)

**What happened:** night one's production backfill exceeded D1's free allowance of 100,000 rows written/day. Root cause (mine): D1 meters each insert once for the table **plus once per index**, and `idx_prices_symbol_date` duplicated the composite primary key — so every price row cost ~3 metered writes. 38,874 inserts ≈ 116,600 metered ≈ cap breached mid-run. The limit reset at 00:00 UTC; data was never at risk; no paid plan needed.

**What this patch does:**
1. `migrations/0002_write_budget.sql` — drops the redundant index (the PK already serves every query; inserts fall to ~2 metered writes) and adds `tickers.last_full_fetch`.
2. `src/jobs/nightly.ts` v2 — the Sunday whole-universe refresh (which would have breached the cap weekly) becomes a **rolling realign**: the 4 stalest symbols get a full refetch each night, so the universe realigns completely every ~8 nights. New hard **insert budget** (30,000/run ≈ 60k metered — comfortable) beside the call budget; D1 write failures are caught per symbol, and three in a row is treated as the daily limit — the run stops cleanly with that on the record instead of crashing mid-loop.

**New budget arithmetic:** a normal night ≈ 31 incrementals + 4 realigns ≈ ~10k metered writes — a tenth of the allowance.

## Apply (before Sunday — the old code's Sunday refresh would breach again)

1. Extract this zip over `C:\Dev\stock-market-toolkit` (Desktop shows the diff).
2. `npx wrangler d1 migrations apply stock-market-db --local`
3. `npx wrangler d1 migrations apply stock-market-db --remote`
4. `npm run deploy`
5. Commit: *"Patch: D1 write budget — drop redundant index, rolling realign"* → push.

## Morning check (10 seconds, do first)

Live `/api/universe`: the cap likely cut the backfill around symbol #27 alphabetically — expect **TSLA partial and UNH, V, WMT, XOM at 0 days**. No action needed: tonight's run backfills missing symbols automatically (and after this patch, the realign rotation tops everyone up to full 5y within ~8 nights).

## BUILD-LOG deviation (paste)

```markdown
Deviation (wk 3, closed): production backfill breached D1's 100k/day metered-write
allowance — each insert counts the table plus every index, and idx_prices_symbol_date
duplicated the PK (≈3 writes/row × 38,874 ≈ 116k). Fix: migration 0002 drops the
redundant index (~2 writes/row); Sunday full refresh replaced by rolling realign
(4 symbols/night, last_full_fetch-tracked); insert budget + write-failure abort added
to the cron. Verified in sandbox: index gone, realign set selects stalest-first,
auth abort after one call, summary records the realign list. Alphabetical tail of
night-one backfill (≈TSLA–XOM) self-heals on the next run. Cost: €0 then, €0 now —
the free tier remains the design, and the limit notification is now teaching material.
```

**For the course:** this is the robot's first budget breach, caught by the landlord's meter, diagnosed from the bill's own arithmetic, and fixed by design rather than by paying — week 3's "robot's diary" slide and the phase-2 cost-literacy thread both just gained a true story. Worth a paragraph in `how-we-built-it` when phase 2's chapter gets written.
