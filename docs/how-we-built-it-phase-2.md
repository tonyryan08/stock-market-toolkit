# The Idiot's Guide to How We Built It — Phase 2

**Weeks 4–6 of the toolkit, explained for everyone · Intro to the Stock Market**

Phase 1 ended with a robot that copies down closing prices every night, and a story about how it got built (`how-we-built-it-phase-1.md`). Phase 2 is the part where the toolkit starts *reading company accounts*, runs Benjamin Graham's seventy-year-old checklist over them, finds nothing, and then learns to explain itself in plain English, with a human checking every sentence.

Same rules as before. The tutor decided *what* and verified *everything*; Claude, the AI, produced *how* and explained *why*; nothing went live on trust. Every mistake stayed on the record: the AI's, the tutor's, and this time one the AI made about *itself*. Nothing below is cleaned up to look clever.

*(Builders: the instructions are in `docs/setup-guide.md`; the evidence is in `docs/data-provider-checks.md`, `docs/reviews/` and `BUILD-LOG.md`. This document explains; those instruct and prove.)*

---

## New words for the cast

| Thing | What it actually is |
|---|---|
| **The books** | A company's annual accounts: what it earned, owns, owes and paid out. Public, audited, and the only numbers in this course that are not somebody's opinion |
| **A ratio** | One number from the books divided by another, so a giant and a corner shop can be compared |
| **A screen** | A checklist run over every company at once. Pass every test and you are a *survivor*; miss by one and you are a *near miss* |
| **A test suite** | Arithmetic the code must get right, checkable on paper, re-run automatically whenever anything changes. The count went from 9 to 90 over these three weeks |
| **An independent review** | A second reader who did not write the thing reads it against the source and reports findings *before* anything is changed |
| **A fact sheet** | A numbered list of facts about one company (F1, F2, …) computed by the toolkit with no AI involved. Week 6 hands this to the AI and nothing else |
| **A token** | The unit an AI is billed in, roughly three-quarters of a word. Week 6 is the first week with a bill; it is counted in hundredths of a cent |

---

## Prologue — the robot gets a speeding ticket (2 Oct)

Phase 1's story was written on 1 October, the day the robot went into production. Next morning the landlord's notice arrived: the toolkit had exceeded its free allowance of **100,000 database writes a day** on night one. The data was safe; the lesson was not optional.

The bill's own arithmetic found the cause. The robot had written about 39,000 price rows, but the notebook had been given a spare index duplicating one it already had, and the landlord meters every row once for the table *and once for each index*. Thirty-nine thousand rows at three charges each: a hundred and sixteen thousand. **The flaw was the AI's**, and the record says so. The fix was engineering, not the €5-a-month upgrade the notice helpfully offered: drop the index, spread the weekly refresh over the nights, and have the robot budget its writes as it already budgets its data calls. The robot got a speeding ticket, read the ticket, and redesigned its route.

*Jargon you now own:* **a meter you didn't know was running.** Free tiers have several. Week 11 will say the same about fees.

---

## Week 4 — The books, opened (5 Oct)

**What got built:** five years of income statements, balance sheets and dividend records for every company, fetched by the robot in a second nightly round and written into the notebook. From those raw lines the toolkit computes its own ratios, never trusting a figure the supplier has pre-chewed. A *books page* per company shows the five years with four Graham-style gauges, and a loss-making year shows a **dash** where the price-to-earnings ratio would be: earnings of zero make the arithmetic meaningless, and the toolkit refuses to compute nonsense. With the ratios came the project's first test suite, `npm test`, every expected value checkable with a pencil.

**How the interaction worked:** the tutor uploaded his own copy of *The Intelligent Investor* (the 2003 revision, his original paperback), the 1940 *Security Analysis*, and his notes on the 75th-anniversary edition, with one line of context that shaped the phase: the students are savers moving ten thousand euro, growing to fifty, from deposits toward evidence, and "the West Cork farmer does not care where he makes his money." Every page reference in the lessons is to that copy, with the chapter beside it for anyone holding a different printing.

**What went wrong.** The AI said "expect 25 tests"; the tutor's machine said **9**. The AI had counted a file that never left its sandbox. Then the AI said the robot's test doorbell had moved because the tutor had upgraded his tooling; the tutor's screen showed he hadn't. The AI had read its own version number and pinned it on the tutor's machine. Twice in a morning the tutor's screen corrected the AI's assumptions, and twice the guides were amended. Then a prompt reappeared that the AI had twice theorised a permanent fix for, and a rule was adopted on the spot: *no third guess; locate it.* Two read-only commands settled it in a minute.

**The moment that was not a fault.** The tutor rang the robot's doorbell, saw "Ran scheduled event," and reported "did not seem to fetch." It had; the doorbell acknowledges the press, and the rounds take a minute. The robot's diary (the log table built in week 3 for exactly this) showed twenty-four companies' books already in. Two rows deserve a frame: Alphabet's dividend record held **10** payments and Meta's **11**, while Coca-Cola's hit the sixty-row cap. Nobody told the toolkit those two began paying dividends in 2024. The data said so, unprompted. That is what a record is for.

*Jargon you now own:* **the books**, **a ratio**, **the dash that tells the truth**.

---

## Week 5 — Graham's checklist, the second reader, and zero (12 Oct)

**What got built:** the screen. Graham's seven tests for the defensive investor (*The Intelligent Investor*, chapter 14) run over every company's books after every nightly close: size, financial strength, years without a loss, a long dividend record, earnings growth, and two price tests (no more than 15 times average earnings; no more than 1½ times book value). Four tests were adapted to the five years of accounts we hold, and the adaptations are printed on the **checklist card** beside Graham's originals. The card is generated from the same table of rules the screen runs, so the two cannot disagree. Hover any ✓ or ✗ and the numbers behind it appear.

**The second reader.** The tutor asked whether this week deserved "more firepower"; the AI's answer was *review yes, rebuild no*, because a tested build should not be swapped for an untested one. The tutor's reply is now the project's house rule: **"In my world, I always require an independent review."** A reviewer who had not written the code read chapter 14 from the tutor's PDF, read the *shipped* files rather than the sandbox copy, wrote eight probe cases to confirm each suspicion, and reported **fourteen findings before changing a line**. Three had to be fixed: a company with *negative* book value was marked "not screenable" instead of failing the book-value test (McDonald's, Home Depot, Starbucks and Boeing all report negative equity, so this was live); the books page and the screen computed P/E differently, breaking the "cannot disagree" promise; and banks were being excused a test on the basis of missing data rather than Graham's own words. The reviewer also showed that the growth hurdle the card called "the same pace as Graham" was not: faithfully converted to our window it is about 13%, not 9%. **The human made the decisions:** 9% stays, with the card reworded and the 13% recorded beside it; and "if it passes, it passes": a bank that meets every test Graham would apply to it is a survivor, scored out of six, not a question mark. Findings, decisions, patch, re-test, in that order. The record is in `docs/reviews/`.

**The result: zero.** No company survived. The tutor, verbatim: *"no tips here, only real data!"* Every company failed both price tests, which is the market being expensive, not the tests being old: chapter 14 also gives a looser price rule tied to bond yields, and most of the list fails that too. Before the zero was accepted, one check that could have faked it was run: had the dividend history been stored oldest-first, every long-standing payer would have failed the dividend test silently. Coca-Cola showed a dividend in every year. The zero stood.

**The second speeding ticket.** The screen's footer read "Universe 31; 21 with books," a week after the robot should have fetched all 31. The status query read like a diary: each night six companies' books arrived, the seventh came in half-finished, and the rest were marked "blocked by the supplier." Three nights, same pattern, alphabetical. *A paywall does not work alphabetically.* The cause was the landlord's other meter: a free Worker may make **50 outside calls per run**, and the robot's single nightly run made 67. Call 51 failed at the same point every night, and the AI's own code had filed that failure under "paywall" instead of "try again tomorrow." The fix split the night into two alarms (prices at 22:30, accounts at 22:50), gave the robot a call budget it counts itself, and made the rule that a passing error can never mark a company blocked. Both design flaws this phase, the index and the single run, were the AI's. Both were found by reading the diary, not by watching the screen.

*Jargon you now own:* **a screen**, **survivor / near miss**, **an independent review**, **a decision log** (the tutor's two decisions are in it, alternatives recorded, so nobody can later say a choice was hidden).

---

## Between the weeks — the hunt for a bigger list (13–17 Oct)

Zero survivors among 31 household names raised the obvious question: is the list the problem? Graham's "enterprising investor" (chapter 15) looked for *small, dull* companies nobody follows, and our 31 were the opposite. So the week-3 probing instrument was pointed at **144 candidates** over several days, inside the supplier's daily ration. The answer was clear and uncomfortable: 38 served, and of the **52 small companies** on the list, **none**. The free plan is not a sample of the market; it is a list of famous names. The universe was fixed at 38. Finding the small companies Graham meant became a separate build, with a second data source for prices and accounts and the regulator's own filings archive (free, no key) as the audit trail, both verified against the companies' annual reports. That build is next.

**The AI's memory was a year out of date, and the filing caught it.** For that verification the AI wrote down the "expected" figures for a small furniture company from memory. The tutor filled in the form from the company's actual filing, and the numbers disagreed: the company had published a newer annual report in September 2026, after the AI's knowledge ends. The record was right; the AI was a year behind. It happened again in week 6, about the AI's own supplier. *When was this true?* is a question to ask of every number, whoever gives it to you.

**The instrument had a bug, and the evidence file showed it.** The probe had stopped early to stay inside its budget and skipped the step that fetches each company's name and sector, so Citigroup was briefly scored as an industrial company. Fixed, re-run, re-published. Evidence files are for finding this.

Also in those days: Ford's 2020–21 dividend suspension had read as unbroken because the test counted *years with a payment*; "uninterrupted" now means no gap over fifteen months. And Graham's second checklist, the enterprising screen, went live beside the first: stricter on price (nine times earnings or less; under 120% of *tangible* book), looser on everything else. On its first run, **37 of 38 failed the first test and 38 of 38 failed the tangible-book test.** Not one company in our pool is priced within 120% of what you could actually touch. AT&T got through the first cut alone and failed three others. Wells Fargo became the defensive screen's first near miss, five tests of six.

A class question went on the record the same week. *Why not just use Yahoo Finance, or pay, if we're not getting survivors?* Because a paid feed gives the same accounts for the same companies and the same zero; Yahoo will show you a P/E but not how it was calculated, and Graham's tests are all in the *how*. The tutor's close on the follow-up about scaling up: *let's get it right first; no point in scaling a faulty engine.*

---

## Week 6 — Numbers into narrative, and the room checks the machine (19 Oct)

**What got built:** "Explain this stock." For any company the toolkit builds a numbered **fact sheet**: the books as numbers, both screens' verdicts, one fact per failed test, and *bars*, the price at which each failed price test would pass, stated plainly as where the test sits and not what the share is worth. Claude is given that sheet **and nothing else** and told, in binding terms: use only these facts; tag every paragraph with the fact numbers it rests on; never recommend; 140–220 words. Then the toolkit **checks the answer**: any number not on a cited fact, any fact number that doesn't exist, any advice-shaped phrase. Invented numbers are flagged on the page; advice is rejected and the course's own template sentences served instead. One story per company per data-day, kept in the notebook; a daily cap; a receipt for every call. Take the AI key away and the page still works, in plainer words.

**The key, and a slip.** This was the week the project acquired its first bill: an account with the AI's maker, separate from the tutor's ordinary subscription and on pre-paid credit, so the worst case is bounded. While storing the key in the landlord's vault the tutor pasted it into the wrong box, the *name* field, so the vault listed it by name. He noticed within minutes; the entry was deleted, the key revoked and a new one issued inside the hour, and the incident is in the log. The rule is week 2's: *a secret that has been on a screen is no longer a secret.* The response, not the slip, is the lesson.

**Three calls to a first page.** 12:03 UTC: the AI's maker refused the request, because a setting the AI had included is no longer accepted for current models. 12:10: the answer came back cut off, because current models now *think* before answering by default and the thinking had used up the word budget. 12:21: the first clean page, for Nvidia: 2,450 tokens in, 564 out, five seconds, every number traced, no advice. Eighteen minutes and two patches, and the cause both times was the furniture company's again: **the AI's knowledge of its own supplier's rules was out of date, and the error messages were current.** Each failed attempt served the plain version with the reason printed on it, which is what it was built to do. All three receipts are in the diary.

**The ledger balanced; the auditor got audited.** The verification check counted stories in the notebook against receipts in the diary: four stories, four success receipts, two failure receipts for the two failed attempts. Everything accounted for. But it had asked for five companies and found four. The tutor had marked the fifth page as passed because its *kinds of fail* were right, and the kinds come from the fact sheet, which is computed before any AI is involved; the story for that page had never been requested. The form was corrected, the page visited, the fifth row appeared. A verification record is itself a record, and can be wrong in the same ways.

**What the room will catch that the machine can't.** The fifth company was Alphabet, and its story opens its second paragraph with *"Four defensive tests fail."* The chip beside it says 4 of 7 passed, so three fail, and the paragraph goes on to name three. The checks passed the page, truthfully: "four" is a word, not a digit, and small counts are excluded from the number check by design. A wrong *word* is the room's job. Lesson 6 sends every pair into an AI-written page with three instructions: *trace* each sentence to its fact, *catch* what the sheet doesn't support, *rewrite* one sentence better. Alphabet's page is one to print.

*[After lesson 6: what the pairs caught, in one paragraph. — tutor to fill in]*

*Jargon you now own:* **a fact sheet**, **a token**, **grounding** (every claim points at a fact you can read), **a receipt** (the diary row that says who was asked, when, at what cost, and what came back).

---

## The scoreboard, six weeks in

- A verified universe of **38** companies with five years of prices *and* accounts, refreshed nightly by a robot with two alarms and two budgets it counts itself
- **Two Graham screens**, a two-page checklist card generated from the same rules, and an "explain this stock" page for every company, written by an AI and checked by the toolkit
- **90 tests** that must pass before anything ships; **15 decisions** in the log; verification records VC-12 to VC-15; one independent review, fourteen findings, all resolved on the record
- **Survivors found: 0. Candidates found: 0.** That is a result, not a failure, and the course would rather report it than fudge it
- Running cost: **€0.00** for everything except the stories, at about **six hundredths of a cent each**: the first non-zero line in the project's ledger
- On the record this phase: two design flaws of the AI's (found by the landlord's meters), two stale memories of the AI's (found by a filing and an error message), one slip of the tutor's (found by him, fixed within the hour), one wrong word in an AI story (found by reading it)

## What the collaboration looked like this time

Phase 1's rhythm held: say what's wanted → a package with an expected result beside every step → run it and paste what actually happened, word for word → diagnose from the evidence → amend the guides. Three things were added.

**The second reader.** A build can pass every one of its own tests and still be wrong in ways its author cannot see, because the tests were written by the same mind. Week 5's review found fourteen such things in an afternoon, and the two that were matters of judgement went to the human. That is now how important weeks ship. It is how the tutor has shipped validated systems for twenty years; the method did not come from the AI.

**The AI's memory got a date stamp.** Twice this phase the AI stated confidently something that had been true a year earlier: a company's accounts, and the rules of its own supplier. Both times the record, not the AI, was right. The course asks you to check every number against its source; that applies to the assistant as much as to the tipster. The AI patched the code and logged the error, which is the correct response from anyone.

**The machine started writing prose, and the room became the last check.** Weeks 4 and 5 produced numbers, which can be reconciled. Week 6 produces sentences, which can only be *read*. The toolkit catches invented numbers and advice; it cannot catch a wrong word or an invented reason, and it says so on the page. Nobody leaves their brain or autonomy at the door: not the machine's, and not the tutor's verification form either.

Next: the small companies Graham actually meant, and then Phase 3, rules for *when*, now that Graham has given us rules for *what*.

---

*Everything above is checkable: the code, the tests, the diary, the decision log, the review record and the evidence files are in the repository linked from the site's footer. Education, not advice — nothing in this course or its toolkit is a recommendation to buy or sell anything.*
