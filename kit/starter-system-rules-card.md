# The Starter System — the rules card

**Takeaway kit · Intro to the Stock Market · Phase 3 (weeks 7–9)**

One instrument, one opening rule, one closing rule, one sizing formula, one weekly routine. Robert Carver's Starter System (*Leveraged Trading*, 2019), run by the course on ordinary US shares with no leverage, in a paper account. The toolkit runs exactly these rules from one table (`src/lib/signals.ts`, `src/lib/sizing.ts`); the card and the site cannot disagree. Where the book leaves a choice, the course's number is marked **(course)** — decisions 17–19 in the syllabus.

## 1 · The opening rule — *when*

- Two averages of the adjusted close: **16-day** and **64-day** exponentially weighted (λ = 2/17 and 2/65).
- **Forecast** = 3.75 × (fast − slow) ÷ σ of daily price changes (35-day), capped at ±20.
- **LONG** when the forecast is above zero; **FLAT** otherwise. No shorts. The rule opens; you don't.
- The rule needs 128 closes before it is trusted ("warming up" on the signals page).

## 2 · The risk target — *how much the account should move*

- **12% a year** — the account's volatility, not a return. Carver's number for the Starter System.
- A share that moves 24% a year gets half the account; one that moves 6% gets all of it and the account accepts 6% (no leverage: exposure never exceeds the account).

## 3 · Position sizing — *how many*

```
target exposure = account × 12 ÷ instrument risk      (capped at the account)
units           = whole shares that fit in it
```
- **Instrument risk** = the share's annualised volatility (the signals page): σ of daily % returns × 16.
- Example: a $10,000 account, Apple at $348.91, instrument risk 18.18% → $6,600.66 → **18 shares** ($6,280.38; 62.8% of the account; carrying 11.42% a year).
- You may hold fewer shares than the rule's size, never more. The size does not change with the forecast's strength — a fixed position while the rule is on (Carver's full system scales it by the forecast; not in the course).

## 4 · The closing rule — *the stop*

```
stop gap   = ½ × instrument risk × entry price        (fixed on the day you enter)
stop level = highest close since entry − stop gap     (only ever rises)
```
- A close **at or below** the stop closes the position: at the next decision, with a ticket and a journal line. The tracker stamps it in red on your page the night it happens.
- The rule's flip to FLAT does not close a position; the stop does.
- After a close — the stop's or your own — no re-entry on the same signal: the rule must go flat and then long again (a fresh crossover on or after the day you closed) first **(course)**.
- Example: Apple entered at $348.91 → gap $31.72 → first stop $317.19; after a $360 close the stop is $328.28.

## 5 · Costs and the smallest account **(course)**

- A trade costs **$2 + 0.25%** of its value (a cheap broker plus the currency conversion). The paper account is in dollars, the shares' currency.
- A position whose **round trip costs more than 1%** of it is too small to trade: the calculator refuses and names the minimum account — counted in whole shares (Apple at 18.18% risk and $348.91: three shares must fit, so $1,586). Nothing is wrong with the company; the account is too small for the share.
- Whole shares only. Cash equities only. Long only. Leverage factor 1.

## 6 · The weekly routine — *Monday evening, five minutes*

1. `/signals` — the rule for your instrument on the latest close.
2. Your page, `/tickets/<code>` — the stop, the distance to it, the stamp if it was hit.
3. The journal — what the rule said, what you will do, why. **Every week, even when the answer is "nothing".**
4. (Maybe) a ticket — open at the rule's size when the rule is long and you hold nothing; close the whole position when the stop was hit. Fills at the latest close the toolkit holds (the decision close).

## 7 · What the ticket will refuse, and why

| It says | Because |
|---|---|
| "The rule opens, you don't" | the rule is FLAT or warming up for that share tonight |
| "Oversized" | you asked for more than the rule's size — with the arithmetic |
| "You already hold …" | one position per instrument |
| "Wait for a fresh crossover" | the rule has been long since before your last close |
| "Not enough cash" | open positions and their costs come first |
| "The journal entry is the ticket" | a blank reason is not a decision |
| "Needs a paper account of at least …" | one share must fit and the round trip must clear 1% |
| "No tickets until week 9" | the small-cap tier is warming up and not yet split-adjusted |

---

*We grade decisions, not outcomes. Education, not advice: a size is what a rule would hold in a paper account; nothing on this card is a recommendation to buy or sell anything.*
