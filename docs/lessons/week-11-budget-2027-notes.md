# Week 11 groundwork — Budget 2027 (announced 6 Oct 2026) and the Finance (No. 2) Bill 2026 (published 19 Oct 2026)

**Status: verified against the Bill as published, 12 Nov 2026 — a Bill, not an Act.** The 6 Oct notes below were re-read against the Finance (No. 2) Bill 2026 (published 19 October 2026) through the professional firms' summaries of it (Arthur Cox, PwC, BDO, Dillon Eustace, Forvis Mazars, Grant Thornton), the Irish Times' Budget main points, Revenue's CGT pages, and etf.ie's dated tax guide (21 Oct 2026). The Bill is expected to pass in December 2026; the account needs a commencement order. **Re-verify every figure against the enacted Finance Act and Revenue's guidance before week 11 is taught, and again before anyone acts on one.** The figures the toolkit uses are in `src/lib/costs.ts` (`TAX_RULES`, with `checkedOn` and a `basis` of "Bill" or "current" on every rule).

## The new account — the Individual Investment Account (the Bill's name; "Personal Investment Account" in the speech)

| Feature | As announced (6 Oct) | As drafted in the Bill (19 Oct) |
|---|---|---|
| Opens | 1 July 2027 (pending legislation) | expected 1 July 2027, **on a commencement order** by the Minister |
| Who | 18+, Irish resident, PPS number; one account per person | the same; multiple accounts "to be considered in future years" |
| Annual contribution limit | €12,000 | €12,000, no minimum; a €3,000 penalty on the provider for an excess contribution without reasonable excuse |
| Tax-free threshold | €50,000 account balance | €50,000 |
| Above the threshold | 1% on the excess | **1% a year on the average daily value above €50,000** (the "investment account tax", a final liability); calculated by the provider each **31 December**, reported to Revenue by **31 March**, paid and deducted from the account by **14 April**; the holder files nothing. A fall in value can still leave tax payable if the daily average exceeded the threshold |
| Inside | no CGT, no DWT, no exit tax, no deemed disposal | the same: income, profits and gains from eligible assets exempt from other Irish tax; the 1% levy on insurance premiums disapplied inside |
| Eligible | listed shares, listed bonds, regulated-market instruments, retail funds, ETFs | listed shares and bonds, UCITS funds (ETFs among them), insurance-based investment products |
| Excluded | derivatives, crypto, complex products | not covered by the summaries read; assume the same |
| Flexibility | no minimum holding period, no lock-in; transfers between providers | transfers between qualifying providers; the receiving provider accountable for the year's tax after a mid-year transfer |
| Providers | — | MiFID firms, fund managers, banks and insurers that register with Revenue; a Revenue register of providers to be published; non-EU EEA providers need a contract with Revenue or an Irish responsible person |
| Model | Sweden's ISK, not the UK ISA | — |

## The other Budget lines, as confirmed

- **CGT on shares outside the account: 33% → 31% for disposals on or after 7 October 2026** (Budget night; "disposals made after October 7th" in the main points — the course treats a disposal on 7 October as the first at 31%, as the dated guide does). The €1,270 annual exemption, the loss rules and the payment dates (15 December / 31 January; the return by 31 October of the following year) are unchanged.
- **The exit tax on funds, ETFs and life products: 38% in 2026 (Budget 2026 cut it from 41% on 1 Jan 2026); 35% from 1 January 2027** as announced and drafted (the summaries cite sections 28, 29 and 36 of the Bill; a new section 739DA gives Irish ETFs held through a clearing system the same rate). Tax falling due before 1 Jan 2027 — a sale or an eighth anniversary — stays at 38%.
- **Deemed disposal: kept** for funds held outside the account (no change in the Bill); none inside it.
- CAT thresholds raised (Group A €420,000 / B €44,000 / C €22,000, from 7 October) — background only.
- Nothing in the summaries on stamp duty on shares or on dividend taxation: both current (1% Irish, 0.5% UK, none on US shares; dividends as income with the treaty withholding).

## Why this matters for our students (unchanged)

1. **It is built for exactly this room.** The policy target is about €170bn of deposits "sitting idle". The course audience is savers moving to investing with roughly €10k, growing to roughly €50k — the tax-free ceiling.
2. **The contribution cap sets the pace.** €12k a year means a €10k start fits in year one; €50k in the account takes at least five years of contributions.
3. **It removes the worst Irish ETF frictions** (exit tax, the eight-year deemed disposal) *inside the wrapper*. The week-11 worksheet shows the same gain three ways for that reason.
4. **It suits systematic management** (Carver, weeks 7–9): with no CGT on each closed trade and no lock-in, rule-based trading has no tax drag inside the wrapper. Trading costs and spreads still apply, so the week-2 cost ledger still counts.
5. **It is a balance tax, not a gains tax.** Tax on what you *hold*, not on what you *gain* — a new idea for most students, and a CORE link (Macro Unit 10, government as economic actor).

## The open questions — where they stand (12 Nov 2026)

- [x] Is the 1% **annual**, and on what valuation date? — **Yes: annual, on the average daily value over the calendar year, calculated at 31 December.**
- [ ] **Are non-EU-listed (US) shares eligible?** — **Not settled by the Bill's text as summarised** ("listed shares" without the markets named). For the Act and Revenue's guidance; the worksheet and the lesson say so. Our cached universe is US-listed, so this is the question that matters most to the room.
- [ ] Treatment of **foreign withholding tax** on US dividends inside the account — **not settled** (the exemption cited is from Irish tax; a treaty withholding is the US's).
- [ ] Which **providers** will offer it, and whether DEGIRO will — **unknown**; Revenue's register of providers is to come. The kit's DEGIRO walkthrough stands on its own.
- [x] Commencement date of the 31% CGT rate — **7 October 2026** (disposals on or after).
- [x] Any change to exit tax or deemed disposal **outside** the account — **the rate to 35% from 1 January 2027; the deemed disposal unchanged.**

## The toolkit feature — built (week 11)

The "wrapper toggle" became `/costs` (`src/lib/costs.ts`): the same paper trade priced in euro — the trade's costs on a published schedule beside the course's $2 + 0.25% model, the holding's costs, and the gain taxed three ways — (a) shares outside at 31% CGT above the €1,270 exemption; (b) a fund or ETF outside at the exit tax (38% in 2026, 35% from 2027) with the eighth-year deemed disposal; (c) inside the account at 0 below a €50,000 average balance and 1% on the excess. Every rate with its date and its basis; the page prints "as checked on" and marks the Bill's lines. When the Act is law, `TAX_RULES.checkedOn` and the `basis` fields change and the page follows.

## Holding line (now for the lesson itself)

> "From July 2027 a new Individual Investment Account would let you hold listed shares and funds with nothing charged below a €50,000 balance and 1% a year on what sits above it. The Bill is published; it is not yet law. The worksheet prices it beside the two existing regimes — and it changes *where* you hold investments, not *how* we choose them."
