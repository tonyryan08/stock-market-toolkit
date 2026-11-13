# The Idiot's Guide to How We Built It — Phase 4

**Weeks 10–12 of the toolkit, explained for everyone · Intro to the Stock Market**

Phase 3 ended with three paper accounts marked to market every night and a story about how that got built (`how-we-built-it-phase-3.md`). The toolkit could say *what* (Graham), *when* and *how much* (Carver), and it could grade a ticket against the rules before accepting it. Phase 4 is the takeaway: the part where the course becomes something a student can keep after the room empties. A tutor that answers from the course's own notes and cites them. A review of a student's own book that looks at the decisions and not the results. A worksheet of what the real world charges and what the state keeps. And at the end, the real logins, the kit in one place, and a README written for a stranger — the course tagged v1.0.

Same rules as before. The tutor decided *what* and verified *everything*; Claude, the AI, produced *how* and explained *why*; nothing went live on trust. Every mistake stayed on the record, and the course keeps three of them on purpose as exhibits for the last lesson — one from Phase 3, two from this phase.

*(Builders: the instructions are in `docs/setup-guide.md`; the evidence is in `docs/data-provider-checks.md`, `docs/reviews/` and `BUILD-LOG.md`; the open items in `docs/OPEN-ITEMS.md`; the decisions in `docs/syllabus.md`. This document explains; those instruct and prove.)*

---

## New words for the cast

| Thing | What it actually is |
|---|---|
| **A passage** | A paragraph or two of the course's own notes — a lesson plan's running-order step, a kit page's section — cut out, numbered (`L8.9`, `K-RULES.6`), and written into the database. The tutor reads 214 of them from 21 files and nothing else |
| **Full-text search** | The database's own way of finding passages by the words in them, stems and all. It matches words, not meanings, which is why the course teaches "ask in the course's words" |
| **Grounding** | Week 6's discipline, now everywhere: the model may say only what is on a numbered sheet; every paragraph names what it rests on; a check flags a number, a name or a tip that is not there — and in Phase 4 a failed check *withholds* the answer rather than showing it with a flag |
| **The audit** | The review's first half: the rules applied to a student's rows by plain code — a stop hit and the position still open, a close with the stop not hit — with no AI anywhere near it |
| **The sheet** | What the review's AI is shown: the tickets, the dates, the rule's state, whether the stop was hit, the student's own journal words — and *none* of the toolkit's profit, loss, value or drawdown figures. It cannot praise what it cannot see |
| **A Bill** | A tax rate announced and drafted but not yet law. The worksheet marks every such figure, and a test proves the marks follow the rules table when the Act arrives |
| **Access** | Cloudflare's door: an email, a one-time code, a list of who may enter. From week 12 the whole site is behind it, and the Worker is simply told who came through |
| **The audit copy** | A withheld answer kept on its database row where nobody is shown it, so the tutor can read afterwards *what* was withheld and not only *that* it was |

---

## Week 10 — Ask the tutor (10–11 Nov)

The brief was one sentence from the syllabus: a tutor "the class can question after the course ends," built the way week 6 built the explainer. The AI's design kept the same three parts — a numbered source, an answer bound to it, a check — and changed the source from one company's accounts to the course's own notes. The retrieval question was the only real one: a vector index (the fashionable answer) or the database's own full-text search. The tutor had decided that in week 1 (decision #3: SQLite in D1, nothing exotic until it is needed), and a spike on the afternoon of the build proved the search index worked on Cloudflare's local database. The upgrade path is written down and not taken.

The reviewer's *must* that week was the kind the course exists to catch: the page withheld a tip correctly, but the API handed the same withheld answer back in full to anyone who asked in JSON. The builder's 494 tests had tested the page. Eight *shoulds* followed — a number check that read the paragraphs but not the decline's reason, a daily cap that ten parallel questions could walk through (the same shape as a cap fixed in Phase 2: the count must come *after* the insert, not before). All applied on the tutor's word, "implement all"; then the gold set — ten questions the tutor must answer and two it must not — run on the live site as VC-22, through the tutor's own browser, every citation opened.

*Jargon you now own:* **a gold set** — the questions you write before building, so that "it works" means something.

---

## Week 11 — The real world (11–13 Nov)

Two features and one idea. The idea: the student's own book, read against the student's own rules, by something that cannot see the result. The audit is plain code and always there; the reading is the AI's, from a sheet with no P&L on it, and a new check withholds any reading that praises or blames an outcome — "well done", "profit", "it went up", "lucky" — because a tutor that says "well done" to a lucky trade has taught the wrong lesson. The worksheet is the other half of the real world: the same paper trade priced in euro through a real broker's fee schedule, beside the course's own cost model (they agree, give or take the currency conversion), and the gain taxed three ways — shares, a fund, the new investment account the Finance Bill would open — every rate with its date and its basis, the Bill marked as a Bill.

The review found three *musts*. A reading with a wrong number had been shown flagged where the record said withheld. The tutor's seed had been generated before the last two file edits — shipped stale — and now a test regenerates it from the files and fails the suite if the two differ; it fired for real the very next week. And the worksheet's "Bill" marks were literal text that would not have followed the Act: now they are derived from the rules table, and a test flips the basis and watches the page change.

Then the week did something the earlier ones had not: it kept finding things *after* the live check. The first live reading repeated its last paragraph as its "next week" line (the prompt had listed the sentence as a third paragraph beside a separate field — the model obliged twice). Fixed, prompt r3. The next reading read the sheet's deliberate omission of the stop level as the student's failure to write it down — honest, but wrong about whose omission it was. Fixed, prompt r4, and the sheet now says what it leaves out by design. The reading after that was withheld for "outcome language: *is well*" — the entry *is well* short of the template — a copula and an adverb caught by a pattern meant for "it went well". The pattern was narrowed, six innocent sentences pinned, and a gap closed on the way: a withheld reading had not been kept anywhere, so nobody could read what had tripped the check. Now it is kept on its row, shown to no one. Five small shipments in two days, each one deployed and read on the live site before the next; the record calls them fix1 to fix5 and keeps every receipt.

*Jargon you now own:* **a false positive** — the check firing on an innocent — and why a check that fires needs a copy of what it fired on.

---

## Week 12 — Demo day, the door, the kit (13 Nov)

The last feature was the one the syllabus had promised in week 1 and parked: real logins. The plan in the syllabus said "Cloudflare Access" and the builder's own knowledge said that meant a policy on a domain name — which the course does not have; the site lives on a `workers.dev` address. The docs, read on the day, said something newer: since August 2026 a single switch on the Worker's own Access tab protects every route the Worker has, the runtime hands the Worker the signed-in email, and the local development server can pretend to be the door with four lines in a config file. So the toolkit validates no token at all. It is told who came through and decides which room they may enter: a student's page opens for the email on their row or for the tutor; `/me` finds the page by the email; and with the door off, the week-8 code scheme stands unchanged — one build, two states, the gate a deployment choice.

Two things the docs corrected before anyone could be misled. A new Zero Trust organisation's default login is now Cloudflare's own identity provider, not the email code — the tutor adds the code as a login method, one screen, and the guide says which. And an address that is not on the list is told "a code has been emailed to you" and sent nothing: the course's phase-4 exit check — *the policy admits only enrolled emails* — looks like silence, and the lesson now says so to the room before the room meets it.

The rest of the week was the handover. A rubric for demo day — five questions a presenter answers about one decision (what the rule said, how many and why, where the stop was, what was written down, whether it was done) and a sixth, *did it go up?*, that is not asked. The same five turned on the course itself, with the register's open items read aloud as the honest answer to the fifth. The kit in one place, `/kit`, seven documents with their links. A README with a "How this was built" section compiled from the build log: the method's eight steps, the twelve weeks in a table. A cost review that reads every provider's allowance page on the day and finds the toolkit runs on free plans for everything but the AI, which is a pre-paid balance the caps bound. And the tests on every push — but the deploy still by hand, because that was decision #6 and nobody has asked for the robot.

The review of the week found the kind of thing reviews are for. The ticket API checked who was at the door only when the code in the request was a plain string, and the parser two lines later would happily turn a one‑item list into a string. Signed in as one student, the reviewer sent another student's code wrapped in square brackets and closed the other student's position on the local Worker — 201, their cash and P&L returned — with every one of 594 tests green. Nobody had tested a code that was not a string, because nobody had thought of one. The fix was to make the parser refuse anything but a string and to normalise the code once, in one place, so the gate and the parser can never again read two different things; the pin is four shapes times four identities. Twenty‑two smaller findings went in with it, and the suite reached 597.

**The day it went live.** The switch was the tutor's, and it did not go quite as the guide named it: Cloudflare's dashboard had moved a label or two since the docs were read that morning (the register's watch on that, OI‑101, earned its keep the same afternoon), and the one‑time‑code login had to be added by hand because a new organisation's default is now Cloudflare's own sign‑in. The builder offered to drive the two remaining screens from the browser pane inside the Claude app; Cloudflare's bot check refused the automated pane at the dashboard, and again, later, at the Access sign‑in page of the course itself. Both refusals were left alone — a course that teaches "find the register, check it yourself" does not teach its builder to work around a bot check — and the tutor drove the gate in his own browser while the builder read each report. Seven looks: the door for a signed‑out visitor; the tutor's address through the code to a landing that named him; `/me` with its two doors (both test accounts are his, for now); the code pages; a reading on the live door, counted; the kit and the tutor at 214 passages; sign‑out; and the gate itself — an address not on the policy told "a code has been emailed to you", and nothing arriving. The phase's exit check, met at 18:18, in silence, exactly as the lesson now warns the room it will be. The commit was pushed at 18:28, verified byte for byte against the sandbox, and the tag `v1.0.0` at 18:31. What the day could not show — a real student refused from another's page — waits for a real student; the record says so rather than pretending.

*Jargon you now own:* **a handover** — the point at which the record has to work without the people who wrote it.

---

## The scoreboard, twelve weeks in

- **Twelve features and twelve lessons**, each with its deck, each shipped on the record; the toolkit at **v1.0.0**
- **597 tests** (445 at the end of Phase 3), a seed that cannot ship stale, a door tested four ways in the suite and four ways on a local Worker — and a ticket API that reads its code once
- **Three independent reviews this phase** — 36 and 40 findings for weeks 10 and 11, every one decided on the record before shipping (decided, not all closed: two stand as watches in the register), and 23 for v1.0.0, one of them a must that closed a door the suite had not thought to try; and after the live checks, half a dozen more findings from the live site itself, fixed in five small shipments
- **Three verification checks closed on live evidence this phase** (VC-22; VC-23 with its five fixes; VC-24, the phase gate, met by the tutor's own hand at 18:18 on 13 Nov) — 23 numbered checks in all, every one closed or open and saying so
- **A corpus of 214 passages** the tutor reads and cites; a review that has never praised a result; a worksheet whose Bill marks will follow the Act in December
- **Three exhibits kept on purpose** for the last lesson: a code printed on a page (week 8), a seed shipped stale (week 11), a false positive on the first live rejection (week 11) — and a register with its open items, read aloud
- **The repository tagged `v1.0.0`** on 13 Nov 2026, the course complete and live behind the door; the toolkit not finished, by design — the register's open items are its next entries

## What the collaboration looked like this time

Phase 3's rhythm held. Three things changed.

**Decisions before building, when they change the build.** Week 12's three — the scope of the door, the rule for the old code pages, what the robot may do at v1.0 — were put to the tutor as a question with a recommended answer before a line was written, because a wrong guess there is a week redone. He answered the first and left the other two to the recommendation, and the record says which was which.

**The docs, read on the day, over what the builder remembers.** Twice this phase the AI's own knowledge was out of date — the Access release of August, the login default of June — and twice the record shows the correction with the page it came from and the date it was read. The course's rule for students ("find the register, find the number, check it yourself") turned out to be the rule for its builder.

**The live site as the last reviewer.** Week 11's fixes came from readings on the live accounts, not from the suite or the reviewer — and each one went back through the same gate: a finding reported, the tutor's decision, a test pinned, a deploy, a reading read.

**And the things the builder would not do.** Twice on the last day the shortest path was closed on purpose: a bot check refused the automated browser, and the builder said so instead of looking for a way round; a card had to be entered for a free plan, and that screen was the tutor's alone. A toolkit that reads "find the register, find the number, check it yourself" to a room of beginners has to be built by the same rule, or the room would be right not to trust it. The toolkit is finished the way the course says a decision is: not by the result, but by whether the process was followed. It was.
