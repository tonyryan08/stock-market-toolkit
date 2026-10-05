# The Idiot's Guide to How We Built It — Phase 1

**Weeks 1–3 of the toolkit, explained for everyone · Intro to the Stock Market**

This is the story of how the course website got built, written for people who have never written a line of code and don't intend to start. It documents a real collaboration: a tutor whose last programming was done on punch-card-adjacent equipment in the 1980s, and Claude, an AI, doing the designing and the code-writing — with every step checked by a human before it was trusted, every mistake kept on the record, and the whole thing in public.

Why tell you this? Because this course has one rule — **we grade decisions, not outcomes** — and the fairest way to prove we mean it is to show you our own decisions, including the ones that went sideways. Nothing below is cleaned up to look clever.

*(If you're the rare student who wants to actually build this yourself: this is not that document — see `docs/setup-guide.md`, the builder's manual. This one explains; that one instructs.)*

---

## The cast, in plain words

| Thing | What it actually is |
|---|---|
| **The toolkit / "the Worker"** | A small program that lives in Cloudflare's datacentres and answers your browser when you open the course site |
| **Cloudflare** | The landlord — rents out space for programs like ours (our usage level: free) |
| **GitHub** | A public filing cabinet for the code — every version ever, who changed what and when, readable by anyone, no account needed |
| **GitHub Desktop** | The filing clerk — a friendly app for putting changes into the cabinet |
| **The terminal** | A keyboard-only control room. Looks like 1985. Still how serious work gets done |
| **A database (ours is called D1)** | The notebook where the toolkit writes things down so it doesn't have to ask the internet twice |
| **A cron job** | An alarm clock for programs — "wake up at 23:30 and do your chores" |
| **An API** | A service hatch on a company's wall: knock properly, get data back |
| **An API key** | The ID badge you show at the hatch. Free ones come with strict rations |
| **Claude** | The AI collaborator. Designs, writes code, explains, diagnoses — and gets checked |

**The division of labour, all three weeks:** the human decided *what* and verified *everything*; the AI produced *how* and explained *why*; nothing went live on trust alone. If that sounds like the relationship this course wants you to have with any financial product — yes. That's the point.

---

## Week 1 — One page, one button (on purpose)

**What got built:** the course site you've seen — the twelve-week ledger with its red SHIPPED stamps — plus exactly one piece of machinery: an address that returns a one-line greeting. That's all. The smallness was deliberate: the site's own page admits what exists and what doesn't yet, and a new capability gets stamped in each week. A system that shows you its own progress honestly, from day one.

**How the interaction worked:** the tutor described the course in plain English — paper portfolios, no tips, process over outcomes. Claude turned that into a twelve-week plan where every lesson is powered by a feature built that same week. Each decision (and there were many: which data suppliers, what gets built when, what students take home) went into a written **decision log** — so later, nobody argues about what was agreed; they read it.

**What went wrong — the filing cabinet fought back.** Getting the code into GitHub the first time failed, twice, in different ways. A command run in the wrong folder tried to file the tutor's *entire computer*. A rescue attempt created two filing cabinets with similar names. At one point the working folder was accidentally deleted entirely — and came back from the Recycle Bin, intact. The real lesson sits underneath the comedy: **the public copy on GitHub meant nothing could be truly lost.** The backup worked because it existed *before* it was needed. (You will hear this course say exactly the same about emergency funds.)

**Jargon you now own:** *deploy* — copy the program to the landlord so the world can see it. *Commit and push* — file your changes in the public cabinet. In this project, push = backup, deploy = release, and every working session ends with a push. House rule, learned the hard way.

---

## Week 2 — Live prices, and what "free" really costs

**What got built:** the quote lookup — type AAPL, get back a real price and company profile. Under the lid, the toolkit knocks on **two** service hatches at once (one supplies prices, the other company information), and if either refuses, it tells you so in a `warnings` note instead of pretending. Every answer also admits `"delayed": true`. The toolkit tells the truth about its own data — hold everything you meet after this course to that standard.

**The ration book:** the free price hatch allows roughly **25 knocks a day** — for the whole class. That's not a flaw we hid; it became the lesson. Fresh market data is a product; immediacy is what costs; and if 25 looks a day feels limiting, ask what you'd actually *do* with more. (One student asked "why not fetch everything once at night and remember it?" — hold that thought.)

**The ID badge saga.** The two API keys had to be placed in two sealed locations — one on the tutor's machine, one in Cloudflare's vault — and *never* in the public filing cabinet. The vault's entry prompt hides what you type (sensible) — and Windows mangled the hidden paste (not sensible), so the keys kept arriving corrupted. The prescribed fixes failed. What worked: **typing the key in by hand, character by character.** The dumbest fix won, and it won because the tutor isolated one variable at a time — which is literally this course's method, applied to a password box.

**The accidental security find.** While testing the rationing, the price supplier's "you've hit your limit" message turned out to **echo the secret key back** inside its own text — and our code was repeating supplier messages word-for-word to anyone looking. A public page quietly leaking a credential. It was found *because* we deliberately ran into our own limits, and fixed the same day: the toolkit now scrubs keys out of anything it repeats. Remember the week-6 maxim early: good systems fail honestly; scams never fail well. Now add: *and testing your failures is how you find your leaks.*

---

## Week 3 — The nightly robot, and the whitelist surprise

**What got built:** the student's idea from week 2, made real. Every night at 23:30 Irish time, a robot wakes, visits every company on the course list, writes down the closing price in the notebook, and goes back to sleep. Your charts — five years deep, adjusted so splits and dividends don't paint fake crashes — are served from that notebook. The week-2 lookup took most of a second and burned ration; the notebook answers in about **nine thousandths of a second** and burns nothing. Same data. The difference is somebody wrote it down.

**Then the data supplier surprised us.** We'd assumed the free plan covered US companies. Test it, though — this project tests everything — and the results refused to behave: Pfizer's accounts, free; Merck's, refused. Visa free; Mastercard refused. Eli Lilly — one of the largest companies on Earth — refused, while Delta Air Lines sailed through. No rule by size, sector, or nationality. The free tier is a **whitelist**: an arbitrary members' list that cannot be deduced, only discovered.

**What do you do when guessing stops working? You measure.** Claude built a small instrument that knocks on the hatch for all 48 candidate companies and records who answers: **31 green, 17 refused**, every result published in the repo as `scripts/universe-verified.json`. Those 31 *are* the course universe — not the companies we fancied, the companies we *verified*. One refused company (Devon Energy) is kept on the test list forever as the control — the known-refusal that proves the instrument still works each time it runs. Hypothesis → test → hypothesis dies → measure instead → publish the evidence. That is the entire course, performed by its own plumbing.

**The robot keeps a diary.** Every nightly visit — success, refusal, limit hit — is written to a log table anyone can audit. When this course tells you to trust systems that record their own failures and distrust ones that only ever report wins, the toolkit will already have been doing it for weeks.

---

## The scoreboard, three weeks in

- A live site, growing one stamped capability per week, in public
- A verified 31-company universe with five years of adjusted daily history
- A robot that refreshes it nightly, budgets itself, and logs its own behaviour
- Running cost: **€0.00** — free tiers, deliberately, because their limits taught half the lessons
- A public record of every decision, every error, and every fix — this document included

## What the collaboration actually looked like

The rhythm, every session: the human says what's wanted → the AI ships a package with an **expected result written beside every step** → the human executes and, when something breaks, **pastes the error word-for-word** (never a paraphrase — the exact wording *is* the diagnosis) → the AI reads the evidence and adjusts → the written guides get amended so the next person never hits that pothole. The AI was wrong sometimes — a wrong command flag here, misplaced confidence in a paste there. It didn't matter much, because nothing was trusted until verified, and evidence settled every argument. The human never got faster at typing; the human got better at *judging*. That trade is available to you too, and not just for software.

---

*Everything above is checkable: the code, the logs, the decision record and the evidence files are in the repository linked from the site's footer. Education, not advice — nothing in this course or its toolkit is a recommendation to buy or sell anything.*
