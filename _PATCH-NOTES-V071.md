# Patch v0.7.1 — the API rejected `temperature` (19 Oct 2026)

**Don't commit this file.** Apply over v0.7.0. No migration, no secret changes, no packages.

**What happened.** The first live call from `/explain/NVDA` reached the Claude API with the new key and came back `HTTP 400 invalid_request_error: temperature is deprecated for this model`. The page did what it is built to do — served the plain version with the reason on the source line, logged `explain_error` in `fetch_log` — and the key itself is proven: a 400 is a content rejection after authentication.

**Cause.** `narrative.ts` sent `temperature: 0.2`, a parameter the current models no longer accept. My API knowledge was one release behind; the live API caught it. The system prompt already does all the constraining, so the parameter is simply removed.

**Changed:** `src/lib/narrative.ts` (no `temperature` in the request) · `src/lib/narrative.test.ts` (asserts it is absent) · `package.json` 0.7.1.

## Apply

1. Extract over `C:\Dev\stock-market-toolkit`. `npm test` → **90 passed**.
2. `npm run deploy`.
3. Hard-reload `/explain/NVDA`. Nothing was cached for the failed call, so this request makes a fresh one. Expect the source line to read *Written by Claude (claude-haiku-5-5) on … · fresh · N tokens in, M out*.
4. Continue VC-15 from step b.

## For the record (AI error log)
19 Oct — sent a deprecated API parameter (`temperature`); found by the live API's 400 on the first real call; the fallback and the receipt worked as designed.
