# Lesson 8 — How Much to Bet (and the ticket that makes you write down why)

**90 minutes · Phase 3, week 2 of 3 · Toolkit feature: Carver's sizing and stop — the position-size calculator (`/size`, `POST /api/position-size`), paper tickets with a compulsory decision-journal entry (`/tickets/<code>`, `POST /api/tickets`), and the stop tracked nightly against the closes after the signal pass.**

*Methodology: Carver's Starter System (Leveraged Trading, 2019 — risk targeting, position sizing, the stop-loss closing rule, minimum capital; the unleveraged variant, leverage factor 1) and Systematic Trading (2015, ch. 9 "Volatility targeting" and ch. 10 "Position sizing"); the course's own numbers where the book leaves a choice are decision 19 in the syllabus. Page anchors for the two books are the tutor's, from the course copies (OI-40).*

Week 7 gave the course a rule for **when**: the 16/64 crossover, long or flat, read the same way every night. Tonight is **how much** — and *how much* is the question that separates a rule from a tip. A tip says "buy Apple". A rule says: at this volatility, with this account, this many shares; the stop here; the cost this; and if the account is too small for the share, say so and hold nothing. Then it makes you write down why before it accepts the ticket.

## By the end, students can

1. Explain risk targeting in a sentence — *the account should move about 12% a year, so a share that moves more gets less of the account* — and say why the target is modest.
2. Size a position by hand from three numbers (account, price, instrument risk) and place the first stop; reproduce the calculator's line for one company.
3. Say what the stop-loss rule is (half the annual instrument risk below the highest close since entry, the gap fixed at entry, the level only ever rising) and why a close below it is a decision already made.
4. Write a paper ticket on their own page — the rule's size, a journal entry of at least twenty characters — and read a refusal as the rule speaking, not the tutor.

## Materials

- The tutor's enrolment list: one code per student (`npm run enrol -- --name "…" --capital 10000`, done the day before), handed out on paper. The paper account is $10,000 unless a student asks for another figure between $500 and $1,000,000; the calculator shows what a small account cannot do.
- `/size` and three student pages pre-checked the evening before (tutor notes).
- Last week's homework: the rule in their own words; the one instrument each chose.
- A calculator per pair (phones do).

## Running order

**0:00 — Harvest: the rule in your words, and your one instrument (10 min).**
Three read aloud. Listen for "the fast average overtakes the slow one" in plain words — the sentence the week was for. Then round the room: the instrument each student chose and why. Write the tickers on the board; they come back at 1:00 when the tickets are written.

**0:10 — Why 12%? Risk targeting (15 min).**
Carver's Starter System starts not with "what to buy" but with "how much should my account move?" — the *risk target*. The course's answer is his: **12% a year.** Three things to say about it:
- **It is the account's volatility, not a return.** A 12% risk target means the account's value typically moves about 12% a year — up or down — the way instrument risk describes a share. Nobody promised 12% a year *gained*.
- **It is modest on purpose.** Carver's reasoning (the Starter System chapter; the course takes the number): a trend rule's expected reward per unit of risk is small — about a quarter — and betting the full amount that arithmetic allows ruins you on the way to the long run; he halves it. The worst years at a 12% target are survivable, which is the whole point of a target.
- **It is the dial everything else turns on.** A share that moves 24% a year gets half the account; a share that moves 6% would need twice the account, which a cash account cannot do. The rule says what you can hold *once* the target is set; the target is the only number of opinion in the system, and it is written down first.

Scripted answer — "Why not more when I'm sure?": "Because being sure is the thing week 7 measured. The target is the same on the night you are sure and the night you are not; that is what makes it a rule."

**0:25 — The arithmetic, in full (15 min).**
On the board, with the calculator open at `/size`:

- **Target exposure** = account × risk target ÷ instrument risk. $10,000 × 12 ÷ 18.18 = **$6,600.66** for Apple (instrument risk 18.18% on the 29 Oct close, from the signals page).
- **Whole shares** = the number that fits. $6,600.66 ÷ $348.91 = 18.9 → **18 shares**, $6,280.38 — 62.8% of the account, carrying 62.8% × 18.18% = **11.42% a year**. Just under target; whole shares always land under. The size does not change with the forecast's strength: the Starter System holds the full position while its rule is on (Carver's full system scales by the forecast — a later refinement, not in the course).
- **Capped at the account.** A share at 6% a year would ask for $20,000 of a $10,000 account; the cash account holds $10,000 and accepts 6%. No leverage in this class — the reason is the next slide.
- **Three companies, one account**, so the room sees the dial turn: Coca-Cola (21.11%, $94.08): $5,684.51 → 60 shares, $5,644.80, 11.92%. Microsoft (22.55%, $530.14): $5,321.51 → 10 shares, $5,301.40, 11.95%. The more it moves, the less you hold. Nothing about the companies entered the arithmetic.

Pairs: each pair sizes its own instrument on paper from the signals page's two numbers, then checks against `/size`. The calculator shows every line and its "how", so a disagreement is a row to find.

**0:40 — The stop (10 min).**
The Starter System has one closing rule: the trailing stop.
- **The gap**: half the annual instrument risk, in price: ½ × 18.18% × $348.91 = **$31.72** for Apple. Fixed on the day you enter; it does not move with tonight's volatility.
- **The level**: the highest close since entry, minus the gap. On day one, $348.91 − $31.72 = **$317.19**. If the share closes at $360, the stop is $328.28. It only ever rises.
- **The rule**: a close at or below the stop closes the position — at the next decision, with a ticket and a journal line. Not at the next crash headline; not "I'll give it a day".
- **Why half the annual risk?** A stop too tight is hit by noise — the ordinary 1–2% days — and churns; too loose and a trend's end costs most of what the trend made. Carver's choice for a rule as slow as 16/64 is half a year's movement; the course takes it. (The book's exact figure and reasoning: tutor, OI-40.)
- **Why the rule's flip doesn't close**: the Starter System opens on the crossover and closes on the stop only; a long that turns flat on the signals page is information, not an order. Students will ask; say what the course does and why (decision 19).
- **After a close** (the stop's, or one you chose): no re-entry on the same signal. The rule must go flat and then long again — a fresh crossover on or after the day you closed — before the next opening ticket. The toolkit refuses the other kind with a sentence.

**0:50 — Costs, minimum capital, and why no leverage (10 min).**
- **A trade costs $2 plus 0.25% of its value** (the course's model of a cheap broker plus the currency conversion an Irish student would pay; the paper account is in dollars because the shares are). Apple's 18 shares: $17.70 to open, $35.40 for the round trip — 0.56% of the position.
- **The course's rule: a round trip over 1% of the position is too small to trade.** Carver's principle is that costs must stay a small fraction of what the rule can earn; the course's threshold is 1%, written in the rules table and open to revision. A $1,000 account sizing a $20 share at 30% risk would hold $400; the round trip ($6.00) is 1.5% of it: refused, with the minimum named — **$2,000** for that share at that risk.
- **Minimum account** for Apple at today's risk: **$1,586** — the first whole number of shares worth at least the $800 the cost rule needs is three ($1,046.73), scaled by 18.18 ÷ 12. (Two shares, $697.82, would fail the 1% check: the floor is counted in whole shares, which is why it is not simply $800 × 1.515 = $1,212.) The calculator prints the minimum on every refusal. Nothing is wrong with the company; the account is too small for the share.
- **Leverage is out of scope.** Leverage is what lets an account hold more than its cash: the 6% share's $20,000 of exposure on a $10,000 account (leverage factor 2). The stop is the same distance away in price, but the loss is on twice the shares, and a broker closes a leveraged position for you at the worst price on the worst day. Apple at 18% needs no leverage at a 12% target (the rule asks for 66% of the account); the slow, steady shares are the ones that would. Carver's book is called *Leveraged Trading* and spends chapters on doing it safely; this class runs the leverage-factor-1 variant — never more than the cash — and says so.

**1:00 — Tickets, live (15 min).**
Codes out. Each student opens `/tickets/<code>` on a laptop and, for their one instrument:
1. Reads tonight's rule for it on `/signals`. **Long** → write an opening ticket, units blank (the rule's size), journal entry: what the rule said, where the stop is, what they will do if it is hit. **Flat or warming** → write nothing, and say so in the journal next week; the rule opens, you don't.
2. Reads the accepted ticket: size, fill (the latest close the toolkit holds — the decision close), cost, stop.
3. Tries one refusal on purpose: units at twice the rule's size. Reads the sentence. That sentence is the week's exit check (VC-20): an oversized ticket refused with arithmetic a student can follow.

Expect a third of the room to be flat and ticket-less tonight. That is the lesson, not a problem: the rule said no, and a journal line saying "the rule is flat; I wait" is a decision.

**1:15 — The weekly routine (5 min).**
Monday evening, every week from now until week 12, in this order: `/signals` for your instrument → your page for the stop and the stamp → the journal → (maybe) a ticket. Five minutes. The tracker runs every night after the signal pass; a close at or below the stop is stamped on your page in red with the date, and the Monday ticket closes it. Decisions on Monday from Friday's close (or the latest the toolkit holds); fills at that close; the tutor reads process, never P&L.

**1:20 — Homework + close (5 min).**
1. **Size two more companies by hand** from the signals page (any two core-tier names), check against `/size`, and bring the page.
2. **The Monday routine, once**, with a journal line whatever the rule says.
3. Read the Starter System's sizing and stop-loss chapters in *Leveraged Trading* (course copy; the tutor's page list). Optional: *Systematic Trading* ch. 9–10, where the method behind the 12% comes from (half the expected reward per unit of risk; the 12% itself is the Starter System's figure).

Close with the sentence.

## Tutor notes

- **Pre-check the evening before:** `/size?ticker=AAPL&capital=10000` renders the ten rows and the reading; `/tickets/<a test code>` renders with no positions; the 23:00 UTC receipt shows `"phase":"stops"` after `"phase":"signals"` (zero positions is fine). Enrol with `npm run enrol -- --name "…" --capital 10000` per student (the code prints once; `-- --list` shows them again); keep the list off the repo.
- **The exit check (VC-20):** one test student; an opening ticket at the rule's size accepted (201, the position row's `open_ticket_id` equals the ticket's id); an oversized ticket refused (422, `oversized`, the sentence); the rule flat for a symbol refused; a close accepted with P&L net of both costs; the nightly `stops` receipt with the position tracked. The recipe is in the shipment notes.
- **Scripted answer — "Why hold a loser until the stop?"** "Because the stop *is* the rule's answer to that question, set on the day you entered, before the loss existed. Moving it on the night is week 7's flawed brain, measured. If the stop is in the wrong place, change the rule for everyone, next week, in writing — not this position, tonight."
- **Scripted answer — "Can I close early if I've made a lot?"** "You can close whenever you like — it's your paper account and your journal. The rule wouldn't; the trend rule's money comes from the few long runs, and taking the gain early is the disposition effect from week 7. Write why, and we grade the why."
- **Scripted answer — "Can I use leverage / options / short?"** "Not in this course, by decision 18: cash equities, long only, whole shares. Carver's book is about doing those things carefully; read it after week 12 if you want to."
- **What the engine does not do, said out loud:** no mark-to-market P&L yet (week 9: cash, open P&L, the risk report); no concentration limit beyond the cash you have (week 9); no small-cap tickets (week 9, once the tier has 128 closes and the splits table is filled); no automatic closes — the tracker stamps, the student acts. The sizing uses the account as enrolled; week 9 sizes on the account's current value.
- **Re-alignment:** entry, high and stop are kept in the adjusted series. When a dividend goes ex, the adjuster moves the earlier closes and the tracker rescales the position's entry and stop by the same factor, stamping `re-aligned` on the page — and the position's exposure with them, so the dividend reaches the paper account as **cash**: the account's value is the same the night after an ex-date as the night before, just as a real account's is (the dividend is paid out of the price and into the cash line). Check it on the page: value = capital + realised + open P&L − the open tickets' costs, before and after. A split after entry also multiplies the share count (18 shares at $348.91 become 36 at $174.46 — the same position; the receipt says `split_realigned`); the tracker reads the splits table for any tier and recognises a round ratio (N-for-1, 1-for-N, or p-for-q with p, q ≤ 5) in the core tier's provider series; a move it cannot explain leaves the position untouched with a `split_unknown` receipt until a human adds the row. The ticket keeps the fill it was written at; the position carries the aligned entry; P&L at close is computed in one series.
- **Exit check (syllabus):** an oversized ticket is rejected with a reason a student can understand.

---

*Education, not advice. Nothing in this lesson or its toolkit is a recommendation to buy or sell anything. A size is what a rule would hold in a paper account; a ticket is a decision written down.*
