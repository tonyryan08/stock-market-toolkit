#!/usr/bin/env node
/**
 * The small-cap visit, run from your own computer (v0.8.1, 23 Oct 2026).
 *
 * Why: Alpha Vantage's free tier counts calls by sender address as well as by
 * key. Cloudflare's shared egress addresses are exhausted before the 23:10 UTC
 * cron fires (three nights of receipts: "25 requests per day", "higher API
 * call volume"), so the robot never got past its first call. From your PC the
 * same key serves 25 a day. This script runs the SAME Worker code locally,
 * with the database binding pointed at the live D1 (_wrangler.smallcaps.jsonc,
 * "remote": true), rings the small-cap doorbell once, waits for the receipt,
 * prints it, and stops the server.
 *
 * Run:   npm run smallcaps                 (20 Alpha Vantage calls, ~5 minutes)
 *        npm run smallcaps -- --calls 12   (fewer, when the day's ration is partly spent)
 * Needs: _wrangler.smallcaps.jsonc (your copy of the example), .dev.vars with
 *        ALPHAVANTAGE_API_KEY and EDGAR_USER_AGENT, `npx wrangler login` done.
 * Don't: run it twice in six hours (the second run skips everything as
 *        "fresh"), or on a day you have spent the ration on probes.
 */

import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const argv = process.argv.slice(2);
const argOf = (flag, dflt) => { const i = argv.indexOf(flag); return i > -1 && argv[i + 1] ? argv[i + 1] : dflt; };
const CALLS = Math.max(1, Math.min(25, parseInt(argOf("--calls", "20"), 10) || 20));
const PORT = parseInt(argOf("--port", "8790"), 10) || 8790;
/** Sandbox self-test only: local database, stub servers, no spacing. Never set on your machine. */
const LOCAL_TEST = process.env.SMALLCAP_VISIT_LOCAL === "1";
const CONFIG = argOf("--config", LOCAL_TEST ? "wrangler.jsonc" : "_wrangler.smallcaps.jsonc");
const WAIT_MINUTES = 14;
const win = process.platform === "win32";
// Wrangler is run through node directly: no shell, no cmd.exe quoting, no
// npx.cmd (23 Oct 2026: the shell route mangled the receipt query on Windows).
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- preflight --------------------------------------------------------------
if (!existsSync(WRANGLER)) {
  console.error("node_modules/wrangler/bin/wrangler.js not found — run npm install first.");
  process.exit(1);
}
if (!existsSync(join(ROOT, CONFIG))) {
  console.error(`No ${CONFIG}. Save wrangler.smallcaps.example.jsonc as ${CONFIG}, paste your database_id from wrangler.jsonc over the zeros, keep it unticked in Desktop.`);
  process.exit(1);
}
let devVars = "";
try { devVars = readFileSync(join(ROOT, ".dev.vars"), "utf8"); } catch {}
for (const key of ["ALPHAVANTAGE_API_KEY", "EDGAR_USER_AGENT"]) {
  if (!new RegExp(`^\\s*${key}\\s*=\\s*"?\\S`, "m").test(devVars)) {
    console.error(`.dev.vars has no ${key} — the visit needs it.`);
    process.exit(1);
  }
}
if (!LOCAL_TEST && /^\s*SMALLCAP_AV_SPACING_MS/m.test(devVars)) {
  console.error(".dev.vars sets SMALLCAP_AV_SPACING_MS — remove it; the live visit must keep the 13-second spacing.");
  process.exit(1);
}

const d1 = (sql) => {
  // The I-2 shape (7403) is transient: three attempts, then give up on this read.
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execFileSync(process.execPath, [WRANGLER, "d1", "execute", "stock-market-db", LOCAL_TEST ? "--local" : "--remote", "--json", "--command", sql], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const start = out.indexOf("[");
      return JSON.parse(out.slice(start))[0].results;
    } catch (err) {
      if (attempt === 3) throw err;
    }
  }
};

const startedAt = new Date().toISOString();
console.log(`Small-cap visit from this computer — ${CALLS} Alpha Vantage calls, 13 s apart (about ${Math.ceil((CALLS * 13) / 60) + 1} minutes). Started ${startedAt}.`);

// --- 1) the local server, live database -------------------------------------
const child = spawn(process.execPath, [WRANGLER, "dev", "-c", CONFIG, "--test-scheduled", "--port", String(PORT), "--var", `SMALLCAP_AV_CALLS:${CALLS}`], {
  cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], detached: !win, // its own process group, so stop() takes workerd with it
});
let ready = false;
let serverLog = "";
const onData = (buf) => {
  const text = buf.toString();
  serverLog += text;
  if (/Ready on http/i.test(text)) ready = true;
};
child.stdout.on("data", onData);
child.stderr.on("data", onData);

const stop = () => {
  try {
    if (win) execFileSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {}
};
process.on("SIGINT", () => { stop(); process.exit(130); });

for (let i = 0; i < 90 && !ready; i++) await sleep(1000);
if (!ready) {
  stop();
  console.error("The local server did not become ready in 90 s. Its output:\n" + serverLog.slice(-1500));
  process.exit(1);
}

// --- 2) ring the small-cap doorbell -------------------------------------------
const cron = "10+23+*+*+*";
let rung = false;
for (const path of [`/__scheduled?cron=${cron}`, `/cdn-cgi/handler/scheduled?cron=${cron}`]) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}${path}`);
    if (res.ok) { rung = true; console.log(`Doorbell rung (${path.split("?")[0]}). Waiting for the receipt…`); break; }
  } catch {}
}
if (!rung) {
  stop();
  console.error("Could not ring the doorbell on either path. Server output:\n" + serverLog.slice(-1500));
  process.exit(1);
}

// --- 3) wait for tonight's run_summary in the LIVE fetch_log --------------------
let summary = null;
const deadline = Date.now() + WAIT_MINUTES * 60_000;
while (Date.now() < deadline) {
  await sleep(20_000);
  let rows = [];
  try {
    rows = d1("SELECT run_at, detail FROM fetch_log WHERE outcome='run_summary' AND instr(detail, 'smallcaps') > 0 ORDER BY id DESC LIMIT 1") ?? [];
  } catch (err) {
    console.log(`(reading the receipt failed, will retry: ${String(err.message ?? err).split("\n")[0].slice(0, 120)})`);
    continue;
  }
  if (rows[0] && rows[0].run_at > startedAt) { summary = rows[0]; break; }
  process.stdout.write(".");
}
console.log("");
stop();

if (!summary) {
  console.error(`No receipt after ${WAIT_MINUTES} minutes. Check the live fetch_log by hand; the server output ends:\n` + serverLog.slice(-1500));
  process.exit(1);
}

// --- 4) the receipt ------------------------------------------------------------
const receipt = d1(`SELECT symbol, outcome, rows_written, substr(detail,1,170) AS d FROM fetch_log WHERE run_at = '${summary.run_at}' ORDER BY id`) ?? [];
console.log(`\nReceipt for the run at ${summary.run_at}:`);
for (const r of receipt) console.log(`  ${String(r.symbol ?? "—").padEnd(6)} ${String(r.outcome).padEnd(17)} ${String(r.rows_written).padStart(4)}  ${r.d}`);
const s = JSON.parse(summary.detail);
console.log(`\nVisited ${s.planned} (${s.withAccounts} with accounts) · Alpha Vantage calls ${s.avCalls} · EDGAR calls ${s.edgarCalls} · outcomes ${JSON.stringify(s.outcomes)}`);
if (s.outcomes?.rate_limited || s.outcomes?.premium || s.outcomes?.auth_failed) console.log("Stopped by the limit — the company it stopped on is first in the queue next time (its accounts are still due); the rest follow.");
console.log("Done. The live site shows these companies now; run again tomorrow (or in a week — accounts keep for a year, prices for 100 days).");
