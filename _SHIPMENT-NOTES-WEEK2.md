# Week 2 Shipment — Apply Notes (regenerated 22 Sep 2026)

**Regeneration note:** identical content to the original 24 Aug shipment, rebuilt fresh and re-verified (type-check + smoke tests pass on current tool versions), with one addition — **the kit patch is now folded in** (`kit/student-quickstart.md`, `kit/reading-list.md` with the Security Analysis restoration). Extract **this one zip only**; ignore the separate kit-patch zip if you downloaded it.

**Read this, follow the steps, then don't commit this file** (in GitHub Desktop, simply untick it in the commit — or delete it once done).

## What's in this shipment

New: `src/landing.ts` · `src/providers.ts` · `.dev.vars.example` · `docs/lessons/week-02.md` · `docs/data-provider-checks.md` · `kit/student-quickstart.md`
Changed: `src/index.ts` (Hono rewrite) · `package.json` (adds hono) · `README.md` · `kit/reading-list.md` (Security Analysis restored) · `docs/setup-guide.md` (Part D parked; Part E is now the Desktop weekly rhythm) · `docs/syllabus.md` (decision log #6: automation parked) · `.github/workflows/deploy.yml` (switched to manual trigger — no more surprise runs)
Not included, on purpose: `BUILD-LOG.md` (yours now — entry to paste is below) · `package-lock.json` (regenerates in step 2).

## Apply, in this order

1. **Extract the zip into `C:\Dev\stock-market-toolkit`**, letting it overwrite. (Desktop will show you every change before anything is committed — that's your review gate.)
2. Terminal in the project folder: `npm install` — this pulls Hono and updates `package-lock.json`.
3. Copy `.dev.vars.example` → `.dev.vars`; paste in your two keys (links inside the file). `.dev.vars` is gitignored — Desktop should *never* show it in the changes list. If it appears, stop and shout.
4. `npm run dev` → localhost:8787. Spot-checks: the ledger shows **two** stamps; look up `AAPL` via the new form; try a nonsense ticker and admire the polite failure.
5. GitHub Desktop: review the diff (untick this notes file) → commit *"Week 2 + doc consolidation: quote route, kit split, Security Analysis restored"* → **Push origin**.
6. Production secrets, one-time: `npx wrangler secret put ALPHAVANTAGE_API_KEY` (paste key when prompted), then the same for `FMP_API_KEY`.
7. `npm run deploy` → open the live URL on your phone → look up a ticker in the wild.
8. Work through `docs/data-provider-checks.md` (VC-01…08), record findings, commit the completed record. **Week 3's schema is gated on it** — especially VC-07 (how many years of statements the free plan really returns).
9. Paste the entry below into the top of `BUILD-LOG.md` (under the intro), tick boxes as you complete them, commit. Add your hold-and-restart line above it: *"Project on hold [dates] — Geel priority; course start postponed to [TBD]; gap audit found Aug doc batch uncommitted; consolidated with week-2 apply."*

## BUILD-LOG entry to paste

```markdown
## Week 2 — Where prices come from · logged [date]

**Designed (Claude chat).** Hono adopted as the router (first runtime dependency); live per-request
provider calls accepted as deliberately throwaway plumbing — week 3's cache replaces them, on schedule.
CI parked by decision: backup habit before automation; deploy stays manual. Provider terms re-verified
(Aug 2026): Alpha Vantage free ≈25 req/day & 5/min, with rate limits arriving as HTTP 200 + a "Note"
field; FMP free ≈250 req/day on /stable endpoints, ~5y of annual statements (Graham's 10-year
criterion may adapt — pending VC-07).

**Built (Claude, sandboxed).** `GET /api/quote/:ticker`: parallel Alpha Vantage + FMP fetch, partial-failure
warnings, honest metadata (`delayed: true`, source rations, education-not-advice note); ticker validation;
missing-keys 503 with setup hint; landing page gains the lookup form and week 2's stamp; lesson plan 2;
data-provider verification record; setup guide reworked (Part D parked, Part E Desktop rhythm);
deploy.yml switched to manual trigger. Shipment regenerated 22 Sep after the original download expired;
re-verified fresh (type-check + smoke tests) before reissue.

**Verified — machine (sandbox; live market data unreachable there by design).** Type-check clean.
Landing renders with two stamps; /api/hello unchanged; no keys → 503 with hint; fake keys + blocked
network → graceful 502 with both provider warnings (failure path proven); malformed ticker → 400;
unknown route → 404. Ticker normalisation (trim/uppercase) verified by inspection.

**Verified — hand (gates "done").**
- [ ] Keys in `.dev.vars`; AAPL returns price + company locally
- [ ] Five tickers OK including one UK listing (VC-05)
- [ ] Nonsense ticker fails politely; `.dev.vars` never appears in Desktop's changes
- [ ] Production secrets set via `wrangler secret put`; deployed; live lookup works on the phone
- [ ] Verification record VC-01…08 completed and committed; decision log #5 updated with the universe finding
- [ ] Live site's ledger shows week 2 stamped
```

## One honest caveat

The sandbox cannot reach the market-data providers, so everything network-shaped was proven on its *failure* path only. The success path — real JSON from real keys — is precisely what your hand-verification steps 4 and 7 establish. If the FMP `stable/profile` call surprises us (their endpoint families have shifted before), the warning text in the response will say so plainly; report the exact wording back and we adjust in minutes.
