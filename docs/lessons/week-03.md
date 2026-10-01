# Lesson 3 — The Nightly Close (and the student who invented it)

**90 minutes · Phase 1, week 3 · Toolkit feature: nightly cron → cache, `/prices/:ticker` charts, `/api/universe`**

## By the end, students can

1. Say what "the close" is, when it happens on an Irish clock, and why one calm number a day beats a flickering feed.
2. Read a daily price chart: trend, range, and the difference between a wiggle and a move.
3. Explain what the course universe is, why it's a *verified list*, and why some famous names aren't in it.

## Materials

- The ledger site URL; week 3 now stamped. Phones out policy: encouraged all session — **the ration is gone.**
- Flip chart; the running cost ledger from week 2.
- Printed `/prices/AAPL` chart (one per pair) as backup if the room wifi sulks.

## Running order

**0:00 — Wall of Resulting + homework harvest (10 min).**
New headline nominations, one-sentence pitches, vote, pin. Then the week-2 homework: who *couldn't* find their company in the lookup? Collect the misses on the flip chart — titled **"Coverage gaps are data."** Keep the list; it pays off at 0:40.

**0:10 — What is "the close"? (15 min).**
New York trades 2:30pm–9:00pm our time. The close is the last agreed deal of the day — the number the whole world writes down. Draw the day as a squiggle on the flip chart, then circle one point: everything else evaporates; this survives. Indices in one breath (S&P 500 = a basket's close). Then the course's stance, said plainly: **we look once a day, after the noise stops, because calm decisions come from calm data** — and anyone selling you urgency is selling *something*.

**0:15 of this block — deliver the invention.** Remind the room who said, in week 2, "why not fetch everything once at night and remember it?" Name them. Tonight at 11:30pm Irish time, a robot does exactly their idea: visits every company on our list, writes down the close, goes back to sleep. Their idea, running nightly, in public.

**0:25 — Reading a chart without fooling yourself (15 min).**
Project `/prices/AAPL`. Walk it: the line is *adjusted* closes (week 2's splits lesson — this is why the chart doesn't "crash" on a split); the labels are max, min, last; the range links switch 3 months ↔ 5 years. The honest exercise: show 3 months, ask "trend?" — then show 5 years and ask again. Same company, same data, different story. **The timeframe is a choice someone makes before showing you a chart.** That sentence is scam-literacy seed #3.

**0:40 — The universe, and why it's small (15 min).**
Open `/api/universe` on screen. This is the tin, and you can read the label: every company we track, how many days of history, when it was last refreshed. Then the honest bit — connect to the 0:00 gap list: the free data plan doesn't cover everything; some companies we wanted (including nearly every Dublin-listed Irish name) aren't served. So the course universe is a **verified list** — every name on it was tested, and the test results are published in the repo. Nobody hid the gaps; we documented them. Contrast that with any tip-seller's stock list, where you never see what was left out or why. *(Tutor honesty, if asked "so is Irish data rubbish?": no — Irish companies' own champions mostly moved their main listings to New York; our data follows where the trading went. Week 11 shows the same migration in the fee schedule.)*

**0:55 — Toolkit time: chart safari (20 min).**
Phones out, no budget, no queue — the cache is theirs to hammer. Each student: (1) chart their week-2 company if it's in the universe, else adopt one from `/api/universe`; (2) find its best and worst stretch over 5 years; (3) one journal line: *"What story does the shape suggest — and what does the shape NOT tell me?"* (It can't tell you why; it can't tell you next.) Circulate; collect one surprise per table at the end. Point out the milliseconds line under each chart — last week one lookup took most of a second and cost ration; tonight it's instant and free, **because we stopped asking the world and started asking our own notebook.**

**1:15 — The robot's diary (5 min).**
Show the `last_nightly_run` line in `/api/universe` metadata. The robot keeps a log of every visit — successes, failures, refusals — and the log is public. A system that records its own failures is a system you can begin to trust. (This is also your segue to how banks and brokers are audited — and to week 6's "scams never fail well.")

**1:20 — Close + homework (10 min).**
Homework: (1) each night this week, glance at your company's chart — *without* acting on anything; notice the urge, journal it once ("day 3: wanted to do something; didn't; nothing was lost"); (2) bring one question about what makes a company *worth* something — week 4 opens the books.

## Tutor notes

- **Pre-class check:** `/api/universe` shows `latest_close` = yesterday for the actives. If a night failed, the fetch_log tells you which and why — that's your demo of the robot's diary, not an embarrassment.
- **"Why isn't Ryanair in the list?"** Best question of the night if it comes. Honest answer: it *trades* in New York and we can quote it live (demo `/api/quote/RYAAY` — tutor's ration), but the free plan refuses its history and accounts — it's on the published blocked list. One company, three different data doors, only some open for free. That's the data business in one example.
- **If wifi dies:** printed charts carry 0:25 and 0:55; the universe discussion needs only the flip chart.
- **Exit check (syllabus, phase 1 gate):** cron green three consecutive nights (fetch_log), ≥2 years of closes for the universe (5y delivered), zero live-API calls on student routes (`/api/prices`, `/prices`, `/api/universe` are D1-only by construction).
