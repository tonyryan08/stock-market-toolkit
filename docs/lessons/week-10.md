# Lesson 10 — Ask the Tutor (and how to interrogate an AI well)

**90 minutes · Phase 4, week 1 of 3 · Toolkit feature: the tutor bot on the course notes (`/tutor`, `POST /api/tutor` — retrieval over the lesson plans and the kit, an answer that cites the passage on every paragraph, checked like week 6's story) and the Graham ∩ Carver watchlist (`/watchlist`, the "Graham" column on `/signals`).**

*Methodology: week 6's grounding discipline (a numbered source, an answer that may say only what is on it, a check that flags what is not) applied to the course's own notes; retrieval by full-text search (SQLite FTS5 in D1 — decision #3, spike-tested at this release) with a plain word match as the fallback. The gate reads Graham's screens (weeks 4–5) and Carver's rule (weeks 7–8) side by side and adds no rule of its own (syllabus, week 10; OI-68).*

Phase 3 ended with every student running a paper account by the rules. Phase 4 is the takeaway: tonight a tutor the class can question after the course ends, next week the real world's costs, in week 12 the logins and the kit. The tutor is a consolidation device and a scam-literacy lesson in one: it answers only from the notes, it cites what it read, and it is *checked* — and the class's job tonight is to catch it being wrong, because an AI that sounds sure and is wrong is the most expensive thing in finance after a tip.

## By the end, students can

1. Ask the tutor a question in the course's own words, read the answer, and **check every citation** back to the passage: find the sentence, find the number.
2. Name the three ways an answer can be wrong and how the page shows each: a passage it was not given (flagged), a number that is in no passage (flagged), a tip (withheld — the passages are shown instead).
3. Say what the tutor cannot know — tonight's prices, your account, tax, anything after the notes were written — and why a confident answer about those is wrong by construction.
4. Read the Graham ∩ Carver gate on `/watchlist` and say why it was empty on the night it was first read (6 Nov 2026), and why the account's size decides how many names it can run (the $10,000 example).

## Materials

- `/tutor` pre-checked the evening before (tutor notes): the notes seeded, a gold-set question answered with citations, the `tutor_ok` receipt in the log.
- The homework question each student wrote down last week ("one question you would want to ask a tutor bot about the course").
- `/watchlist` open on the projector; the signals page beside it.
- The gold set (`docs/lessons/week-10-gold-set.md`) printed, one per pair.

## Running order

**0:00 — Harvest: the question you brought (10 min).**
Round the room, each student reads their question aloud. Sort them on the board into three columns as they come: *the course can answer this* ("how is the stop calculated?"), *the course cannot* ("what will Apple do next year?", "should I buy Coca-Cola?"), *not sure*. Say nothing about the sorting yet — the hour decides it.

**0:10 — What the tutor is, and is not (15 min).**
On the projector, `/tutor`. Five sentences, each one a fact about the page:
- **It has read the course's notes and nothing else** — the lesson plans (this one included; week 11's joined the notes when it shipped), the two week-5 segments and the kit documents — the student's sections, not the tutor's notes — cut into about 160 passages (the page says how many and when they were indexed). Not the internet, not the news, not your account, not tonight's prices.
- **It finds passages by words, not by meaning.** The question "how is the stop calculated?" becomes the words *stop, calculated* and the index returns the passages that use them most (stemmed: "calculated" finds "calculation"). Ask in the course's words and it finds the course's passages; ask in other words and it finds the wrong ones — and the model must then say the passages do not answer the question (it finds *nothing* only when no word of the question is in the notes).
- **It answers from those passages only, and cites them on every paragraph** — the `[L8.9]` tags: lesson 8, passage 9. Click one; the passage is on the page below the answer.
- **It is checked.** A label it invented (a passage it was not given) is flagged; a number that appears in no passage it read is flagged; advice-shaped language — buy, sell, should, undervalued, a target — is caught by the same families week 6 uses, and the answer is **withheld**: the passages are shown, the answer is not.
- **It is anonymous and rationed.** No code is asked for; the question and the outcome are stored and the page lists the class's recent questions for every visitor — so a name or a code typed into the box is published; ask about the course, not about yourself. Sixty questions a day on the course's key, then the passages only until the budget resets.

The thing to say out loud: the citations are not decoration. They are the whole point. An answer with a citation you can check is a claim; an answer without one is a rumour.

**0:25 — Ask it, live (15 min).**
Three questions from the gold set first, projected, each checked by a pair: *find the sentence, find the number*. Then the board's first column, three of the room's own questions. Then — deliberately — one from the second column: **"Should I buy Coca-Cola?"** Watch what the page does: either the model declines (the notes say how the course decides, not what to buy) or it answers in process terms ("the rule decides; the ticket is yours") — and if it slips into a tip, the page withholds the answer and prints why. Either is the lesson: *the course does not say what to buy, and neither does its tutor.* Then one the notes cannot answer ("what will Apple's shares do next year?") — the passages about Apple are retrieved (lesson 8's worked example), and the model should say the notes carry no forecast (the rule reads the price; it does not predict it); if it slipped into one, the page would withhold it. And one made of letters that are no word at all (the record's VC-22 used one — it is not printed here, or the notes would contain it): no passage, no call, the honest "no passage matched" — the two different ways of having nothing to say. *(Until week 11 shipped, the example here was the capital-gains-tax question; the notes now carry the kit's walkthrough, so the tutor answers it — with the Bill's caveat.)*

Pairs, five minutes: one question each, one citation each, checked. Hands up for anyone whose answer had a flag.

**0:40 — How to interrogate an AI well (15 min).**
The lesson inside the lesson, on the board as five habits — the ones the class will keep when the AI is not this one:
1. **Use the source's words.** Retrieval matches words. "Instrument risk", "the stop gap", "the 12% target", "the defensive screen", "the drawdown" — the course's nouns find the course's passages. (A general chatbot has the same weakness dressed better.)
2. **One thing at a time.** "What is the stop gap, and when does the stop move?" beats "explain stops and sizing and everything". A long question retrieves the wrong passages and the answer blends them.
3. **Ask for the passage, then read it.** Here the page does it for you; elsewhere, ask "where does that come from?" and refuse an answer that cannot say. A source you cannot open is not a source.
4. **Check the number, not the sentence.** The sentence will be fluent either way. The number is where a wrong answer shows: $31.72 is either in the passage or it is not.
5. **Distrust fluency.** The better the prose, the more it is worth checking — a confident wrong answer is the product that sells scams (week 6, and week 11's second scam-literacy pass). The tutor's flags are a training wheel; the habit is the point.

And what the tutor cannot know, said plainly: tonight's prices and signals (ask `/signals`), your account (your page), tax and costs (week 11), anything that happened after the notes were written, and anything about *you* — it has no idea what you own, how much you have or what you should do. A confident answer on any of these is wrong by construction, however well put.

Scripted answer — "Why won't it just tell me what to buy?": "Because the course doesn't, and it only knows the course. If it ever does, the page will withhold the answer and show you the sentence that tripped the check — that's the lesson working, not failing."

**0:55 — The gate: Graham ∩ Carver (15 min).**
Change the page to `/watchlist`. The idea first, in one line on the board: **Graham says *what*; Carver says *when* and *how much*. Read in that order, as a gate.** A name must pass a Graham screen (the defensive seven, or the enterprising six) *and* be long on the rule before the course would ticket it; then the Starter System sizes it and the stop closes it. No new rule — the two the class already has, side by side; the signals page now shows each company's Graham tests passed beside its state.

Then the first night it was read, 6 November 2026: **the gate was empty.** No company passed either screen (eight defensive near misses, two enterprising); every name the rule was long on — nineteen that night — failed both of Graham's price tests, P/E ≤ 15 and P/B ≤ 1.5. Two things to say about that:
- **An empty gate is a result.** The rule's answer was cash, and a journal line that says "waiting". Graham's price bars were set in the 1970s; against a 2026 US large-cap market they say "nothing is cheap", which is a statement about the market and the bars, not a fault in the toolkit — and not a reason to loosen the bars tonight (that is a second rule; week 7's point stands).
- **The account's size decides N.** A relaxed, *labelled* example — the Carver longs that passed the most defensive tests, sized on $10,000 — showed it: four names failed the 1% round-trip cost rule on two of them; three worked (DAL 10 shares, JNJ 5, KO 20 — 11.7% of the 12% budget used, 58% of the account in cash by design). Four instruments on $10,000 is not a bigger portfolio, it is two positions too small to trade. The example is on the board as arithmetic, not as a list: say so.

Read the page's sentences aloud — they are statements about tonight: the gate, the near misses that are long (one Graham test short, with the failed test named), the rule's longs that fail both screens (sorted by tests passed), and the small caps on their way to 128 closes. "A near miss is a reading list, not a pick" is printed on the page for the same reason the week-5 page says "a screen is a starting list".

**1:10 — The weekly routine, with the tutor in it (5 min).**
Monday evening, five minutes, as before: `/signals` for your instrument → your page: the stop, the stamp, the report → the journal → (maybe) a ticket. Two additions: glance at `/watchlist` and write the gate's state in one word ("empty", or the name); and if you have a question, ask the tutor *before* class and bring the citation you checked.

**1:15 — Homework + close (10 min).**
1. **Three questions to the tutor** in the course's words, each with one citation checked — write the passage id and whether the sentence and the number were there. If an answer carried a flag, bring it: it is the best homework in the room.
2. **One question the notes cannot answer**, asked anyway, and what the page did.
3. **The Monday routine with the watchlist line** in the journal.
4. Read the week-11 preview on the ledger: next week is the real world — a broker's mechanics, Irish costs and tax, and the second scam-literacy pass. Bring your DeGiro questions (no accounts opened: paper only, still).

Close with the sentence.

## Tutor notes

- **Pre-check the evening before:** `npm run seed-notes` was run after the last lesson edit and the seed applied (`npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-notes.sql` — the page's lede says how many passages and the date); `/tutor` answers a gold-set question with citations and `tutor_ok` in the receipts (`SELECT run_at, outcome, detail FROM fetch_log WHERE outcome LIKE 'tutor_%' ORDER BY id DESC LIMIT 10`); `/watchlist` renders with tonight's date. If the retrieval line on the page says "word match (no index)", the FTS5 index is not on the live database — the plain seed was applied, or the virtual table failed (the shipment notes say what to do); the tutor works either way, a little less sharply.
- **The budget:** `TUTOR_DAILY_CAP` (default 60) is questions answered per 24 hours on the course's Claude key; a class of twenty asking three each is inside it. A question costs about three thousand input tokens (the prompt and six passages — 2,200–3,400 measured at VC-22) and one to four hundred output on Haiku — pennies; the cap is there for a loop, not a class. `"0"` switches the generation off and the page shows the passages only — useful the week after the course ends.
- **Re-seed after editing a lesson.** Passage ids are positional within a file (`L8.9` is the ninth passage of lesson 8): an edit can move them, and a citation in an old answer then points at a neighbour. The `questions` table keeps the ids each answer cited; the page shows the passage text, so a student checking an old answer sees the text that was cited, not a guess.
- **Scripted answer — "It cited a passage that doesn't say that":** "Good. That is a flag or a mis-citation, and you found it. Write the question and the passage id on the board; the record gets it after class." (The reviewer's and the class's catches go in `docs/OPEN-ITEMS.md`; the prompt or the chunking changes if a pattern appears.)
- **Scripted answer — "Can I ask it about my account?":** "No — it cannot see it, and it would be wrong if it tried. Your page is your account; the tutor is the notes."
- **Scripted answer — "Why not just use ChatGPT?":** "Use whatever you like after the course — with the five habits. The difference tonight is that this one shows you its sources and refuses when it has none; a general assistant will answer anything, in the same confident voice, and you will have to do the checking yourself. The habit is what you take home."
- **Scripted answer — "The gate is empty; so the course says don't invest?":** "The course says nothing about whether to invest. It says what two rules read together say tonight: no name passes a 1970s price bar in a 2026 market. What you do with that is a decision — write it down, with the reason."
- **What the engine does not do, said out loud:** no answer from outside the notes; no memory of the previous question (each is on its own); no knowledge of prices, accounts or students; no rule in the watchlist — it reads the two that exist; no loosening of Graham's bars (a relaxed list is labelled as such on the page and in this lesson, and is not a feature).
- **The exit check (VC-22 — planned):** the ten gold-set questions asked on the live site; each answer's citations checked by hand against the passages shown (the retrieval half is pinned in `src/lib/tutor.test.ts` against the real corpus); the off-corpus and the advice-seeking question handled as the lesson says; `/watchlist` showing the gate's state for the night. The recipe is in the shipment notes.
- **Exit check (syllabus):** the bot answers a 10-question gold set with correct citations; declines gracefully off-corpus; the watchlist page shows the gate's state for the night.

---

*Education, not advice. Nothing in this lesson or its toolkit is a recommendation to buy or sell anything. A tutor's answer is a reading of the course's notes with its sources shown; a gate is what two rules say together about a company tonight; an empty gate is a result.*
