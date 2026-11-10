# Lesson 9 — Running Your Paper Portfolio (and why drawdowns are normal)

**90 minutes · Phase 3, week 3 of 3 · Toolkit feature: the paper account marked to market every night, the pre-trade checks (size on the account's current value, the concentration cap, the risk budget) and the nightly per-student risk report (`/tickets/<code>`, `GET /api/risk/<code>`, the `risk` pass after the stop tracker at 23:00 UTC); small-cap tickets once an instrument has 128 closes and no unexplained jump in its series.**

*Methodology: Carver's Starter System (Leveraged Trading, 2019 — the risk target and what it implies for the account's year; running more than one instrument, with the risk shared between them) and Systematic Trading (2015, ch. 9 "Volatility targeting" — the account's expected movement and drawdowns; ch. 11 "Portfolios" — instrument weights and the diversification multiplier, which the course sets to 1 as the conservative choice); the risk layer's shape is the syllabus's "PraxiRisk-derived" one — pre-trade checks, a nightly report. The course's own numbers where the book leaves a choice are decision 20 in the syllabus. Page anchors for the two books are the tutor's, from the course copies (OI-40).*

Week 7 gave the course **when**, week 8 **how much**. Tonight is **what it is like to run it** — which is mostly waiting, and mostly waiting while the account is below its last high. A rule you can hold for three weeks is a hobby; one you can hold through a 20% drawdown without touching it is a system. The toolkit's job this week is to put the account's true state in front of each student every night — cash, open P&L, the high-water mark, the distance below it, the risk the positions carry — in sentences that state and never instruct, so that the only thing left to decide is what to write in the journal.

## By the end, students can

1. Read their own risk report and say what each line is: the account's value at the latest closes, the high-water mark, the drawdown from it, the risk used of the 12% budget, the nearest stop.
2. Say why a drawdown is expected rather than a fault — *at a 12% target the account moves about 12% a year either way, so a one-in-twenty year is around −20%, and a run of years sees deeper falls from a peak* — and what the rules do about it (nothing).
3. Explain the two new refusals: *concentration* (one position per instrument, N instruments per account) and *budget* (the open positions' risk, summed, against 12%), and why the size is now computed on the account's current value.
4. Run the weekly routine unprompted: signal → stop → report → journal → (maybe) a ticket — and know what a small-cap ticket needs before the rule will take it.

## Materials

- Every student's page pre-checked the evening before: the account strip, the "Risk report" box and at least one nightly row (tutor notes).
- The week-8 homework: two companies sized by hand; the Monday routine's journal line.
- The rules card (`kit/starter-system-rules-card.md`, updated): sections 2, 3, 6 and 7 changed this week.
- A calculator per pair.

## Running order

**0:00 — Harvest: the Monday routine, once (10 min).**
Round the room: what did the rule say for your instrument on Monday, what did you write, did you ticket? Count the room: long and holding, long and ticketed, flat and waiting, warming. Then the question that sets up the hour: *"Whose account is below where it started?"* Most hands. *"Whose is below its own highest value?"* Every hand that holds anything. That is tonight's subject.

**0:10 — The account marked to market: what the page now shows (15 min).**
Open the test student's page (the one enrolled for VC-20; the numbers below are its 3 Nov close). Six figures across the top, then the report in sentences:
- **Account value** = cash + Σ shares × the latest close the toolkit holds. The test account: $3,893.02 cash + 18 × $331.90 = $5,974.20 → **$9,867.22**. Not the cash (that is what is left after buying); not the capital enrolled (that was the start).
- **Open P&L** = (latest close − entry) × shares: (331.90 − 338.32) × 18 = **−$115.56**. **Realised** = the P&L of closed positions, net of both tickets' costs (the test student closed on 5 Nov at $349.51: **+$166.47** — (349.51 − 338.32) × 18 − 17.22 − 17.73).
- **High-water mark** = the highest account value the nightly report has seen, starting at the enrolled capital. **Drawdown** = (high − value) ÷ high: (10,000 − 9,867.22) ÷ 10,000 = **1.3%**. The mark only ever rises; the drawdown is measured from it, not from the start.
- **Risk used** = each position's share of the account × its instrument risk, summed: 60.55% × 19.04% = **11.5% a year** of the 12% budget. This is the week-8 arithmetic run backwards on tonight's prices.
- **The nearest stop**: (331.90 − 306.11) ÷ 331.90 = **7.8%** below the latest close.

Every one of those is a line the student can check on a calculator from the page's own numbers; the report's sentences say the same thing in words and nothing more. Pairs: check two of the five on the test page before moving on.

**0:25 — Drawdowns are normal (15 min).**
The centre of the lesson. On the board, from the one number the course chose in week 8:
- **A 12% target means a 12% year is ordinary.** The account's value moves about 12% a year *either way*. Half of all years end below where they started before any expected gain is counted; the rule's expected gain is small and slow (week 7: a quarter of a unit of return per unit of risk — Carver's figure, the course's assumption).
- **A one-in-twenty year is about −20%.** 1.65 standard deviations of a 12% move is 19.8%: the account that enrols at $10,000 should expect, once in a career of such years, to see $8,000 — *with the rules followed perfectly*.
- **Drawdowns from a peak are deeper than years are bad**, because peaks and troughs do not fall on the calendar. A run of years at a 12% target *typically* sees a drawdown of 20–30% from a high; one run in twenty sees 40% or more; a decade sees deeper still. (The course's figures: a random walk at 12% a year, simulated — it ignores fat tails and the trend rule's own shape, so take them as the floor of what to expect, not the ceiling. Carver's own table for the Starter System is in the risk-target chapter: tutor, OI-40.) A trend rule's drawdowns are longer than most, because it earns in a few long runs and loses a little most of the rest of the time (week 7's "why systems beat gut feel" slide, read the other way). The sentence printed on the page is this arithmetic.
- **What the rules do about a drawdown: nothing.** The size was set so that the worst drawdowns are survivable; the stop closes a position, not the account; the report says how far below the high the account is and leaves the feeling to the journal. "Nothing in the rules changes because of it" is printed on the page for that reason.
- **What students do about it: write.** The journal line in a drawdown — *"8% below the high; the rule is still long; the stop is 6% away; I am doing nothing"* — is the most valuable sentence in the course. Week 7's flawed brain wants to act; the page's arithmetic is the restraint.

Scripted answer — "Why not sell when it's down 10% and buy back lower?": "Because that is a second rule, and you would have to show it works. Week 7 measured what happens when the second rule is 'how I feel tonight'. If you want the course to add a rule, write it as a rule — for everyone, next week — and we will see what it would have done." The 10% note on the page is a statement, not a threshold for action.

**0:40 — Two new refusals, and sizing on the current value (15 min).**
Three changes to the ticket since week 8, each one sentence on the card:
- **Size on the account's current value**, not the enrolled capital. The account that has fallen to $9,867.22 sizes its next position on $9,867.22; one that has risen sizes on more. This is what makes the 12% a target for *the account as it is*; it is also why a position opened in week 8 can be a little over or under target tonight (the page says so, and the rules do not trim it — the stop does its work).
- **Instruments, N.** An account runs 1 instrument unless the tutor sets more (up to 4: `npm run enrol -- --set-instruments CODE 2`). Each position is then sized at **12% ÷ N** a year — 6% each for two, 4% for three, 3% for four — so the account as a whole still carries about 12%. (Carver's full system raises the total for the diversification between instruments — the *instrument diversification multiplier*; the course sets it to 1: two shares that fall together on the same bad day are not the diversification the multiplier assumes. Students who have read ch. 11 will ask; say so.) **Concentration**: a ticket that would open position N + 1 is refused — *close one first, or ask the tutor to set more instruments.*
- **The budget.** Before an opening ticket, the risk the open positions carry tonight plus the risk the new one would add must stay within 12% (+1 point of tolerance for rounding). Normally the sizing rule keeps this true by construction; it bites when instrument risk has risen since a position was opened, or when the number of instruments changed with a position open. The worked case is the test account itself: its 18 Apple shares were sized at the full 12% in week 8; if the tutor now sets it to two instruments and the student asks for Coca-Cola on the 3 Nov close ($94.08, 21.11%), the rule's 6% size is 29 shares — and the refusal reads: *"Over the risk budget: the open positions carry 11.5% a year tonight and 29 shares of KO would add 5.8% — 17.4% against the 12% target (tolerance 1 point). Fewer shares, or wait for a stop to do its work."* Eleven shares would still be refused (13.7%); seven are accepted (12.9%). Every figure is pinned in `src/lib/tickets.test.ts`. The check never trims what is held — Apple stays at 18 until its stop.

The thing to say out loud: none of these three *recommends* anything. They say what the rule would hold, and refuse what it would not.

**0:55 — Small caps, now (10 min).**
Since week 7 the small-cap tier's signals have been "warming up" (fewer than 128 closes) and marked `s` as not split-adjusted. Two things changed:
- An instrument in the tier can be ticketed **once it has 128 closes** — the first visited reach that in early December; the signals page shows "N of 128 closes" until then, and the ticket says so.
- A series with a **jump the toolkit cannot explain** — a one-day move of more than 40% in the adjusted close with no row in the splits table within four days of it — is **quarantined**: a `Q` on the signals page with the reason, and no opening ticket until the tutor adds the row (a split, or factor 1 with a note when it was news). Mueller Industries' two-for-one of 1 July is the tier's first row; it is why MLI is *not* quarantined. Closing tickets are never gated — a stop is a stop.

Why the quarantine exists: an unexplained halving looks to the rule like a crash and to the volatility estimator like a 50% day; a position sized on that number would be a quarter of the right size, and a long opened after it would be opened on a false signal. The rule only works on prices that mean the same thing all the way along the series.

**1:05 — The weekly routine, now with the report (10 min).**
Monday evening, in this order, five minutes: `/signals` for your instrument → your page: the stop, the stamp, **the report** → the journal → (maybe) a ticket. Three things about the page this week:
- The code is no longer printed on the page. **The page's address is its key**: a screenshot of the page is safe to show the class; the link — and a screenshot that includes the browser's address bar — is not. Share screenshots, not links.
- The "Nightly reports" table at the bottom is your account's history, one row per night from the 23:00 UTC job. A flag in the last column is a statement, not an instruction, and the words are the same on the page, in this lesson and on the slides: `drawdown ≥ 10%`, `over the 12% budget`, `stop hit`, `more positions than instruments`, `no close stored`.
- The report is as of the night — the latest close the toolkit holds for any instrument; a position whose own series lags (a small cap between visits) is valued at its latest stored close and the report says so. The account strip at the top is computed when the page loads, so it can be a night ahead of the last table row.
- `/size` now takes the number of instruments too, so the calculator and your ticket agree on the 12% ÷ N size.

**1:15 — Homework + close (10 min).**
1. **The Monday routine with the report**, and a journal line that quotes one number from it ("the account is 2.3% below the high").
2. **Check the report by hand**: account value, drawdown and risk used for your own page, from the page's own numbers; bring the arithmetic.
3. Read the Starter System's risk-target chapter again, this time for what it says about *drawdowns* — and ch. 9 of *Systematic Trading* if you want the method. Optional: ch. 11 (why the course's multiplier of 1 is the conservative end of Carver's range).
4. Phase 4 begins next week: bring one question you would want to ask a tutor bot about the course, in writing.

Close with the sentence.

## Tutor notes

- **Pre-check the evening before:** every enrolled page renders with the account strip, the "Risk report" box and the "Nightly reports" table; the 23:00 UTC receipt shows `"phase":"risk"` after `"phase":"stops"` with `"students":N,"written":N,"errors":0`; `GET /api/risk/<code>` answers for one code. A `risk_flag` receipt names the student and the flag — read them before class so a flagged student is not surprised by the room.
- **Instruments:** `npm run enrol -- --set-instruments CODE N` (1–4). Positions already open keep their size; the report flags `more positions than instruments` if N was lowered below the open count, and the ticket refuses the next open until it is not. Enrol with `--instruments N` to set it from the start. The list (`-- --list`) shows each student's N.
- **The exit check (VC-21 — the Phase 3 gate):** two test students, N = 1 and N = 2; a rule-compliant opening ticket accepted for each; a concentrated ticket refused (`concentration`); an oversized one refused (`oversized`, with the current value in the sentence); the nightly `risk` receipt and one `risk_reports` row per student; the page's report checked by hand (value, drawdown, risk used); a warming small cap refused with its close count and a quarantined one with its reason. The recipe is in the shipment notes; the gate's three sentences in the syllabus are its a–d (the positions and the two refusals) and f–g (the report).
- **Scripted answer — "My account is up; can I size on the gain?"** "You already do — the size is on the account's current value, gains included. What you cannot do is size on next week's value."
- **Scripted answer — "Two instruments at 6% each is less than one at 12%. Why bother?"** "Because the two fall on different days, mostly. Carver would raise the total for that; the course doesn't, because 'mostly' is doing a lot of work in a four-share account of US large caps. If you want the multiplier, read ch. 11 and bring the case."
- **Scripted answer — "The report says 'over the 12% budget'. Do I sell some?"** "The rules don't. The budget check is a pre-trade check: it stops you adding risk, it doesn't trim what you hold; the stop is the closing rule. If a position's risk rose because the share got wilder, that is the stop's business. Write the line."
- **What the engine does not do, said out loud:** no automatic closes, still; no re-sizing of open positions when N changes or volatility moves; no instrument diversification multiplier (set to 1, decision 20); no correlation between instruments; the budget check uses tonight's instrument risk, not the risk at entry. Phase 4 adds the tutor bot, the portfolio review and the login — not more rules.
- **One row per student per night.** `risk_reports` is keyed on (code, date): a second run on the same close replaces the row, so the doorbell can be rung twice without a double line.
- **Exit check (syllabus):** every test student can open a rule-compliant paper position; the risk layer blocks an oversized/concentrated ticket; the nightly risk report renders per student.

---

*Education, not advice. Nothing in this lesson or its toolkit is a recommendation to buy or sell anything. A report is the state of a paper account; a drawdown is a measurement; a ticket is a decision written down.*
