# The Idiot's Guide to How We Built It — Phase 3

**Weeks 7–9 of the toolkit, explained for everyone · Intro to the Stock Market**

Phase 2 ended with two of Benjamin Graham's checklists running every night over the books of 86 companies, finding nobody cheap enough, and a story about how that got built (`how-we-built-it-phase-2.md`). Graham gave the course rules for *what*. Phase 3 is the part where the toolkit gets rules for *when* and *how much*, from Robert Carver's Starter System: a trend rule that says long or flat, a size from how wildly a share moves, a stop that says *close* — the tracker stamps it, the student writes the ticket — and a paper ticket that refuses to be written unless the rules agree. By the end of it three test accounts are live, marked to market every night, with a report in sentences on each student's page.

Same rules as before. The tutor decided *what* and verified *everything*; Claude, the AI, produced *how* and explained *why*; nothing went live on trust. Every mistake stayed on the record: the AI's, the tutor's, and two this phase that nobody can account for. Nothing below is cleaned up to look clever.

*(Builders: the instructions are in `docs/setup-guide.md`; the evidence is in `docs/data-provider-checks.md`, `docs/reviews/` and `BUILD-LOG.md`; the open items in `docs/OPEN-ITEMS.md`; the decisions in `docs/syllabus.md`. This document explains; those instruct and prove.)*

---

## New words for the cast

| Thing | What it actually is |
|---|---|
| **A rule** | A sentence that decides for you, written down before the decision is needed, the same for everyone. Phase 3's first: *long when the 16-day average is above the 64-day, flat otherwise* |
| **Instrument risk** | How wildly a share moves in a year, as a percentage: Coca-Cola about 20%, a speculative technology share two or three times that. Everything in Phase 3 is sized by it |
| **A risk target** | How much the *account* should move in a year — 12% — the one number the course chose for its students, and what every position's size is worked back from |
| **A stop** | A price, below the highest close since you bought, at or below which the rule says *close*; the student's ticket does it, never the robot. It only ever moves up |
| **A paper ticket** | A decision written down — ticker, side, shares and *why*, in at least twenty characters — judged against the rules before it is accepted, and refused with a sentence you can check on a calculator |
| **Mark to market** | What the account is worth tonight: cash plus every open position at the latest close the toolkit holds. Not what you paid; not what you hope |
| **A drawdown** | How far the account sits below the highest value it has ever had. Normal, measured nightly, and the rules do nothing about it |
| **A fake notebook** | A stand-in for the database that lives in the test suite, so the robot's night can be rehearsed a hundred times in a second with the answers decided in advance. The tests went from 150 to 445 this phase; roughly eighty of the new ones run on it, the rest test the rules and the explainer directly |
| **A mutation** | Breaking a line of the code on purpose to see whether any test notices. A test that still passes was testing nothing |

---

## Prologue — not rigid about Carver (19–24 Oct)

The tutor owns a paperback of Carver's *Systematic Trading* and a copy of *Leveraged Trading*; there was no PDF to hand the AI. His brief for the phase is one sentence that shaped every decision in it: *"not rigid about Carver — open to a better method — but rigid that the method is systematic, science-based and disciplined."* Carver stayed, because the Starter System "seems written for my audience": one rule, one instrument, no leverage, every number explained.

Without the book's pages, the AI read Carver's own open-source code instead, the same day, and took every constant from it — the two averages' spans, the volatility window, the scale that turns a crossover into a forecast between −20 and +20. Each is written into decision #17 with the course's one adaptation (long only; no shorts, no borrowing) and one simplification (a volatility formula a spreadsheet can reproduce in one column). Page references to the two books belong to the tutor, from his copies; the record says so wherever one is wanted.

*Jargon you now own:* **a decision log entry that names its source**, so that "Carver says" can be checked against Carver.

---

## Week 7 — When: the rule, the review, and the spreadsheet (24 Oct – 2 Nov)

**What got built:** the rule itself, run by the robot every night at 23:00 after the prices are in — one row per company saying long or flat, since when, how strong, and the instrument risk — and a *signals page* with the two averages drawn over every chart and a coloured strip for every run of long and flat. A small cap with fewer than 128 closes shows "warming up" and a marker that says its prices are not split-adjusted, because a split reads to the rule as a crash. And the first fake notebook: the night's job could at last be tested on a machine that cannot reach the market.

**The second reader, before anyone saw it.** The shipment went to a fresh reader on a cold copy with Carver's code beside it: 55 probes, seven mutations, the robot run locally, the arithmetic recomputed in a spreadsheet cell by cell. Twenty-six findings, two of them *must*. The first was a design flaw of the AI's: the signal pass had no error handling, so one bad company — or one of the database's passing faults — would have thrown the whole night out and lost the accounts refresh with no receipt. Every company now fails on its own, with its own receipt, and the pass runs on its own alarm. The second was a promise in the lesson that the spreadsheet exercise would match the toolkit to the fourth decimal; the slow average cannot keep that promise on a one-year file, so the exercise got five years and the sentence got the measured truth. The tutor's instruction, as it would be three times this phase: *implement all, then build.*

**What went wrong on the tutor's screen.** The audit reported one *high* vulnerability — in a library inside the development server, never in the deployed robot — and the tutor chose an override to lift it rather than wait; nine days later the tooling caught up and the override came out. A command the AI had written with its expected result *beside it* was pasted into the shell, arrow and all; the rule since (it is in the build diary) is that a command sits alone in its box and the expectation is written underneath. And `localhost` "did not serve": Windows resolved the name to the newer kind of address and the server was listening on the older; `127.0.0.1` it is, in every guide.

**The first receipt, and the first slip of the ration.** 24 October, 23:00: 86 instruments, 46 rows written, 18 long, 20 flat, 8 small caps warming, the rest not yet visited — 8.3 seconds, almost all of it round trips to the notebook. The daily small-cap visit, meanwhile, learned its own lesson twice: the supplier's "25 a day" is a rolling twenty-four hours, and a visit started an hour early (27 October, then 1 November) found the previous day's calls still counting and was cut short. The fix was to stop asking the tutor to watch the clock: the script now reads its own receipts and plans inside what is left.

**VC-19 — the tutor checks the robot's arithmetic by hand.** Three companies, three spreadsheets built from the toolkit's own price files with fourteen formulas, against the robot's rows for the same dates: fast and slow averages to **six decimals**, volatility to six, forecast and risk to two, state the same — Apple, Coca-Cola, Microsoft, all three. The largest difference was five ten-millionths, from rounding the printed figure. *Findings in the arithmetic: none.* It took four days of evenings and it is the kind of check that cannot be delegated to the thing being checked.

**The split.** On 31 October the visit's diary flagged Mueller Industries: its adjusted price had moved ×0.467 in a day. Not a crash: a two-for-one share split on 1 July, which the AI confirmed from the company's announcement, the exchange's notice and the filing. To the rule a halving looks like a collapse, and to the volatility estimate like a 50% day — a position sized on that number would be a quarter of the right size. Week 8 built the splits table; the row for Mueller is its first; and the rule, decided then, is that a human reads the filing and adds the row, because the one thing the toolkit must not do is guess.

*Jargon you now own:* **a rule**, **instrument risk**, **a rolling ration** applied to oneself, **a split** (the price halves, the shares double, and nothing happened).

---

## Week 8 — How much: sizing, the stop, and the first ticket (2–5 Nov)

**What got built:** the calculator — account × 12% ÷ instrument risk, in whole shares, never more than the account — with every line of the arithmetic printed so a student can check it; the stop at half a year of the share's volatility below its highest close since entry; and the paper ticket. A ticket is refused, in a sentence, when the rule is flat, when you already hold the name, when the size is more than the rule would hold ("a $10,000.00 account supports $6,302.52 of AAPL — 18 shares at $338.32"), when the account cannot afford it, and when the journal is empty: *the journal entry is the ticket.* Students are codes until the course gets logins; a ticket and its position are written in one stroke so they cannot disagree.

**A build nobody ordered.** On 2 November the AI found week 8 already on its disk — a complete build, its files dated that afternoon, from a pass of work that this conversation had not done. It said so plainly, verified every file of it before sending it for review, and the record carries the sentence. It will matter below.

**The second reader, again.** Twenty-nine findings; four *must*, and all four sat on the path the exit check would walk. The "minimum account" the calculator named was a figure the calculator then refused, because the floor had been worked out in dollars and shares come whole: Apple's minimum was $1,586, not $1,212, and the reviewer showed the formula wrong at 115 of 216 points on a grid. The "oversized" sentence could never be reached by a student who already held the position. The sentence printed 18.2% where the arithmetic used 18.18%. And the new ration reader would throw on any receipt from the previous week, because — found on the way — every receipt had been cut at 300 characters, which turns a JSON line into a broken one. *Implement everything.* The grid became a test: the named minimum clears, one dollar less does not, on 160 pairs of price and risk.

**VC-20 — the first live ticket, and the exit check that got its name.** 3 November: the tutor enrolled a test student and wrote the ticket the rule allowed — 18 Apple shares at $338.32, stop $306.11, cash $3,893.02 — then asked for 36 and was refused with both sentences, held and oversized, arithmetic checked on a calculator. Wells Fargo, flat that night: *the rule opens, you don't.* A blank journal: refused by the rule, not by the browser. Two nights later the position was closed at $349.51 for a profit of **$166.47** — (349.51 − 338.32) × 18, less two tickets' costs — worked by hand and matched to the cent, and the robot's first stops receipt read `positions 1, tracked 1, hits 0`. The ticket and its position pointed at each other in the live notebook, which is the thing the one-stroke write exists to guarantee.

**The screenshot.** The student page printed "Code XXXX-XXXX" in its first line, and the tutor's screenshot of the live page, sent to show a win, carried the code — the page's only key. The code came off the page in week 9; the page's address is the key, and lesson 9 says *share a screenshot, never the link* — and crop the address bar.

*Jargon you now own:* **a risk target**, **a stop**, **a paper ticket**, **an exit check** (the test the week must pass before the next one is built), **a grid test**.

---

## Week 9 — Running it: the account marked to market, and drawdowns are normal (5–10 Nov)

**What got built:** every account marked to market every night — cash, open positions at the latest close, profit open and realised, the high-water mark and the distance below it, the risk the positions carry against the 12% budget, the nearest stop — written as four sentences on the student's page and as a row in the notebook. Three new refusals: the size is now worked on the account's *current* value; an account runs N instruments (one unless the tutor sets more) and refuses the N+1th; and a ticket that would push tonight's risk past the budget is refused with the numbers. Small caps can be ticketed once they have 128 closes, and a small cap whose price jumped with no split on record is *quarantined* — a Q on the signals page, no opening ticket until a human adds the row.

**The second reader finds the thing the builder's own test could not.** Twenty-five findings; one *must*, and it sat on the quarantine itself. The visit writes a receipt naming every jump it saw; the quarantine read that receipt with a pattern that expected a symbol before *each* figure, and the receipt carried it once. A company whose first jump was a known split and whose second was not showed no Q — and on the reviewer's local copy the calculator sized it and an opening ticket went through. The fix is one character and a test that writes the receipt with the same function that reads it, so the two can no longer drift. Among the rest: the nightly row was dated by the close a lagging position happened to be valued at, so a small cap between visits would have overwritten yesterday's row instead of writing tonight's; the drawdown sentence the lesson called "deliberately conservative" was, by the reviewer's own simulation, the *typical* case (a run of years at a 12% target usually sees 20–30% from a peak; one run in twenty, 40% or more) and the sentence now says so; and a slide's worked example used the sandbox's made-up Apple where the record's real one was to hand. *Implement everything* — 433 tests became 445.

**The second build nobody ordered.** Between the review report reaching the tutor (14:50) and his decision (15:33), fifteen files of the AI's working copy were edited by something that was not this conversation — review-driven edits, one carrying the comment "review F4 of v0.11.0". Same pattern as 2 November. The AI set the files aside unchanged, restored the exact copy the reviewer had seen, and implemented every finding again from there, so that everything in the shipment is work it can account for. The cause is unknown; the likeliest is a second instance of the same session. It is in the register as OI-66, because a third occurrence should be recognised for what it is.

**The apply, on a Monday.** The tutor pasted the previous week's patch over his folder by mistake, then the right one, and asked for a complete check before installing. The check was three commands, and the diary has the figures: `git status` had to show exactly the 33 files the shipment touches, and did; the diff had to count 23 files changed, to the line, and did; the ten new files had to be the sizes the shipment gave them, and were. Then the tests: **444 of 445.** The one failure was real and the AI's: a test gave the visit a company "fetched an hour ago" on 5 November and expected it skipped as fresh; on 9 November it was four days stale, because the planning step read the clock while everything else read the run's own timestamp. One line fixed the job; the suite is now the same on any date. The reviewer's last note — *the Windows path is the apply's `npm test`* — had earned its keep within the hour.

**VC-21 — the gate, executed by the machine in the tutor's own browser.** "I'm having some difficulty following the logic — can you execute the test for me?" The AI could: the tutor's computer was linked to the session, so it drove the browser pane on his desk, wrote the tickets through the pages' own forms, read every refusal back from the page and checked every figure by hand while he watched. Test One, one instrument: the rule's size accepted (the tutor had already written it himself: 17 AbbVie at $291.31), a second name refused — *your account runs 1 instrument and 1 position is open*. Test Two, two instruments: the calculator's 6% size, 31 Coca-Cola; 62 asked and refused with the account's current value in the sentence; 31 accepted, then 6 Apple at 6% of what the account was worth *after* the first, then Microsoft refused — *2 instruments and 2 positions are open*; a warming small cap refused with its close count, 100 of 128. The next morning the night's receipt read `risk: students 3, written 3, errors 0`, the rows were dated by the night, and the report's value, drawdown and risk used matched the hand arithmetic — $10,019.45, 0.0%, 11.77% for One; $10,044.53, 0.0%, 11.6% for Two. Phase 3's gate: *every test student can open a rule-compliant paper position; the risk layer blocks an oversized or concentrated ticket; the nightly risk report renders per student.* **Met**, on live evidence, with the sheet of figures filled in by the thing that did it and read by the human whose course it is.

**The evening question.** *If Graham says what to buy and Carver says how, what is the intersection — and what would it hold tonight?* The honest answer came from the live site: **nothing.** No company passes either Graham screen; every one of the rule's longs that night (19 of them, on the 6 November close — the count is in the register) fails both price tests, because 15 times earnings and 1½ times book are 1970s bars against a 2026 market. Relaxed on purpose and labelled, "the Carver longs that pass the most Graham tests" sized on $10,000 taught a second thing: four names fail the course's own 1% cost rule on two of them; three work; the rest is cash by design. An empty gate is a result. It went into Week 10's scope the same evening (OI-68).

*Jargon you now own:* **mark to market**, **a high-water mark**, **a drawdown**, **a budget**, **a quarantine**, **a wall-clock test** (one that passes today and fails on Thursday).

---

## The scoreboard, nine weeks in

- **Three rules** that decide without being asked — when, how much, when out — all of Carver's numbers, the course's four decisions (#17–#20) written beside them with the alternatives
- **Three live paper accounts** with three open positions, marked to market every night, each page carrying its report in sentences and its own history
- **445 tests** (150 at the end of Phase 2), a fake notebook the night can be rehearsed on, and a habit of breaking the code on purpose to see what notices
- **Three independent reviews this phase** — 26, 29 and 25 findings, seven of them *must* — every one resolved on the record before anything shipped, the tutor's decision each time: *implement all*
- **Three verification checks closed on live evidence**: VC-19 (the arithmetic to six decimals, by hand), VC-20 (the first ticket, the first refusal, the first close — $166.47), VC-21 (the Phase 3 gate, executed in the tutor's browser)
- **Survivors found: still 0.** The intersection of Graham and Carver on 6 November: empty. The course would rather report it than fudge it
- On the record this phase: two design flaws of the AI's found by reviewers (the unfenced night; the quarantine that read one jump), two more found by the market and the calendar (the receipt cut at 300 characters; the test that read the clock), two slips of the tutor's (the ration started early; the wrong patch pasted), one leak of a code in a screenshot, and two passes of work nobody can account for

## What the collaboration looked like this time

Phase 2's rhythm held and tightened. Four things were added.

**"Keep me on track so I don't miss a step scrolling back."** Every reply during an apply now ends with the whole checklist and one line — *You are at: step N* — and every command sits alone in a box with its expected result written underneath, after the arrow that got pasted into the shell. Small, and it is the difference between a tutor who can apply a release in an evening and one who cannot.

**The review has a shape now.** A fresh reader on a cold copy, the author's conversation out of bounds; probes written before findings are recorded; the code broken on purpose; the robot run locally against a synthetic month; findings reported *before* a line changes; the tutor's decision; then the resolution, row by row, in the repository. Three times this phase the reviewer found what the builder's own 400 tests could not, and twice the *must* was a line the builder had just written and tested.

**The machine executed a check, and the human read the figures.** VC-21 was done by the AI in the tutor's browser because the tutor asked, and the record keeps every sentence it read back and every subtraction it did. That is not the AI marking its own homework: the arithmetic is on the page for anyone, the sheet of results is the tutor's, and the gate is the syllabus's words, not the builder's. It is, though, the first time the thing being verified drove the verification, and the course should keep noticing when that happens.

**Two things happened that nobody ordered, and the record says so.** A build appeared on disk in Phase 3's second week and edits appeared in its third, both outside the conversation of record, both review-shaped, both set aside rather than used. The AI cannot explain them and did not pretend to. A validated system is one whose record names what it does not understand; the alternative is a record that is tidy and wrong.

*Next: Phase 4 — the tutor bot (week 10), the real-world costs and tax (week 11), and the logins (week 12). Graham has given the course rules for what, Carver for when and how much; what is left is to let the students ask questions of the notes, and to find out what the room makes of a drawdown.*

---

*Everything above is checkable: the code, the tests, the diary, the decision log, the review records and the evidence files are in the repository linked from the site's footer. Education, not advice — nothing in this course or its toolkit is a recommendation to buy or sell anything.*
