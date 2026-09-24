# Builder's Setup Guide: From Zip to Live

> **Who this is for: the course tutor, and anyone forking this repo to run the course themselves.**
>
> **Students need none of this.** No Node, no Git, no GitHub, no installs of any kind. Students need a browser and a URL — see [`kit/student-quickstart.md`](../kit/student-quickstart.md). If a student is reading this page, they've been handed the wrong document.

No prior web-development knowledge assumed. Every step has an expected result — if you see it, proceed; if you don't, jump to the troubleshooting table at the bottom.

Honest time estimate: **~45 minutes** from a bare machine, including account creation. Parts 0–D happen **once, ever**. After that the weekly rhythm is Part E, which takes a minute.

Instructions show Windows; where the Mac differs, it's flagged inline.

## Translation table for the MES-minded

| Foreign term | What it is in your world |
|---|---|
| Node.js / npm | The runtime and its package manager — think vendor platform plus a dependency installer that works *per project*, not per machine |
| `package.json` | The project's bill of materials — the spec from which everything else is regenerated |
| `node_modules/` | The installed vendor libraries. Never shipped, never version-controlled — always regenerable from the spec |
| `localhost:8787` | Your dev instance. Exists only on your machine; nothing is public yet |
| GitHub repository | The controlled document store — full version history, every change attributable |
| Commit / push | Checking your changes into the master record |
| GitHub Actions | The automated deployment pipeline — change control that executes itself |
| Repository "secrets" | The credential vault: encrypted, masked in logs, write-only after saving |
| `wrangler` | Cloudflare's deployment CLI — the tool that moves code from your machine to their edge |
| `…workers.dev` URL | The production instance |

---

## Part 0 — Set up the workshop (one time only, ~15 min)

### 0.1 Install Node.js

Go to **nodejs.org**, click the big **LTS** download, run the installer, accept every default.

**Verify:** open a **new** terminal window — Windows: press Start, type `powershell`, Enter; Mac: open **Terminal** from Applications → Utilities — and run:

```
node --version
```

**Expected result:** a version number of `v20` or higher. If you get *"node is not recognized"*, the terminal was open before the install — close it and open a fresh one.

### 0.2 Install GitHub Desktop

Go to **desktop.github.com**, install, and sign in with your GitHub account when prompted.

This is the recommended route for everything in Part C, and it installs a working Git for you. It is not a lesser path: Desktop, the terminal, and Claude Code all drive the same engine — one `.git` folder inside your project holds the single history, and it doesn't record which hand held the wrench.

Mac users who prefer the terminal, or anyone who wants the command line available for Claude Code later, should also confirm `git --version` returns something, and set their identity once:

```
git config --global user.name "Your Name"
git config --global user.email "your-email@example.com"
```

**Expected result:** no output at all. Silence is success — a Unix tradition you'll get used to.

### 0.3 Create the two accounts (both free)

- **github.com** → Sign up. The free plan is all this project ever needs.
- **dash.cloudflare.com** → Sign up. The Workers free plan covers this entire course; no payment card required.

---

## Part A — Run it on your own machine (~5 min)

### A1. Unzip to a sensible home

Create a folder with **no spaces in its path** — `C:\Dev` on Windows, `~/dev` on Mac — and extract the zip there. You should end up with `C:\Dev\stock-market-toolkit` containing `package.json`, `src`, `docs` and friends. (If you find a `stock-market-toolkit` folder *inside* another one, the extractor double-nested — use the inner one.)

### A2. Open a terminal *in* that folder

```
cd C:\Dev\stock-market-toolkit
```

(Mac: `cd ~/dev/stock-market-toolkit`.) Windows shortcut: in File Explorer, open the folder, right-click empty space → **Open in Terminal**.

**Verify:** `dir` (Windows) or `ls` (Mac) lists `package.json`. **If it doesn't, stop** — every later command assumes you are inside the project folder, and running them elsewhere causes the messiest failures in this guide.

### A3. Install the project's dependencies

```
npm install
```

**Expected result:** a minute or two of progress noise, ending with `added NNN packages` and `found 0 vulnerabilities`. This read the bill of materials and populated `node_modules/` — locally, for this project only.

### A4. Start the dev instance

```
npm run dev
```

**Expected result:** a line containing `Ready on http://localhost:8787`. A prompt about usage metrics or a newer wrangler version can be answered either way / ignored.

### A5. Look at it

Open **http://localhost:8787** — the ledger page, week 1 stamped SHIPPED. Then **http://localhost:8787/api/hello** — the JSON payload. You are now running a Cloudflare Worker on your own machine.

### A6. Stop it

Press **Ctrl+C** in the terminal. The site vanishes — it only ever existed on your machine.

---

## Part B — First deploy, by hand (~5 min)

Prove the pipe manually before automating it.

### B1. Authorise the deployment tool

```
npx wrangler login
```

**Expected result:** your browser opens a Cloudflare page — click **Allow**, return to the terminal, see `Successfully logged in`. (If no browser opens, the terminal prints a URL — paste it in yourself.)

### B2. Deploy

```
npm run deploy
```

First-ever deploy on a new account: wrangler asks you to **register a workers.dev subdomain**. Pick something short — it becomes part of every URL on your account, publicly.

**Expected result:** output ending in a URL like `https://stock-market-toolkit.YOURSUBDOMAIN.workers.dev`.

### B3. The real test

Open that URL **on your phone, on mobile data** — not your wifi. If the ledger loads, it loads for your students. That's the syllabus exit check, passed.

---

## Part C — Put the source on GitHub (~5 min)

**Do this in GitHub Desktop.** It is three clicks, it handles authentication for you, and it sidesteps the entire class of failures that command-line Git throws at newcomers.

1. **File → Add local repository** → choose `C:\Dev\stock-market-toolkit`.
2. If Desktop says it isn't a Git repository yet, accept its offer to **create one**. When it asks for a branch name, use **`main`**.
3. Bottom-left, type a summary: *"Week 1: hello, Worker"* → **Commit to main**.
4. Top bar → **Publish repository**. Name it `stock-market-toolkit` and **untick "Keep this code private"** — the open repo is a course promise.

**Verify:** your repository page on github.com shows `README.md`, `src/`, `docs/`, `kit/`, and friends. Note that `node_modules` is *absent* — `.gitignore` excludes it by design. The spec travels; the regenerable libraries don't.

<details>
<summary><strong>If you prefer the command line</strong> (or want it working for Claude Code later)</summary>

Create the empty repository first on github.com: **+** → **New repository** → name it → **Public** → leave every "initialize with…" box **unticked** → Create.

Then, from inside the project folder:

```
git init -b main
git add .
git commit -m "Week 1: hello, Worker"
git remote add origin https://github.com/YOUR-USERNAME/stock-market-toolkit.git
git push -u origin main
```

A wall of yellow `warning: LF will be replaced by CRLF` lines is harmless line-ending housekeeping. Real problems announce themselves with `error:` or `fatal:` — see the troubleshooting table.

Whichever route you take, this one-line check tells you the terminal is healthy, which is the door Claude Code uses:

```
git status
```

**Expected result:** `On branch main`, and either a clean tree or a list of your changes.
</details>

---

## Part D — Wire the automation (PARKED — by choice, until wanted)

**Decision, week 2:** automation waits until committing-and-pushing is second nature and the team *wants* the robot. Nothing is lost — the pipeline file stays in the repo, switched to manual-trigger only. Until then, releasing is one command from Part B: `npm run deploy`.

When the want arrives: do D1–D3 below, then restore the `push:` trigger in `.github/workflows/deploy.yml` (instructions are in the file itself). From that moment, pushing is deploying. The steps below are kept ready; **all of this happens in the browser.**

### D1. Get your Cloudflare Account ID

dash.cloudflare.com → **Workers & Pages** → the right-hand column shows **Account ID** with a copy button.

### D2. Create a scoped API token

dash.cloudflare.com → profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → **Edit Cloudflare Workers** template → **Use template** → **Continue to summary** → **Create Token**. **Copy it immediately** — it is shown exactly once.

Note what you just did: a least-privilege credential that can deploy Workers and nothing else. Your validation instincts apply in full here.

### D3. Put both in the GitHub vault

Your repo on github.com → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Create two; the names must match **exactly**:

| Name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from D2 |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from D1 |

### D4. (On reactivation) Trigger the pipeline with a real change

Open `src/index.ts` in any text editor (Notepad is fine), find the line near the bottom reading:

```
<p>&copy; 2026 Tony Ryan &middot; Source code: GitHub link to follow once the repo is public</p>
```

Replace it with (your username in the URL):

```
<p>&copy; 2026 Tony Ryan &middot; <a href="https://github.com/YOUR-USERNAME/stock-market-toolkit">Source code on GitHub</a></p>
```

Save. Then in GitHub Desktop: the change appears in the left pane → summary *"Add repo link; test CI deploy"* → **Commit to main** → **Push origin**.

### D5. Watch it work

Your repo on github.com → **Actions** tab → the run is executing. **Expected result:** a green tick in about two minutes. Refresh your live `workers.dev` URL — the footer now links to the source.

You will never deploy by hand again. From now on, **pushing is deploying**.

---

## Part E — The weekly rhythm (a few minutes, every week)

This is the whole loop from here to week 12. Two verbs, two meanings: **push = backup** (the record), **deploy = release** (the live site).

1. Build the week's feature (this is where Claude Code earns its keep).
2. `npm run dev` → check it locally at localhost:8787.
3. Tick the hand-verification boxes in `BUILD-LOG.md`.
4. GitHub Desktop: review the diff → commit → **Push origin**. *(The backup.)*
5. `npm run deploy` → refresh the live URL. *(The release.)*

When automation is eventually switched on (Part D), step 5 disappears into step 4 — pushing becomes deploying. Until then they are deliberately separate acts, and that's fine.

That's it. Parts 0–C never repeat.

---

## Done — the acceptance checklist

These mirror the hand-verification gates in `BUILD-LOG.md`:

- [ ] Site runs locally (`npm run dev`, both URLs respond)
- [ ] Live `workers.dev` URL opens on your phone over mobile data
- [ ] Repository public on GitHub; both secrets stored
- [ ] *(Parked with Part D.)* Instead: an `npm run deploy` after a change produced a visible change on the live site
- [ ] Landing-page placeholder replaced with the real repo link

---

## When something goes wrong

| Symptom | Cause and fix |
|---|---|
| `'node' is not recognized` / `command not found` | Terminal predates the install. Close it, open a fresh one. |
| PowerShell: *"npm.ps1 cannot be loaded because running scripts is disabled"* | Execution policy. Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer Y — or just use **Command Prompt** instead. |
| `npm install` fails with network/proxy errors | Corporate VPN in the way. Try again off it. |
| `Ready on…` never appears / port error | Something else holds port 8787 — a forgotten dev server in another terminal. Close it, or `npm run dev -- --port 8788`. |
| `git add .` → torrent of errors, or `Filename too long` | Almost always the wrong folder: `dir` must show `package.json` before any git command. Otherwise Windows path limits — `git config --global core.longpaths true`. |
| `fatal: remote origin already exists` | The bookmark exists; edit it instead of adding: `git remote set-url origin https://github.com/YOU/REPO.git`, then `git remote -v` to confirm. |
| `git status` says `On branch master` | Rename it — the pipeline only fires on main: `git branch -M main`. |
| `git status` clean but no mention of `origin/main` | No upstream link set. `git push -u origin main` — safe whether or not the content is already up there. |
| `git push` → authentication failed | Use GitHub Desktop, which handles sign-in. Terminal fix: install the GitHub CLI (cli.github.com) and run `gh auth login` → GitHub.com → HTTPS → browser. |
| `fatal: detected dubious ownership` | Common on corporate or synced drives. The error itself prints the exact `git config --global --add safe.directory …` command — run it. |
| Actions run shows a red ✗ | Click the run, read the failing step. Ninety percent of the time a secret name doesn't match exactly, or the token came from the wrong template. Fix, then **Re-run jobs**. |
| `npm ci` fails in Actions with a lockfile error | `package-lock.json` must be committed. Confirm it's on github.com; if not, commit it. |

---

## What just happened, in one paragraph

Your machine holds the working copy. GitHub holds the controlled copy with full history. On every push to `main`, GitHub's pipeline type-checks the code, then uses your vaulted, least-privilege token to deploy the Worker to Cloudflare's edge, where it serves your students from a datacentre near them. Dev instance, controlled repository, automated change execution, scoped credentials, verified deployment — you have run this exact architecture for twenty years. Only the vendor names changed.
