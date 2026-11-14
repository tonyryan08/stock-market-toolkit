# v1.2.0 "the front door" — the two reviews and the resolution

*Two readings before the deploy, as decision #25 (f) asks: a **reader review** — a model (Claude Sonnet) told only that it has never bought a share, given the rendered text of every page (door off, and the tutor's four) and nothing else — and the **independent code review** (Claude Opus, cold, on a fresh clone of `e6fc34c` with the shipment laid over it). Both ran 14 Nov 2026 on the shipment as built; both reports went to the tutor before anything was changed; the tutor's decision was "implement all", with the five scoped decisions as recommended. Part 1 is the code review as written; Part 2 the reader's report as written (the reader masked every address and code itself); Part 3 the resolution table — what changed for each finding, and what did not.*

---

# Part 1 — the independent code review (as written)


*Reviewer: cold, on a fresh clone of `e6fc34c` (v1.1.0 fix1) with the v1.2.0 shipment laid over it (21 modified files, `docs/plain-words.md` new). 14 Nov 2026. Nothing shipped was changed; this file is the only addition.*

## Verdict

**Ship with changes.** The central claim holds, and I checked it on the running Worker as well as in the diff. No arithmetic, route, refusal sentence, query, gate check or API shape changed. Every JSON API and the planner's CSV are byte-identical to `e6fc34c` on the same local database. Every figure on every page outside the ledes is unchanged. Status codes are unchanged. The suite is 630/630 and `tsc` is clean. The header, the cards and the phone layout work as described: the planner's sixteen columns fit at 1280 px, and its rows read as cards at 390 px. One finding must change before the deploy. The review page's new lede tells a student that the AI's sheet carries "no profit, loss or account-value figures **at all**". That is not true, and the week-11 lesson says the opposite: the student's own journal words, results included, are on the sheet. Four findings should change. A student's 403 page on the planner shows the tutor-only *Planner* link. OI-112's reason for not showing that link everywhere is wrong (reading the gate costs no D1 query). The planner's phone card shows two different numbers under the same label, "Risk a year". The planner's lede describes its ranking inaccurately. Then there are some smaller pieces: one test re-pin that drops a fact, the voice sheet only partly applied, and record counts. None of them blocks the deploy.

## Findings

### Must

**F1 — The review page overstates what the AI cannot see.** `src/review.ts:379`.
- **What I saw:** v1.1 said the sheet carries "none of the toolkit's profit, loss, account-value or drawdown figures". v1.2 says "a sheet that carries **no profit, loss or account-value figures at all**". It also dropped "drawdown".
- **Why it matters:** The next sentence admits the student's own journal words are on the sheet as written. Decision #22 (a) and lesson 11 (`docs/lessons/week-11.md:54`, "if an entry says 'made €500', that is on the sheet as you wrote it") make the distinction on purpose. The new words give a student a false promise about their own record, and the tutor says the opposite in the room. Rule 7 of the sheet exists to protect sentences like this one: the rule speaking, not lede padding.
- **Smallest fix:** Restore the qualifier: "…from a sheet that carries **none of the toolkit's profit, loss, account-value or drawdown figures**." Optionally pin it in `src/review.test.ts`, since the old pin did not cover the lede.

### Should

**S1 — The planner's 403 page shows a student the *Planner* link.** `src/plan.ts:305` and `:310`.
- **What I saw:** `shell(title, body, tutor = true)` defaults to the tutor. `emptyPage()` never passes the flag. A signed-in student (identity `ada@example.com`) gets 403 on `/plan` and `/plan/ABCD-2345`, and the page's header carries `<a href="/plan" aria-current="page">Planner</a>`.
- **Why it matters:** The shipment's claim, and the brief's test for "cannot leak", is that the tutor flag comes only from the gate. Here it is a hardcoded default. The harm is small, because the student is already on the URL. But the new test says "a student sees neither", and it checks only the landing.
- **Smallest fix:** Pass the gate's flag. In the guard and the `/plan` route the gate is in hand, so use `emptyPage(reason, gate.tutor || !gate.on)` and drop the default. Add one assertion to the new test: a student's `/plan` 403 page does not contain `>Planner<`.

**S2 — OI-112's reason for showing the link on only four pages is wrong.** `docs/OPEN-ITEMS.md:133`.
- **What I saw:** The register says reading the gate on every page is "one D1 query per request (the students table by email)". It is not. `doorOf()` (`src/lib/access.ts:68`) reads `ctx.access.getIdentity()` and compares the email against `TUTOR_EMAILS` from the environment. It never touches D1. The shipment itself added `doorOf` to `/kit` for exactly this purpose. On the account's page and the review page the gate is already loaded by `ownerGate` and simply not passed to `nav()`.
- **Why it matters:** A decision was recorded on a false cost. The tutor finds *Planner* missing from the header on six of the pages he uses most.
- **Smallest fix:** Either correct the register line (the cost is the Access identity call, not a query) and leave the decision to the tutor, or pass `gate.tutor` to `nav()`. On the account's and review pages that costs nothing. On `/signals`, `/watchlist`, `/tutor`, `/costs` and `/size` it costs one `doorOf` call each. The test comment at `src/access.test.ts:243` would then change.

**S3 — The planner's phone card shows two different numbers labelled "Risk a year".** `src/plan.ts:359` and `:365`.
- **What I saw:** The instrument-risk cell (header "Risk") and the position's risk cell (header "Risk/yr") both carry `data-label="Risk a year"`. At 390 px the GOOD card reads "RISK A YEAR: 2.5%" and, eight lines further down, "RISK A YEAR: 2.4%". The first is how much the price moves; the second is what the position adds to the account.
- **Why it matters:** On a phone the headers are hidden, so the label is the only meaning a number has. The two numbers are the core of the sizing lesson, and the label conflates them. The planner is the tutor's page, but it is the page used to demonstrate sizing.
- **Smallest fix:** Use labels that match the glossary, for example `data-label="Price moves a year"` (or "Instrument risk") for the first cell and `data-label="Adds to account risk"` for the second. Pin both with `data-label=` assertions.

**S4 — The planner's lede describes its ranking inaccurately.** `src/plan.ts:396`.
- **What I saw:** The lede says "Within each group: more of Graham's tests passed". `rankCandidates` (`src/lib/plan.ts:80-86`) sorts by the defensive tests passed first, then by the enterprising tests passed. That is lexicographic, not a total. A name at 5/7 · 1/6 ranks above one at 4/7 · 6/6, which has more tests passed. v1.1 said it exactly ("the defensive tests passed, the enterprising tests passed"), and decision #24 (b) says the same.
- **Why it matters:** This is finance content. The page is meant to show its order so that it can be checked. I flag it and do not rewrite it.
- **Smallest fix:** For example: "Within each group: more of Graham's seven defensive tests passed, then more of the six enterprising ones, then a stronger trend…". Then re-pin.

**S5 — One re-pin drops a fact instead of carrying it across.** `src/portfolio.test.ts:109`, `src/portfolio.ts:228`.
- **What I saw:** The `/size` test pinned "or a small cap once its rule has 128 closes". The calculator's new lede no longer says which companies it accepts, and the pin was replaced by a pin on the lede's opening words. The fact still reaches the user in the refusal (`portfolio.ts:87`, pinned at `portfolio.test.ts:77`), but only after they try.
- **Why it matters:** The BUILD-LOG says the eight failing pins were "re-pinned to the new sentences, not loosened". This one was loosened, and a sentence of guidance left the page. Also, nine tests failed on the first run, not eight (see H1).
- **Smallest fix:** Add one plain sentence back, for example "Any of the big names works; a smaller company works once the rule has 128 days of prices (`${SIGNAL_RULE.minMatureDays}`)". Re-pin that sentence. Alternatively, correct the BUILD-LOG to say one fact was dropped by choice.

**S6 — The voice sheet is applied to the ledes but not to the rest of each tool's page.** `docs/plain-words.md` rules 9 and 10 say "every page's words are held to this sheet".
- **What I saw (rendered, door off):**
  - `/signals`: the footer reads "the calculator (week 8)" (`src/index.ts:870`), a paragraph is headed "Week 10 — the two rules side by side", and the tooltips carry "week 10" and "(week 9, OI-08)".
  - `/costs`: "the spread (week 2's toll bridge)" and "(week 8's $2 + 0.25% a trade)", both from `src/lib/costs.ts`.
  - The planner: "Week 2's toll" (`src/plan.ts:404`), and "the same table (`src/lib/sizing.ts`)" in the arithmetic box.
  - `/fundamentals/*`: "week 5's checklist adapts openly" (`src/index.ts:1561`).
  - `/size`: "The constants live in one table, `src/lib/sizing.ts`".
  - `/card`: "(`src/lib/graham.ts`)".
  - `/kit`: a week stamp on every item. That one is defensible, because the kit records when each document was taught.
- **Why it matters:** The shipment says the "week" eyebrows were replaced. These are the same thing one paragraph lower.
- **Smallest fix:** Either a short second pass, or a sentence in the sheet and OI-111 that scopes v1.2 to the ledes and eyebrows, with the body text as a register item.

### Notes

**N1 — The ledes against the ten rules.** The teaching phrases are intact, character for character: *We grade decisions, not outcomes* (strapline), the three promises, *Education, not advice* (every footer), "the rule opens, you don't" (the planner's reasons, unchanged). No refusal or judge sentence changed. The ledes that break a rule are listed below, quoted. Finance content is flagged, not rewritten.

- **`/signals` (`src/index.ts:850`), rule 1.**
  - What it says: "Every night the same rule is run over all N companies the course follows…". What to do comes in the sixth sentence ("Read the state first, then the forecast.").
  - Rule 3: "warming up" appears in the table and the tally but is not explained. The glossary says "the rule needs 128 days of prices before it is trusted".
  - Flag for the tutor: the lede now says "the rule says LONG — buy or hold", while the page's own footer says "a long is not a recommendation to buy". Both are the glossary's words, but on one page they pull against each other.
- **`/watchlist` (`src/index.ts:921`), rule 1.**
  - What it says: "The watchlist is short on purpose." That sentence is neither what the page is for nor what to do, and no sentence says what to do.
  - This lede is the sheet's own "after" example, so the sheet's example breaks its own rule 1.
- **The account's page (`src/portfolio.ts:487`), rule 3.**
  - What it says: "write the Monday line in your journal".
  - "the Monday line" and "the stop line" are not explained. "Carver" is named without an introduction.
- **`/costs` (`src/costs.ts:94`), rule 2 and rule 3.**
  - What it says: "the brochure's missing page".
  - Rule 2: "the brochure's missing page" is a riddle.
  - Rule 3: "as shares (capital gains tax), as a fund or ETF (the exit tax)" puts the term in the brackets instead of the plain words. "ETF" is never explained.
  - Flag: "the cheapest of the three changes with them" against the page's own "the order of the three can change". The second is the more exact.
- **`/size` (`src/portfolio.ts:228`), rule 3.**
  - What it says: "half the instrument risk below the highest close".
  - "instrument risk" is not explained on this page.
- **`/screen` (`src/index.ts:960`), rule 1 and finance content.**
  - Rule 1: no what-to-do sentence.
  - Flag: "Benjamin Graham's seven tests… ten years of dividends". Graham asked for 20 years. Ten is the course's adaptation (`src/lib/graham.ts`, `adapted: true`; `docs/lessons/week-05.md:41`). The lede credits the course's figure to Graham. The glossary has the same wording.
- **`/screen/enterprising`, rule 1.** No what-to-do sentence.
- **`/plan/<code>` (`src/plan.ts:396`), rule 1 and rule 3.**
  - Rule 1: no first sentence saying what the page is for.
  - Rule 3: "12% ÷ N" is not explained, and "the judge" is not explained (the chooser page does both).
- **The review page.** Apart from F1: "fact tag" and "the sheet" are not explained.
- **Ledes that pass:** `/tutor`, `/kit`, `/me`, the planner's chooser, and the landing's intro.

**N2 — The landing's cards have no headings.** Each card is an `<a>` with a `<b>` title (`src/landing.ts:80-86`). They sit inside a labelled `<nav aria-label="What you do here">`, which helps landmark navigation. But a screen-reader user moving by headings jumps from the `h1` straight to "How it was built". Each link's accessible name is the whole card's text. A `<h2>` (or `<h3>`) for the title inside each `<a>`, styled as now, fixes both.

**N3 — The planner's phone cards and screen readers.**
- **The labels:** `data-label` is shown through CSS `::before { content: attr(data-label) }`. Generated content is in the accessibility tree in current Chrome, Edge, Safari and Firefox, so most screen readers read "Rank: 1". But it is not part of the table's semantics, it cannot be translated, and older pairings of reader and browser skip it.
- **The table semantics:** Setting `display:block` on `table/tr/td` removes the table semantics in Chrome and Safari. Hiding `thead` with `display:none` removes the column headers from the tree as well. On a phone, then, the table is announced as a run of text. That is acceptable because the `::before` labels are read, but it is not a table. Desktop is unaffected.
- **The common fix:** Add `role="table"`, `role="row"`, `role="cell"` and `role="columnheader"` on the elements, or put a visually hidden `<span class="sr">` label inside each cell instead of `::before`. This is a tutor-only page, so it is a note.

**N4 — Smaller points on the header.**
- **The `aria-current` logic is safe.** `href === active || (href !== "/" && active.startsWith(href + "/"))` has no false match. Every caller passes a literal with no trailing segment (`"/signals"`, `"/me"`, `"/plan"`, …). The `+ "/"` guard keeps `/plan` from matching `/planner`. In practice the prefix branch never fires.
- **"Your page" is marked current on someone else's page.** The account's page and the review page pass `"/me"`, so when the tutor opens a student's page, *Your page* is marked current. This is cosmetic.
- **The `who` option is never used.** No caller passes it. `nav()` interpolates `who` and the labels without escaping and documents that the caller must escape them. It is safe today (`NAV_LINKS` is a constant; `who` is unused), but it is a trap for later. Either delete `who` or escape it inside `nav()`. The landing's header comment (`src/landing.ts:6`, "the header (who is signed in…)") and syllabus #25 (b) ("with the signed-in line as a strip") describe something the header does not do. The signed-in line stays a separate paragraph.

**N5 — `/screen` scrolls sideways at 390 px.** The document is 444 px wide. The cause is the `.sr` spans inside the screen's table, which escape the `.wrap` box. This predates v1.2: `e6fc34c` measures the same 444 px. But the BUILD-LOG and OI-111 say "no page scrolling sideways" at 390, and the brief's page list did not include `/screen`. Either fix it (`position:relative` on the `.wrap` or on the cell that holds the `.sr` spans) or correct the claim. OI-113 is the natural home.

**N6 — Dead CSS from the removed crumb line.** `.back` survives in `src/page.ts:12-13` and in the card's print rule (`src/index.ts:1123`). No page renders it any more. The second selector line (`.back a, a`) also carries the global link colour, so remove only `.back {…}` and the `.back a,` part.

**N7 — The kit's count and lists.**
- The kit lede says "The seven documents… —" and then names six (the student quickstart is missing).
- The landing's kit card names five.
- Either name all seven or drop the dash so the list does not read as complete.

**N8 — Small wording changes outside the judge's sentences.**
- `/me`'s 403 for an identity-less request changed "Access let this request through…" to "The door let…". This is not a judge or plan sentence, so rule 7 does not apply.
- The landing's signals card hardcodes "all 86 companies", while `/signals` computes the count. Locally that showed "7". The two will drift if the universe changes.

### Housekeeping

**H1 — The first-run count.** Running the `e6fc34c` versions of the five changed test files against the new code fails **9 tests**, not 8:
- three in `access.test.ts`;
- two in `plan.test.ts`;
- two in `portfolio.test.ts`;
- one in `review.test.ts`;
- one in `routes.test.ts`.

The BUILD-LOG line ("**8 failed**") and OI-111 ("the suite's eight failures") should say nine.

**H2 — Test comment cross-reference.** `src/access.test.ts:243` cites OI-111 for the four-pages decision. That decision is OI-112.

**H3 — The reader review is not in the shipment.** The BUILD-LOG, OI-111, OI-114, the README ("12 written reviews… the last one twice") and the README's reviews line all point to `docs/reviews/v120-independent-review.md` for both reports and a resolution table. This file holds the code review only. Add the reader review, here or in its own file with the pointers updated, before the README's counts are true.

**H4 — The README's counts, checked against the files:**
- 630 tests: **true**.
- 25 decisions: **true** (1–25 in the decision log).
- 12 reviews: **true once this file lands** (11 reviews and 2 briefs before it).
- 114 register items: **true** (OI-001…OI-114, no duplicates).
- 26 live checks: **off by one, and was already off at v1.1.** The record has VC-01 to VC-26 with no VC-11, which is 25 distinct numbers. It carries eight lettered ids (06b, 08a, 09a–e), not "two".

**H5 — Version and lock.** `package.json` is at 1.2.0. In `package-lock.json` exactly the root's two entries changed (lines 3 and 9). The two `"version": "1.1.0"` lines that remain belong to dependencies (`@img/colour`, `@rolldown/pluginutils`). Correct.

**H6 — The State block, the BUILD-LOG entry and the syllabus.**
- **The State block** (14 Nov) reads correctly: live v1.1.0 fix1, v1.2.0 to deploy, 630 tests, next step deploy → VC-26 → commit.
- **The BUILD-LOG entry** is accurate except for H1, N5 and S5's "not loosened".
- **Syllabus #25 (b)** names the header's links "Home · Your page · Watchlist · Signals · Tutor · Costs · Kit". The labels as built are "Intro to the Stock Market · Your page · Watchlist · Signals · Ask the tutor · Costs & tax · The kit". This is trivial and only matters if the record should match the page.
- **Syllabus #25 (f)** "The gate is Phase 2's" reads oddly, presumably meaning "the reader-review gate, as in Phase 2".

**H7 — The VC-26 plan against the code.**
- (a) and (b) hold on the local Worker: the cards, the planner's card and link for the tutor only, the header with the current page marked, and no `class="back"` on any page.
- (d) holds: the four buttons and their labels exactly as listed.
- (c) "no page scrolls sideways" is false for `/screen` (N5); add it to the list or add the exception.
- (a) "as a student neither" holds except on the 403 page (S1).
- (e) and (f) are for the tutor on the live site.

**H8 — The shipment's files are clean.**
- No key-shaped strings.
- No email addresses other than the test fixtures.
- No account codes other than the fixtures (`K7PM-4R2X` as the planner's placeholder; `ABCD-2345` only in my local seed).
- No live-site address.
- `wrangler.jsonc` is not in the shipment.
- The new buttons' hrefs use `esc(student.code)`. The planner card's href is a constant.

## What I ran

**The suite and types.**
- `npm test`: **33 files, 630 passed (630)**, 6.96 s.
- `npm run check` (`wrangler types` then `tsc --noEmit`): **exit 0**.
- `worker-configuration.d.ts` was regenerated identically. It is gitignored and does not appear in `git status`.

**Claim (e) in the diff.**
- I read `git diff` for all nine `src/*.ts` files.
- **Changes beyond markup, CSS and lede text:**
  - the new `nav()` and `NAV_LINKS` (`page.ts`);
  - `shell()` gaining an `active`/`tutor` pair (`me.ts`) and a `tutor = true` default (`plan.ts`, see S1);
  - `/kit` now calling `doorOf()` (no D1 query; it reads the Access identity and `TUTOR_EMAILS` only);
  - the landing filling `<!--nav-->` and `<!--tutor-->` from the `gate.tutor` it already had.
- **Where each page's `tutor` comes from:**
  - the landing: `gate.tutor` (`index.ts:93`);
  - `/me`: `gate.tutor` on the two-account and no-account branches, `false` when the door is off or there is no identity;
  - `/kit`: `gate.tutor`;
  - the planner: the hardcoded `true` (S1);
  - every other page: none.
- **No change** to a route, a query, a computed value, a refusal or judge sentence, an API handler or a gate check.
- **In `plan.ts`** the diff touches only the HTML row template, the CSS and the lede. The `data-label` attributes are added, and the stop's and euro cell's sub-lines are split with `<br>` (same figures). `planCsv` and `/api/plan` are untouched.

**Old tests against new code.** In a throwaway copy (deleted), the `e6fc34c` versions of the five changed test files fail 9 tests. I judged each new pin:
- **The same fact in new words:** access ×3, plan ×4 assertions, the account page's sizing sentence, routes.
- **Stronger:** the review test, which now pins the button rather than any "costs &amp; tax" string; the new header and cards test.
- **Weaker:** the `/size` small-cap sentence (S5). "the course's, not a broker order" became "not a broker order"; the column's title attribute still says "The course's stop".

**The local Worker.** Placeholder `.dev.vars` (four entries as briefed), migrations 0001–0014 applied, the gate seed, the `ABCD-2345` student, `wrangler dev --port 8787 --test-scheduled`, and the 23:00 signal pass run.

- **Door off.** Probed `/`, `/me`, `/tickets/ABCD-2345`, `/tickets/ABCD-2345/review`, `/watchlist`, `/signals`, `/tutor`, `/costs`, `/kit`, `/size`, `/screen`, `/screen/enterprising`, `/card`, `/plan`, `/plan/ABCD-2345`, `/explain/GOOD`, `/fundamentals/GOOD`, `/prices/GOOD`, `/tickets/ZZZZ-9999` (404), `/api/plan/ABCD-2345`, `/plan/ABCD-2345/plan.csv`, `/api/me`, `/api/signals`, `/api/watchlist`.
  - Every HTML page carries exactly one `<nav class="top"`, and none carries `class="back"`.
  - `aria-current` sits on Home for `/`, on *Your page* for `/me`, the account's page and the review page, and on the tool's own link for the watchlist, signals, tutor, costs, kit and planner. No link is marked on `/size`, `/screen`, `/card`, `/explain`, `/fundamentals` or `/prices`.
  - With the door off the planner's pages show *Planner* to anyone, which is consistent with "the code is the key".
- **v1.1 beside it.** I ran `e6fc34c` from `git archive` on port 8788 against a copy of the same local D1.
  - `/api/me`, `/api/signals`, `/api/watchlist`, `/api/plan/ABCD-2345`, `/plan/ABCD-2345/plan.csv`, `/api/risk/ABCD-2345`, `/api/tickets/ABCD-2345`, `/api/costs` and `/api/explain-my-portfolio/ABCD-2345` are **byte-identical** apart from `served_in_ms`.
  - Every number outside the styles and ledes on the planner, the account's page, `/size`, `/costs`, `/signals`, `/watchlist`, `/screen` and the review page is identical. The only differences are the removed "week/phase" numbers.
  - Ten status codes compared are unchanged.
- **As the tutor** (the `access.dev` block, identity `tutor@example.ie`). `/api/me` reads `tutor: true`.
  - `/` has the planner's card and the header's *Planner* link.
  - `/kit` and `/me` (404, no linked account) carry *Planner*.
  - `/signals`, `/watchlist`, `/tutor`, `/costs`, `/size`, the account's page and the review page do not (OI-112, as documented).
  - `/plan` and `/plan/ABCD-2345` open (200).
- **As a student** (identity `ada@example.com`).
  - `/` has no planner card and no *Planner* link.
  - `/me` returns 302 to the account.
  - `/plan` and `/plan/ABCD-2345` return 403, and their header **carries *Planner*** (S1).
  - `/api/plan/ABCD-2345` returns 403 JSON.

**Screenshots** (`review-v120-shots.mjs`, 390 and 1280 px).
- **Pages, door off:** `/`, the account's page, the planner, `/costs`, `/signals`, `/watchlist`, `/me`, `/kit`, `/size`, `/tutor`, `/screen`, the review page, `/plan`.
- **Pages, as the tutor:** `/`, the planner, `/signals`, the account's page.
- **At 1280:** no page overflows.
- **At 390:**
  - Only `/screen` overflows the document (444 px, which predates v1.2: N5).
  - The account's, signals and costs tables and the planner's "not eligible" table scroll inside their boxes (OI-113).
- **What I saw:**
  - **The landing at 1280:** the header on one line, *Planner* included. Then the intro, three cards a row (the tutor's seventh alone on a fourth row), the promises, the look-up and the ledger.
  - **The landing at 390:** the header wraps to three lines with *Planner*. The cards stack one per row, and the ledger's SHIPPED stamps clear the titles.
  - **The planner at 1280:** all sixteen columns fit in the 76 rem main. The stop cell reads "$59.09 / gap $0.74 / $122.84 to the stop" on three lines.
  - **The planner at 390:** each eligible name is a bordered card with labelled lines. The units box, the facts and the thesis box sit inside the card, and the journal row joins the card above it. The repeated "RISK A YEAR" is visible (S3).

**Cleanup.** `.dev.vars` deleted. `wrangler.jsonc` restored with `git checkout`; its SHA-256 matches the value before the edit. Both `wrangler dev` processes stopped. The local `.wrangler/` state I created removed. The scratch copies deleted. `git status --short` shows the 22 shipped paths plus this file.


---

# Part 2 — the reader review (as written)

*Scored 4/10 overall. Several of its complaints are artefacts of the local test data it was reading (three companies instead of 86, no accounts cached, hand-seeded nightly reports that disagree with the account's figures, a stop "hit" with the price since recovered) and are marked as such in Part 3; the rest are findings about the words, and were applied.*


I am an adult in Cork. I have never bought a share. I am reading on my phone on a Tuesday evening with a cup of tea. I read every page in both folders (the student version and the tutor version). Where a page quotes an address, an email or an account code, I have written "[address]", "[the email]" or "[the code]". Where a quoted sentence had a link in it, I show it as "[link]". Otherwise quotes are exact.

The order below is the order I would meet the pages: front page, Your page, my paper account (the tickets page), the review, the watchlist, the signals, the tutor, the costs page, the kit, the planner (the tutor's version only), then the small side pages.

One thing I noticed straight away and kept noticing: the site contradicts itself about its own numbers. The front page says 86 companies and the signals page says 3. The top of my account says one figure and the nightly table says another. I come back to this in each place.

---

### 1. The front page (landing)

#### What I think this page is for, in my own words
It introduces a twelve-evening course where you practise with pretend money and a fixed set of rules, and it is also a diary of how the site was built week by week.

#### What I think I'm supposed to do here
Pick one of the six boxes (Your page, Watchlist, Signals, Ask the tutor, Costs & tax, The kit), but it does not say which to open first or what I should do tonight. The "Look up a company" box asks me to type a ticker, and I only half know what that is.

#### Sentences I could not follow
I went through the whole page.

- "We grade decisions, not outcomes." I don't know who grades me, or how a decision gets a grade.
- "You get a paper account — pretend dollars, real prices, a real record — and a set of rules that says when to buy, how much, and when to sell." I followed it, but "a set of rules" is never shown. Why dollars, when I am in Cork?
- "Your paper account: tonight's report, the stop line, your tickets and your journal. Found by the email you signed in with." Three things I don't know: "tonight's report", "the stop line" and "tickets". It also says I'm found by my email, but the next page says sign-in is off.
- "Which companies pass Graham's checklist and have a price trend going up. Usually none — and that is the lesson." I don't know who Graham is or what his checklist is. "Usually none" sounds like the page is broken, and "that is the lesson" does not tell me what I'm meant to learn.
- "What the trend rule says tonight for all 86 companies: LONG (buy or hold) or FLAT (stay out), and how strong the trend is." "The trend rule" has not been shown to me. "LONG" and "FLAT" are capital letters with no meaning yet. "Buy or hold" are two opposite actions. The signals page later says 3 companies, not 86.
- "A tutor that has read the course notes and nothing else. It shows its sources and never gives a tip." This is fairly clear, but I don't know what a "tip" means here.
- "Price a trade in euro on a real broker's charges, and see the same gain taxed three ways." I don't know what a broker is, and "taxed three ways" is a mystery until I open the page.
- "Type a ticker — the short code a company trades under, such as AAPL for Apple — to see five years of its accounts with Graham's tests, or its price chart with the two moving averages." This is a good explanation of "ticker", then it loses me with "Graham's tests" and "the two moving averages". The next line says "Untick for the price chart", but I can see no tick-box, only the words "the accounts".
- "Also here: the position-size calculator [link] · Graham's screen, run tonight [link] · a company explained, with its receipts [link] · the checklist cards [link]. The site can stand behind Cloudflare Access — a code sent to your email at the door, your page [link] found by that email — and on this deployment the door is off tonight: your page is still its address, so share a screenshot, not the link." Lost on "position-size", "screen", "receipts", "Cloudflare Access", "the door", and "your page is still its address". Is the "door" an actual door? It is the longest and most confusing sentence on the front page.
- "One lesson and one feature a week, for twelve weeks, every step in the open repository — the decisions, the tests, the independent reviews, the live checks, and the list of what is not finished." "Repository", and "the tests" (which tests?).
- "Live quote lookup — rationed by design". I don't know what a "quote" is. "Rationed" is odd.
- "Price history, refreshed every night — see a chart [link] or the whole universe [link]". "Universe" is not a word I'd use for companies.
- "The books, opened — five years of accounts & Graham's ratios [link]". "Ratios" is unexplained.
- "The value screener — seven tests, run tonight [link], the enterprising investor's six [link] & the checklist cards [link]". "Screener", "value" and "enterprising investor" are all unexplained.
- "“Explain this stock” — a story with its receipts [link], written from the fact sheet and checked against it". Which stock, what receipts, what fact sheet?
- "Carver's rule, run nightly — trend signals & instrument risk [link] for every company, and the two averages on every chart [link]". Who is Carver? What is an "instrument"?
- "Carver's sizing and stop — the position-size calculator [link], paper tickets with a decision journal, the stop tracked nightly". Unknown: sizing, stop, tickets.
- "The account marked to market every night — cash, open P&L, the high-water mark and the drawdown, the risk the positions carry against the 12% budget — on each student's page, with the pre-trade checks (size, concentration, budget) that refuse a ticket in a sentence". I understood only "cash". Every other phrase is a term I don't know. A "12% budget" of what? How does a ticket get refused "in a sentence"?
- "A tutor that answers from the course notes [link] and cites the passage on every paragraph — checked, like week 6's story; and the watchlist [link]: Graham and Carver read side by side as a gate". "Like week 6's story" refers to something I haven't read, and "a gate" is unexplained here.
- "“Explain my portfolio” — your tickets read against your rules by an audit and a reading that cannot see the result (on your page); and the costs-and-tax worksheet [link]: the same trade priced in euro, the gain taxed three ways". "Audit", "a reading", "cannot see the result": what result?
- "The real student logins — the site behind Cloudflare Access, an email code at the door, your page found by your email [link]; the takeaway kit [link] assembled; the course tagged v1.0". "Tagged v1.0" means nothing to me.
- "v1.1: the tutor's workbook — tonight's companies ranked by the tests, sized and stopped, the tickets raised through the judge. v1.2: this page, the header on every page, and every page's words for the room rather than the builder". "The judge", "raised", "sized and stopped", "the header". "The room rather than the builder" is a line about the site's own development that I'm not meant to care about.
- "© 2026 Tony Ryan · Source code on GitHub [link] · week 1's /api/hello [link] lives on." The last part means nothing to me.

#### Words used before they were explained
Page where each first appears: the front page, unless I say otherwise.

- **paper account**: front page. Explained in the same sentence ("pretend dollars, real prices, a real record"). Yes.
- **stop** ("the stop line"): front page. Not explained on the front page. Explained in brackets only on the calculator page and the planner. Not on my account page.
- **LONG / FLAT**: front page. Explained by "(buy or hold)" and "(stay out)", though "buy or hold" is vague.
- **forecast**: first on the signals page. Explained there ("how strong the trend is").
- **instrument risk**: front page, in the build list. Explained on the signals page ("how much the price moves in a year"). "Instrument" itself is never explained.
- **drawdown**: front page, in the build list. Partly explained on my account page ("the account is 6.1% below it" and "the report says how far below the high the account is").
- **P/E**: first on the watchlist. Not explained there. Explained on the Graham screen page ("the price divided by a year's earnings"). EPS is never explained.
- **the gate**: front page. Explained on the watchlist.
- **ticket**: front page ("your tickets"). Never plainly explained. The planner says "The journal entry is the ticket", which is odd.
- **thesis**: first on the planner. Explained there.
- **the judge**: front page. Never explained. It "refuses" things.
- **exposure**: first on the planner. Not explained as a word, only inside a formula.
- **high-water mark**: front page. Only implied on my account page ("high $10,100.00", "The high-water mark is $10,100.00").
- **marked to market**: front page. Never explained anywhere.
- **EWMAC**: first on the planner. Not explained. (The signals page writes "EWMA" in a formula, also unexplained.)
- **crossover**: first on my account page, in someone's journal. Not explained.
- **near miss**: first on the watchlist. Explained there ("one test short").
- **Graham**: front page. Never said who he is on the front page or the watchlist. The Graham screen page gives his full name and book title.
- **Carver**: front page. Never said who he is. The calculator page gives "Robert Carver".
- **DEGIRO**: costs page. Named and used, but I'm never told what it is beyond "a published broker schedule".
- **CGT**: costs page, in the form label "The €1,270 CGT exemption". Spelled out as "capital gains tax" earlier on the same page.
- **exit tax**: costs page. Named in the intro, and described in the rules block further down.
- **UCITS**: costs page. Never explained.
- **ETF**: costs page. Never explained.
- **TER**: costs page. Explained by the label ("annual charge (TER)").
- **spread**: costs page. Half-explained ("the cost of buying and selling at the quote"), and it points to "week 2's toll bridge", which I haven't read.
- **moving averages**: front page. Explained on the signals page ("the 16-day and the 64-day").
- **ticker**: front page. Explained.
- **P&L, realised, open**: first on my account page. Never explained.
- **close** (as in "the 2026-11-10 close"): first on my account page. Never explained.
- **screen / screener**: front page. Explained a little on the Graham screen page ("it decides which ones are worth reading about").

#### Anything that sounded like advice or a tip
- "a set of rules that says when to buy, how much, and when to sell." The page says it never tells me what to buy, but this reads like a system for telling me when to.
- "LONG (buy or hold) or FLAT (stay out)". This reads as an instruction.

#### What I liked
"We grade decisions, not outcomes." is a refreshing line, and "Paper portfolios only. Nobody risks a cent in this room." put me at ease straight away. The twelve-week list at the bottom shows there is real structure behind this.

#### Score: 5/10
I got the idea (practice account, rules, no tips), but I would not know which box to press first.

#### The tutor's version of the front page
Differences I noticed: there is an extra "Planner" link in the menu and a seventh box ("The tutor's workbook: tonight's companies ranked by the tests, sized and stopped for an account, the tickets raised through the judge."). There is a line "Signed in as [the email] (the tutor) · the enrolment list is npm run enrol -- --list · the kit [link] · the planner [link] · sign out [link]". "npm run enrol" is computer instructions, not words for me. It also says "The site now stands behind Cloudflare Access — you signed in with a code sent to your email, and your page [link] opens for you and the tutor only, no address to keep secret." That contradicts the student version, which says the door is off.

---

### 2. Your page (the "me" page)

#### What I think this page is for, in my own words
It is meant to lead me to my own account, but on this copy it only tells me the sign-in is off.

#### What I think I'm supposed to do here
Use "the eight-character code the tutor gave you", but I haven't been given one on this page, and there is no box to type it into. I do not know where to go next. I'd have to ask the tutor.

#### Sentences I could not follow
- "Sign-in is switched off on this copy of the site, so there is no email to find your account by." What is "this copy"? The front page told me my account would be found by my email.
- "Your page is [address] — the eight-character code the tutor gave you." The page shows a computer address with a placeholder in it, and there is no way to type my code. It is a dead end for a beginner.

#### Words used before they were explained
"Copy of the site" and "sign-in" are the only odd words. Nothing else to list.

#### Advice or a tip
None.

#### What I liked
It is short.

#### Score: 2/10
I don't know what to do next. There is no box to enter my code.

#### The tutor's version
It says "You are signed in as the tutor ([the email]). No paper account is linked to that email; every student's page opens for you by its code — npm run enrol -- --list shows them." Again nothing I can do, and the instruction is computer jargon.

#### The "not a code" page
If I mistype a code, it says "That doesn't look like a student code — eight characters like [the code]." That is a clear and kind message, though it shows an example in the same shape as real ones.

---

### 3. My paper account (the tickets page — what "Your page" turns into)

#### What I think this page is for, in my own words
It's my pretend account: how much it is worth, what shares I'm "holding", the ones I've sold, and a form for recording a new buy or sell with my reason.

#### What I think I'm supposed to do here
Read the "stop line" first, then write a ticket with a reason of at least 20 characters. There is a red-flag line saying one stop has been hit and I should "write the close ticket". I'm not clear what a close ticket is, but I think it means: write down that I'm selling the Apple shares.

#### Sentences I could not follow (exhaustive)
- "Test Book". Is this my name? A book?
- "Read the stop line first, then the rule's state, then tonight's report; write the Monday line in your journal." Which is the stop line? What is "the rule's state"? What is the Monday line?
- "The rules are Carver's: buy only when the rule says LONG, size by how much the price moves (on the account's value tonight), sell at the stop, write every decision down before you make it." "Carver's", "size", "the stop", and the bracket is hard to read.
- "This account runs 2 companies at a time — each position sized at 6% risk a year (12% ÷ 2)." Risk of what? 12% of what?
- "The page's address is its key: share a screenshot, not the link." I don't understand why an address is a "key".
- "Account value $9,486.18 −5.1% since enrolment": clear enough.
- "Open P&L $1.62" and "Realised P&L −$497.74": what is P&L, and what is "realised"?
- "Drawdown 6.1% high $10,100.00": what is a drawdown, and why is there a "high" of $10,100 when I started with $10,000?
- "Risk used 12.0% of the 12% budget": what is the budget?
- "On the 2026-11-10 close the account is worth $9,486.18: $3,204.18 cash and $6,282.00 in 1 open position — −5.1% since enrolment (−$497.74 realised, $1.62 open)." "The close" is not defined. "Open position" is not defined.
- "The high-water mark is $10,100.00; the account is 6.1% below it." The first time I'm given the term, and it is a metaphor.
- "At a 12% target a one-in-twenty year is about −20%; a run of years typically sees a drawdown of 20–30% from a high, one run in twenty 40% or more, and deeper over a decade: this is what the target was chosen to survive." I can't follow this at all, and I'm a little frightened: it sounds like it is telling me I could lose 40%.
- "Nothing in the rules changes because of it." "It" is unclear.
- "The open positions carry 12.0% a year of the 12% budget (AAPL 12.0%); the account runs 2 instruments, each sized at 6%." Two paragraphs earlier it said each position is sized at 6%, and here AAPL alone is 12%. That doesn't add up for me.
- "1 stop has been hit (AAPL): the rule says close — the close ticket is yours to write at the next decision, with the journal line." Which close ticket, what next decision, what journal line?
- In the open positions table, the Apple row shows a latest close of $349.00 and a stop of $328.28 ("high $360.00 − $31.72"), "TO THE STOP +5.9%", and "STOP HIT 2026-10-28". The price is above the stop, yet it says the stop was hit. And the journal in my Apple ticket says the stop is $317.19. Three different stop figures.
- The form: "Units (blank = the rule's size)". "The rule's size" is not shown.
- "Decision journal — why, in your own words (at least 20 characters: what the rule said, where the stop is, what you will do if it is hit)". It is clear what I have to do, but the "stop" is still not defined.
- Tickets list: "#5 2026-10-28 close MSFT 10 $465.00 2026-10-28 · long $13.63". What does "· long" mean here? Is $13.63 a fee? Why are the tickets in the order 5, 4, 3, 2, 1 rather than by date?
- "The rule went long on the 16/64 crossover; the stop is at $317.19; if it is hit I close the next morning. Calm 2." "16/64 crossover" and "Calm 2" are meaningless to me.
- "Nightly reports the last 10 written by the 23:00 UTC job". "UTC job" is jargon. The review page says there are 15 reports and this says "last 10", which is fine, but then:
- The nightly table shows every row as "$9,800.00 · $20.00 · 3.0% · 11.4% / 12% · 1 · -2.5% · stop hit", the same on all ten nights. At the top of the page the account is worth $9,486.18 with a 6.1% drawdown and 12.0% risk used. The two disagree and I don't know which is true.
- "Fills are the latest nightly close the toolkit holds when the ticket is written (the decision close), in the adjusted series; the stop tracker and the risk report run after the signal pass at 23:00 UTC; the tutor reviews process, never outcomes. Drawdowns are normal: the report says how far below the high the account is and leaves the feeling to the journal." "Fills", "the decision close", "adjusted series", "signal pass", "the stop tracker" are all unexplained. "Leaves the feeling to the journal" is odd.

#### Words used before they were explained
Stop (never explained on this page), P&L, realised, open position, drawdown (partly), high-water mark (partly), risk budget, close, ticket, crossover, fills, adjusted series. See the list on the front page for the rest.

#### Anything that sounded like advice or a tip
- "buy only when the rule says LONG, size by how much the price moves (on the account's value tonight), sell at the stop, write every decision down before you make it." This is a direct list of instructions. It's paper money, but it reads as "do this".
- "1 stop has been hit (AAPL): the rule says close — the close ticket is yours to write at the next decision, with the journal line." This reads as "sell your Apple".
- "the rule says close — write the close ticket". Same.

#### What I liked
The numbers at the top (account value, cash) are simple and honest, and it shows my losing sell next to my winning one without hiding either. The journal box asking "why, in your own words" is a good idea.

#### Score: 4/10
I understood this is my practice account, but I would not be able to say what to do about the red "stop hit" line, and the numbers disagree with each other.

#### The review ("Did I follow my rules?")

**What it's for:** It checks my tickets against the rules and tells me where I broke them.
**What to do:** Read the list; I could press a button to ask for an AI reading.
**Worst five sentences:**
- "Not followed — KO: closed on the 2026-11-02 close with the stop not hit (the rule was LONG). The stop is the closing rule; this close was a second rule, and the journal entry (ticket #3) is where the reason has to be." What is the "second rule"?
- "Journal — Ticket #2's journal entry names no rule, signal or feeling as the trigger (a word test: none of "rule", "signal", "crossover", "long", "stop", "gut", "feeling" appears)." A computer is counting words. I can't tell whether it is marking me down for the style of my writing.
- "The nightly reports flagged a stop hit on 10 nights. Over-budget and too-many-positions nights are the account's arithmetic (a share got wilder, or the number of instruments changed), not a ticket you wrote; a drawdown is normal and the rules do nothing about it." "A share got wilder" is a strange way to say a price moved more.
- "A reading that names a number not on the sheet, cites a fact that is not there, cites nothing, praises or blames a result, or tips, is withheld; the audit stands on its own." Which sheet, and what is withheld from whom?
- "The sheet carries your own journal entries, results included if you wrote them — the AI is told to quote them in fragments only and to repeat no result words; the net is partial by nature, so read what it says." "The net" and "result words" are obscure.
Also the page says the audit is "no AI" and then talks about "the course's AI". I got that, but "audit" in the intro is a scary word for a beginner.
**What I liked:** "Did you do what you wrote?" is a clear and fair question.
**Score:** 5/10.

---

### 4. The watchlist

#### What I think this page is for, in my own words
It lists the few companies that pass two filters at once, and tonight it says there are none.

#### What I think I'm supposed to do here
Read it. It gives me nothing to press or fill in. After reading I know the list is empty "and that is the lesson". There are links to the screens and signals pages, but nothing says which to go to next.

#### Sentences I could not follow (exhaustive)
- "A company is on it only when it passes one of Graham's checklists (is it a sound business at a fair price?) and the trend rule says LONG (is the price going up?)." The brackets help a lot. I still don't know who Graham is, or what the "trend rule" is on this page.
- "Most nights that is nobody — and that is the lesson: the course never buys because a name is famous or a tip was hot." The first half is clear. "The course never buys" is odd for a pretend account.
- "Below the list, the near misses (one test short) and the rest the rule says LONG on." Grammar tangle: "the rest the rule says LONG on".
- "The gate tonight: nothing. No company passes either Graham screen, so there is no name the course would ticket by both rules — the rule's answer is cash, and a journal line that says "waiting"." "Ticket" used as a verb. "The rule's answer is cash" is a puzzle: cash means do nothing?
- "No near miss is long tonight. A near miss is a reading list, not a pick." Why "a reading list"?
- Table headings: "COMPANY / RULE / GRAHAM / THE FAILED TESTS / INSTR. RISK". "INSTR." is short for what?
- "Sorted by defensive tests passed. These are what a "relaxed" gate would read first — labelled as such in lesson 10, never as picks: the failed tests are mostly the two price tests, P/E ≤ 15 and P/B ≤ 1.5, set in the 1970s." Defensive tests, relaxed gate, "lesson 10", P/E, P/B, and "≤" are all unexplained.
- "Small caps on their way to 128 closes" and "Every small cap in the tier has its 128 closes." Small cap, tier, and 128 closes: unknown.
- "Served in 6 ms · raw JSON [link]". A computer's footnote.
- "A gate is what two rules say together about a company tonight — a name on this page is not a recommendation to buy anything, and an empty gate is not a recommendation to wait: it is what the rules say, written down." This is the best explanation of "gate" on the site, but it is at the very bottom, and it says the empty gate is not a recommendation to wait, while higher up "the rule's answer is cash, and a journal line that says 'waiting'".

#### Words used before they were explained
- **gate**: first on the front page. Explained only at the very bottom of this page.
- **near miss**: explained here.
- **Graham**, **trend rule**: not explained here.
- **P/E, P/B**: not explained here. Explained a click away on the Graham screen page (P/E, P/B) and not at all for EPS.
- **defensive tests, relaxed gate, small cap, tier, 128 closes**: never explained on this page.
- **ticket** (as a verb): not explained.

#### Anything that sounded like advice or a tip
- "the rule's answer is cash, and a journal line that says "waiting"". This reads as "do nothing and write 'waiting'". It is then contradicted by the last paragraph's "an empty gate is not a recommendation to wait".
- "These are what a "relaxed" gate would read first". Reads like a ranked list of what to look at.

#### What I liked
I like the honesty of "Most nights that is nobody — and that is the lesson", and the plain-English brackets on the first line.

#### One honest worry
The Graham screen page shows 0 companies have any accounts loaded ("No company has cached accounts yet"), and the signals page shows a dash in the Graham column. So the list is empty because the data is missing, not because the rules found nobody. "That is the lesson" then feels like an excuse for a gap.

#### Score: 5/10
I get the general idea of two filters, but I don't see what a "watchlist" then does for me.

---

### 5. The signals

#### What I think this page is for, in my own words
It shows, for each company, whether a price-trend rule says "buy or hold" (LONG) or "stay out" (FLAT) tonight.

#### What I think I'm supposed to do here
Read the table, then do "Tonight's exercise" (write three names I think are going up and see how many are LONG). I did not write three names before I opened the page, so the exercise is already spoiled.

#### Sentences I could not follow (exhaustive)
- "Every night the same rule is run over all 3 companies the course follows: two moving averages of the price (the 16-day and the 64-day)." The front page said 86. A "moving average" is not explained beyond "of the price".
- "When the faster is above the slower the rule says LONG — buy or hold. Otherwise FLAT — stay out." "Faster" and "slower" what? I guess the two averages.
- "The forecast says how strong the trend is (capped at ±20); the instrument risk says how much the price moves in a year." "Capped", "±20", "instrument". Forecast of what? Nothing about what it predicts.
- "As of the 2026-11-10 close, 2 of 3 companies." Half a sentence.
- "Read the state first, then the forecast." "State" is the column called STATE, fine, but the word was not introduced.
- "long — the fast average is above the slow", "flat — below (no position; the rule never goes short)", "warming up — fewer than 128 closes". "Goes short" and "warming up" are unexplained.
- Table: "INSTRUMENT / STATE / FORECAST (±20) / INSTR. RISK / SINCE / GRAHAM / CLOSE". "KO ... LONG +14.4 21% 2026-01-12 — 96.91". What are 14.4 and 21%? Is 96.91 euros or dollars? Why a dash for Graham?
- "Week 10 — the two rules side by side: the Graham column is what the screens say about the company (tests passed, defensive · enterprising; hover for the failed ones); the State column is what the rule says about its price. A name the course would ticket by both is marked GATE; one Graham test short and long is near." "Hover" does not work on a phone. "Marked GATE" and "near" are lowercase and uppercase labels I can't see in the table.
- "fast = EWMA(close, 16) · slow = EWMA(close, 64) · σ = EW standard deviation of daily price changes, span 35"
- "forecast = 3.75 × (fast − slow) ÷ σ, capped at ±20 · state = forecast > 0 ? LONG : FLAT · instrument risk = σ% × 16 (a year)." A formula with Greek letters. I stopped reading.
- "EWMA weight λ = 2 ÷ (span + 1). The forecast scalar is Carver's (average |forecast| ≈ 10 over his data); the spans, the volatility lookback and the cap are his open-source defaults." All of it.
- "Long-only is the course's adaptation: a negative forecast means no position, never a short." "Short" again.
- "The rule reads the adjusted close — dividends are inside the price." "Adjusted close", "dividends".
- "Tonight's exercise: before you looked at this page you wrote three names you believed were "going up". How many are long here?" I was not told earlier to write names.
- "The rule has no opinion about the company, the news or you — it has read 64 days of closes and divided by the noise." "Divided by the noise" is a metaphor that I can't unpick.
- "Next week: how much a rule like this would let you hold, and where it would make you stop." The course has finished; it says "Next week" while all twelve weeks are "SHIPPED".
- "Education, not advice. A signal is what a rule says about a price series — a long is not a recommendation to buy, a flat is not a recommendation to sell." This conflicts with the top of the same page ("LONG — buy or hold").

#### Words used before they were explained
Forecast (explained), instrument risk (explained, but "instrument" is not), moving average (half), state (not), warming up (explained in the tile), short (not), EWMA / EWMAC (not), adjusted close (half), dividends (never), Graham (not), GATE and near (not).

#### Anything that sounded like advice or a tip
- "When the faster is above the slower the rule says LONG — buy or hold. Otherwise FLAT — stay out." This reads as instructions.
- The big green "LONG" labels next to Coca-Cola and Apple look like a buy list, whatever the footer says.
- "Where you and the rule disagree, write down why." Nudges me to trust the rule.

#### What I liked
The "tonight's exercise" idea (guess first, then compare with the rule) is a clever way to learn. The three little counters at the top (2 long, 0 flat, 0 warming up) are easy to read.

#### Score: 4/10
The top and the exercise are fine; the half below the line is a maths textbook.

---

### 6. Ask the tutor

#### What I think this page is for, in my own words
A box where I can type a question about the course and get answers taken from the course notes.

#### What I think I'm supposed to do here
Type a question and press Ask. The page tells me how to ask well.

#### Worst five sentences
- "The tutor has read the course's notes (the lesson plans and the kit, 214 passages indexed 2026-11-13) and nothing else". "Indexed" and "passages".
- "a number from nowhere, or anything that sounds like a tip, is flagged or held back." Who flags it, and where?
- "Use the course's words. "the stop", "instrument risk", "the 12% target", "the defensive screen", "the drawdown", "the journal" — retrieval matches words, not meanings." This asks me to use words I don't know. "Retrieval" is jargon.
- "Check every citation. Click a tag; find the sentence; find the number. A confident answer with no passage behind it is wrong, however fluent." I'm not sure how to "click a tag".
- "Education, not advice. The tutor answers from the course's own notes and cites the passage it read; it recommends nothing, and an answer is a reading of the notes, never a tip." "A reading of the notes".

Terms: "stop" is named here as something I can ask about ("Ask anything the course covers — what a stop is"), which is useful.
Advice: "Don't ask what to buy. The tutor won't say, by rule; it will tell you how the course decides, and that the decision is yours." Fine.
**What I liked:** It's honest about what it can't do, and the example question ("How is the stop calculated, and when does it move?") is a good one.
**Score:** 7/10.

---

### 7. Costs & tax

#### What I think this page is for, in my own words
A worksheet where I type in a trade and it shows the fees and the Irish tax on the profit, three different ways.

#### What I think I'm supposed to do here
Fill in the boxes (amount, gain, years, which market, dividend, ETF charge, spread, exemption) and press "Work it out". The boxes show no starting figures in what I can see, though the page already shows a worked example for €10,000, 3 years, 30%.

#### Sentences I could not follow (exhaustive)
- "What it really costs to buy and sell shares from Ireland, and what the taxman takes — the brochure's missing page." What brochure?
- "Type a trade; the worksheet prices it in euro on a real broker's published charges beside the course's own estimate, adds what holding it costs, and taxes the same gain three ways: as shares (capital gains tax), as a fund or ETF (the exit tax), and inside the Individual Investment Account the Finance (No. 2) Bill 2026 would open on 1 July 2027." Far too many ideas in one sentence: broker, estimate, fund, ETF, exit tax, Bill, account that doesn't exist yet.
- "Change the numbers; the cheapest of the three changes with them. Every figure carries its date."
- "As checked on 2026-11-12. Budget 2027 was announced on 6 Oct 2026 and the Finance (No. 2) Bill 2026 published on 19 Oct 2026. A Bill is not an Act: the measures below marked 'Bill' are as announced and drafted, expected to be enacted in December 2026 and, for the investment account, to start only on a commencement order." "Bill" versus "Act", "enacted", "commencement order".
- "Years held (0 = sold in 2026)". Strange.
- "The share's market: US (no stamp duty) / Irish (1% stamp duty) / UK (0.5%)". Stamp duty not explained until the rules block at the bottom.
- "The ETF's annual charge (TER), %", "The spread, % of the price". The spread is not explained until later.
- "The €1,270 CGT exemption unused this year? yes / no — already used". I don't know what I'm answering.
- "€10,000 into a US share for 3 years, sold with a gain of 30%: €3,000.00." Clear.
- "The trade costs €79.00 to open and close on the published schedule (commission and handling, buy €2.00, commission and handling, sell €2.00, currency conversion, buy €25.00, currency conversion, sell €32.50, the spread (week 2's toll bridge) €10.00, exchange connectivity €7.50); the course's own model (week 8's $2 + 0.25% a trade, in the paper account's dollars) would say $61.50 — close enough that the paper account's costs were real costs." A string of items in a bracket, two "weeks" I haven't seen, and a toll bridge. The next table gives the same figure in euro, not dollars.
- "The same money in a euro-listed ETF: €12.00 to trade, and €69.00 of annual charge over the holding, taken inside the price — if the 30% is the fund's price gain, that charge is already paid." What is an ETF, "taken inside the price"?
- "The tax on the same €3,000.00: as shares, €536.30 (31% of €1,730 (the gain less the €1,270 exemption)); as a fund or ETF, €1,050.00 (35% of the whole gain (a sale from 1 January 2027: 35% as announced; 38% if sold in 2026); no exemption); inside the investment account, €0.00 (the average value never passes €50,000: no charge, no capital gains tax, no exit tax, no deemed disposal)." Brackets inside brackets. "Deemed disposal" is not explained here.
- "Net of trade costs and tax, the €3,000.00 becomes €2,384.70 as shares, €1,938.00 as an ETF (its annual charge already in the price), €2,921.00 inside the account (traded as shares) — the share's dividends, €345.00 gross over the holding, are income taxed at your own rate and are left out of all three. The order of the three can change with the size of the gain, the years, and whether the exemption is free — change the numbers and watch it." Everything.
- "Currency conversion, buy: 0.25% of €10,000 — the euro account buys dollars (or sterling)". OK but "euro account" is a guess for me.
- "The spread (week 2's toll bridge): 0.1% of the value: the cost of buying and selling at the quote". "At the quote" is still unclear.
- "Exchange connectivity: €2.50 a year for a foreign exchange, 3 years". "Foreign exchange" here doesn't mean currency, I think.
- "Open (the course's model): €27.00 — $2 + 0.25% — the ticket's cost line". Dollars and euros mixed.
- "As a euro-listed UCITS ETF (core selection)" and "€1.00 an order for a core-selection ETF on a euro venue; €3.00 outside the selection". UCITS, "core selection", "venue".
- "a published broker schedule (DEGIRO Ireland, as published autumn 2026 — confirm on the broker's site before relying on it): US shares €2.00 an order, Irish shares €2.00, core-selection ETFs €1.00 (€3.00 outside the selection), currency conversion 0.25% each way, €2.50 a year per foreign exchange. Any MiFID broker on an EU regulator's register works the same way; the numbers differ." MiFID, "register".
- "Withheld at source (US, treaty rate): 15% with a W-8BEN on file (30% without); then income tax at your rate, with credit for this". W-8BEN and "treaty rate".
- "Annual charge (TER): 0.2% a year of the average value over 3 years, taken inside the fund — the price you see is after it".
- "Shares, outside any account Bill — not yet law", with "31% of €1,730 (the gain less the €1,270 exemption)" and "paid by 15 December (January–November disposals) or 31 January (December's); the return by 31 October of the following year". Does "Bill — not yet law" mean the 31% is not yet law? Elsewhere it says it already applies from 7 October.
- "no deemed disposal inside 8 years", "an ETF is self-assessed on Form 11 / Form 12 (an Irish fund deducts the tax itself); the broker reports nothing to Revenue for you". "Self-assessed", "deemed disposal".
- "a simplification: the charge is counted from the trade's first year as if the account were open then — it opens on 1 July 2027 if enacted; the provider calculates and deducts the charge; whether a US-listed share is an eligible asset is for the Act and Revenue's guidance". Hard to follow.
- Rules block: "The exit tax on funds and ETFs: Irish and equivalent EU/EEA/OECD funds and ETFs (UCITS): the exit tax on a gain or a distribution — 41% to the end of 2025, 38% from 1 January 2026 (Budget 2026), 35% from 1 January 2027 as announced in Budget 2027 and drafted in the Bill. No annual exemption; a loss on one fund cannot be set against a gain on another or on shares; a deemed disposal every eight years taxes the gain as if sold (credited against the tax on the real sale)." Most worrying: I can't tell if it's true for me.
- "A US-domiciled ETF is a different case — generally not available to EU retail investors since 2018 (PRIIPs) — and outside this worksheet." PRIIPs.
- "Whether a share listed only in the US qualifies, and how US withholding is treated inside, are for the Act and Revenue's guidance — the Bill's text as published does not settle them." The page admits it doesn't know.
- "The worksheet does not compute income tax on dividends (it depends on the person), the four-week rule, a foreign-currency gain on the cash itself, or the broker's cap on connectivity fees; it assumes a straight-line path from cost to sale value for the averages." All of it.

#### Words used before they were explained
CGT (spelled out on the page), exit tax (introduced in the intro, described lower down), ETF (never), UCITS (never), TER (labelled), spread (half), DEGIRO (named, not described), stamp duty (explained at the bottom, after it is used in a menu), deemed disposal (partly), W-8BEN (not), MiFID (not), PRIIPs (not), broker (not), dividends (not), "week 2's toll bridge" (refers to something I haven't seen).

#### Anything that sounded like advice or a tip
- "Change the numbers; the cheapest of the three changes with them." It sets up a "which is cheapest" comparison, which is a nudge toward the "best" way.
- "€2,384.70 as shares, €1,938.00 as an ETF ... €2,921.00 inside the account". Three results laid side by side, with the biggest being the account that doesn't exist yet.
- Naming "DEGIRO Ireland" and the line "Any MiFID broker on an EU regulator's register works the same way" reads like a pointer to a particular broker. "a real broker's charges" on the front page plus the named broker feels like a recommendation, whatever the footer says.

#### What I liked
Dates on everything and the honest "A Bill is not an Act" are the kind of care I'd want. The worked example adds up. I checked: 2 + 2 + 25 + 32.50 + 10 + 7.50 is 79.

#### Score: 4/10
It does one useful thing, but it throws a dozen new ideas at someone who has never owned a share.

---

### 8. The kit

#### What I think this page is for, in my own words
A list of seven documents to take home from the course.

#### What I'm supposed to do
Print the rules card and the journal, and keep the links to the rest. It does tell me that, clearly. The links go off to an outside site ([address]), which I might not want on my phone.

#### Worst five sentences
- "The seven rules the toolkit enforces, one page: the opening rule, the risk target, sizing, the stop, costs, the Monday routine, what the ticket refuses." "Enforces", "refuses".
- "The template every ticket's journal entry follows: the trigger, the thesis, what would prove you wrong, the size and why, when you will judge it."
- "Graham, Carver, Peacock and the rest — what each is for and which chapters the course leans on." Who is Peacock?
- "Stories versus numbers, and the platform itself: the register, the number, the fee page, the exit — the red flags one breath each."
- "How one decision is presented and judged on process alone, and the questions the course asks of itself at the end."
Also: "The site itself stays where it is for the class: your paper account, the signals, the watchlist, the tutor, the review, the costs worksheet." Fine.
Words: "toolkit", "Peacock" and "register" are unexplained.
Advice: none. The scam notes are a plus.
**What I liked:** It is plain and finite, seven things. The list is useful. "How to spot a scam" is a lovely thing to give a beginner.
**Score:** 7/10. (In the tutor version, "The planner" link is added to the menu; the page is otherwise the same.)

---

### 9. The planner (tutor's version; the student menu doesn't show it)

I only know about this page from the tutor's folder. The student version of the front page doesn't link to it. The student folder still holds the page, and nothing on it says "not for students".

#### What I think this page is for, in my own words
It is the tutor's workbook: pick a paper account and it works out which companies to "buy", how many shares, and where the stop goes, then lets the tutor "raise tickets".

#### What I think I'm supposed to do here
Type an account code (the box shows an example in the shape of a code) and press Open. On the account's plan: optionally type a euro rate, write a "thesis" for each ticked name, then press "Raise the tickets". It is a lot to take in. As a student I would not know whether to use it.

#### Sentences I could not follow (exhaustive)
- "The planner is the tutor's workbook. It takes tonight's companies, ranks them by the course's tests (never by what went up), sizes the top ones for a paper account, shows each one's stop (where the rule says sell) and costs — in dollars, and in euro at a rate you type — and can raise the tickets through the judge, which refuses exactly as a student's page would." "Ranks", "sizes", "raise the tickets", "the judge", "refuses". It does explain stop here, in brackets.
- "The door is off on this deployment: the code is the key, as on every student page." "Deployment", "door", "key".
- "PLAN FOR A PAPER ACCOUNT BY ITS CODE". Plain enough, but I have no code.
- "Tonight's companies, ranked by the tests: the ones on the watchlist first (Graham's checklist passed and the trend rule LONG), then the near misses (one test short), then the rest the rule says LONG on. Within each group: more of Graham's tests passed, then a stronger trend (the forecast, capped at ±20), then a calmer price (the instrument risk — how much it moves in a year). Never by what went up." The best explanation of the order. I'm still left with Graham, trend rule, forecast.
- "The top ones are ticked and sized for this account at 12% ÷ N risk a year on its value tonight — the figures the ticket judge reads — with the stop (where the rule says sell) and the costs." "N" is not explained here.
- "Change anything; the judge still says no." Says no to what?
- "Signed in as [the email] (the tutor) · sign out [link] · the account's page [link] · download the plan as CSV [link] · JSON [link] · tonight's top names (nothing saved yet)". "CSV" and "JSON".
- "INSTRUMENTS, N: 2 · 6% each. Set by npm run enrol; each position is sized at 12% ÷ N." Computer instruction.
- "US DOLLARS PER EURO: Typed, never fetched. Blank leaves the euro columns blank."
- "SPREAD ESTIMATE (% OF VALUE): Week 2's toll: 0.1% for a large cap; a small cap's can be ten times that."
- "Recompute keeps your ticks and redoes the arithmetic · Repopulate picks the top names again from tonight's rows · Save keeps the picks as you typed them (a blank units cell stays the rule's, re-sized each night) · Raise writes each ticked row through the ticket judge, which refuses exactly as the account's page would." Four buttons and I'd not know which one to press.
- "names picked · room for 2 (2 instruments, 0 open)", "exposure · 60% of $10,000.00", "risk a year with the open positions (plan 11.7% + open 0.0%) · target 12%", "to open (course model) · cash after $4,029.73". "Exposure", "target", "to open".
- "No exchange rate typed, so the euro columns are blank: enter today's US-dollars-per-euro rate from your broker's screen to see the broker's lines." Fine, but "your broker's screen" assumes I have a broker.
- "Eligible tonight — 2 names, by the tests". The Graham column for both says "no books" and "—", so no Graham test was applied. "By the tests" overstates it.
- Table headings: "PICK / # / INSTRUMENT / BAND / GRAHAM / FORECAST / RISK / LONG SINCE / CLOSE $ / RULE / UNITS / EXPOSURE / RISK/YR / STOP $ / not a broker order / COST TO OPEN / IN EURO". "Band" has no explanation. "Not a broker order" sits in the middle of the headings.
- "gap $10.23 · $296.67 to the stop · $9.03 · trip 0.64%". "Trip" is unexplained.
- "KO: rule LONG since 2026-01-12 (forecast +14.4); Graham —; 29 of the rule's 29 shares at the 6% target; stop $86.68 (gap $10.23), trailing the high; if it is hit I close on the next close." "Trailing the high" and "the rule's 29 shares".
- "Thesis: why this name, what would prove you wrong, why this size — at least 20 characters; the facts above are the planner's, the decision is yours". The one clear, useful instruction on the page.
- "Not eligible tonight — 0 names, with the reason the ticket would give".
- "The arithmetic, in full — the same table (src/lib/sizing.ts) the ticket judge and the nightly stop tracker use, on the judge's facts. Target exposure = the account's value tonight (less the opening costs of the rows above) × (12% ÷ N) ÷ instrument risk, capped at the value (no leverage) · units = the whole shares that fit (fewer allowed, never more), then fitted to the ledger cash left in rank order · stop gap = ½ × instrument risk × entry, fixed at entry · stop = the highest close since entry − gap, read on the close and acted on the next day by a ticket — not a resting stop-loss order at a broker (the costs-and-tax walkthrough says why: gaps and intraday noise) · a trade costs $2 + 0.25% in the course's model; the euro lines are a published broker schedule (DEGIRO Ireland, as published autumn 2026 — confirm on the broker's site before relying on it): €2.00 an order, 0.25% conversion each way, the spread as typed, and €2.50 a year per exchange you hold on (NYSE and Nasdaq are two), capped at 0.25% of the account — charged once, not per name. The rule: 16/64-day EWMAC, long-only; a name warms up for 128 closes." Not one word of it is for me. It even shows a computer file name.
- "The journal entry is the ticket: the planner writes the facts (the rule, the screens, the size, the stop) and you write the thesis — at least 20 characters; a row with none is not raised. What would prove you wrong is not on any sheet."

#### Words used before they were explained
Judge (never), raise a ticket (never), band (never), exposure (formula only), leverage (never), trip (never), EWMAC (never), small cap (never), N (partly), thesis (explained), stop (explained here in brackets, finally).

#### Anything that sounded like advice or a tip
- "The top ones are ticked and sized for this account at 12% ÷ N risk a year on its value tonight". It tells me which companies and how many shares.
- "Eligible tonight — 2 names, by the tests", with "KO: ... 29 of the rule's 29 shares at the 6% target" and "AAPL: ... 9 of the rule's 9 shares". This looks very much like "buy 29 of KO and 9 of Apple", with a button saying "Raise the tickets".
- "if it is hit I close on the next close". Written in first person, as if I'd said it.

#### What I liked
"What would prove you wrong is not on any sheet" is a good, humble line. And the thesis box does insist I write my own reason.

#### Score: 3/10
I could not use this page, but I'm not sure it is meant for me.

---

### 10. The smaller pages I met on the way

These are shorter reports.

- **Graham screen (and its "enterprising" twin; both pages show the same text).** For: shows how many companies pass Graham's seven tests. To do: nothing, it shows 0 everywhere ("No company has cached accounts yet — the nightly refresh fills the books over three nights."). I liked "A screen doesn't pick shares — it decides which ones are worth reading about." and the "Tonight's argument" questions. The "enterprising" version of the page shows the defensive title and numbers, so I couldn't tell the two apart. Worst sentences: "Benjamin Graham's seven tests for the cautious investor (The Intelligent Investor, 1949; the 1972 figures), run tonight over 0 companies' accounts: big enough, financially strong, steady earnings, ten years of dividends, growing, not dear by P/E (the price divided by a year's earnings), not dear by P/B (the price divided by the book value)." / "0 SURVIVORS · ALL TESTS PASSED" / "Universe 3; 0 with books." / "Prices to — · accounts to the latest fiscal year held · served from the nightly cache in 3 ms". "Book value" and "fiscal year" are unexplained. Score 4/10.
- **The checklist cards.** For: the seven tests (and a second set of six) on one printable page. Good: each test has a plain line under it ("Small firms are more fragile in bad years."). Worst: "Latest annual revenue ≥ $800m — Graham's $100m × US inflation since 1971 (CPI ≈ ×8)." / "Positive EPS in every one of the last 5 years (free data holds 5)." / "P/B ≤ 1.5, OR P/E (3-yr) × P/B ≤ 22.5." / "Price ≤ 9× the latest fiscal year's diluted EPS. A loss year cannot be cheap on earnings — it fails." / "Printed from the same rules the course toolkit runs (src/lib/graham.ts), so the card and the screen cannot disagree." EPS, current ratio, working capital, tangible book: none are explained. Score 6/10.
- **Position-size calculator.** For: type a share, an account value and a number of companies; it tells me the number of shares and the stop. To do: fill three boxes and press "Size it". Worst: "a risk target of 12% a year (the account moves about that much in a typical year), shared equally when an account runs more than one company (12% ÷ N each); the stop (the price at which the rule says sell) half the instrument risk below the highest close since you bought; whole shares only; $2 + 0.25% a trade." / "a position whose round trip costs more than 1% is too small to trade." / "The constants live in one table, src/lib/sizing.ts". This is the page where "stop" is finally explained in brackets. Score 5/10.
- **Company pages (accounts, price chart, "explain this company").** Each says only that no data has been loaded yet ("No cached accounts yet — the nightly refresh opens a few companies' books per night and covers the whole universe within about three nights." / "No cached history yet — the nightly refresh hasn't reached this symbol. Check back after 23:30 Irish time." / "has no cached accounts yet"). The front page invites me to look up a company, and then the page for Coca-Cola has nothing on it. Score 2/10. (The signals page lists a price for Coca-Cola, so some price data exists.)

---

### The five sentences on the whole site that most need rewriting

1. Front page: "The site can stand behind Cloudflare Access — a code sent to your email at the door, your page [link] found by that email — and on this deployment the door is off tonight: your page is still its address, so share a screenshot, not the link."
2. Front page: "The account marked to market every night — cash, open P&L, the high-water mark and the drawdown, the risk the positions carry against the 12% budget — on each student's page, with the pre-trade checks (size, concentration, budget) that refuse a ticket in a sentence"
3. My account page: "At a 12% target a one-in-twenty year is about −20%; a run of years typically sees a drawdown of 20–30% from a high, one run in twenty 40% or more, and deeper over a decade: this is what the target was chosen to survive."
4. Signals: "forecast = 3.75 × (fast − slow) ÷ σ, capped at ±20 · state = forecast > 0 ? LONG : FLAT · instrument risk = σ% × 16 (a year)."
5. Costs & tax: "Type a trade; the worksheet prices it in euro on a real broker's published charges beside the course's own estimate, adds what holding it costs, and taxes the same gain three ways: as shares (capital gains tax), as a fund or ETF (the exit tax), and inside the Individual Investment Account the Finance (No. 2) Bill 2026 would open on 1 July 2027."

(The nearest runners-up: "Read the stop line first, then the rule's state, then tonight's report; write the Monday line in your journal." on my account page, and the planner's long "The arithmetic, in full" paragraph.)

### The three things I would want on the front page that are not there

1. A "start here" line: one sentence saying what to do first tonight (for example, "ask your tutor for your account code, then open Your page"), and a way to type that code in. As it is, Your page tells me to use a code I don't have, with nowhere to put it.
2. A short plain-words key for the site's own words (paper account, rule, LONG, stop, ticket, watchlist), each in one line, before the timeline of how the site was built. The timeline takes up most of the page and is about the builder, not me.
3. A clear note of which evening of the twelve we are on and where the lesson notes for it are. At the moment the page lists all twelve weeks as "SHIPPED", the signals page says "Next week", and the numbers (86 companies versus 3) don't agree, so I can't tell what is live and what is still being built.

### Did I understand these three by the end of the front page, Your page and the watchlist?

- **A paper account: yes.** "You get a paper account — pretend dollars, real prices, a real record" on the front page, repeated on my account page as "This is your paper account — pretend dollars, real prices, a real record — started at $10,000.00." The page then showing cash and shares made it concrete.
- **A stop: partly.** No page in those three defines it. From "sell at the stop", the journal examples ("the stop is at $317.19; if it is hit I close the next morning") and "STOP HIT ... the rule says close — write the close ticket", I guessed it is a price at which I must sell. The sentence that actually defines it ("the stop (the price at which the rule says sell)") is on the calculator page and the planner, which I'd only find by clicking away. I also could not tell why Apple counts as "stop hit" when its price is above its stop.
- **The watchlist: partly.** "A company is on it only when it passes one of Graham's checklists (is it a sound business at a fair price?) and the trend rule says LONG (is the price going up?)." taught me it is a short list that two filters produce, not a list I build myself, but I still don't know what the two filters are, and tonight it is empty.

### Overall score: 4/10

There is a good idea underneath (practise with pretend money, write your reasons down, be graded on your process), and a few pages (the tutor, the kit, the checklist cards) are clear and kind. But a beginner is thrown into a lot of unexplained vocabulary on the very first page, the "Your page" entry point is a dead end without a code, and the site's own numbers disagree (86 companies versus 3, $9,486 versus $9,800, a stop "hit" while the price is above it). Worst for me, the pages meant to teach (signals, costs, planner) are written for someone who already knows the field, and several "Education, not advice" footers sit under lines that read like instructions to buy, hold or sell.


---

# Part 3 — the resolution (14 Nov 2026; the tutor: "implement all")

## The code review's findings

| # | Finding | Decision | What changed |
|---|---|---|---|
| F1 | The review page said the AI's sheet carries "no profit, loss or account-value figures at all" — false | fix | The lede says "none of the *toolkit's* profit, loss, account-value or drawdown figures" and "your own journal words are on the sheet as you wrote them, results included if you wrote them"; both pinned (`src/review.ts`, `src/review.test.ts`) |
| S1 | The planner's 403 page showed a student the *Planner* link (a hardcoded `tutor = true`) | fix, by construction | The header no longer takes a flag. `nav()` leaves a mark where the link goes; one HTML middleware in `src/index.ts` reads the door per request and fills it — the link when `plannerOpen(gate)` (the tutor, or anyone when the door is off: `plannerCheck`'s own rule), nothing otherwise. A page never passed through it keeps a bare comment, which carries no link. Pinned: a student's `/plan` 403 carries no link and no mark; JSON passes untouched (`src/access.test.ts`) |
| S2 | OI-112's reason (one D1 query a page) was wrong; the tutor lost *Planner* on six pages | the link everywhere | The same middleware: *Planner* in the header of every page for the tutor, marked current on the planner; OI-112 rewritten (the cost is one Access identity read per HTML response, no D1) |
| S3 | Two different numbers both labelled "Risk a year" on the phone card | fix | `data-label="Price moves a year"` and `data-label="Adds to the account's risk"`; pinned, the old label pinned absent (`src/plan.ts`, `src/plan.test.ts`) |
| S4 | The lede said "more of Graham's tests passed"; the code ranks defensive then enterprising | fix | "more of Graham's seven defensive tests passed, then more of his six enterprising tests, then a stronger trend…"; re-pinned |
| S5 | The calculator's small-cap sentence was dropped, not re-pinned | put back | "Any of the big names works; a smaller company works once the rule has 128 days of its prices."; pinned; the build log's "not loosened" corrected to "eight re-pinned, one put back after the review" |
| S6 | The voice sheet reached the ledes and eyebrows only | the second pass | Out of every tool page's body: "week 8", "week 10", "week 2's toll bridge", "week 5's checklist", "(week 9, OI-08)", "(Phase 3 review F2)", `src/lib/sizing.ts`, `src/lib/graham.ts`. The costs reading's lines re-pinned ("The spread (the toll)"). The kit's week stamps stay — they record when each document was taught. Rule 10 of the sheet now says so |
| N1 | Ledes breaking rule 1 or 3 | fix each | The watchlist, both screens and the planner open with what the page is for and what to do; "warming up", "the Monday line", "the stop line", "instrument risk" (on `/size`), "N", "the judge", "the fact sheet" and "tag" explained at first use; the screen's lede says Graham asked for twenty years of dividends and why the course asks for ten (the glossary too) |
| N2 | The landing's cards had no headings | fix | Each card's title is an `h2` inside the link; the planner's card too |
| N3 | The planner's stacked table loses its semantics on a phone | fix | `role="table"`, `rowgroup`, `row`, `columnheader`, `rowheader`, `cell` on the eligible table; the `data-label` text stays as the visible label |
| N4 | The unused `who` option; "Your page" marked current on another student's page for the tutor | half | `who` removed (`nav()` takes the path only). The marking stays and is OI-115 — cosmetic |
| N5 | `/screen` scrolled sideways at 390 px (the `.sr` spans escaping the box; predates v1.2) | fix | `.wrap { position:relative }` on the screen page; the Playwright pass reports no page wider than the window at 390 |
| N6 | Dead `.back` CSS | fix | Removed from `src/page.ts` and the card's print rule (which now hides the header instead) |
| N7 | "The seven documents" named six on `/kit`, five on the landing's card | fix | Seven named in both, the quickstart first |
| N8 | The landing's card hardcoded "all 86 companies" | fix | "every company the course follows"; pinned absent |
| H1 | Nine old pins failed, not eight | fix | The build log and OI-111 say nine |
| H2 | A test comment cited OI-111 for OI-112 | gone | That test was rewritten for S1/S2 |
| H3 | The reader review was not in the shipment | fix | Part 2 of this file |
| H4 | The README's "26 live checks" is 25 (no VC-11), and "two carry letters" is eight | fix | "25 numbered live checks (VC-01 to VC-26 with no VC-11; eight carry letters)" |
| H5 | Version and lock | — | Correct as shipped |
| H6 | Syllabus #25 (b)'s labels; (f)'s wording | fix | The labels as built; "the gate is the reader's, as Phase 2's was" |
| H7 | VC-26 (c) was false for `/screen`; (a) held except the 403 page | fixed by N5 and S1 | An amendment appended to the record under the VC-26 plan |
| H8 | The shipment's files are clean | — | Still: no key, no address but the fixtures, no code but the fixtures, no live address, no `wrangler.jsonc` |

## The reader review's findings

| Where | What the reader said | Decision | What changed |
|---|---|---|---|
| The landing | The door sentence was the longest and most confusing on the page | rewrite | Two short sentences in each state (`doorSentence` in `src/me.ts`); re-pinned |
| The landing | "Which box do I press first?" | a start-here line | "New here? Open *Your page* first… Then the watchlist, the page everyone liked. Stuck on a word? Ask the tutor, or read the key below the cards." |
| The landing | "A short plain-words key for the site's own words" | the six-line key | Below the promises: a paper account · the rules · LONG/FLAT · the stop · a ticket · the watchlist, one line each |
| The landing | The ledger "takes up most of the page and is about the builder, not me" | fold it | `<details>` "How it was built — the builder's log, week by week; the course is the pages above". The rows themselves unchanged: they are the record's |
| The landing | "SHIPPED" on every row and "Next week" on the signals page: which evening are we on? | say the course has run | The intro: "The twelve evenings have run; the site stays open for the class." The signals page's "Next week" is now a link to the calculator |
| The landing | "Why dollars, when I am in Cork?" | one bracket | "pretend dollars (the companies are American)" |
| The landing · the account's page | "stop", "tickets", "tonight's report" used before they were explained | explain at first use | The first card: "the stop line (the price at which the rules say sell), your tickets (the form that buys or sells on paper)"; the account's lede likewise, and the ticket and the judge defined there |
| Your page (door off) | A dead end: a code is named, nowhere to type it | the code box | A GET form on `/me`; `/me?code=` of the right shape redirects to the account's page, the wrong shape says "That doesn't look like a student code…" (400). The tutor's no-account page gets the box too. Decision #25 (e) bent by one query parameter on an existing route, recorded in the syllabus |
| The signals | "As of the … close, 2 of 3 companies." — half a sentence | fix | "As of the … close, N of the M companies have a reading." |
| The signals · everywhere | "LONG — buy or hold / FLAT — stay out" read as instructions under an "Education, not advice" footer | the wording | "LONG — it would be in the share, holding it. Otherwise FLAT — it would be out." on the signals page, the landing's card and the key; the glossary changed; rule 11 added to the sheet |
| The signals | The formulas "a maths textbook"; "divided by the noise"; "goes short" | fold and gloss | The formulas under `<details>` "The maths, if you want it"; EWMA and "short" glossed; "allowed for how jumpy they are" |
| The signals | "hover for the failed ones" does not work on a phone | the words | "on a computer, hover for the failed ones — the screen lists them" |
| The account's page | The drawdown sentence "frightened" it | plainer, same figures | The nightly report's sentence rewritten: "That is normal. A 12% target means the account moves about 12% in an ordinary year, so one year in twenty is down about 20%…"; re-pinned (`src/lib/risk.ts`) |
| The account's page | A stop "hit" while the price is above the stop | the words | "the rule says close, whatever the price does after"; re-pinned. (The flag itself is right: a hit stop is acted on by a ticket, and the position stays open until the student writes it) |
| The account's page | One nine-sentence lede | split | Two paragraphs: what the page is and what to do; then the rules and the ticket |
| The watchlist | "the rest the rule says LONG on"; "ticket" as a verb; "the rule's answer is cash" | fix | "the companies the rule says LONG on that pass neither checklist"; "would write a ticket for"; "the rules' answer is to hold cash"; the P/E and P/B tests glossed where they are named; the reading's sentence re-pinned (`src/lib/gate.ts`) |
| Costs & tax | Twelve ideas in one sentence; ETF, UCITS, broker, stamp duty, DEGIRO unexplained | rewrite and gloss | The lede in short sentences; a broker, an ETF, CGT, UCITS, stamp duty, the TER and the spread explained where they first appear; "DEGIRO's are used because it publishes them — that is not a recommendation" |
| Costs & tax | "the brochure's missing page" | cut | Gone |
| Ask the tutor | "indexed", "retrieval", "click a tag" | the words | "in N short passages, last read in on <date>"; "finds passages by matching words, not meanings"; "each paragraph of an answer ends in a tag naming the passage it came from; tap the tag…" |
| The kit | "Who is Peacock?" | left | The reading list's own page says; the kit's one-line descriptions stay |
| The planner | "Change anything; the judge still says no" — says no to what? | the words | "the judge (the rules, read against the account before a ticket is accepted) still refuses what breaks them"; "N" explained |
| The tutor's `npm run enrol` lines | "computer instructions, not words for me" | left | They are the tutor's own instruction, shown to the tutor only |
| Artefacts of the local data — not findings | 86 vs 3 companies; no accounts cached; the nightly table disagreeing with the account's figures; the enterprising screen reading as the defensive one (the dump's wrong query parameter) | none | The live site has 86 companies, the books cached, and reports written by the nightly job |

**After the changes:** 631 tests (630 + the code box), `tsc` clean; every page screenshotted again at 390 and 1280 px, door off, as the tutor and as a student — no page wider than the window; the planner's 403 page carries no link; the code box redirects. The reader review was not re-run: its reading is of the shipment as reviewed, and the exit check VC-26 (e) is the tutor reading the landing, the account's page and the watchlist as a student would.
