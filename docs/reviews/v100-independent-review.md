# v1.0.0 — independent review (week 12: the door, the kit, the handover)

**Reviewed:** the public repository at commit `73d21fe` (v0.13.0 fix4–5) with the pre-review v1.0.0 zip laid over it — 32 shipment paths (13 new, 19 changed) plus the two local-run helpers — in a fresh clone, 13 Nov 2026. The builder's working copies, notes and conversation were out of bounds; the owner's `wrangler.jsonc` is not part of the shipment and was touched only in the clone, for the local run, and restored. Findings are reported before anything is changed; nothing in the shipment was altered by this review.

## Verdict

**Ship with changes — one of them before the door is switched on.** The week is built the way the record says it is in almost every part I could reach: the suite is 594/594 in 31 files and `tsc` is clean, both with the builder's generated types and with types freshly generated the way the new CI workflow will generate them; on a fresh local D1 (13 migrations, the 214-passage seed in 31 statements, the rule-breaking book) a simulated Access identity got exactly the answers the notes claim — the owner's page 200, another student's page/JSON/risk/form/ticket API/review page/review API/review button all 403 with the stated reasons and no row and no model call spent, the tutor opening everything, `/me` 302/404/off-sentence as described, the landing's line present only when the door is on — and every Cloudflare fact the shipment asserts (the Access tab's steps, `ctx.access`/`getIdentity()` with no token to validate, the `access.dev` block's shape, the 14 Aug 2026 release covering `workers.dev` and surviving route changes, the One-time PIN path, the ten-minute PIN, "a code has been emailed" with none sent, the 18 June 2026 default-IdP change, the 24-hour session default, 50 free seats with payment details asked, D1's limits enforced from 1 Sep 2026) checks against the public docs. Sixteen of seventeen mutations of the gate died in the suite. **But one route is gated only when the code in the body is a string, and the ticket parser accepts a non-string: signed in as one student, `POST /api/tickets` with `{"code": ["<another's code>"], …}` wrote a close ticket into the other student's account on the real local Worker (201, the position closed, the other account's cash and P&L returned to the caller) while the suite stayed green.** That is the one *must*. Beyond it: the landing tells students the door is on and "no address to keep secret" in both states, including the off state the lesson plans for; the phase-4 story counts VC-24 and this review as done; the cost review promises links it does not carry and quotes tutor token figures that are not the receipts'. **Counts: 1 must · 3 should · 10 notes · 9 housekeeping.** 17 mutations: 16 killed, 1 survived (plus the array-code probe, where the code is wrong and the suite passes).

---

## Must

### F1 — `POST /api/tickets` is gated only for a string `code`; an array-wrapped code writes into another student's account

- **Where:** `src/portfolio.ts:314–317` (the gate: `if (typeof body.code === "string" && CODE.test(body.code.trim().toUpperCase())) { … ownerGate … }`), `src/lib/tickets.ts:77` (the parser: `const code = String(body.code ?? "").trim().toUpperCase()`).
- **What I observed:** the gate runs only when `body.code` is a string. `parseTicket` then normalises with `String(...)`, and `String(["ABCD-2345"])` is `"ABCD-2345"`, so a single-element array passes `CODE` in the parser after skipping the gate. Signed in as Ada's fixture address (the owner of ABCD-2345), against the local Worker with Access simulated:
  - control, string code: `POST /api/tickets {"code":"AAAA-2222", …}` → **403** `{"error":"You are signed in as <fixture address>, and this is another student's page. Your own page is /me."}` — as claimed;
  - `POST /api/tickets {"code":["AAAA-2222"],"ticker":"AAPL","side":"open", …}` → **422** — not 403: the refusal came from Bob's own concentration rule, and its message disclosed Bob's book to Ada: *"Concentration: your account runs 1 instrument and 1 position is open (KO) …"*;
  - `POST /api/tickets {"code":["AAAA-2222"],"ticker":"KO","side":"close", …}` → **201** `{"accepted":true,"id":7,"code":"AAAA-2222","symbol":"KO","side":"close","units":60, … "cash_before":4339.09, … "entry_price":94.08,"pnl":137.15, …}`. The `tickets` table then held ticket 7 for AAAA-2222 with my journal text and `positions` row 4 read `status: "closed", closed_on: "2026-11-10", pnl: 137.15`. Bob's position was closed by Ada.
  - The same shape against the in-process Worker with the fake D1 (a throwaway vitest file, removed): 201, `INSERT INTO tickets` ran once, the gate's `SELECT email FROM students` never ran.
- **Why it matters:** the whole of week 12's message to students is "the address is no longer the key" (lesson objective 2; the landing: "no address to keep secret"; the quickstart). Codes travel in URLs and screenshots in class (lesson 9 says a screenshot carries the address bar). After the switch, any enrolled student who has seen a classmate's code can open or close positions in that account and read its cash and P&L through this one route — exactly what decision #23 b says cannot happen. The suite does not catch it: `src/access.test.ts:89–97` tests a string code (403) and a malformed string (422), never a non-string.
- **What I'd change:** normalise once, in one place, and gate on the result: e.g. `const code = String(body.code ?? "").trim().toUpperCase(); if (CODE.test(code)) { gate }` and pass `{ ...body, code }` to `handleTicket` — or make `parseTicket` refuse a non-string code outright (`typeof body.code !== "string"` → the "code" reason), so the gate's condition and the parser's cannot drift apart. Pin it: a test posting `{ code: ["K7PM-4R2X"], … }` and `{ code: [" k7pm-4r2x "], … }` as another student expects 403 and no `INSERT INTO tickets`. Add the array-shaped probe to VC-24 (c), or note there that the fix makes it moot.

---

## Should

### S1 — The landing tells students the door is on, in both states

- **Where:** `src/landing.ts:234–235` — the "New this week" paragraph: *"The site now stands behind Cloudflare Access — you signed in with a code sent to your email, and your page opens for you and the tutor only, no address to keep secret."* It is static text; only the `<!--who-->` line (`src/index.ts:88`, `whoLine`) follows the door.
- **What I observed:** with the `access.dev` block removed (the off state), `GET /` still carried that sentence (I grepped the response), while `GET /tickets/AAAA-2222` on the same server read *"The page's address is its key: share a screenshot, not the link."* and `/me` said *"Sign-in is not switched on for this deployment"*. Two pages, two opposite statements about who can see a student's book.
- **Why it matters:** the off state is a supported deployment state in this very shipment — the window between `npm run deploy` and the switch (the setup guide's E4 comes after the deploy), and the lesson's own plan "If the door must come off … the Worker falls back to the code scheme at once … say that to the room if it happens" (`docs/lessons/week-12.md:50`). In that state the landing misleads a student about the privacy of their page.
- **What I'd change:** render that sentence from `gate.on` as `whoLine` is (the on text as now; off: the week-8 sentence, or nothing), and pin it beside the existing landing test (`src/access.test.ts:164–174`), which asserts the absence of "Signed in" but not of this sentence.

### S2 — The phase-4 story records the v1.0.0 review and VC-24 as done

- **Where:** `docs/how-we-built-it-phase-4.md:66–67`: *"Three independent reviews this phase — 36, 40 and the v1.0.0 review's findings — every one resolved on the record before shipping"* and *"Three verification checks closed on live evidence this phase (VC-22, VC-23 with its five fixes, and VC-24 — the phase gate — the tutor's to run after the switch), 24 in all"*.
- **What I observed:** 36 and 40 are right (v0.12.0: 1+8+16+11; v0.13.0: 3+7+17+13 — counted in the two review files). But this review's findings did not exist when the sentence was written, VC-24 is "planned" in `docs/data-provider-checks.md:412` and "open — after the switch" in OI-98, and "every one resolved" is not what the register says of the earlier two reviews either: OI-80 (v0.12.0 N11) and OI-91 (v0.13.0 F4/N2/N4) stand open/watch — *decided*, as the README's method puts it ("the tutor decides each"), not resolved.
- **What I'd change:** write the scoreboard as of the day — "two reviews with their findings decided on the record, the third (v1.0.0) this week; two live checks closed, VC-24 planned" — and let the VC-24 closure append the rest. The README's table (line 184, "v1.0.0 review · VC-24") reads as a pointer and is fine once this file exists.

### S3 — The cost review says things its own text does not bear out

- **Where:** `docs/free-tier-cost-review.md:3, 40, 43, 52`.
- **What I observed:**
  - line 3: *"Every allowance below is as the provider's own page read on that date, with the link"* — the document contains no links at all.
  - line 40, the tutor's row: *"~3,000–3,500 in / ~150–360 out … as the receipts show"*. The receipts in the record (VC-22 closure, `docs/data-provider-checks.md:328`) are *"Tokens 2,164–3,393 in, 105–434 out"*, which the README quotes correctly ("2,200–3,400 measured at VC-22"). The review's row (1,400–1,600 / 430–550) does match its receipts (1569/496, 1569/506, 1412/544, 1531/491).
  - line 43: *"the tutor's receipts on 11–12 Nov: twelve questions"* — the VC-22 closure alone records fourteen model calls on 11 Nov, and VC-23 (f) adds more on 12 Nov.
  - line 52: *"the Workers Paid plan ($5 a month at the build …)"* — a price, in a document that says nine lines earlier that it copies no prices "because it changes and the record would go stale". The D1 pricing page I fetched states no subscription fee for the Paid plan.
  - The D1 figures I could check are right: 5,000,000 reads and 100,000 writes a day, 5 GB, errors past the limit, enforcement from 1 Sep 2026 (the changelog entry of that date). The nightly write figure "prices 5,254 + signals 86" is quoted nowhere else in the repo (the receipts it comes from are not in the record), so I could not verify it; the arithmetic of the headroom (~5%, ~3%) follows from it.
- **What I'd change:** add the links or drop "with the link"; make the tutor's row the receipts' range; count the questions from the record; drop the dollar figure (or date it and mark it as the cost review marks the Bill).

---

## Notes

### N1 — `accountsFor` and `ownerCheck` disagree about a padded stored email
- **Where:** `src/lib/access.ts:78` trims and lower-cases the row's email before comparing; `src/lib/access.ts:100` looks up `WHERE lower(email) = ?1` with no trim.
- **Observed:** I set a row's email to a padded, mixed-case value by SQL (the way the review method itself links accounts; the enrol script would have normalised it) and signed in as that address: `/tickets/AAAA-2222` → **200** (the page opened), `/me` → **404** *"no paper account is linked to that email yet"*, `/api/me` → `accounts: []`, the landing: *"no account is linked to this email yet — the tutor links it"*. The same row is "linked" to one lookup and not to the other.
- **Change:** `lower(trim(email)) = ?1`, or normalise on write in the migration's successor; a test with a padded stored value for both functions.

### N2 — The landing is filled with a string `replace`
- **Where:** `src/index.ts:88`: `LANDING_PAGE.replace("<!--who-->", whoLine(gate, accounts))`.
- **Observed:** a string replacement interprets `$&`, `$'` and the like in the replacement text. `esc()` does not escape `$`, and `$` and `&` are legal in an email's local part, so an identity containing `$'` would splice the rest of the landing into the line. The address comes from the tutor's own policy, so the risk is remote; the fix is a function replacement (`.replace("<!--who-->", () => whoLine(...))`) and costs nothing.

### N3 — Where the suite is weaker than it looks
- `src/access.test.ts:156–159` (`/api/me says … nothing about anyone else`) uses `toMatchObject`, a partial match: mutation M12, which added `tutors: c.env.TUTOR_EMAILS` to the JSON, **survived** (594/594). Assert the key set.
- `src/access.test.ts:27` registers a handler for `SELECT email FROM students WHERE code`, and line 29 registers `FROM students WHERE code` after it; `fake-d1.ts` says "later registrations win", so the gate's query is answered by the full-row handler and the email-only handler is dead. It works because the full fixture row carries `email`; it would not catch the gate reading the wrong column.
- `src/access.test.ts:85`: `expect([200, 201, 409, 422]).toContain(ok.status)` — the owner's form post is allowed to fail the ticket's own checks; fine as a door test, but it is not a test that the owner can write.
- Mutations M2 (drop the tutor shortcut in `ownerCheck`) and M17 (open the page to a "nobody" identity) were killed only by `src/lib/access.test.ts`, never by a route test: `ownerGate` short-circuits the tutor before `ownerCheck`, and no route test sends a student page a nobody identity (only `/me` is tested that way, line 130).

### N4 — The lesson says "sign out if signed in" and nothing says how
- **Where:** `docs/lessons/week-12.md:27` ("open the course address, sign out if signed in, and show the room what a student sees — Cloudflare's page, the email, the code arriving"); Materials line 18 has the tutor "signed in on the projector machine".
- **Observed:** no document in the shipment names the logout path. With a 24-hour session (or the week E4 suggests), the demo cannot be shown without it. Cloudflare's session-management page: *"To log out of Access, the end user can visit … `<your-application-domain>/cdn-cgi/access/logout`"*. Put it in the tutor notes and E5.

### N5 — The Access tab's own policy options, and a label
- **Where:** `docs/setup-guide.md:249–251` (E4), `:247` (E3), `scripts/enrol.mjs:130`.
- **Observed:** the Workers Access page says the tab's "Authentication policy" step offers *"Cloudflare account"* and *"Email domain"* or an existing policy. E4 says "the policy from E3" and is right to; it should also say in so many words not to pick *Email domain*, which admits every address at a domain. E3 and the enrol script's hint say "Zero Trust → Access → Policies"; the current docs label that section *Access controls* (e.g. "Zero Trust > Access controls > Applications"). OI-101 already says the screens move; this is one that has.

### N6 — `wrangler dev` did not reload when the `access.dev` block was put back
- **Observed:** editing the identity's email reloaded in seconds, as the lesson says, and removing the block reloaded to `access:false`. Re-adding the block (by a rewrite, then `touch`, then `sed -i`) produced no reload; `/api/me` stayed `access:false` until I restarted `wrangler dev`, after which it was correct. Two "Reloading local server" lines in the log, then none. E5's "Locally" paragraph (`docs/setup-guide.md:257`) could say: if `/api/me` does not change, restart.

### N7 — The 403 for a mistyped row reads as "another student's page"
- **Where:** `src/lib/access.ts:81`.
- **Observed:** a student whose row carries a mistyped or second address gets, on their own page, *"You are signed in as …, and this is another student's page. Your own page is /me."* — and `/me` then says no account is linked. The lesson's tutor notes (line 49) name a wrong address as "the commonest failure". The `/me` sentence is the right one; the page's 403 could add "if this is your own page, the address on the row differs — tell the tutor".

### N8 — Error paths when migration 0013 is not applied
- **Where:** `scripts/enrol.mjs:100`, `src/lib/access.ts:93`.
- **Observed:** the Worker fails closed as claimed (M9 confirmed the test pins it): every row reads as unlinked, the tutor still opens them. But `--list` and `--set-email` fail with *"The database call failed: … Retry the same command"* — the remedy is the migration, not a retry. And the Worker's catch treats any D1 error as "unlinked", so an outage would show a student "not linked to an email yet … the tutor runs --set-email" — safe, wrong reason.

### N9 — Existence of a code is still visible to a signed-in student
- **Where:** `src/portfolio.ts:325–328, 342–345, 372–375` (404 before the gate); the review routes reach the same 404 through `reviewStudent` after a gate that passes when there is no row (`src/lib/access.ts:91`).
- **Observed:** a real code answers 403, a non-existent one 404, so a signed-in student can tell them apart. At 32⁸ codes it is not an attack; it is a property worth one line in decision #23 b.

### N10 — VC-24's plan tests the string-shaped code only
- **Where:** `docs/data-provider-checks.md`, VC-24 (c): *"`POST /api/tickets` with Test Two's code: 403, no ticket written"*.
- **Observed:** with F1 as shipped this step passes while the array shape writes. Fix F1 first; then either add the array probe to (c) or record that the normaliser makes the shape irrelevant.

---

## Housekeeping

- **H1 — README numbers that the shipment itself made stale.** `README.md:25` *"# 568 tests"* (594); `:21` *"Four secrets"* and `:143` *"the four secrets' names"* against the Runbook's *"Secrets — five"* (`:58`); `:150` the reviews list stops at *"Phase 3"* (v0.12.0 and v0.13.0 missing, and this one); `:186` *"11 written reviews in docs/reviews/"* — the folder has 9 reviews and 2 briefs; *"97 register items"* — OI-101 is the last and 101 ids are present; *"24 live checks"* — the record has no VC-11 (23 numbered checks, VC-24 of them planned) plus VC-06b/VC-08a; `:174` week 2 "24 Aug" is the shipped date where the column says logged (BUILD-LOG: "logged 24 Sep 2026 (shipped 24 Aug …)").
- **H2 — `package-lock.json:3`** root `"version": "0.12.0"` against `package.json` 1.0.0 (the dependency pins agree, so `npm ci` is unaffected — checked).
- **H3 — `docs/syllabus.md:188`** decision-log header *"Status (12 Nov 2026)"* while #23 is dated 13 Nov.
- **H4 — `README.md:60`** *"about 1,500–2,500 input tokens each"* for the review; the four receipts are 1,412–1,569.
- **H5 — `kit/demo-day.md:19`** *"the high since entry less half a year of volatility"* — the rules card's rule is *"½ × instrument risk × entry price"*: half the annualised volatility, not half a year of it.
- **H6 — the deck, slide 9:** *"the Bill of this autumn becomes law in December"* — stated as fact; the course's own rule is that a Bill is a Bill until the Act (the kit: "against the Finance Act of that year").
- **H7 — `docs/lessons/week-12.md:18`** *"`npm run enrol -- --list` shows both columns"* — the list shows the row's email; the policy is not a column. `docs/how-we-built-it-phase-4.md:7` *"this phase kept three of them on purpose"* — the week-8 code exhibit is Phase 3's.
- **H8 — `BUILD-LOG.md:253, 284`** week 10 and 11 headings still say "(in review)". Under the append-only rule they stay; noting only that a reader of the headings alone would think both open.
- **H9 — `.dev.vars.example`** `TUTOR_EMAILS` example and the test fixtures use different fixture domains (.com in the example, .ie in the tests and the local-run instructions) — harmless, but a tutor copying the example into `.dev.vars` and the review method's identity will wonder why the local tutor is not the tutor.

---

## What I did

**Clone and apply.** `GIT_LFS_SKIP_SMUDGE=1 git clone --depth 1 … /home/claude/review-w12`; HEAD `73d21fe` ("v0.13.0 fix4–5 …", 13 Nov 2026). Unzipped the pre-review zip over it (34 files). `git status --short`: **32 entries — 13 untracked, 19 modified**, matching the claim; the two helpers `_stub-claude.mjs` and `_seed-review.sql` are ignored by `.gitignore`'s `_*` and do not appear. (A 33rd entry appeared later: my `node_modules` symlink — `.gitignore`'s `node_modules/` matches directories, not symlinks.) Linked the builder's `node_modules`, copied the builder's `worker-configuration.d.ts` (it carries `CloudflareAccessContext` at line 523 and `ExecutionContext.access?` at 463).

**Suite and types.** `npm test`: **Test Files 31 passed (31) · Tests 594 passed (594)**, 6.2 s. `npx tsc --noEmit -p .`: **exit 0**. Re-run after the mutations: 594/594. Also `npm run check`'s path as CI would run it: `wrangler types` with no credentials and an empty HOME → exit 0, types written, `CloudflareAccessContext` present; `tsc` against that file → exit 0. `package-lock.json`'s pins equal `package.json`'s (hono 4.13.18, typescript 5.9.3, vitest 5.1.0, wrangler 4.160.0), so `npm ci` on a fresh runner will not refuse. `test.yml` would pass.

**Reading.** `src/lib/access.ts`, `src/me.ts`, `src/index.ts` (routes and the landing), `src/portfolio.ts` (the five gated routes), `src/review.ts` (the three), `src/tutor.ts`, `src/costs.ts` (no code routes), `src/lib/tickets.ts` (`CODE`, `parseTicket`), `src/jobs/fake-d1.ts`, `migrations/0013_emails.sql`, `scripts/enrol.mjs`, `src/access.test.ts`, `src/lib/access.test.ts`, the diffs of every changed source and test file, the seed's header and its L12/K-DEMO rows (the lesson's "Tutor notes" and "Materials" are not in the corpus — `grep` for the dashboard steps in `seed-notes.sql`: 0).

**Mutations** (each applied to the shipment's file, `npx vitest run`, restored from a backup and checked byte-for-byte):

| # | Mutation | Result |
|---|---|---|
| M1 | `ownerCheck`: `own === email` → `!==` | killed (8 tests) |
| M2 | `ownerCheck`: drop the tutor shortcut | killed (1 test, `src/lib/access.test.ts` only) |
| M3 | `ownerGate`: skip the query, always ok | killed (8) |
| M4 | remove the gate from `GET /api/risk/:code` | killed (1) |
| M5 | `doorFrom`: door off always | killed (16) |
| M6 | drop `toLowerCase` on the identity email | killed (2) |
| M7 | "other": 403 → 200 | killed (6) |
| M8 | remove the gate from `GET /api/explain-my-portfolio/:code` | killed (1) |
| M9 | `ownerGate` catch: fail open when the column is missing | killed (1) |
| M10 | drop trim/lower on the stored email | killed (1) |
| M11 | remove the gate from `POST /api/tickets` | killed (1) |
| M12 | `/api/me` JSON gains `tutors: TUTOR_EMAILS` | **survived** (594/594) |
| M13 | `tutorEmails`: drop `toLowerCase` | killed (3) |
| M14 | remove the gate from `GET /tickets/:code` | killed (3) |
| M15 | remove the gate from `POST /tickets/:code/review` | killed (1) |
| M16 | `doorFrom`: everyone is the tutor | killed (13) |
| M17 | `ownerCheck`: a "nobody" identity opens the page | killed (1, unit test only) |

Plus the probe that is not a mutation: the shipped code with `code: ["K7PM-4R2X"]` from another student → 201 and an insert, suite green (F1).

**Local run.** `rm -rf .wrangler/state`; `wrangler d1 migrations apply --local` → 13 applied (0001–0013 ✅); `--file=scripts/seed-notes.sql` → **31 commands**; `--file=_seed-review.sql` → 28 commands; counts: notes 214, students 2, tickets 6. Linked ABCD-2345 to Ada's fixture address by `UPDATE`. (I re-ran the book seed once to capture its command count and its `INSERT OR REPLACE` wiped the link — my doing; re-linked, and later re-seeded and re-linked both after the F1 write to keep the book clean.) A throwaway `.dev.vars` with a placeholder key, the stub URL and the tutor fixture address; the `access.dev` block added to the clone's `wrangler.jsonc` (a copy of the original kept); `node _stub-claude.mjs` and `npx wrangler dev --port 8787` in background subshells; `/api/hello` 200 on the first poll. Transcript, in brief:

- *As Ada (owner of ABCD-2345):* `/api/me` → `{"access":true,"email":"<fixture>","tutor":false,"accounts":[{"code":"ABCD-2345","name":"Test Book"}]}`; `/` → `<p class="who">Signed in as <fixture> · your page → /tickets/ABCD-2345 · the kit</p>`; `/me` → **302** `Location: /tickets/ABCD-2345`; `/tickets/ABCD-2345` → **200**, lede ends *"Signed in as <fixture>: this page opens only for its own student and the tutor (week 12)."*; `/tickets/AAAA-2222` (unlinked) → **403** *"This account is not linked to an email yet, so it opens only for the tutor until it is (the tutor runs `npm run enrol -- --set-email CODE <fixture>`). You are signed in as <fixture>."*. After linking AAAA-2222 to Bob's fixture address: `/tickets/AAAA-2222`, `/api/tickets/AAAA-2222`, `/api/risk/AAAA-2222`, `POST /api/tickets` (string code), `POST /tickets/AAAA-2222` (form) → all **403** *"… this is another student's page. Your own page is /me."*; `/api/explain-my-portfolio/AAAA-2222?ai=1` → **403**, `reviews` 0 rows, `fetch_log` 0 rows, the stub untouched; `/tickets/AAAA-2222/review` → 403; `POST /tickets/AAAA-2222/review` → 403. Own review page → **200**; own button `POST /tickets/ABCD-2345/review` → **303** `Location: /tickets/ABCD-2345/review?r=1`; `reviews` row 1 `answered`; `fetch_log` row 1 *"claude-haiku-5-5 1100/120 tokens 18 ms r4 1 breach 4 notes"* — no code, no address in it. Then F1's three posts (above).
- *As the tutor fixture address* (edit, reload in ~6 s): `/api/me` `tutor:true, accounts:[]`; `/tickets/ABCD-2345`, `/tickets/AAAA-2222`, both `/api/tickets/…`, `/api/risk/AAAA-2222`, `/tickets/AAAA-2222/review`, `/api/explain-my-portfolio/AAAA-2222`, `/`, `/kit` → all **200**; the lede *"Signed in as <fixture> (the tutor): this page opens only for its own student and the tutor"*; `/me` → **404** *"You are signed in as the tutor (<fixture>). No paper account is linked to that email; every student's page opens for you by its code — `npm run enrol -- --list` shows them."*; the landing: *"Signed in as <fixture> (the tutor) · the enrolment list is `npm run enrol -- --list` · the kit"*.
- *Block removed:* `/api/me` → `{"access":false,"email":null,"tutor":false,"accounts":[]}`; every page above **200** on the code; `/me` → **200** *"Sign-in is not switched on for this deployment … your page is `/tickets/<your code>`"*; no `who` line and no `<!--who-->` left on the landing; the lede back to *"The page's address is its key: share a screenshot, not the link."* — and the "New this week" paragraph unchanged (S1).
- `/tutor` lede: *"214 passages indexed 2026-11-13"*. `POST /api/tutor {"question":"What are the five questions of demo day?"}` → `answered`; passages L12.4, K-DEMO.4, L12.5, K-DEMO.3, K-DEMO.5, L12.1; the stub's answer with grounding `clean: true`. `/kit`: the seven `kit/…` paths in `KIT`'s order.
- Extra probes: an upper-case dev identity → lower-cased, `/me` 302 (needed a restart, N6); a padded stored email (N1).
- Cleanup: both processes killed, `.dev.vars` deleted, `wrangler.jsonc` restored (`cmp` against the copy and `git diff --quiet` both clean), no `stub-mode.txt` left; `git status --short` back to the 32 entries plus my symlink.

**Documents.** `docs/lessons/week-12.md` (the running order sums to 90: 10+25+25+15+10+5; its dashboard steps agree with `docs/setup-guide.md` E4 and the README's door paragraph; the three agree on the order rows → policy → secret → switch), `kit/demo-day.md`, `kit/README.md` against `KIT` in `src/me.ts` (same seven, same order, same text), `kit/student-quickstart.md`'s new sections, the README (Status, Quickstart, Runbook, Repo map, "How this was built" — the table's weeks/versions/dates against the BUILD-LOG's headings, its VC numbers against the record's section headings; VC-11 is absent from the record, as `docs/research/paper-notes.md:48` already notes), `BUILD-LOG.md` week 12, `docs/data-provider-checks.md` (VC-22/23 closures, the VC-24 plan), `docs/free-tier-cost-review.md`, `docs/how-we-built-it-phase-4.md`, `docs/syllabus.md` (#23, the week-12 section, the Phase 4 gate; 23 rows in the decision log), `docs/OPEN-ITEMS.md` OI-98..101 and the Live/Repo/Tests/Next lines, `.github/workflows/test.yml` and `deploy.yml`, the deck's ten slides (text extracted from the pptx; the PDF has 10 pages) against the lesson and the kit, the review files' counts (36, 40), `docs/reviews/` (11 files: 9 reviews, 2 briefs).

**Secret scan** of every text file in the zip and the deck's XML and the PDF's streams: code shapes other than the four fixtures — only the `XXXX-XXXX` placeholder and one placeholder code used for "no such student" in two tests (not a student's); `workers.dev` — generic or `YOURSUBDOMAIN`; `sk-ant-` — none (one obviously fake `sk-…` fixture, labelled as not a real key, in a pre-existing test); gmail/yahoo/etc. — none; UUIDs — none; emails — fixtures only (example.com/.ie, the two-letter test domains) plus Alpha Vantage's public support address inside its own quoted message. Deck metadata: title and a generic creator. The seed carries no email and no code.

**Cloudflare facts** (fetched): the Workers Access page (`…/workers/configuration/cloudflare-access/index.md`), the One-time PIN page, the changelog entries of 14 Aug 2026 ("You can now enable Access on a Worker or all Workers at once" — *"every associated domain and preview URL stays protected even when its routes or domains change"*), 18 June 2026 ("Cloudflare identity provider is now the default for new accounts" — *"Previously, new organizations started with one-time PIN"*) and 1 Sep 2026 (D1 free-tier enforcement), the Zero Trust org-creation page (*"If you chose the Zero Trust Free plan, this step is still needed but you will not be charged"*), the SASE plans page (50 users), the session-management page (application session default 24 hours; range to one month; the logout URL), the D1 pricing page. All of the shipment's assertions matched; two things the docs add that the shipment does not say: a WARP client's `ctx.access` carries only `aud` (the Worker's "nobody" path handles it) and Worker-level Access does not support WebSocket upgrades (the toolkit has none).

## What I did not check

- The live site, the Cloudflare dashboard's actual screens, a real One-time PIN flow, or the tutor's own `wrangler.jsonc`: VC-24 is the tutor's, as the record says. I did not test the "nobody" identity on the local Worker (the dev block without `identity`), only in the unit tests.
- The deck and PDF visually — text only.
- The FMP and Alpha Vantage allowance pages behind the cost review's provider table, and its nightly D1 write figure (the receipts it cites are not in the repository).
- CSRF on the form route behind an Access cookie (pre-existing design, not changed this week); HEAD/OPTIONS handling.
- The enrol script against a live database (read, and its SQL quoting traced: `q()` doubles single quotes, the email is lower-cased and trimmed before it is written, the duplicate check is `lower(email) =` on a normalised value).
- Whether `npm ci` completes on GitHub's runner — only that the lockfile's pins agree and that `wrangler types` and `tsc` need no credentials.

---

## Resolution — 13 Nov 2026 (the tutor's word: "implement all")

All 23 applied before the shipment zip; the suite 594 → 597 (`tsc` clean); the local Worker re-run after the changes recorded in `BUILD-LOG.md`.

| Finding | Resolution |
|---|---|
| **F1** | **Applied, both ways.** `parseTicket` refuses a non-string code outright (`typeof body.code === "string"` or the "code" reason — `src/lib/tickets.ts`), and `POST /api/tickets` normalises the code once and hands the same value to the gate and to the parser (`src/portfolio.ts`). Pinned: the parser on an array, an object with `toString`, a number, `true`, `null`, `undefined` (`src/lib/tickets.test.ts`); the route on four shapes × four identities — 422 with reason `code`, no `INSERT INTO tickets`, no gate query — and the padded lower-cased string shape gated (403) (`src/access.test.ts`). On the real local Worker after the change, the review's exact probe (`{"code":["AAAA-2222"],"ticker":"KO","side":"close",…}` signed in as the other student) → **422**, nothing written. The shape is refused as malformed rather than gated — stricter than the suggested 403, and the resolution says so in VC-24 (N10). |
| S1 | **Applied.** The "New this week" sentence is rendered per request from the door (`doorSentence` in `src/me.ts`, a second placeholder `<!--door-->`): on, the sentence as it was; off, "the door is **off** tonight: your page is still its address, so share a screenshot, not the link". Pinned both ways beside the landing test. |
| S2 | **Applied.** The scoreboard rewritten as of the day: two reviews decided on the record (not "resolved" — two watches stand), the third this week; two live checks closed, VC-24 planned, its closure the record's. "This phase kept three" → the course keeps three, one from Phase 3 (H7). |
| S3 | **Applied.** The five pages linked in the preamble; the tutor's row the VC-22 receipts' range (2,164–3,393 / 105–434); the review's row the five readings' (1,412–1,569 / 425–544); the explainer's row no longer invents figures; "twelve questions" → the record's fourteen and three; the dollar figure dropped; the nightly write figures' provenance stated (the tutor's pasted `run_summary` rows, not in the repository). |
| N1 | **Applied.** `accountsFor` looks up `lower(trim(email))`; the fakes and tests follow. |
| N2 | **Applied.** Both landing placeholders filled by function replacements. |
| N3 | **Applied.** `/api/me` asserted with `toEqual` and its exact key set (the survived mutation now dies); the fake's full-row handler carries no email and the gate's handler is registered after it, so the gate must read its own column; the owner's form post asserts 200 and one `INSERT INTO tickets`; a "nobody" identity is sent to a student page on the route (403). M2 (the tutor shortcut inside `ownerCheck`) stays killable only by the unit test by design — `ownerGate` short-circuits the tutor before `ownerCheck`; noted here. |
| N4 | **Applied.** The landing's signed-in line carries "sign out" (`/cdn-cgi/access/logout`, `SIGN_OUT`); the lesson's 0:00 segment and tutor notes and the guide's E5 name the path. |
| N5 | **Applied.** E4 says not to pick *Cloudflare account* or *Email domain* and why; E3, the enrol script's hint and the lesson say *Access controls*; OI-101 watches the label. |
| N6 | **Applied.** E5's "Locally" paragraph: if `/api/me` does not change after an edit to the block, restart `wrangler dev`. |
| N7 | **Applied.** The "other" reason ends "— and if this is your own page, the address on your row is not the one you signed in with: tell the tutor." Pinned in both test files. |
| N8 | **Applied.** The enrol script names migration 0013 and the command when D1 says "no such column: email" instead of "retry"; the Worker's gate distinguishes the missing column (unlinked, 403) from any other database error (503 "could not be read just now", the tutor still opens) — pinned on the route and in the unit test. |
| N9 | **Applied.** A line in decision #23 b: a real code answers 403 and a non-existent one 404; at 32⁸ codes a property, not an exposure. |
| N10 | **Applied.** VC-24 (c) says the non-string shape is the parser's refusal, pinned four ways, so the live probe needs the string only. |
| H1 | **Applied.** 597 tests; five secrets (the quickstart, the repo map twice); the reviews list to v1.0.0; "10 reviews and 2 briefs"; "23 numbered live checks (no VC-11; two carry letters)"; "101 register items"; week 2 "logged 24 Sep (shipped 24 Aug, regenerated 22 Sep)". |
| H2 | **Applied.** `package-lock.json`'s two root `version` fields → 1.0.0 (the pins untouched; `npm ci` unaffected) — the lockfile is therefore in this zip, for those two lines. |
| H3 | **Applied.** "Status (13 Nov 2026)". |
| H4 | **Applied.** "1,400–1,600 input tokens each (measured at VC-23)". |
| H5 | **Applied.** The rubric's stop: "the high since entry less half the instrument risk — ½ × instrument risk × entry price, the rules card's rule"; the corpus re-seeded (214 passages, the pin test green). |
| H6 | **Applied.** Slide 9: "this autumn's Bill is expected to become an Act in December — a Bill until it does"; the deck and PDF regenerated. |
| H7 | **Applied.** The lesson's Materials line ("shows it … the policy (the dashboard's)"); the story's Phase 3 exhibit. |
| H8 | **Noted, unchanged.** The week-10 and week-11 headings keep "(in review)" under the append-only rule; the Reviewed paragraphs under them say what happened. |
| H9 | **Applied.** `.dev.vars.example` uses the tests' fixture domain. |

Also from the review's method, kept for the record: `.gitignore`'s `node_modules/` does not match a symlinked `node_modules` (a reviewer's clone shows it as untracked — harmless, never committed); `wrangler dev` 4.160.0's watcher missed the `access.dev` block being put back (E5 says restart); `wrangler types` needs no credentials, so `test.yml`'s `npm run check` runs on a fresh runner.
