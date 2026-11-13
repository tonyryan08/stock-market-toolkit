#!/usr/bin/env node
/**
 * Enrol a student (week 8): a code, a name, a paper account. Decision 18:
 * per-student codes until Cloudflare Access arrives in week 12; the code is
 * the student's identity on every ticket and on their page, /tickets/<code>.
 *
 * Run:   npm run enrol -- --name "Ada Lovelace" --capital 10000 --email ada@example.com
 *        npm run enrol -- --name "Ada Lovelace" --capital 10000 --instruments 2 --email ada@example.com
 *        npm run enrol -- --set-email K7PM-4R2X ada@example.com      (link, or re-link, an account to an email)
 *        npm run enrol -- --set-instruments K7PM-4R2X 2
 *        npm run enrol -- --list
 *        npm run enrol -- --local --name "Test Student" --capital 10000    (the local database, for a rehearsal)
 *        npm run enrol -- --retire K7PM-4R2X          (shows what would go; add --yes to delete the student and every row of theirs)
 *
 * Week 9 (decision 20): `--instruments N` (1–4, default 1) is how many
 * instruments the account runs; each position is sized at 12% ÷ N a year and
 * the pre-trade checks hold the account to N open positions and the 12% budget.
 * `--set-instruments CODE N` changes it later — positions already open are not
 * resized (the stop does its work); the nightly report says if the account is
 * over budget or over the count.
 * Week 10 (OI-56): `--retire CODE` deletes a student and their tickets,
 * positions and nightly reports — a test account whose code leaked, or a
 * student who left. It prints the rows it would remove and does nothing
 * without `--yes`; with it, the four DELETEs run as one batch and the
 * count is read back. There is no undo: a retired account is gone from the
 * database (the fetch_log keeps its receipts, which name no code).
 * Week 12 (decision 23): `--email` is the student's login. Cloudflare Access
 * stands in front of the site and sends a one-time code to the addresses on
 * its policy; the Worker matches the signed-in email to the student row, so
 * a student's page opens for their own email and the tutor's (TUTOR_EMAILS)
 * and nobody else's. The email here and the email on the Access policy must
 * be the same address — add it to the policy when you enrol. One email per
 * account: a duplicate is refused (the tutor's own test accounts may share
 * one — pass --allow-shared-email). An account without an email keeps its
 * code and opens for the tutor only while Access is on; `--set-email` links
 * it. While Access is off (local dev, or the Worker made public) the code is
 * the key as before, and the email is just a column.
 * Needs: `npx wrangler login` done (the live database is written through
 *        `wrangler d1 execute --remote`). The code is printed once — give it
 *        to the student; the list shows it again.
 */
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const WRANGLER = join(ROOT, "node_modules", "wrangler", "bin", "wrangler.js");
const USAGE = 'usage: npm run enrol -- --name "Full Name" --capital 10000 --email a@b.c [--instruments N] [--local]   |   npm run enrol -- --set-email CODE EMAIL [--local]   |   npm run enrol -- --set-instruments CODE N [--local]   |   npm run enrol -- --list [--local]   |   npm run enrol -- --retire CODE [--yes] [--local]';

// Strict arguments (OI-50): nothing is guessed.
const argv = process.argv.slice(2);
const KNOWN = { "--name": "str", "--capital": "int", "--instruments": "int", "--set-instruments": "pair", "--list": "flag", "--local": "flag", "--retire": "str", "--yes": "flag", "--email": "str", "--set-email": "pair", "--allow-shared-email": "flag" };
const args = {};
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  if (!(flag in KNOWN)) { console.error(`Unknown argument: ${flag}\n${USAGE}`); process.exit(2); }
  if (KNOWN[flag] === "flag") { args[flag] = true; continue; }
  if (KNOWN[flag] === "pair") {
    const [c, n] = [argv[i + 1], argv[i + 2]];
    if (c === undefined || n === undefined || c.startsWith("--") || n.startsWith("--")) { console.error(`${flag} needs a code and a value, e.g. ${flag === "--set-email" ? "--set-email K7PM-4R2X ada@example.com" : "--set-instruments K7PM-4R2X 2"}\n${USAGE}`); process.exit(2); }
    args[flag] = [c, n]; i += 2; continue;
  }
  const val = argv[i + 1];
  if (val === undefined || val.startsWith("--")) { console.error(`${flag} needs a value\n${USAGE}`); process.exit(2); }
  if (KNOWN[flag] === "int" && !/^\d+$/.test(val)) { console.error(`${flag} must be a whole number, got "${val}"\n${USAGE}`); process.exit(2); }
  args[flag] = val; i++;
}
// An email, plainly: one @, no spaces, a dot in the domain — Access's policy will be the real judge of it.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const emailOf = (raw) => {
  const e = String(raw ?? "").trim().toLowerCase();
  if (!EMAIL.test(e) || e.length > 254) { console.error(`"${raw}" is not an email address.\n${USAGE}`); process.exit(2); }
  return e;
};
/** Refuse an email already on another account (the tutor's test accounts may share one with --allow-shared-email). */
const refuseDuplicate = (email, exceptCode) => {
  if (args["--allow-shared-email"]) return;
  const rows = d1(`SELECT code, name FROM students WHERE lower(email) = ${q(email)}${exceptCode ? ` AND code <> ${q(exceptCode)}` : ""}`);
  if (rows.length) { console.error(`${email} is already the login of ${rows.map((r) => `${r.name} (${r.code})`).join(", ")}. One email, one account — or pass --allow-shared-email for the tutor's own test accounts.`); process.exit(1); }
};
const MAX_INSTRUMENTS = 4;   // SIZING.maxInstruments in src/lib/sizing.ts
const instrumentsOf = (raw) => {
  const n = parseInt(raw, 10);
  if (!(n >= 1 && n <= MAX_INSTRUMENTS)) { console.error(`instruments must be a whole number from 1 to ${MAX_INSTRUMENTS} (each position is sized at 12% ÷ N a year), got "${raw}"\n${USAGE}`); process.exit(2); }
  return n;
};
if (!existsSync(WRANGLER)) { console.error("node_modules/wrangler/bin/wrangler.js not found — run npm install first."); process.exit(1); }
const where = args["--local"] ? "--local" : "--remote";

const d1 = (sql) => {
  let out;
  try {
    out = execFileSync(process.execPath, [WRANGLER, "d1", "execute", "stock-market-db", where, "--json", "--command", sql], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    // A 7403 or a dropped connection (review N11): say what to do instead of a stack trace.
    const raw = String(err.stderr ?? err.message ?? err);
    const msg = raw.split("\n").filter((l) => /error|7403|failed/i.test(l)).slice(0, 3).join(" ") || "wrangler failed";
    // A missing column is not a transient (v1.0.0 review N8): migration 0013 has not been applied to this database.
    if (/no such column:?\s*email/i.test(raw)) { console.error(`The students table has no email column yet — migration 0013 is not applied on the ${where === "--local" ? "local" : "live"} database. Run \`npx wrangler d1 migrations apply stock-market-db ${where}\` and try again.`); process.exit(1); }
    console.error(`The database call failed: ${msg}\nRetry the same command; \`npm run enrol -- --list${where === "--local" ? " --local" : ""}\` shows whether the row landed (a name may then appear under two codes — harmless).`);
    process.exit(1);
  }
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results;
};

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

if (args["--list"]) {
  const rows = d1("SELECT code, name, capital, instruments, created_at, email FROM students ORDER BY created_at");
  if (!rows.length) { console.log("No students enrolled yet."); process.exit(0); }
  for (const r of rows) console.log(`${r.code}  ${String(r.name).padEnd(24)}  $${Number(r.capital).toLocaleString("en-US")}  ${r.instruments} instr.  ${String(r.created_at).slice(0, 10)}  /tickets/${r.code}  ${r.email ?? "(no email — opens for the tutor only while Access is on)"}`);
  const unlinked = rows.filter((r) => !r.email).length;
  if (unlinked) console.log(`${unlinked} account${unlinked === 1 ? "" : "s"} without an email: \`--set-email CODE EMAIL\` links each; the same address goes on the Access policy.`);
  process.exit(0);
}

if (args["--set-email"]) {
  if (args["--name"] || args["--capital"] || args["--instruments"] || args["--email"] || args["--set-instruments"] || args["--retire"]) { console.error(`--set-email stands alone (with --local or --allow-shared-email if needed).\n${USAGE}`); process.exit(2); }
  const code = String(args["--set-email"][0]).toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) { console.error(`"${args["--set-email"][0]}" is not a student code (XXXX-XXXX from the toolkit's alphabet — no I, O, 0 or 1).\n${USAGE}`); process.exit(2); }
  const email = emailOf(args["--set-email"][1]);
  const before = d1(`SELECT name, email FROM students WHERE code = ${q(code)}`);
  if (!before.length) { console.error(`No student with code ${code} — \`npm run enrol -- --list${where === "--local" ? " --local" : ""}\` shows the codes.`); process.exit(1); }
  refuseDuplicate(email, code);
  d1(`UPDATE students SET email = ${q(email)} WHERE code = ${q(code)}`);
  const after = d1(`SELECT email FROM students WHERE code = ${q(code)}`);
  if (!after.length || String(after[0].email).toLowerCase() !== email) { console.error("The change did not land — retry the same command."); process.exit(1); }
  console.log(`${before[0].name} (${code}): email ${before[0].email ?? "(none)"} → ${email} (${where === "--local" ? "local database" : "live"}).`);
  console.log(`Now the same address on the Access policy (Zero Trust → Access controls → Policies → the course's policy → Include → Emails), or the door will not open for it.`);
  process.exit(0);
}

if (args["--set-instruments"]) {
  if (args["--name"] || args["--capital"] || args["--instruments"] || args["--email"]) { console.error(`--set-instruments stands alone (with --local if needed).\n${USAGE}`); process.exit(2); }
  const code = String(args["--set-instruments"][0]).toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) { console.error(`"${args["--set-instruments"][0]}" is not a student code (XXXX-XXXX from the toolkit's alphabet — no I, O, 0 or 1).\n${USAGE}`); process.exit(2); }
  const n = instrumentsOf(args["--set-instruments"][1]);
  const before = d1(`SELECT name, instruments FROM students WHERE code = ${q(code)}`);
  if (!before.length) { console.error(`No student with code ${code} — \`npm run enrol -- --list${where === "--local" ? " --local" : ""}\` shows the codes.`); process.exit(1); }
  d1(`UPDATE students SET instruments = ${n} WHERE code = ${q(code)}`);
  const after = d1(`SELECT instruments FROM students WHERE code = ${q(code)}`);
  if (!after.length || Number(after[0].instruments) !== n) { console.error("The change did not land — retry the same command."); process.exit(1); }
  console.log(`${before[0].name} (${code}): instruments ${before[0].instruments} → ${n}; each new position is sized at ${(12 / n) % 1 === 0 ? 12 / n : (12 / n).toFixed(2)}% a year, ${n} open position${n === 1 ? "" : "s"} at most (${where === "--local" ? "local database" : "live"}).`);
  console.log(`Positions already open keep their size; tonight's report says if the account is over the budget or the count.`);
  process.exit(0);
}

if (args["--retire"]) {
  if (args["--name"] || args["--capital"] || args["--instruments"] || args["--set-instruments"]) { console.error(`--retire stands alone (with --yes and --local as needed).\n${USAGE}`); process.exit(2); }
  const code = String(args["--retire"]).toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(code)) { console.error(`"${args["--retire"]}" is not a student code (XXXX-XXXX from the toolkit's alphabet — no I, O, 0 or 1).\n${USAGE}`); process.exit(2); }
  const who = d1(`SELECT name, capital, instruments, created_at FROM students WHERE code = ${q(code)}`);
  if (!who.length) { console.error(`No student with code ${code} — \`npm run enrol -- --list${where === "--local" ? " --local" : ""}\` shows the codes.`); process.exit(1); }
  const counts = d1(`SELECT (SELECT COUNT(*) FROM tickets WHERE code = ${q(code)}) AS tickets, (SELECT COUNT(*) FROM positions WHERE code = ${q(code)}) AS positions, (SELECT COUNT(*) FROM risk_reports WHERE code = ${q(code)}) AS reports`)[0];
  console.log(`${who[0].name} (${code}), enrolled ${String(who[0].created_at).slice(0, 10)}, $${Number(who[0].capital).toLocaleString("en-US")}, ${who[0].instruments} instr.: ${counts.tickets} ticket${counts.tickets === 1 ? "" : "s"}, ${counts.positions} position${counts.positions === 1 ? "" : "s"}, ${counts.reports} nightly report${counts.reports === 1 ? "" : "s"} (${where === "--local" ? "local database" : "live"}).`);
  if (!args["--yes"]) { console.log(`Nothing deleted. Run the same command with --yes to retire the account — the student row and every row above go, and there is no undo.`); process.exit(0); }
  d1(`DELETE FROM risk_reports WHERE code = ${q(code)}; DELETE FROM positions WHERE code = ${q(code)}; DELETE FROM tickets WHERE code = ${q(code)}; DELETE FROM students WHERE code = ${q(code)}`);
  const left = d1(`SELECT (SELECT COUNT(*) FROM students WHERE code = ${q(code)}) + (SELECT COUNT(*) FROM tickets WHERE code = ${q(code)}) + (SELECT COUNT(*) FROM positions WHERE code = ${q(code)}) + (SELECT COUNT(*) FROM risk_reports WHERE code = ${q(code)}) AS n`)[0].n;
  if (Number(left) !== 0) { console.error(`${left} row(s) remain — retry the same command.`); process.exit(1); }
  console.log(`Retired: ${code} and its ${counts.tickets + counts.positions + counts.reports} rows are gone. /tickets/${code} now answers "No student with that code".`);
  process.exit(0);
}

const name = (args["--name"] ?? "").trim();
// Any letter in any alphabet (review F11: Seán and Ó Briain enrol on the first evening).
if (!/^[\p{L}\p{N} .'\-]{2,60}$/u.test(name)) { console.error(`--name must be 2–60 letters, digits, spaces, dots, apostrophes or hyphens.\n${USAGE}`); process.exit(2); }
const capital = parseInt(args["--capital"] ?? "", 10);
if (!(capital >= 500 && capital <= 1_000_000)) { console.error(`--capital must be between 500 and 1,000,000 dollars (the course's paper accounts).\n${USAGE}`); process.exit(2); }
const instruments = args["--instruments"] === undefined ? 1 : instrumentsOf(args["--instruments"]);
// Week 12: the email is the login. Optional while Access is off; required once it is on, so say so when it is missing.
const email = args["--email"] === undefined ? null : emailOf(args["--email"]);
if (email) refuseDuplicate(email, null);

// XXXX-XXXX from an alphabet without I, O, 0, 1 (nothing to misread on paper).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = `${group()}-${group()}`;
const createdAt = new Date().toISOString();
d1(`INSERT INTO students (code, name, capital, instruments, created_at, email) VALUES (${q(code)}, ${q(name)}, ${capital}, ${instruments}, ${q(createdAt)}, ${email ? q(email) : "NULL"})`);
const check = d1(`SELECT code FROM students WHERE code = ${q(code)}`);
if (!check.length) { console.error("The row did not land — check `npx wrangler d1 execute stock-market-db --remote --command \"SELECT * FROM students\"`."); process.exit(1); }
console.log(`Enrolled ${name}: code ${code}, paper account $${capital.toLocaleString("en-US")}, ${instruments} instrument${instruments === 1 ? "" : "s"} (${where === "--local" ? "local database" : "live"}).`);
if (email) console.log(`Login: ${email} — put the same address on the Access policy; their page is /me once they sign in (and /tickets/${code}, which opens for that email and the tutor's).`);
else console.log(`No email: /tickets/${code} opens for them while Access is off, and for the tutor only once it is on — \`npm run enrol -- --set-email ${code} their@email\` links it.`);
