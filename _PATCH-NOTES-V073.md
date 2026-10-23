# Patch v0.7.3 — the open question, once (cosmetic)

**Don't commit this file.** Apply *after* the week-6 commit, so what is committed as v0.7.2 is exactly what VC-15 verified.

## What

On the first live NVDA page the model put its open question at the end of the last paragraph *and* in the `question` field, so the page showed it twice. Prompt rule 6 said "End with one open question", which reads as "end the text with". It now says the question goes in the `question` field only and the paragraphs contain no question. One sentence in the system prompt; no code path changes; one test assertion added so the rule cannot be lost in a later edit.

Cached narratives are keyed by the fact sheet, not the prompt, so NVDA's cached story keeps the duplicate until its sheet changes — which is the next trading day's close. Every company visited after the deploy, or revisited after tonight's prices, gets the single question. For the six printed pages: do the evening-before pre-check *after* applying this.

**Changed:** `src/lib/narrative.ts` (rule 6) · `src/lib/narrative.test.ts` (+1 assertion, still 9 tests) · `package.json` (0.7.3)

## Apply

1. Commit week 6 first (v0.7.2) → push.
2. Extract over `C:\Dev\stock-market-toolkit`. `npm test` → **90 passed**.
3. `npm run deploy`.
4. Open `/explain/MSFT` (not yet cached): one open question, under "The open question", none in the paragraphs.
5. Commit *"v0.7.3: open question in the question field only"* → push.

## Record line

```markdown
19 Oct — v0.7.3: prompt rule 6 reworded; the question appeared twice on the first live page (paragraph and field). Cosmetic; no code change; takes effect per company as its fact sheet changes (next close).
```
