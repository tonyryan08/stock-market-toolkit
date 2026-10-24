# Lesson 7 — Why Systems Beat Gut Feel (and the evening a rule reads every company the same way)

**90 minutes · Phase 3, week 1 of 3 · Toolkit feature: the signal engine — Robert Carver's 16-day / 64-day moving-average crossover run nightly over the whole universe (`/signals`), the two averages drawn on every price chart (`/prices/:ticker`), and the series behind them (`/api/signals/:ticker`, `/api/prices/:ticker?csv=1` for a spreadsheet).**

*Methodology: Carver's Starter System (Leveraged Trading, 2019 — the opening rule, instrument risk) and his Systematic Trading (2015, ch. 1 "The Flawed Human Brain"; ch. 7 "Forecasts": the EWMAC rule and its scalar); the evidence on individual investors (Barber & Odean 2000; Odean 1998); the evidence on trend following (Moskowitz, Ooi & Pedersen 2012; Hurst, Ooi & Pedersen 2017). Page anchors for the two Carver books are to be added from the course copies (OI-40).*

Phase 2 gave the course rules for **what** — which companies are worth reading. Phase 3 gives it rules for **when** — when a rule, applied the same way every night, says a price is trending and when it says it is not — and, in weeks 8 and 9, how much a rule would let you hold and where it would make you stop. Nothing in Phase 3 picks a company. The screens still do that. The signal is a second, independent reading of the same share: the books say what it is; the price says what the crowd has been doing with it.

## By the end, students can

1. Explain, in their own words, why a written rule applied by a machine beats a human reacting to the news — and name two of the biases the evidence finds in people who trade on feel.
2. Compute, on paper or in a spreadsheet, a 16-day EWMA, a 64-day EWMA, and the forecast the toolkit prints, from a list of closes.
3. Say what *instrument risk* is (the annualised volatility of a share), read it off the signals page, and say why everything in Phase 3 hangs off that one number.
4. Read a long/flat signal as the output of a rule and not as advice: "the rule is long" is a statement about 64 days of closes, not about the company or about you.

## Materials

- `/signals` and three chart pages pre-checked the evening before (tutor notes).
- One printed "predict first" slip per student, blank: *three companies from the universe I believe are in an uptrend; three I believe are falling.*
- A laptop per pair with the CSV of one company open in a spreadsheet (`/api/prices/AAPL?days=1900&csv=1` — the whole five years; a one-year sheet still remembers its starting point in the slow average and misses at the fourth decimal). Any company with five years; AAPL has them.
- The decision-journal; last week's 120-word explanations.

## Running order

**0:00 — Harvest: the 120-word explanations (10 min).**
Two read aloud. Listen for the sentence that has no fact tag; there is usually one. Then the ANDE page from the toolkit's own diary: the AI wrote revenue as 11.2 billion where the sheet said 11.3, and the toolkit flagged it (24 Oct). The room's exercise, done by the machine, on itself. Tonight we turn from reading to deciding — and the first decision is *who decides*.

**0:10 — Predict first (5 min).**
Slips out, before anyone sees a chart. Three names you believe are going up, three going down. Fold. They come back at 0:45.

**0:15 — Why systems beat gut feel (20 min).**
Carver's first chapter is called "The Flawed Human Brain", and he means every brain, including his own. The evidence, in three findings the class can carry away:
- **People who trade on feel trade too much, and it costs them.** Barber and Odean read the records of 66,000 households at a US discount broker, 1991–96: the fifth that traded most earned 11.4% a year against the market's 17.9%. Overconfidence, measured in commissions.
- **People sell their winners and keep their losers.** Odean (1998), the same kind of records: investors were about 50% more likely to sell a share showing a gain than one showing a loss — the *disposition effect*, loss aversion with a brokerage account.
- **A rule has none of this.** It cannot be overconfident, it does not feel a loss, it does not read the news, and it does the same thing on a bad night as on a good one. What it *can* be is wrong — openly, measurably, and in a way you can test before you trust it.

That last line is the whole of Phase 3: not that rules are right, but that rules can be checked and gut feel cannot. The toolkit's rule was checked three ways before tonight: against Carver's book (the tutor's copies — OI-40), against his own open-source code (the constants are his), and against a spreadsheet re-implementation (VC-19, done before this class). Nobody leaves their brain at the door: you check the rule; the rule checks the price.

**0:35 — One instrument, one rule: the arithmetic (10 min).**
Carver's Starter System is deliberately small: one instrument, one opening rule. The rule, in full, on the board:

- λ = 2 ÷ (span + 1). For 16 days λ = 2/17 = 0.117647…; for 64 days λ = 2/65 = 0.030769…. Use the fractions, not a four-place rounding — four places moves the last digit of the worked example.
- EWMA today = λ × today's close + (1 − λ) × yesterday's EWMA. Start both at the first close.
- σ = the exponentially weighted standard deviation of daily price changes (span 35 — Carver's default).
- forecast = 3.75 × (EWMA₁₆ − EWMA₆₄) ÷ σ, capped at ±20. The 3.75 is Carver's scalar: it makes the average size of the forecast about 10, so that +20 means "as strong as trends get".
- **State:** forecast above zero → LONG; otherwise FLAT. The course's adaptation: long-only, no shorts, no leverage — a community class in cash equities.
- **Instrument risk** = σ of daily *percentage* returns × 16 (√256 trading days), as a percentage a year.

Do three days of it by hand with closes 10, 11, 12: EWMA₁₆ goes 10 → 10.1176 → 10.3391; EWMA₆₄ goes 10 → 10.0308 → 10.0914. The fast average moves first. That is the whole idea: a crossover is the fast average overtaking the slow one, which only happens after a trend has been going for a while. The rule is late on purpose; being late is what filters the noise.

**0:45 — The signals page, live, and the slips (15 min).**
Project `/signals`. Read the tally: how many long, how many flat, how many warming up (the small caps — fewer than 128 closes stored). Open one chart (`/prices/AAPL`, 1y): the blue 16-day line, the red dashed 64-day line, the green and grey strip underneath — green where the rule was long, grey where flat — and the hover on the strip for the dates. Count the flips over five years on `/api/signals/AAPL` → `summary.flips`.

Then the slips. Each student reads their six names against the page. Keep a tally on the board: *agreed with the rule / disagreed*. Expect the room to be right about half the time, which is the point: the rule is also right about half the time on any one day — the difference is that it will do the same thing tomorrow, and you will not.

**1:00 — Instrument risk: the number everything hangs off (10 min).**
Sort the page by instrument risk in your head: the household names near 20–30% a year, the small caps at 40% and up. Say what the number means: a share with 30% instrument risk moves about 30% a year, two years in three — up or down. Next week that number becomes a position size (a volatile share gets a smaller holding) and a stop (half the annual risk below the high). Tonight it is enough that students can read it and rank by it.

**1:10 — The spreadsheet (15 min).**
Pairs: the five-year CSV open (`?days=1900&csv=1`). Columns: date, adj_close. Add EWMA₁₆, EWMA₆₄, the price change, σ (the EW variance recursion, then its square root), forecast, state — the recipe is in the tutor's VC-19 notes. The last row must match `/api/signals/<ticker>` → `latest`: the averages and σ to six decimals, the forecast to two. It will. The point of the exercise is not the arithmetic; it is that *you can reproduce the machine's answer*, which is what makes it a rule and not an oracle.

**1:25 — Homework + close (5 min).**
1. **Write the rule in your own words**, five lines, no symbols, as you would explain it to a friend. Bring it.
2. **Pick your one instrument** from the universe — the company you would follow with this rule for the rest of the course — and write why in the journal. Not the one you like: the one whose history you have read (its books page, its chart, its flips).
3. Read the Starter System's opening-rule and instrument-risk chapters in *Leveraged Trading* (course copy; pages per the tutor's list). Optional, for the science: Hurst, Ooi & Pedersen, "A Century of Evidence on Trend-Following Investing" (free on AQR's site).

Close with the sentence.

## Tutor notes

- **Pre-check the evening before:** `/signals` should show the 23:00 UTC run's date as "as of"; every core-tier company long or flat, the small caps warming up (fewer than 128 closes) until mid-December. Open three charts at 1y and check the overlay draws and the strip's hover gives dates.
- **The spreadsheet reconciliation (the syllabus's exit check, VC-19):** three tickers, the five-year CSV route, the recipe in `_PATCH-NOTES-V090.md`. The toolkit's EWMA starts at the first close and its variance recursion takes the mean as zero (the RiskMetrics convention); on a five-year sheet the start is forgotten (the slow average keeps 10⁻¹⁷ of it) — a disagreement means a wrong column, a wrong λ or a row offset. Carver's own code subtracts an EW mean and floors σ; measured against it, the state never differs and the forecast's size differs by a few tenths of a point in a strong trend (decision 17; the v0.9.0 review's F11).
- **Scripted answer — "So the rule is telling us to buy the long ones?"** "No. The rule is telling us that for those companies the 16-day average is above the 64-day average tonight. That is all it knows. It does not know the company, the news, or your circumstances; it has no view on the price tomorrow. Weeks 8 and 9 say what someone *who chose to follow it* would do about size and stops. Choosing is yours. Education, not advice."
- **Scripted answer — "Does this actually make money?"** "Over long periods and across many markets, trend-following rules like this one have made modest returns with large drawdowns — Hurst, Ooi and Pedersen trace it back to 1880 across 67 markets; Carver's own backtests show the same shape. Over any one year, on any one share, it can lose. We are not here to make money with it; we are here to learn what a rule is and what it costs to follow one. If any of you later use one, you will know exactly what you are doing and why."
- **Scripted answer — "Why 16 and 64?"** "Carver's choice, and he says in the book that the exact numbers matter less than you'd think — 8/32 and 32/128 behave similarly, faster or slower. What matters is that they are written down before you look at the prices, and not changed afterwards because last month's result was bad. Fitting the rule to the past is the oldest way to fool yourself; Carver has a chapter on it."
- **What the engine does not do, said out loud:** no shorts; no sizing; no stops; no costs; no backtested P&L on the page (a strip of long/flat days is not a return). The small-cap tier is "warming up" until 128 closes are stored and is not split-adjusted — a split would show as a false flip; the open-items register carries it.
- **Exit check (syllabus):** signals for the universe reconcile with a spreadsheet re-implementation for three tickers (VC-19); the nightly job writes the signals table (`fetch_log` → `run_summary` with `"phase":"signals"` after 23:00 UTC); `/api/signals/:ticker` returns the state, the forecast and the instrument risk.

---

*Education, not advice. Nothing in this lesson or its toolkit is a recommendation to buy or sell anything. A signal is what a rule says about a price series.*
