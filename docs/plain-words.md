# Plain words — the voice of the pages, and the glossary

*Written 14 Nov 2026 for v1.2 (decision #25), after the tutor's reading of the site at v1.1: "the language needs to be less cryptic and more in layman's terms — the target audience; the jewels are buried beneath small-text hyperlinks." Every page's words are held to this sheet from v1.2 on; the reader review checks them against it. Rules 11 and 12 and the glossary's later rows were added after the v1.2.0 reviews (the reader's and the reviewer's), from what they found.*

## Who the pages are for

Someone who has never bought a share, arriving on a Tuesday with a cup of tea, who wants to know what the page is for and what to do on it. Not the builder, not the reviewer, not the record. The record (`docs/`, the build log, the syllabus) keeps its own register; the pages do not.

## The rules of the voice

1. **Say what the page is for in the first sentence, and what to do on it in the second.** "This is your paper account. Read the stop line first, then the report."
2. **One idea per sentence. Short sentences.** A full stop is cheaper than a semicolon.
3. **Explain every term where it first appears on a page, in brackets, in six words or fewer** — *instrument risk (how much the price moves in a year)*. The glossary below gives the words; use them the same way on every page.
4. **Numbers carry their meaning.** Not "12%" but "12% a year — the account moves about that much in a typical year".
5. **Second person.** "Your page", "you write the thesis". The toolkit is "it"; the tutor is "the tutor".
6. **The teaching phrases stay exactly as they are.** They are lessons, not jargon: *We grade decisions, not outcomes* · *the rule opens, you don't* · *Education, not advice* · *paper portfolios only; no tips, ever; everything is open* · *a number you cannot source is not a number* · *the sixth question is not asked*.
7. **The refusals stay exactly as they are.** The ticket judge's sentences and the plan's problem lines are pinned by the tests and are the rules speaking; a page explains them beside, it does not rewrite them.
8. **Links are things to do, in readable type, where the eye lands** — never a grey line of small links at the bottom. A page's main actions are buttons or cards; "the planner" is a card, not a crumb.
9. **No "we built this in week 7".** The ledger of the build has its own place on the landing, below the tools; a tool's page says what the tool does, not when it arrived.
10. **Nothing about the builder, the reviews or the record on a tool's page.** The footer carries the licence line and the link to the repository; that is enough. That includes source-file names (`src/lib/sizing.ts`) and "week 8" in a page's body, not only its lede and eyebrow (v1.2.0 review S6). The kit's week stamps stay: they record when each document was taught.
11. **A statement about a price is not an instruction.** "LONG (the rule would be in the share)", never "LONG (buy)". The reader hears a verb as an order, whatever the footer says (v1.2.0 reader review).
12. **The maths and the builder's log are one click away, not in the way.** The signals page folds its formulas under "The maths, if you want it"; the landing folds "How it was built". What a beginner must read is above the fold; what a builder wants is below it.

## The glossary — the plain words for the course's terms

| The term | The plain words (use these, in brackets, at first use on a page) |
|---|---|
| the close | the last price of the day |
| adjusted close | the price with dividends and splits folded in, so days compare like with like |
| the universe | the 86 companies the toolkit follows |
| core tier · small-cap tier | the 38 big names · the 48 smaller ones |
| the rule / the signal | a trend rule: two moving averages of the price (the average of the last 16 days and of the last 64); the shorter above the longer says LONG (the rule would be in the share), otherwise FLAT (it would be out) |
| LONG · FLAT | the rule would be in the share · the rule would be out — a statement about a price, never an instruction (v1.2.0: the reader review heard "buy or hold / stay out" as orders under an "Education, not advice" footer) |
| warming up | the rule needs 128 days of prices before it is trusted |
| forecast | how strong the trend is, on a scale capped at ±20 |
| instrument risk | how much the price moves in a year, as a percentage |
| the gate · the watchlist | a company that passes one of Graham's checklists *and* is LONG on the rule — the list of those is the watchlist |
| Graham's defensive screen | seven tests from *The Intelligent Investor* (1949): big enough, financially strong, steady earnings, ten years of dividends (Graham asked for twenty; the course's record holds about fifteen, so it asks for ten — say so), growing, not dear by P/E, not dear by P/B |
| the enterprising screen | six looser tests, for the investor willing to do more work |
| near miss | one test short of passing |
| P/E · P/B | the price divided by a year's earnings · the price divided by the book value — two ways of asking "is it dear?" |
| the risk target | 12% a year: the account is sized so that it moves about 12% in a typical year |
| 12% ÷ N | the risk target shared equally between the N instruments the account runs |
| the rule's size | how many shares the risk target allows at this price and this instrument risk |
| the stop | the price at which the rules say sell: a fixed distance (half the instrument risk) below the highest close since you bought; it only ever moves up. Defined on the landing's first card and on the account's page, not only on the calculator |
| the stop gap | the distance from the entry price down to the stop |
| a ticket | the form on your page that buys or sells on paper (opens or closes a paper position); the judge checks the rules and refuses with a reason |
| the judge | the rules, applied to a ticket before it is accepted |
| the journal · the thesis | what you write before the decision — the facts, and why, and what would prove you wrong |
| a paper account · paper money | pretend dollars, real prices, a real record |
| marked to market | valued at tonight's closing prices |
| exposure | the value of the shares you hold |
| cash | what is left in the account after the shares and their costs |
| drawdown | how far the account is below its highest value |
| the high-water mark | the account's highest value so far |
| P&L | profit and loss |
| the round trip | what it costs to buy and later sell |
| the spread | the gap between the buying price and the selling price at the same moment — the toll |
| the cost model | $2 plus 0.25% a trade — the course's own estimate |
| a broker · the broker's lines | the firm that holds your account and places your orders · DEGIRO's published charges, in euro — named because it publishes them, never as a recommendation (say so where it is named) |
| an ETF · UCITS | an exchange-traded fund: a basket of shares you buy and sell like one share, taxed under the exit tax · an EU-regulated fund |
| stamp duty | the state's tax on the purchase of a share itself (1% Irish, 0.5% UK, none US) |
| quarantine | a price series that jumped without an explanation; no tickets on it until a human checks |
| the nightly report | one paragraph written for your account every night: what happened, what the rules did |
| the audit · the review | the rules read against your rows — did you do what you wrote? — and, if you ask, a reading written from that sheet, which cannot see whether you made money |
| the door | the sign-in: your email, then a code sent to it |
| the planner | the tutor's workbook: tonight's names ranked by the tests, sized and stopped, the tickets raised through the judge |
| the kit | the seven documents you take away |
| CGT · exit tax · the IIA | capital gains tax (shares) · the tax on funds · the Individual Investment Account the Finance (No. 2) Bill 2026 would open |

## Three before-and-afters

| v1.1 | v1.2 |
|---|---|
| "Graham says *what* (the screens, from the accounts, slowly); Carver says *when* and *how much* (the rule, from prices, nightly). Read together, in that order, as a gate." | "This is the watchlist: the companies that pass two tests at once tonight. Read its three lists in order — the gate, the near misses, then the rest — and write what you see in your journal; there is nothing to buy here. A company is on the gate only when it passes one of Benjamin Graham's checklists (is it a sound business at a fair price?) *and* the trend rule says LONG (the price trend is up). Most nights that is nobody — and that is the lesson." |
| "One rule, run the same way over every company every night: Robert Carver's 16-day / 64-day moving-average crossover, long-only." | "This page is what the trend rule says tonight about every company the course follows. Read the state first, then the forecast. The rule: two moving averages of the price (the average of the last 16 days and of the last 64). When the shorter average is above the longer the rule says LONG — it would be in the share, holding it. Otherwise FLAT — it would be out." |
| "The watchlist as a starting point: tonight's names ranked by the tests — the gate first, then the near misses that are long, then the rule's longs that fail both screens…" | "Tonight's companies, ranked by the tests: the ones on the watchlist first, then the near misses, then the rest the rule says LONG on. The top ones are ticked and sized for you. Change anything; the judge still says no." |
