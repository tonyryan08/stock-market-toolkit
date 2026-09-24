# Lesson 2 — Where Prices Come From (and what "free" really costs)

**90 minutes · Phase 1, week 2 · Toolkit feature: `GET /api/quote/:ticker` + the lookup form**

## By the end, students can

1. Read a quote screen: last price, bid, ask, spread, volume, OHLC, previous close.
2. Explain why our course data is delayed and rationed — and why that itself is a price signal about the value of data.
3. Explain what a split or dividend does to a price chart, and why "adjusted" prices exist.

## Materials

- Two printed quote screens from any broker or finance site: one liquid mega-cap, one small-cap with a visible spread.
- The homework headlines (the "luck dressed as skill" collection).
- The course site URL, and the day's **lookup ration written large on the board: 25**.
- Flip chart for the split worked example.

## Running order

**0:00 — Homework harvest: the Wall of Resulting (10 min).**
Headlines out. Each contributor gets one sentence on why theirs smells like luck dressed as skill. Class votes; the winner gets pinned up and stays up all term — the Wall of Resulting grows weekly. (Recurring bit, low prep, compounds nicely.)

**0:10 — What a quote actually is (15 min).**
Build on week 1's "a price is the last deal two strangers agreed": the *last* price is history; the **bid and ask are the two queues** of people waiting to deal, and the **spread between them is a toll bridge** you pay to cross in a hurry. Volume is how busy the bridge is. OHLC is a whole day compressed to four numbers. Activity: hand out the two printed quote screens — find the spread on each, then compute the cost of buying and immediately selling €1,000 worth. That number goes on the flip chart as **the first entry in the course's running cost ledger.** The small-cap's toll will genuinely surprise them.

**0:25 — Why is our data delayed? (10 min).**
Because immediacy is the product. Exchanges sell speed: co-located real-time feeds for serious money, 15-minute-delayed for cheap seats, end-of-day for free. Our course sits at the free end **by design** — nothing this course teaches needs speed, and (plant this flag now) *feeling that you need speed is usually a sign you're gambling, not investing.*

**0:35 — The ration book (10 min).**
Point at the 25 on the board. That's the entire class allowance of live lookups per day on the free data tier; the second provider allows about 250. Discussion: if you had 25 looks a day at the whole market, how would you spend them? Let it run a few minutes — someone will say some version of *"why doesn't it just fetch everything once at night and remember it?"* **That student has just invented week 3.** Name it, credit them, promise it. (If nobody says it, ask: "what would a sensible person do instead of looking things up one at a time?")

**0:45 — Splits and dividends, or: why charts lie (15 min).**
Flip chart: a €100 share does a 2-for-1 split → two €50 shares. The chart shows a 50% "crash" in which nobody lost a cent. Same trick in miniature every time a dividend is paid — the cash leaks out of the price on the ex-date. Hence **adjusted prices**: history restated as if today's share structure had always existed. Rule of thumb for the course: *raw prices for what happened today, adjusted prices for any chart longer than a season.* Week 3's nightly history will store adjusted closes for exactly this reason.

**0:55 — Toolkit time: spend the ration deliberately (20 min).**
Phones out. Budget ~8 of the 25, spent as an experiment plan, not a scramble:

1. `AAPL` — a liquid US mega-cap; read the JSON fields aloud together.
2. `TSCO.LON` — a UK listing; note the symbol dialect differs by provider.
3. One student-chosen ticker.
4. A nonsense ticker — watch the toolkit **fail politely** and explain itself. Failing well is a feature; scams never fail well.
5. If the class is lively and the budget dies early — celebrate. Reading the rate-limit message live off the screen is the entire lesson in one JSON field.

Point out two honest details in every response: `"delayed": true`, and the `warnings` array. The toolkit tells the truth about its own data. That's the standard everything they meet after this course should be held to.

**1:15 — The transparency minute (5 min).**
On screen: `.dev.vars.example` next to `.gitignore` in the public repo. The lock and the promise, side by side: the code is open, the keys are not, and they can verify both claims themselves. (Scam-literacy seed #2: real systems show you how they work *and* how they protect secrets.)

**1:20 — Close + homework (10 min).**
Repeat the sentence. Homework: pick **one company you genuinely encounter in daily life** — the shop, the phone, the airline — and write a journal entry titled *"What do I actually know about this business?"* No numbers, no looking anything up; just knowledge from living. (This feeds week 4 directly.) Second, smaller: use the lookup to find your company's ticker — and if the lookup can't find it, write that down too. **Coverage gaps are data.**

## Tutor notes

- **Guard the ration.** Test your class tickers the night before against your own key so class time spends its 25 on ceremony, not debugging. If the limit hits early anyway, don't apologise — point at the board.
- **The invention moment.** The whole session is rigged so a student proposes caching before you announce it. Don't rescue the silence too early.
- **"Which broker shows real-time for free?"** Some do — and now the class can ask *who's paying for that, and with what.* (Answer for later: week 11.)
- **Exit check (syllabus):** quote route works for five tickers including one UK listing; keys nowhere in the repo — demonstrated live in the transparency minute.
