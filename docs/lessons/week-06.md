# Lesson 6 — Numbers into Narrative (and the evening we audit a story)

**90 minutes · Phase 2, week 3 of 3 · Toolkit feature: "Explain this stock" `/explain/:ticker` — a numbered fact sheet, a short story written from it, and the checks that bind the story to the sheet. Also taught tonight: the enterprising screen `/screen/enterprising` and page 2 of the card.**

*Methodology: Graham on the two investors (TII p. 6), the enterprising investor's winnowing (ch. 15, pp. 385–387), the Chrysler caveat on low multipliers (ch. 7, p. 165), Mr. Market (ch. 8, p. 188; Zweig p. 213), and Zweig's rule to read five years of a company's own reports (p. 375). Chapter numbers hold in every edition; page numbers are the course copy.*

## By the end, students can

1. Say what the enterprising investor relaxes and what he tightens, and why a small dull company can be a candidate on one screen and a fail on the other.
2. Read an AI-written explanation of a company **against its fact sheet**, sentence by sentence, and find the claim the sheet does not support.
3. Tell a number that is *on the record* from a number that is *in the story*, and say which of Graham's three P/Es a figure is.
4. Answer, in their own words, "why not just use Yahoo Finance?"

## Materials

- The two screens and `/explain/` pages, pre-checked the evening before (tutor notes).
- Printed card, both pages (`/card`): page 1 came home last week; page 2 is new.
- One **explain page printed per pair** (Print → the whole page: story, fact sheet, bars, kinds). Six companies, chosen the evening before: the highest scorer on each screen, one cheap-on-earnings failure (AT&T or Verizon on the 17 Oct run), one new-dividend payer (Alphabet or Meta), one loss-year company (Ford, Boeing or Intel), one bank.
- A phone or laptop per pair with Yahoo Finance or Google Finance open for the three-P/Es exercise.
- Journals; last week's pre-mortems.

## Running order

**0:00 — Harvest: the pre-mortems (10 min).**
Three volunteers read theirs. Listen for the pattern: the good ones name a *number that would have to move* (a loss year, a debt figure, a dividend cut); the weak ones tell a story with no number in it. Say so, kindly. That difference is tonight.

**0:10 — The two investors (25 min).**
Graham's distinction is effort, not nerve (p. 6): the defensive investor wants "freedom from effort"; the enterprising one has "willingness to devote time and care". Project `/screen/enterprising` beside `/screen`. Walk the table from `the-enterprising-screen.md`: relaxed on quality and record (1.5× instead of 2×, five years instead of ten, "some current dividend" instead of twenty years), **stricter on price** (nine times earnings or less, first; under 120% of *tangible* book), and **no size test** at all (p. 386).

Then read the room's numbers off the footer. On the 17 Oct run: 37 of 38 failed the first cut and **38 of 38 failed tangible book** — nothing in our pool is priced within 120% of what you could touch, banks included. The one company through the first cut (AT&T) failed three others. Ask: *who passes one screen and fails the other, and why?* (Alphabet and Meta pass "some current dividend" and fail the ten-year record: same history, two correct answers.) Close with Graham's own numbers: about 150 of 4,500 passing all six in 1970, then "a third selection … one out of five" by judgment (p. 386). Candidates are a reading list.

**0:35 — Stories versus numbers (10 min).**
Every tip is a story. Mr. Market "lets his enthusiasm or his fears run away with him" (ch. 8), and in 2026 he lives in your pocket. The course's defence is not cynicism but a habit: *every sentence about a company should point at a number on the record, and the number should be one you can find yourself.* Tonight the toolkit models that habit, and then we check whether it kept it.

**0:45 — Explain this stock, live (10 min).**
Project `/explain/` for the highest scorer. Read the page top to bottom: the two verdict chips; **the story**, four short paragraphs with small fact tags after each; the source line (who wrote it, when, from the cache or fresh, how many tokens, and whether the checks were clean); then **the fact sheet** the story was written from; **what would have to change**, in numbers; **what kind of ✗**.

Say plainly what happened: a numbered fact sheet was built from the books and both screens (no AI involved); an AI was given that sheet and nothing else, told to use only the facts, to tag every paragraph with the facts it rests on, and never to recommend; and then the toolkit *checked the answer* — any number not on the sheet, any fact id that doesn't exist, any advice-shaped language gets flagged on the page. Click "Read the plain version instead" to show the course's own template sentences from the same sheet. Two tellings, one record.

**0:55 — Audit the story, in pairs (20 min).**
Each pair takes a printed explain page. Three jobs, in order:
1. **Trace.** For each sentence, find the fact tag and read the fact. Does the fact support the sentence? Mark ✓, ✗ (not supported) or ? (true as far as you know, but not on the sheet).
2. **Catch.** Is there a number anywhere in the story that is not on the sheet? A claim about *why* something happened? A word that nudges ("cheap", "opportunity", "safe")? The toolkit catches invented numbers and advice-shaped phrases (a list it can be shown, never a complete one); it cannot catch a wrong *word* ("fails" where the sheet says "near miss") or a *why* the sheet never gave. That is your job.
3. **Rewrite.** One sentence of your own, better than the AI's, citing a fact.

Report back: one catch per pair. Expect some pages to be clean, and say so: a clean page is not a reason to stop checking; it's what checking looks like when it passes.

**1:15 — The three P/Es (10 min).**
Pick one company. Open its books page and its Yahoo (or Google) Finance page side by side. Find three P/E ratios: Yahoo's trailing figure, our "latest year" figure, our "three-year average" figure. All three are "right". Ask which one Graham asked for in ch. 14 (the three-year average, p. 349) and which in ch. 15 (the latest twelve months, p. 385), and show a company whose verdict changes with the choice (GM on the 16 Oct books: 14.8× on the average passes the defensive test; 25.6× on the charge year fails the enterprising cut). Then the scripted answer to the question that produced this exercise, below.

**1:25 — Homework + close (5 min).**
1. **Write your own explanation**, 120 words, of one company from its fact sheet alone, no AI, every sentence tagged with a fact id. Bring it printed.
2. Read TII **ch. 15, pp. 385–387** (the winnowing and Table 15-1) and ch. 7, p. 165 (Chrysler).
3. Journal: *the story I was told this week, and the number I found that checked it.*

Close with the sentence.

## Tutor notes

- **Pre-check the evening before:** open `/explain/` for each of the six chosen companies so the narratives are generated and cached (the first visit costs the AI call; later visits are served from the cache). Read each source line: it should say *written by Claude … every number traced to the sheet; no advice-shaped language*. If one shows a flag, keep it — a flagged page is better teaching material than a clean one. Print the six.
- **If the source line says "the plain version":** the reason is printed beside it — no key on the deployment, today's budget spent, the API call failed, or the AI's answer was rejected for advice language. The page is complete either way; the lesson runs on the plain version with no loss.
- **Cost:** well under a cent per company at Haiku prices, once per company per data-day. The whole universe for a term is pocket money. The daily cap (default 60 generations) is a guard, not a budget you will reach.
- **What the checks catch and don't:** invented numbers, unknown fact ids, advice-shaped phrases: caught by the machine. Wrong words, invented reasons, tone: caught by the room. Say that out loud; it is the point of the exercise and of the course.
- **Scripted answer — "Why not just use Yahoo Finance, or pay for a service, if we're not getting survivors?"** "A paid feed gives us the same accounts for the same companies and the same zero; the figures on the screen already reconcile to the companies' own filings. It would give us more companies, and we're getting those free. Yahoo is fine for reading, but it won't show you how its P/E was calculated, and Graham's tests are all in the how. Here, every mark on the screen can be traced to a line in the accounts. That's the point of building it."
- **Scripted answer — "Would this scale up for me if I paid for breadth?"** "Yes. The rules and the engine don't care whether it's 38 companies or 3,000. What we built around them — the rationing, the sweeps, the three alarms — exists because we chose to pay nothing. Pay for the data and a $5 plan, batch the nightly fetch, and it runs over the market. It will give you Graham's list. It will not tell you which one in five to read."
- **"So the AI picks stocks now?"** No. The AI is given a sheet of numbers the toolkit computed and is forbidden to add to it or to recommend; the toolkit checks the answer; the room checks the toolkit. Nobody leaves their brain at the door, including the machine's.
- **Exit check (syllabus):** every explanation is grounded — the grounding check runs on every narrative, AI or plain, and its result ships in the JSON (`/api/explain/:ticker` → `grounding`); no narrative is served if it contains advice-shaped language; cost and provenance are on the page (model, time, tokens, cached or fresh) and in `fetch_log` (`explain_ok`, `explain_rejected`, `explain_capped`, `explain_error`). `npm test` holds 149 cases at v0.8.2, 41 of them on the fact sheet, the narrative path and the advice check — the count grows as the weeks ship; `npm test` prints the current one.

---

*Education, not advice. Nothing in this lesson or its toolkit is a recommendation to buy or sell anything.*
