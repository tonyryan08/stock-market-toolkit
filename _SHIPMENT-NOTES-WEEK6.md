# Week 6 Shipment — Apply Notes (v0.7.0: numbers into narrative)

**Follow in order. Don't commit this file.** This is the first Claude-powered feature (the syllabus's Phase 2 route), so there is one new secret, one migration, and a short verification check (VC-15) before class. The page works **without** the key — it serves the course's own template sentences — so nothing here can leave the site broken.

## What this is

`/explain/:ticker` — "Explain this stock." Three layers, each traceable:

1. **The fact sheet** (`src/lib/explain.ts`, pure, 14 tests). Built from the same inputs as the two screens: numbered facts F1…Fn (the books as numbers, both verdicts, one fact per failed test with the screen's own detail), **kinds** of ✗ (the eight meanings from the first live run, plus a few the later runs taught: financial, too small, incomplete), and **bars** — where each failed test sits in numbers ("test 6 passes at or below $70.05 on today's three-year average EPS"). A bar is arithmetic on a threshold; the page says so in as many words.
2. **The story** (`src/lib/narrative.ts`, 9 tests). Claude (`claude-haiku-5-5` by default) is given the sheet and nothing else: use only these facts, tag every paragraph with the fact ids it rests on, never recommend, 140–220 words, JSON only. The answer is cached in D1 by the sheet's fingerprint, so a company costs at most **one call per data-day**; a daily cap (default 60) bounds the worst case.
3. **The checks** (`checkGrounding`). Every narrative, AI or plain, is checked: a number that appears on no fact, a cited fact id that doesn't exist, advice-shaped language. Invented numbers and unknown ids are **flagged on the page** (the class's audit exercise); advice language is **rejected** — the plain version is served and the rejection is kept in the table so the same data is never re-asked. Receipts go to `fetch_log` (`explain_ok`, `explain_rejected`, `explain_capped`, `explain_error`) with model, tokens and milliseconds.

What the checks cannot catch: a wrong *word* ("fails" where the sheet says "near miss"), an invented *reason*. That is the room's job, and lesson 6 says so.

**Also in this zip:** the enterprising screen's lesson segment (taught in week 6); the week-5 reading notes' 17 Oct addendum (AT&T and Verizon pass both price tests; Wells Fargo the first near miss); `docs/research/paper-notes.md` (parked, as agreed); "explain" links on both screens and the books page; the landing page stamped week 6.

**New:** `src/lib/explain.ts` · `explain.test.ts` · `src/lib/narrative.ts` · `narrative.test.ts` · `migrations/0005_explanations.sql` · `docs/lessons/week-06.md` · `docs/research/paper-notes.md`
**Changed:** `src/index.ts` (routes `/explain/:ticker`, `/api/explain/:ticker`; links) · `src/landing.ts` · `docs/lessons/week-05-reading-the-screen.md` · `package.json` (0.7.0)
**Deck:** `week-06-numbers-into-narrative.pptx` (+ PDF), sent separately — file it where the week-5 deck lives.

No new packages — no `npm install`, no approvals prompt.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`; review in Desktop. `npm test` → **expect 90 passed**.
2. Migration, local then remote:
   `npx wrangler d1 migrations apply stock-market-db --local`
   `npx wrangler d1 migrations apply stock-market-db --remote` → `0005_explanations.sql ✅`
3. **The Claude API key** (the one new dependency). Sign in to the Claude Console at platform.claude.com (the docs redirect there now). Create a key under *API Keys*; set a monthly spend limit under the billing/limits settings (a few euros is more than this feature can spend). Stage the key in Notepad as before — whole key, no quotes, no spaces — then:
   - locally: add `ANTHROPIC_API_KEY="…"` to `.dev.vars` (and a blank `ANTHROPIC_API_KEY=` line to `.dev.vars.example` for the repo);
   - live: `npx wrangler secret put ANTHROPIC_API_KEY` → paste → Enter. `npx wrangler secret list` should now show three names.
     Optional, in `wrangler.jsonc` under a `"vars"` block: `"EXPLAIN_MODEL": "claude-haiku-5-5"`, `"EXPLAIN_DAILY_CAP": "60"` — the defaults are the same, so nothing is needed.
4. `npm run deploy`.
5. **VC-15** (below) — five minutes, in the browser.
6. Commit *"Week 6: explain this stock — fact sheet, Claude narrative with grounding checks, cache (v0.7.0)"* → push.

## VC-15 — the narrative route, verified (do before class)

| Step                 | Open                                                                                                                                                                             | Expect                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a                    | `/explain/NVDA`                                                                                                                                                                  | Two verdict chips; a four-paragraph story with small fact tags; a source line reading **"Written by Claude (claude-haiku-5-5) on … · fresh · N tokens in, M out"**; the fact sheet; the bars; the kinds. |
| b                    | reload the same page                                                                                                                                                             | Source line now says **"served from the cache"**, same text.                                                                                                                                             |
| c                    | `/explain/NVDA?plain=1`                                                                                                                                                          | **"The plain version — the course's own sentences"**; the same facts beneath.                                                                                                                            |
| d                    | `/api/explain/NVDA`                                                                                                                                                              | JSON with `grounding.clean` (true, or a listed flag), `meta.source: "claude"`, `meta.tokens`.                                                                                                            |
| e                    | `/explain/T`, `/explain/GOOGL`, `/explain/F`, `/explain/WFC`                                                                                                                     | Different kinds on each: cheap-for-a-reason + loss year; new dividend; loss year + dividend gap; financial.                                                                                              |
| f                    | `npx wrangler d1 execute stock-market-db --remote --command "SELECT symbol, source, model, input_tokens, output_tokens, ms FROM explanations ORDER BY created_at DESC LIMIT 10"` | One row per company visited, source `claude` (or `rejected` if the checks refused one — that is a PASS for the checks, and the page shows the plain version).                                            |
| g                    | `…--command "SELECT outcome, COUNT(*) FROM fetch_log WHERE outcome LIKE 'explain%' GROUP BY outcome"`                                                                            | `explain_ok` counts; any `explain_rejected`/`explain_error` rows carry the reason in `detail`.                                                                                                           |
| h (negative control) | Locally, remove the key from `.dev.vars`, `npm run dev`, open `localhost:8787/explain/NVDA`                                                                                      | The plain version, with the reason "no AI key is configured on this deployment".                                                                                                                         |

Cost arithmetic for the record: ~1,500 input and ~300 output tokens per company at Haiku's listed prices (from $0.10 and $0.50 per million) is a few hundredths of a cent; 38 companies once a day is a few cents. The cap exists so a bug can't change that.

## The rules as built

| Rule                                                                                                                                                                                                   | Where                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| The AI sees the fact sheet and nothing else; no student text ever reaches it (the ticker is validated by regex and the sheet is computed server-side)                                                  | `narrative.ts` `sheetAsText`           |
| Every paragraph carries fact ids; every number must appear on a cited fact (page and chapter references excepted)                                                                                      | `explain.ts` `checkGrounding`          |
| Advice-shaped language ("you should buy", "price target", "will rise"…) → rejected, plain version served, rejection recorded                                                                           | `index.ts` `explainCompany`            |
| One generation per company per fact-sheet fingerprint; daily cap; receipts in `fetch_log`                                                                                                              | `index.ts`, `0005_explanations.sql`    |
| No key, API error, cap or rejection → the plain template, with the reason on the page                                                                                                                  | `explain.ts` `templateNarrative`       |
| Verified in the sandbox against a stub API: fresh → cached; cap reached → plain; invented number → flagged on the page; advice language → rejected and recorded; 404s for unknown and bookless tickers | `_SHIPMENT-NOTES-WEEK6.md` (this file) |

## Paste 1 — BUILD-LOG

```markdown
## Week 6 — Numbers into narrative · logged [date]

**Designed (Claude chat).** The syllabus's first Claude-powered route, built so the AI cannot
outrun the numbers: a pure, tested FACT SHEET (facts F1…Fn from the books and both screens; the
kinds of ✗ from the first live runs; "what would have to change" as bars in dollars) is the only
thing the model sees; it must cite fact ids per paragraph and may not recommend; the toolkit
CHECKS the answer (numbers not on the sheet, unknown ids, advice language) and shows its flags
on the page — the class's audit exercise. Plain template narrative when no key / cap / error /
rejection. One call per company per data-day, cached in D1, capped per day, receipts in
fetch_log. Decision 15 records the grounding rules.

**Built (Claude, sandboxed).** explain.ts (+14 tests), narrative.ts (+9 tests, fake API),
migration 0005, /explain/:ticker + /api/explain/:ticker, links from screens and books page,
landing stamped wk 6, lesson 6 + deck, enterprising-screen segment, reading-notes addendum
(17 Oct: T and VZ pass both price tests; WFC first near miss). 90 tests.

**Verified — machine (sandbox).** Type-check clean; 90/90. Against a stub standing in for the
Claude API: fresh → cached on reload; cap of 3 reached → plain version with reason; a narrative
with an invented 37.5% → flagged on the page; "You should buy" → rejected, plain served, row kept
as source=rejected; fetch_log holds explain_ok ×4, explain_capped ×3, explain_rejected ×1.
Pages checked at desktop and phone widths.

**Verified — hand (gates "done").**
- [ ] `npm test` 90/90 on my machine
- [ ] migration 0005 local + remote
- [ ] ANTHROPIC_API_KEY in .dev.vars and `wrangler secret put`; spend limit set in the Console
- [ ] VC-15 a–h: fresh, cached, plain, JSON grounding, four kinds, D1 rows, fetch_log, no-key control
- [ ] six explain pages printed for the pairs; deck filed
```

## Paste 2 — decision log

```markdown
| 15 | AI narrative, grounded | **DECIDED (19 Oct 2026).** "Explain this stock" is written by Claude from a numbered fact sheet computed by the toolkit, and from nothing else. Binding rules: cite fact ids per paragraph; no number that is not on a cited fact; no recommendation. The toolkit checks every narrative: invented numbers and unknown ids are flagged on the page; advice-shaped language is rejected and the plain template served. One generation per company per fact-sheet fingerprint, cached in D1; daily cap (60); receipts in fetch_log. The page is complete without a key. Model: claude-haiku-5-5 (configurable). What the checks cannot catch — wrong words, invented reasons — is the room's job, by design. |
```

## Paste 3 — verification record

```markdown
## VC-15 — the narrative route — [date]
a fresh ✓/✗ · b cached ✓/✗ · c plain ✓/✗ · d JSON grounding ✓/✗ · e kinds (T, GOOGL, F, WFC) ✓/✗ ·
f explanations rows ✓/✗ · g fetch_log receipts ✓/✗ · h no-key control ✓/✗.
Model: claude-haiku-5-5. Tokens per company (first visit): ___ in / ___ out. Flags seen: ___.
```

## Week 7 needs from this week

Nothing. Phase 3 (Carver) starts fresh on the price history; the small-cap tier (decision 14) is the next build and uses the same books pages and explain route once its companies have accounts.
