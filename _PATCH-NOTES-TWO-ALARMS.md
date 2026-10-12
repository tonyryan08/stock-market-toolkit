# Patch v0.5.2 — the second speeding ticket (12 Oct 2026)

**What happened.** Ten companies (COST, CSCO, CVX, DAL, DIS, MSFT, NFLX, NKE, NVDA, PEP) were marked `blocked` for accounts, and three (BAC, META, XOM) `partial`, so the Graham screen ran over 21 companies instead of 31. The verifier had passed all ten on 1 Oct; FMP never refused them.

**Root cause (mine).** Workers Free allows **50 external `fetch()` calls per invocation** (Cloudflare Workers limits). One nightly invocation was making 31 price fetches + 12 × 3 accounts fetches = 67. Fetch 51 failed every night at the same company, and my classifier recorded the failure as "blocked" — a paywall shape — instead of a transient error. The signature in your query: six ok, the seventh partial, the rest blocked, three nights running, regardless of your local usage.

**What this patch does.**
1. **Two cron invocations** instead of one: prices at 22:30 UTC, accounts at 22:50 UTC — each with its own 50-fetch budget (31 and 36 respectively).
2. **The job counts its own fetches** and stops cleanly at 45 per invocation, logging `fetch_budget`, so the platform cap is never hit silently again. The price phase now walks the universe stalest-first, so a stopped run resumes where it left off.
3. **A transient error can never mark a company "blocked".** Only the genuine paywall response can. `partial` and `error` are retried the next night. The provider's own words are now logged on every `fund_` line, so the next unfamiliar shape is captured verbatim.
4. **Classifier order fixed** in both FMP fetchers: a response containing "limit" is rate-limited even if it also says "upgrade your plan"; only the specific paywall phrases mean blocked. Five new tests with a stubbed network pin this.

## Apply — four steps

1. **Edit `wrangler.jsonc` in Notepad** (this patch does not ship that file, because yours holds your database id). Change
   `"triggers": { "crons": ["30 22 * * *"] },`
   to
   `"triggers": { "crons": ["30 22 * * *", "50 22 * * *"] },`
2. Extract the zip over `C:\Dev\stock-market-toolkit`. `npm test` → **expect 43 passed**.
3. **Reset the thirteen mis-marked companies** so the robot fetches them again (one command, production):
   ```
   npx wrangler d1 execute stock-market-db --remote --command "UPDATE tickers SET fundamentals_as_of = NULL, fundamentals_status = NULL WHERE fundamentals_status IN ('blocked','partial')"
   ```
   Expect "1 command executed" and 13 rows changed.
4. `npm run deploy`. The deploy output should list **both** schedules: `30 22 * * *` and `50 22 * * *`.

Then commit *"Patch v0.5.2: two cron invocations, fetch budget, transient errors never block"* → push.

**What you'll see.** Tonight at 22:50 UTC the accounts invocation fetches 12 of the 13 reset companies; tomorrow night the last one. By Wednesday morning `/screen` reads "Universe 31; 31 with books", and META, XOM and BAC lose their "?" marks. Don't expect survivors to appear; expect the same two red columns, now over 31 rows.

**Local doorbell, by phase (wrangler 4.122 path):** prices `localhost:8787/__scheduled?cron=30+22+*+*+*` · accounts `…?cron=50+22+*+*+*` · both `…?cron=*+*+*+*+*`.

## Paste — BUILD-LOG deviation

```markdown
Deviation (wk 5, closed): accounts missing for 10 companies, partial for 3. Cause: Workers Free
caps external fetches at 50 per invocation; one nightly invocation made 67 (31 prices + 36
accounts), so fetch 51 failed every night at the same company and the classifier recorded a
transient failure as a paywall "blocked". Diagnosed from the diary's pattern (6 ok · 1 partial ·
rest blocked, three nights identical). Fix v0.5.2: two cron invocations (prices 22:30 UTC,
accounts 22:50 UTC); per-invocation fetch counter stops at 45 and logs it; transient errors
never mark "blocked", partial/error retried nightly; classifier tests "limit" before paywall
phrases; provider wording logged on every accounts line. 13 companies reset and refetched.
Second landlord's meter in two weeks; both found by reading the diary.
```

## Paste — verification record addendum

```markdown
## Infrastructure limit I-1 — 12 Oct 2026
Cloudflare Workers Free: 50 external fetch() calls per invocation (D1 calls count separately,
1,000). The nightly job planned 67. Symptom: fundamentals_status blocked ×10 / partial ×3 with a
fixed break at the ~51st fetch. Resolution: two invocations + self-counted budget (v0.5.2).
Note: the exact text of the failed fetch was not logged by v0.5.1; from v0.5.2 every accounts
line carries the provider's wording, so the next new shape (M-7) is captured verbatim.
```
