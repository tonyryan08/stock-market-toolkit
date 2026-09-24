# API Keys, Step by Step — the fully explicit edition

An API key is a long code that identifies *you* to a data service — an ID badge for software. This project needs two, both free, and each key ends up living in exactly **two places**: a local file on your machine (for `npm run dev`) and Cloudflare's credential vault (for the live site). Nowhere else, ever — not in the code, not on GitHub.

Total time from nothing: **~15 minutes.** Every step has an expected result. If you see it, proceed; if not, jump to "If something goes sideways" at the bottom.

---

## First: find out where you stand (2 min)

You may have done some of this already. These four checks tell you exactly where to start — run them in order.

**Check 0 — right folder.** Open a terminal in the project folder and run `dir`. **Expected:** the listing includes `package.json`. If not, `cd C:\Dev\stock-market-toolkit` first. (Every command in this guide assumes you're here.)

**Check 1 — local file.** Run:

```
dir .dev.vars*
```

- Shows **only** `.dev.vars.example` → local keys are **not** configured. That's what your 503 means. You need Parts 1–4.
- Shows `.dev.vars` as well → open it (`notepad .dev.vars`): if it still says `paste-yours-here`, you need Parts 1–4; if real codes are in there, skip to Part 4 to prove they work.
- Shows `.dev.vars.txt` → Notepad played its favourite trick; run `ren .dev.vars.txt .dev.vars`, then check its contents as above.

**Check 2 — production vault.** Run:

```
npx wrangler secret list
```

- **Expected if unconfigured:** an empty list — `[]` or no entries. You'll need Part 5 after the local part works.
- Shows entries named `ALPHAVANTAGE_API_KEY` and `FMP_API_KEY` → production is already done; skip Part 5.
- Errors about not being logged in → run `npx wrangler login` (browser opens, click Allow), then rerun.

**Check 3 — do I already have provider accounts?** Search your email inbox for **"Alpha Vantage"** and for **"Financial Modeling Prep"**. Old signup emails mean you may already own keys — the Parts below say what to do in that case.

Most likely position given the 503: nothing configured anywhere → start at Part 1.

---

## Part 1 — Get the Alpha Vantage key (~3 min)

1. In your browser: **alphavantage.co/support/#api-key**
2. Fill in the short claim form (who you are, email) and submit.
3. **Expected result:** your key appears **right there on the page** — a short code of capital letters and digits.
4. **Copy it immediately** into a safe note (password manager, or a private note you keep — this note is your master copy for both keys).

*Already claimed one before?* Submit the form again with the same email — it will tell you, and your original key will be in the old email from Check 3. One key per person is all you ever need.

---

## Part 2 — Get the Financial Modeling Prep key (~5 min)

1. In your browser: **site.financialmodelingprep.com** → **Sign Up** (top right).
2. Register (email + password, or the Google button). Verify your email if asked. The **free plan is the default** — no card, and decline any trial upsell.
3. Log in → open your **Dashboard**. **Expected result:** your API key displayed prominently, usually with a copy button — a longer jumble of letters and digits.
4. Copy it into the same safe note.

*Think you already registered?* Use **Forgot password** with your likely email: a reset email arrives if the account exists; nothing arrives, sign up fresh.

**Checkpoint:** your safe note now holds two labelled keys. Everything after this is just delivering them to the two places that need them.

---

## Part 3 — Put both keys in the LOCAL file (~3 min)

This file feeds `npm run dev` only. It never leaves your machine.

1. If the dev server is running, stop it: click into that terminal, press **Ctrl+C**.
2. In the terminal (project folder — Check 0):

```
copy .dev.vars.example .dev.vars
notepad .dev.vars
```

Copy-then-edit matters: because the file already exists when Notepad opens it, saving keeps the correct name — the infamous invisible-`.txt` trap can't fire.

3. In Notepad, replace **both** `paste-yours-here` placeholders with your real keys, keeping the quotes. Before and after, with a fake key for shape:

```
Before:   ALPHAVANTAGE_API_KEY = "paste-yours-here"
After:    ALPHAVANTAGE_API_KEY = "AB12CD34EF56GH78"
```

Same for the `FMP_API_KEY` line. One key per line, inside the quotes, nothing else changed. (Careful pasting: the line should end up with exactly one pair of quotes — `""AB12..."` means you pasted quotes into quotes.)

4. **Ctrl+S**, close Notepad.
5. Verify the filename:

```
dir .dev.vars*
```

**Expected result:** exactly two files — `.dev.vars` and `.dev.vars.example`.

6. **Privacy proof:** open GitHub Desktop. **Expected result:** `.dev.vars` does **not** appear in the changes list — `.gitignore` is keeping your keys out of the record. (`.dev.vars.example` may appear; that's fine — it holds only placeholders.) If the real file ever shows up there, stop and shout before committing anything.

---

## Part 4 — Prove it works locally (~2 min)

Keys are read at startup, so the restart is mandatory.

1. `npm run dev`
2. Browser: **http://localhost:8787/api/quote/AAPL**

Three possible outcomes:

| You see | Meaning | Do |
|---|---|---|
| JSON with a filled `price` block and `company` block | **Done.** That's verification checks VC-01 and VC-03 passed in one shot | Carry on to Part 5 |
| The 503 "API keys are not configured" again | The file isn't being found — almost always the name | Rerun Part 3 step 5; then confirm you restarted the server |
| JSON with a `warnings` array | The keys arrived but a *provider* objected — wrong key, typo, or coverage | Read the warning: it names which provider and why. Re-paste that key carefully; if it persists, report the exact wording back |

---

## Part 5 — Put both keys in PRODUCTION (~3 min)

Your machine and the live site are separate instances, and each holds its own copy of the credentials. `.dev.vars` stays home; the deployed Worker reads from Cloudflare's encrypted vault instead. Two commands fill it:

1. In the terminal:

```
npx wrangler secret put ALPHAVANTAGE_API_KEY
```

It prompts for the value. **Paste the key and press Enter — the input stays invisible while you paste.** That's deliberate (it's a secret); trust the paste. **Expected result:** a success message about the secret being created/uploaded.

2. Again for the second key:

```
npx wrangler secret put FMP_API_KEY
```

3. Release the site so it picks them up:

```
npm run deploy
```

4. **The real test:** on your phone, open the live `workers.dev` URL and look up `AAPL` with the form. **Expected result:** the same populated JSON as Part 4.
5. Confirm the vault: `npx wrangler secret list` now shows both names (never the values — that's the point of a vault).

---

## The map: where the keys live

| Place | Holds real keys? | How to check |
|---|---|---|
| Your safe note / password manager | **Yes — the master copy** | You put them there in Parts 1–2 |
| `.dev.vars` (local machine only) | **Yes** — feeds `npm run dev` | `dir .dev.vars*` + open it |
| Cloudflare secrets vault | **Yes** — feeds the live site | `npx wrangler secret list` (names only) |
| `.dev.vars.example` | **Never** — placeholders only | Open it: `paste-yours-here` |
| GitHub / anything committed | **Never** | Desktop's changes list never shows `.dev.vars` |

---

## If something goes sideways

| Symptom | Fix |
|---|---|
| Still 503 after Part 3 | It's the filename or the missing restart, in that order: `dir .dev.vars*` must show exactly `.dev.vars`; then Ctrl+C and `npm run dev` again. |
| `.dev.vars.txt` keeps appearing | You created the file from inside Notepad. Delete it and use the `copy` command in Part 3 — copy first, edit second. |
| Warning says the key was rejected | Re-open `notepad .dev.vars`: exactly one pair of quotes per line, no spaces inside them, whole key pasted (they're easy to half-select). |
| `wrangler secret put` says not logged in | `npx wrangler login`, click Allow in the browser, retry. |
| Live site works but localhost doesn't (or vice versa) | Remember: two instances, two copies. Localhost reads `.dev.vars`; the live site reads the vault. Fix the one that's failing. |
| It worked yesterday, warnings today | Probably the daily ration (Alpha Vantage ≈ 25 lookups/day). The warning text says so. It resets daily — and it's week 3's whole reason to exist. |
