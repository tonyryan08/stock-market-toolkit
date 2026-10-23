# Patch v0.7.2 — the model thinks by default (19 Oct 2026)

**Don't commit this file.** Apply over v0.7.1. No migration, no secret changes, no packages.

**What happened.** Second live call: `malformed narrative (stop_reason max_tokens)`. The key and the request were accepted; the answer was cut off before the JSON closed.

**Cause (from the API docs, read today).** Claude Haiku 5.5 runs "adaptive thinking" by default — it reasons before it writes — and those thinking tokens are billed and counted against `max_tokens`. With `max_tokens: 800`, the budget went on reasoning and the JSON was truncated. Writing four paragraphs from a numbered sheet needs no reasoning budget.

**Changed:** `src/lib/narrative.ts` — `thinking: {type: "disabled"}` (documented as accepted on Haiku 5.5 at default effort); `max_tokens` 2000; `output_config.format` set to a JSON schema so the API guarantees the shape (supported on Haiku 5.5; no beta header needed). `narrative.test.ts` asserts all three. `package.json` 0.7.2.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`. `npm test` → **90 passed**.
2. `npm run deploy`.
3. Hard-reload `/explain/NVDA`. Expect *Written by Claude (claude-haiku-5-5) on … · fresh · N tokens in, M out*.
4. VC-15 from step b.

## For the record (AI error log)
19 Oct — assumed the model answers in a single pass; current models think first and the thinking counts against the output ceiling. Found by the live API's `stop_reason` on the second real call; the fallback and the receipt worked again. Two API facts were out of date in one feature; both are now covered by tests that pin the request.
