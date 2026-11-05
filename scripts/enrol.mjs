#!/usr/bin/env node
/**
 * Enrol a student (week 8): a code, a name, a paper account. Decision 18:
 * per-student codes until Cloudflare Access arrives in week 12; the code is
 * the student's identity on every ticket and on their page, /tickets/<code>.
 *
 * Run:   npm run enrol -- --name "Ada Lovelace" --capital 10000
 *        npm run enrol -- --list
 *        npm run enrol -- --local --name "Test Student" --capital 10000    (the local database, for a rehearsal)
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
const USAGE = 'usage: npm run enrol -- --name "Full Name" --capital 10000 [--local]   |   npm run enrol -- --list [--local]';

// Strict arguments (OI-50): nothing is guessed.
const argv = process.argv.slice(2);
const KNOWN = { "--name": "str", "--capital": "int", "--list": "flag", "--local": "flag" };
const args = {};
for (let i = 0; i < argv.length; i++) {
  const flag = argv[i];
  if (!(flag in KNOWN)) { console.error(`Unknown argument: ${flag}\n${USAGE}`); process.exit(2); }
  if (KNOWN[flag] === "flag") { args[flag] = true; continue; }
  const val = argv[i + 1];
  if (val === undefined || val.startsWith("--")) { console.error(`${flag} needs a value\n${USAGE}`); process.exit(2); }
  if (KNOWN[flag] === "int" && !/^\d+$/.test(val)) { console.error(`${flag} must be a whole number of dollars, got "${val}"\n${USAGE}`); process.exit(2); }
  args[flag] = val; i++;
}
if (!existsSync(WRANGLER)) { console.error("node_modules/wrangler/bin/wrangler.js not found — run npm install first."); process.exit(1); }
const where = args["--local"] ? "--local" : "--remote";

const d1 = (sql) => {
  let out;
  try {
    out = execFileSync(process.execPath, [WRANGLER, "d1", "execute", "stock-market-db", where, "--json", "--command", sql], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    // A 7403 or a dropped connection (review N11): say what to do instead of a stack trace.
    const msg = String(err.stderr ?? err.message ?? err).split("\n").filter((l) => /error|7403|failed/i.test(l)).slice(0, 3).join(" ") || "wrangler failed";
    console.error(`The database call failed: ${msg}\nRetry the same command; \`npm run enrol -- --list${where === "--local" ? " --local" : ""}\` shows whether the row landed (a name may then appear under two codes — harmless).`);
    process.exit(1);
  }
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start))[0].results;
};

if (args["--list"]) {
  const rows = d1("SELECT code, name, capital, created_at FROM students ORDER BY created_at");
  if (!rows.length) { console.log("No students enrolled yet."); process.exit(0); }
  for (const r of rows) console.log(`${r.code}  ${String(r.name).padEnd(24)}  $${Number(r.capital).toLocaleString("en-US")}  ${String(r.created_at).slice(0, 10)}  /tickets/${r.code}`);
  process.exit(0);
}

const name = (args["--name"] ?? "").trim();
// Any letter in any alphabet (review F11: Seán and Ó Briain enrol on the first evening).
if (!/^[\p{L}\p{N} .'\-]{2,60}$/u.test(name)) { console.error(`--name must be 2–60 letters, digits, spaces, dots, apostrophes or hyphens.\n${USAGE}`); process.exit(2); }
const capital = parseInt(args["--capital"] ?? "", 10);
if (!(capital >= 500 && capital <= 1_000_000)) { console.error(`--capital must be between 500 and 1,000,000 dollars (the course's paper accounts).\n${USAGE}`); process.exit(2); }

// XXXX-XXXX from an alphabet without I, O, 0, 1 (nothing to misread on paper).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const code = `${group()}-${group()}`;
const createdAt = new Date().toISOString();
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
d1(`INSERT INTO students (code, name, capital, created_at) VALUES (${q(code)}, ${q(name)}, ${capital}, ${q(createdAt)})`);
const check = d1(`SELECT code FROM students WHERE code = ${q(code)}`);
if (!check.length) { console.error("The row did not land — check `npx wrangler d1 execute stock-market-db --remote --command \"SELECT * FROM students\"`."); process.exit(1); }
console.log(`Enrolled ${name}: code ${code}, paper account $${capital.toLocaleString("en-US")} (${where === "--local" ? "local database" : "live"}).`);
console.log(`Their page: /tickets/${code} — the code is their identity until week 12; give it to them once and keep this list.`);
