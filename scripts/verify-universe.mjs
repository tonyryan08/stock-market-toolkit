#!/usr/bin/env node
/**
 * Universe verifier — the whitelist detector.
 *
 * VC-10 falsified the domicile hypothesis (DVN: US-domiciled, blocked), so
 * FMP free-plan coverage is a whitelist that can only be DISCOVERED. This
 * script is the instrument: for every candidate it probes the two endpoints
 * week 3+ actually depends on, classifies the answer, and writes the
 * evidence — a raw-materials certificate for the universe.
 *
 * Run:   npm run verify-universe          (reads FMP_API_KEY from .dev.vars)
 * Cost:  2 FMP calls per candidate, +1 profile call per green.
 *        ~48 candidates ≈ 130 calls — fits the 250/day budget; run it on a
 *        day the nightly cron hasn't already spent the ration, or before
 *        the universe is seeded (then the cron has nothing to spend).
 *
 * Outputs (commit all three):
 *   scripts/universe-verified.json  — full evidence, per candidate
 *   scripts/seed-universe.sql       — INSERTs for the greens (tickers table)
 *   console                         — a human-readable verdict table
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DELAY_MS = 300;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- key: env var wins, .dev.vars fallback --------------------------------
function loadKey() {
  if (process.env.FMP_API_KEY) return process.env.FMP_API_KEY.trim();
  try {
    const text = readFileSync(join(ROOT, ".dev.vars"), "utf8");
    const m = text.match(/FMP_API_KEY\s*=\s*"?([^"\r\n]+)"?/);
    if (m) return m[1].trim();
  } catch {}
  console.error(
    "No FMP key found. Either create .dev.vars (see .dev.vars.example) or run:\n" +
      "  set FMP_API_KEY=yourkey && npm run verify-universe   (Windows)\n",
  );
  process.exit(1);
}

// --- classification: the M-shape map, script edition ----------------------
async function probe(url) {
  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    return { kind: "error", detail: String(err.message ?? err) };
  }
  if (res.status === 401 || res.status === 403) return { kind: "auth", detail: `HTTP ${res.status}` };
  if (res.status === 402) return { kind: "blocked", detail: "HTTP 402 (M-5)" };
  if (res.status === 429) return { kind: "rate", detail: "HTTP 429" };
  if (!res.ok) return { kind: "error", detail: `HTTP ${res.status}` };
  let json;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", detail: "unparseable JSON" };
  }
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const text = JSON.stringify(json).slice(0, 160);
    if (/premium query parameter|special endpoint|upgrade your plan/i.test(text))
      return { kind: "blocked", detail: "M-6 prose" };
    if (/limit/i.test(text)) return { kind: "rate", detail: text };
    return { kind: "error", detail: `unexpected shape: ${text}` };
  }
  if (!Array.isArray(json) || json.length === 0) return { kind: "empty", detail: "empty array" };
  return { kind: "ok", json };
}

const key = loadKey();
const candidatesFile = join(HERE, "universe-candidates.txt");
const candidates = readFileSync(candidatesFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*$/, "").trim())
  .filter(Boolean);

console.log(`Universe verifier — ${candidates.length} candidates, ~${candidates.length * 2} calls + profiles.\n`);

const results = [];
let aborted = false;

for (const symbol of candidates) {
  const row = { symbol, statements: null, statement_years: 0, history: null, history_from: null, history_days: 0, verdict: "?" };

  // 1) income statement (the Graham screener's raw material)
  const st = await probe(
    `https://financialmodelingprep.com/stable/income-statement?symbol=${symbol}&apikey=${key}`,
  );
  row.statements = st.kind;
  if (st.kind === "ok") {
    row.statement_years = st.json.length;
  }
  if (st.kind === "auth") { console.error(`AUTH FAILURE at ${symbol} — check the key. Stopping.`); aborted = true; results.push(row); break; }
  if (st.kind === "rate") { console.error(`RATE LIMIT at ${symbol} — stopping; rerun tomorrow (progress below is still valid).`); aborted = true; results.push(row); break; }
  await sleep(DELAY_MS);

  // 2) dividend-adjusted history (the price spine)
  const hi = await probe(
    `https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted?symbol=${symbol}&apikey=${key}`,
  );
  row.history = hi.kind;
  if (hi.kind === "ok") {
    row.history_days = hi.json.length;
    const dates = hi.json.map((r) => r.date).filter(Boolean).sort();
    row.history_from = dates[0] ?? null;
  }
  if (hi.kind === "rate") { console.error(`RATE LIMIT at ${symbol} history — stopping; rerun tomorrow.`); aborted = true; results.push(row); break; }
  await sleep(DELAY_MS);

  row.verdict = row.statements === "ok" && row.history === "ok" ? "GREEN" : "blocked";
  results.push(row);
  console.log(
    `${row.verdict === "GREEN" ? "✓" : "✗"} ${symbol.padEnd(6)} statements:${String(row.statements).padEnd(8)} ${String(row.statement_years)}y   history:${String(row.history).padEnd(8)} ${row.history_days} days${row.history_from ? " from " + row.history_from : ""}`,
  );
}

// 3) profiles for the greens (names + sectors for the tickers table)
const greens = results.filter((r) => r.verdict === "GREEN");
if (!aborted) {
  console.log(`\nFetching profiles for ${greens.length} greens…`);
  for (const g of greens) {
    const pr = await probe(
      `https://financialmodelingprep.com/stable/profile?symbol=${g.symbol}&apikey=${key}`,
    );
    if (pr.kind === "ok" && pr.json[0]) {
      g.name = pr.json[0].companyName ?? null;
      g.sector = pr.json[0].sector ?? null;
    }
    await sleep(DELAY_MS);
  }
}

// --- outputs ---------------------------------------------------------------
const evidence = {
  verified_at: new Date().toISOString(),
  candidates: candidates.length,
  greens: greens.map((g) => g.symbol),
  aborted_early: aborted,
  results,
  note: "Raw-materials certificate for the course universe. Free-plan coverage is a whitelist (VC-10); this file is the discovery evidence. Education, not advice.",
};
writeFileSync(join(HERE, "universe-verified.json"), JSON.stringify(evidence, null, 2));

const sqlEsc = (s) => String(s).replace(/'/g, "''");
const seed =
  `-- seed-universe.sql — generated by verify-universe.mjs on ${evidence.verified_at}\n` +
  `-- Greens only: ${greens.length} of ${candidates.length} candidates. Blocked names live in universe-verified.json.\n` +
  `-- Apply:  npx wrangler d1 execute stock-market-db --local  --file=scripts/seed-universe.sql\n` +
  `--         npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-universe.sql\n` +
  greens
    .map(
      (g) =>
        `INSERT INTO tickers (symbol, name, sector, status) VALUES ('${sqlEsc(g.symbol)}', ${g.name ? `'${sqlEsc(g.name)}'` : "NULL"}, ${g.sector ? `'${sqlEsc(g.sector)}'` : "NULL"}, 'active') ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, sector=excluded.sector, status='active';`,
    )
    .join("\n") +
  "\n";
writeFileSync(join(HERE, "seed-universe.sql"), seed);

console.log(`\n${aborted ? "PARTIAL RUN (stopped early — see above). " : ""}Verdict: ${greens.length} green / ${results.length} probed.`);
console.log("Wrote scripts/universe-verified.json (evidence) and scripts/seed-universe.sql (the universe).");
console.log("Next: apply the seed to D1 (commands are in the seed file header), commit all three files.");
