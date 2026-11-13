# The free-tier cost review — what the toolkit costs to run (week 12, v1.0)

*Written 13 Nov 2026 for the course's close-out (syllabus, week 12: "free-tier cost review"). Every allowance below is as the provider's own page read on that date — the pages: [Workers limits](https://developers.cloudflare.com/workers/about/limits/), [D1 pricing and limits](https://developers.cloudflare.com/d1/platform/pricing/), [the D1 free-tier enforcement of 1 Sep 2026](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [Access on Workers](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [creating a Zero Trust organisation](https://developers.cloudflare.com/learning-paths/cybersafe/account-creation/create-zero-trust-org/). Every usage figure is from the toolkit's own receipts: the nightly `run_summary` rows of 11–12 Nov 2026 as the tutor pasted them to the builder (not in the repository — the receipts are read, never committed), and the model-call receipts quoted in the record's VC-22 and VC-23 closures. Allowances change; the receipts are the meter; re-read both before relying on either.*

## The one-line answer

**The toolkit runs on free plans for everything except the AI, and the AI is a pre-paid balance that the caps bound.** No card is charged by Cloudflare, FMP, Alpha Vantage, the SEC or GitHub for what the course does; the Claude key is the tutor's, topped up by hand, and the toolkit's three daily caps (the explainer's, the tutor's, the review's) put a ceiling on what a day can spend.

## Cloudflare — the Workers Free plan

| What | The allowance (Workers Free) | What the toolkit uses | Headroom |
|---|---|---|---|
| Requests | 100,000 a day, reset at midnight UTC; past it, error 1027 | A class of ten on a lesson night: a few hundred page views and API calls; the crons are not requests | ~99% |
| CPU time | 10 ms per HTTP request | The pages render from D1 in single-digit ms (the watchlist 3 ms, the signals page 6 ms at OI-78); the model calls are I/O, not CPU | fine |
| Cron Triggers | 5 per account | 4 (`30 22`, `40 22`, `50 22`, `0 23`) | 1 |
| Subrequests per request | 50 | 1 per model call; the nightly price run is a scheduled invocation (its own budget, 45 fetches — decision at week 3) | fine |
| D1 rows written | 100,000 a day — **enforced from 1 Sep 2026**: queries fail past the limit until midnight UTC | ~5,300 a night (prices 5,254 + signals 86 + stops and risk a handful; the FTS seed, when re-run, a few hundred); the tickets and reviews are single rows | ~95% |
| D1 rows read | 5,000,000 a day, enforced likewise | The signal pass reads each instrument's history (86 × ~1,300 closes ≈ 110,000); the stop tracker and the risk report a few thousand; a page view tens to hundreds; the tutor's FTS query a few hundred | ~97% |
| D1 storage | 5 GB total, 10 databases | One database; five years of daily closes for 38 core names and the small tier, the accounts, the signals, the notes: tens of MB | >99% |
| Access (Zero Trust) | Free up to 50 users; payment details asked for at sign-up, nothing charged | A class of ten plus the tutor | 39 seats |
| `workers.dev` hostname, TLS, the dashboard | included | | |

The two D1 limits are the ones to watch, because since 1 September 2026 they fail queries rather than merely warn: the nightly run would leave `error` receipts and the pages would 500 until midnight UTC. At ~5% of the write allowance and ~3% of the read one, a twenty-fold growth in the class or the universe is needed before either matters; the receipts (`run_summary` rows: `inserts`, and the `fetch_log` row counts) say each morning where the night stood.

## The data providers

| Provider | The allowance | What the toolkit uses | Note |
|---|---|---|---|
| FMP (core tier prices and accounts) | the free plan's daily call allowance, and the symbols it serves (probed, not guessed — `npm run verify-universe`) | 38 price fetches a night + up to 15 account refreshes | The write budget and the 45-fetch budget were sized to the plan at week 3 (two landlord's meters, the record) |
| Alpha Vantage (small-cap prices and accounts, the demo quote) | 25 calls in any rolling 24 hours, 5 a minute, metered by key **and** by sender address | the small-cap visit from the tutor's PC plans within the rolling ration it reads from its own receipts (default 20 of the 25); the live demo quote capped at 3 a day | The ration is the design constraint of the small tier (decision #14) |
| SEC EDGAR (small-cap EPS) | free; a User-Agent naming the project and a contact is the fair-access policy's price | a handful of company-concept calls per visit | `EDGAR_USER_AGENT` is the secret |

## The AI — the only money

The model is `claude-haiku-5-5` on a pre-paid key, called in three places, each behind a daily cap in the Worker (`wrangler.jsonc` `vars` or the defaults):

| Call | Tokens per call, as the receipts show | Cap (default) | A worst day, in tokens |
|---|---|---|---|
| The explainer (week 6) | of the same order as the tutor's (the record's week-6 receipts predate this table; the caps are the bound) | `EXPLAIN_DAILY_CAP` 60 | ~200,000 at the tutor's figures |
| The tutor (week 10) | 2,164–3,393 in / 105–434 out (the VC-22 closure's fourteen calls) | `TUTOR_DAILY_CAP` 60 | ~230,000 |
| The process review (week 11) | 1,412–1,569 in / 425–544 out (the VC-23 closures' five readings) | `REVIEW_DAILY_CAP` 3 per account, `REVIEW_GLOBAL_CAP` 40 | ~85,000 |

A worst day is therefore around half a million tokens, nearly all of it input; a normal lesson night is a tenth of that (the record's receipts: fourteen tutor calls on 11 Nov at VC-22 and three on 12 Nov at VC-23; five review readings on 12–13 Nov). The price per token is the Console's to state — it is not copied here because it changes and the record would go stale — and the balance is read on the Console, not in the toolkit. The caps are the control: `"0"` on any of them switches that call off and the feature falls back to its plain version (the explainer's template, the tutor's passages, the review's audit), so a balance that runs dry costs the class a reading, never a page.

## GitHub and the rest

The repository is public (free), Actions for the test workflow (`test.yml`, week 12) run within the free minutes many times over, and GitHub Desktop is free. The deck files and PDFs are in the repository; nothing is hosted elsewhere.

## What would change the answer

- A class of fifty, or a second class on the same Worker: the request allowance is still comfortable; the Access seats are not (50); the AI caps would want raising, and the balance watching.
- A universe of five hundred names: the D1 write allowance would be met by the nightly price run alone (500 × ~140 bars); that is the first thing that stops being free, and the Workers Paid plan — a monthly subscription whose price is the Workers pricing page's to state, with the allowances in the second column of the D1 table — is the step.
- Vectorize for the tutor (the documented upgrade path, not the plan): Workers AI and Vectorize have their own free allowances; not reviewed here because not used.

*Education, not advice; and not a quotation — the providers' pages are the prices.*
