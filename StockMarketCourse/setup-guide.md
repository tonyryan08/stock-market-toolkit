# From Zip to Live: The Complete Setup Guide

**No prior web-development knowledge assumed. **** **** Every step has an expected result — if you see it, proceed; if you don't, jump to the troubleshooting table at the bottom.**

Honest time estimate: the "fifteen-minute path" assumed the workshop was already set up. From a bare machine including account creation, budget **~45 minutes**. You only ever do Part 0 once; every future week is Parts A and D only, and takes minutes.

Instructions show Windows; where the Mac differs, it's flagged inline.

## Translation table for the MES-minded

| Foreign term Whatttm | What it is in your world Node. js dev reads the bill of materials and populates the devdevsworld                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Node.js / npm        | The runtime and its package manager — think vendor platform plus a dependency installer that works *per project*, not per machine |
| `package.json`       | The project's bill of materials — the spec from which everything else is regenerated                                              |
| `node_modules/`      | The installed vendor libraries. Never shipped, never version-controlled — always regenerable from the spec                        |
| `localhost:8787`     | Your dev instance. Exists only on your machine; nothing is public yet                                                             |
| GitHub repository    | The controlled document store — full version history, every change attributable                                                   |
| `git push`           | Checking your changes into the master record                                                                                      |
| GitHub Actions       | The automated deployment pipeline — change control that executes itself                                                           |
| Repository "secrets" | The credential vault: encrypted, masked in logs, write-only after saving                                                          |
| `wrangler`           | Cloudflare's deployment CLI — the tool that moves code from your machine to their edge                                            |
| `…workers.dev` URL   | The production instance                                                                                                           |

---

## Part 0 — Set up the workshop (one time only, ~15 min)

### 0.1 Install Node.js

Go to **nodejs.org**, click the big **LTS** download, run the installer, and accept all defaults.

**Verify:** open a **new** terminal window — Windows: press Start, type `powershell`, Enter; Mac: open **Terminal** from Applications → Utilities — and run:

```
node --version
```

**Expected result:** a version number of `v20` or higher (e.g. `v22.x.x`). If you get *"node is not recognised "*, the terminal was open before the install — close it and open a fresh one.

### 0.2 Install Git

Windows: **git-scm.com/download/win**, run the installer, accept every default (this bundles the credential manager you'll want later). Mac: run `git --version` in Terminal; if it's missing, macOS pops up an offer to install the command-line tools — accept it.

**Verify:** `git --version` prints a version number.

Then introduce yourself to Git, once, forever (use the email you'll register with GitHub):

```
git config --global user. name "Tony Ryan"
git config --global user.email "your-email@example.com"
```

**Expected result:** no output at all. Silence is success — a Unix tradition you'll get used to.

### 0.3 Create the two accounts (both free)

- **github.com** → Sign up. The free plan is all this project ever needs.
- **dash.cloudflare.com** → Sign up. The Workers free plan covers this entire course; no payment card required.

---

## Part A — Run it on your own machine (~5 min)

### A1. Unzip to a sensible home

Create a folder with **no spaces in its path** — `C:\Dev` on Windows, `~/dev` on Mac — and extract the zip there. You should end up with `C:\Dev\stock-market-toolkit` containing `package.json`, `src`, `docs` and friends. (If you find a `stock-market-toolkit` folder *inside* another `stock-market-toolkit` folder, the extractor is double-nested — use the inner one.)

### A2. Open a terminal *in* that folder

```
cd C:\Dev\stock-market-toolkit
```

(Mac: `cd ~/dev/stock-market-toolkit`.) Windows shortcut: in File Explorer, open the folder, right-click reads the bill of materials and populatesspace → **Open in Terminal**.

**Verify:** `dir` (Windows) or `ls` (Mac) lists `package.json`.

### A3. Install the project's dependencies

```
npm install
```

**Expected result:** a minute or two of progress noise, ending with something like `added NNN packages` and `found 0 vulnerabilities`. This read the bill of materials and populated `node_modules/` — locally, for this project only.

### A4. Start the dev instance

```
npm run dev
```

First run may ask a yes/no question about sharing usage metrics — either answer is fine. It may also mention a newer wrangler version exists — ignore it.

**Expected result:** a line containing `Ready on http://localhost:8787`.

### A5. Look at it

In your browser, open **http://localhost:8787** — the ledger page, week 1 stamped SHIPPED. Then **http://localhost:8787/api/hello** — the JSON payload. Congratulations: you are running a Cloudflare Worker on your own machine.

### A6. Stop it

Back in the terminal, press **Ctrl+C**. The site vanishes — it only existed on your machine.

---

## Part B — First deploy, by hand (~5 min)

Prove the pipe manually before automating it.

### B1. Authorise the deployment tool

```
npx wrangler login
```

**Expected result:** your browser opens a Cloudflare page — click **Allow**, return to the terminal, see `Successfully logged in`. (If no browser opens, the terminal prints a URL — paste it into a browser yourself.)

### B2. Deploy

```
npm run deploy
```

First-ever deploy on a new account: wrangler will ask you to **register a workers. devdevreads the bill of materials and populatesdevdev reads the bill of materials and populates the devdev subdomain devdev subdomain**. Pick something short — it becomes part of every URL on your account, publicly.

**Expected result:** output ending in a URL like `https://stock-market-toolkit.YOURSUBDOMAIN.workers.dev`.

### B3. The real test

Open that URL **on your phone, on mobile data** — not your wifi. If the ledger loads, it loads for your students. That's the syllabus exit check, passed.

---

## Part C — Put the source on GitHub (~10 min)

### C1. Create the empty repository

On github.com: **+** (top right) → **New repository** → name it `stock-market-toolkit` → select **Public** → leave every "initialize with…" box **unticked** (you already have a README) → **Create repository**. Ignore the instructions page it shows; yours are below.

### C2. Connect and push (in your terminal, in the project folder)

```
git init
git add.
git commit -m "Week 1: hello, Worker"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/stock-market-toolkit.git
git push -u origin main
```

Replace `YOUR-USERNAME` with your actual GitHub username in line five.

**Authentication, first push only:** on Windows, a browser window should pop up — sign in to GitHub, done (that's the credential manager from step 0.2). On Mac, if the terminal instead asks for username and password: the "password" must be a **Personal Access Token**, not your account password — create one at github.com → Settings → **Developer settings** → Personal access tokens → **Tokens (classic)** → Generate new token, tick the `repo` scope, and paste it as the password.

**Expected result:** `git push` ends with lines mentioning `main -> main`.

### C3. Verify

Refresh your repository page on github.com — README, `src`, `docs`, `kit` all visible. Note `node_modules` is *not* there: the `.gitignore` file excludes it by design. The spec travels; the 100 MB of regenerable libraries do not.

---

## Part D — Wire the automation (~10 min)

From here on, pushing to `main` deploys automatically. The pipeline needs two credentials in the vault.

### D1. Get your Cloudflare Account ID

dash.cloudflare.com → **Workers & Pages** → on the overview page, the right-hand column shows **Account ID** with a copy button. Copy it.

### D2. Create a scoped API token

dash.cloudflare.com → click your profile icon (top right) → **My Profile** → **API Tokens** → **Create Token** → find the **Edit Cloudflare Workers** template → **Use template** → **Continue to summary** → **Create Token**. **Copy it immediately** — it is shown exactly once. Note what you just did: a least-privilege credential that can deploy Workers and nothing else. Your validation instincts apply in full here.

### D3. Put both in the GitHub vault

Your repo on github.com → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Create two, and the names must match **exactly**:

| Name                    | Value             |
| ----------------------- | ----------------- |
| `CLOUDFLARE_API_TOKEN`  | the token from D2 |
| `CLOUDFLARE_ACCOUNT_ID` | the ID from D1    |

### D4. Trigger the pipeline with a real change

Two birds with one stone — the landing page still has a placeholder where the repo link belongs. Open `src/index.ts` in any text editor (Notepad is fine), find this line near the bottom:

```
<p>© 2026 Tony Ryan · Source code: GitHub link to follow once the repo is public</p>
```

and replace it with (your username in the URL):

```
<p>© 2026 Tony Ryan · <a href="https://github.com/YOUR-USERNAME/stock-market-toolkit">Source code on GitHub</a></p>
```

Save, then in the terminal:

```
git add.
git commit -m "Add repo link; test CI deploy"
git push
```

### D5. Watch it work

Your repo on github.com → **Actions** tab → a run named "Add repo link; test CI deploy" is executing. **Expected result:** a green tick in about two minutes. Refresh your live `workers.dev` URL — the footer now links to the source. You will never deploy by hand again; from now on, `git push` *is* the deployment.

---

## Done — the acceptance checklist

These mirror the hand-verification gates in `BUILD-LOG.md` — tick them there as you go; the log is part of the product.

- [ ] Site runs locally (`npm run dev`, both URLs respond)
- [ ] Live `workers.dev` URL opens on your phone over mobile data.
- [ ] Repository is public on GitHub; both secrets are stored.
- [ ] A push to `main` produced a green Actions run **and** a visible change on the live site.
- [ ] Landing-page placeholder replaced with the real repo link.

---

## When something goes wrong

| Symptom: Cause: "npm " error" "etom                                          | Cause and fix 'x ' nodex                                                                                                                                                                                       |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `'node' is not recognised / `command not found`                              | Terminal predates the install. Close it, open a fresh one.                                                                                                                                                     |
| PowerShell: *"npm.ps1 cannot be loaded because running scripts is disabled"* | Windows execution policy. Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`, answer Y, retry — or use **Command Prompt** instead of PowerShell.                                                        |
| `npm install` fails with network/proxy errors                                | Corporate VPN in the way. Try again off the VPN.                                                                                                                                                               |
| `Ready on…` never appears / port error.                                      | Something else holds port 8787 — probably a forgotten dev server in another terminal. Close it, or run `npm run dev -- --port 8788`.                                                                           |
| `git push` → authentication failed                                           | See the C2 authentication note — on Mac, the password must be a Personal Access Token.                                                                                                                         |
| Actions run shows red. ✗                                                     | Click the run and read which step failed. Ninety per cent of the time: a secret name doesn't match exactly, or the token came from the wrong template. Fix the secret, then **Re-run jobs** on the failed run. |
| Deploy asks about a workers.dev subdomain                                    | Normal on first deploy — pick a short name; it's public and account-wide.                                                                                                                                      |

---

## What just happened, in one paragraph

Your machine now holds the master source. GitHub holds the controlled copy with full history. On every push to `main`, GitHub's pipeline checks the types, then uses your vaulted, least-privilege token to deploy the Worker to Cloudflare's edge, where it serves your students from a datacentre near them. Dev instance, controlled repository, automated change execution, scoped credentials, verified deployment — you have run this exact architecture for twenty years; only the vendor names changed.

From week 2 onward, the weekly rhythm is: pull up the project, build the week's feature (this is where Claude Code earns its keep), tick the BUILD-LOG, `git push`, watch it go green.
