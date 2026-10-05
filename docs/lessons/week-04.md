# Lesson 4 — What Is a Company Worth? (Mr. Market moves into your phone)

**90 minutes · Phase 2, week 1 of 3 · Toolkit feature: the books page — `/fundamentals/:ticker`**

*Phase 2 methodology note: Benjamin Graham throughout — the readable half from* The Intelligent Investor *(your 2003 Revised Edition, Zweig commentary), the reasoning underneath from* Security Analysis *(1940 second edition). Alternatives get named only so students can recognise them.*

## By the end, students can

1. Name the two statements the toolkit reads — what a company **owns and owes** (balance sheet) and what it **earned** (income statement) — and find four lines on each.
2. Say what EPS, book value, current ratio and long-term debt each measure, in kitchen-table words.
3. Retell the Mr. Market parable — and recognise him in a trading app's push notification.
4. Open their homework company's books on the course site and read five years in one screen.

## Materials

- The ledger site; week 4 stamped. Books pages live for the whole universe (pre-check one evening before — see tutor notes).
- Printed one-pager per pair: the four Graham-bar cards for one company (print `/fundamentals/KO` or similar).
- Flip chart; the running cost ledger (wk 2) and Wall of Resulting on display.
- Your TII (2003 revised ed.) to hold up: ch. 8 starts p. 188; the parable sits near its end. Zweig's commentary from p. 213.

## Running order

**0:00 — Wall of Resulting + harvest (10 min).**
New nominations, vote, pin. Then collect last week's discipline-drill journals in one round: who felt the urge to act on a nightly glance? What did doing nothing cost? (Usually: nothing. That's the point landing.)

**0:10 — The shop on the corner (15 min).**
No slides yet — flip chart. Imagine buying the corner shop outright. What would you demand to see before naming a price? Let the room build the list: what it *owns* (stock, fittings, the van), what it *owes* (suppliers, the loan), what it *takes in* a year, what's *left* after wages and light. Then the reveal: they have just invented the **balance sheet** and the **income statement**. Companies file exactly these, audited, every year, in public. A share is the corner shop cut into millions of slices — week 1's napkin, now with documents. *(Graham's own version of this move — valuing the business, not the ticker — is* Security Analysis's *whole premise; the 1940 edition's epigraph is Horace: "Many shall be restored that now are fallen, and many shall fall that now are in honor." Read it aloud; it's week 5's mood.)*

**0:25 — Four numbers, kitchen-table words (15 min).**
On the flip chart, one at a time, each with its question:
- **EPS** — of the year's profit, how much belongs to *one slice*? (TII ch. 12, p. 310, warns how this number gets dressed up — one line now, the full warning in week 6's narrative lesson.)
- **Book value per share** — if the company shut tonight, sold the lot and paid every debt, what's left per slice?
- **Current ratio** — can it pay this year's bills with this year's money? Graham's comfort line: about 2-to-1.
- **Long-term debt vs working capital** — is the mortgage bigger than the cushion?
No formulas yet beyond the words. The site computes; tonight is about *what the numbers ask*.

**0:40 — Mr. Market (15 min).**
Tell it properly (TII ch. 8, p. 188ff): you own half a business; your partner is obliging but manic. Every day he names a price — some days giddy-high, some days despairing-low — and you are perfectly free to **buy his half, sell him yours, or ignore him**. His feelings are not information about the business. Then the 2026 update, straight from Zweig's 75th-anniversary theme: *Mr. Market now lives in your pocket.* He pings you at breakfast, flashes red at lunch, throws confetti when you trade. The parable didn't age — it got a push notification. The discipline drill they just did? That was a week of practising *ignoring him*. **Margin of safety** gets one sentence tonight as the bridge to week 5: never pay so much that being a bit wrong ruins you (ch. 20, p. 512, holds the full argument).

**0:55 — Toolkit time: open the books (20 min).**
Phones out, no ration. Each student opens `/fundamentals/` + their homework company (or an adopted one). Tasks: (1) find the four cards and say aloud what each *asks*; (2) read the five-year table bottom row to top — has the dividend row ever gone blank?; (3) one journal line: *"One number here surprised me because…"*. Point at the red/green **Graham bars** on the cards and say plainly: these are *teaching thresholds from a 1949 book*, printed so you can argue with them — next week we run them as a screen and argue properly. Note what the P/E card does for a loss-making year: it shows a dash, because a loss has no meaningful P/E. The toolkit refusing to compute nonsense *is* the lesson.

**1:15 — The savers' question (10 min).**
Name the room's real starting point: most of you are savers wondering whether to become investors, with deposit rates and the property pages as your comparisons. Hold the course's line: we don't predict, and nothing here is advice — but we *can* say what a defensive investor demands before parting with savings: **evidence, read from the books, with a margin for being wrong.** Deposits ask no reading and pay accordingly; property arrives with a mortgage and no five-year table on a phone screen. What this course adds is the reading. *(If this week's Budget changed the tax treatment of savings or investments — see tutor notes — say only: "the rules just moved, week 11 prices it properly.")*

**1:25 — Homework + close (5 min).**
(1) Read TII **ch. 8** — Graham's text and Zweig's commentary (p. 188 and p. 213 in the course copy's pagination); it's the most important chapter in the book. (2) Journal: open your company's books page twice this week; note *one* line that moved or surprised you — and resist Mr. Market both times. Close with the sentence.

## Tutor notes

- **Pre-check, two evenings before:** fundamentals coverage fills at ~12 companies/night, so the whole universe has books within three nights of the week-4 deploy. Spot-check `/fundamentals/` for AAPL, KO, BA (BA shows the loss-year dash — your best prop), and whichever companies students adopted. `fundamentals_status` in `/api/universe`'s JSON shows ok/partial/blocked.
- **Budget 2027 (announced 7 Oct):** before class, check whether the funds/exit-tax or savings measures survived the speech, via the Department of Finance summary — one neutral sentence in class at most; the full costing belongs to week 11. Don't let tax questions eat the evening: park them visibly.
- **Affordability will come up** ("these are $200 shares and I have €10,000"). Honest answers, briefly: position sizing is week 8's whole lesson; fractional shares exist on some platforms but carry their own terms (week 11); and a five-slot paper portfolio works at any price level. Park the rest.
- **"Is a current ratio of 1.1 bad?"** The adult answer: it depends on the business (a supermarket turns stock faster than a shipyard). Graham's bars are *defensive* bars — deliberately strict, built to reject, and sector-blind by design. Week 5 argues this properly over the live screen.
- **Exit check (syllabus):** ratios for a sample match a hand-check from published accounts — `npm test` holds the arithmetic cases, and the books page for one company should be reconciled by eye against its latest annual report before class.
