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
 *        npm run verify-universe -- --all  (re-probe everything, not just new names)
 *        npm run verify-universe -- --max-calls 120   (default 150: the sweep stops
 *        there and resumes tomorrow, so the nightly robot keeps its ~135 of the 250)
 * Cost:  2 FMP calls per NEW candidate, +1 profile call per new green.
 *        Since v0.5.3 the sweep RESUMES: candidates already recorded in
 *        universe-verified.json are skipped, so adding 40 names to the list
 *        costs ~80 calls, not ~250. If the daily limit stops it mid-run, run
 *        it again tomorrow and it carries on from where it stopped. The
 *        nightly cron spends ~67 calls of the 250; leave it that headroom.
 *
 * Outputs (commit all three):
 *   scripts/universe-verified.json  — full evidence, per candidate, merged
 *   scripts/seed-universe.sql       — upserts for ALL greens (tickers table)
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
  callsMade++;
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
    // Order matters (same bug as providers.ts, fixed 12 Oct 2026): FMP's
    // limit message ALSO says "upgrade your plan", so test for "limit" first,
    // and only the specific paywall phrases mean a genuine block.
    if (/limit/i.test(text)) return { kind: "rate", detail: text };
    if (/premium query parameter|special endpoint/i.test(text))
      return { kind: "blocked", detail: `M-6: ${text}` };
    return { kind: "error", detail: `unexpected shape: ${text}` };
  }
  if (!Array.isArray(json) || json.length === 0) return { kind: "empty", detail: "empty array" };
  return { kind: "ok", json };
}

const key = loadKey();
const reprobeAll = process.argv.includes("--all");
const mcIdx = process.argv.indexOf("--max-calls");
const MAX_CALLS = mcIdx > -1 ? Math.max(10, parseInt(process.argv[mcIdx + 1], 10) || 150) : 150;
let callsMade = 0;
const candidatesFile = join(HERE, "universe-candidates.txt");
const evidenceFile = join(HERE, "universe-verified.json");
const listed = readFileSync(candidatesFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*$/, "").trim())
  .filter(Boolean);
const candidates = [...new Set(listed)]; // a symbol listed twice is probed once

// --- resume: keep every verdict already on record unless --all ------------
let previous = [];
try {
  previous = JSON.parse(readFileSync(evidenceFile, "utf8")).results ?? [];
} catch {}
const recorded = new Map(previous.map((r) => [r.symbol, r]));
const toProbe = reprobeAll
  ? candidates
  : candidates.filter((sym) => !recorded.has(sym) || recorded.get(sym).verdict === "?");
const skipped = candidates.length - toProbe.length;

console.log(
  `Universe verifier — ${candidates.length} listed, ${skipped} already on record (skipped), ` +
    `${toProbe.length} to probe: ~${toProbe.length * 2} calls + profiles.` +
    (skipped && !reprobeAll ? "  (--all re-probes everything)" : "") + "\n",
);

const results = [];
// Two different stops (fixed 15 Oct 2026, quirk found 14 Oct: a ceiling stop
// skipped the profile step, so C, CARR and F were seeded with no name or
// sector and Citigroup was scored as an industrial):
//   ceilingStop — OUR budget ceiling. Probing stops, but profiles still run
//                 for the greens found so far, inside a reserved allowance.
//   aborted     — FMP said stop (limit or bad key). Nothing more is sent.
let aborted = false;
let ceilingStop = false;
// Every green costs one profile call; keep room for those this run finds
// (and any on record still unnamed) so the ceiling never strands them.
const unnamedOnRecord = [...recorded.values()].filter((r) => r.verdict === "GREEN" && !r.name).length;
const greensSoFar = () => results.filter((r) => r.verdict === "GREEN").length;

for (const symbol of toProbe) {
  if (callsMade + 2 + greensSoFar() + unnamedOnRecord > MAX_CALLS) {
    console.log(`\nStopping probes at ${callsMade} calls (--max-calls ${MAX_CALLS}), keeping room for the profiles. Run again tomorrow; it resumes here.`);
    ceilingStop = true;
    break;
  }
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

// 3) profiles (names + sectors for the tickers table) — for this run's
//    greens, plus any green on record still missing a name because an
//    earlier run stopped before this step.
const newGreens = results.filter((r) => r.verdict === "GREEN");
const needProfile = [
  ...newGreens,
  ...[...recorded.values()].filter((r) => r.verdict === "GREEN" && !r.name && !newGreens.some((g) => g.symbol === r.symbol)),
];
if (!aborted) {
  console.log(`\nFetching profiles for ${needProfile.length} greens${ceilingStop ? " (ceiling reached for probes; profiles run inside the reserve)" : ""}…`);
  for (const g of needProfile) {
    if (callsMade >= MAX_CALLS) {
      console.log(`Call ceiling reached — remaining names/sectors are fetched on the next run.`);
      break;
    }
    const pr = await probe(
      `https://financialmodelingprep.com/stable/profile?symbol=${g.symbol}&apikey=${key}`,
    );
    if (pr.kind === "rate" || pr.kind === "auth") {
      console.log(`FMP stopped the profile step at ${g.symbol} (${pr.kind}) — remaining names/sectors are fetched on the next run.`);
      break;
    }
    if (pr.kind === "ok" && pr.json[0]) {
      g.name = pr.json[0].companyName ?? null;
      g.sector = pr.json[0].sector ?? null;
    }
    await sleep(DELAY_MS);
  }
}

// --- outputs: merge this run into the record ------------------------------
const runAt = new Date().toISOString();
for (const r of results) {
  if (r.verdict === "?") continue; // stopped before this one was finished — stays probe-able
  recorded.set(r.symbol, { ...r, verified_at: runAt });
}
// Keep the record in candidate-file order, then anything no longer listed.
const merged = [
  ...candidates.filter((sym) => recorded.has(sym)).map((sym) => recorded.get(sym)),
  ...[...recorded.values()].filter((r) => !candidates.includes(r.symbol)),
];
const greens = merged.filter((r) => r.verdict === "GREEN");
const evidence = {
  verified_at: runAt,
  candidates: candidates.length,
  probed_this_run: results.length,
  greens: greens.map((g) => g.symbol),
  aborted_early: aborted || ceilingStop,
  stopped_by: aborted ? "fmp" : ceilingStop ? "ceiling" : null,
  results: merged,
  note: "Raw-materials certificate for the course universe. Free-plan coverage is a whitelist (VC-10); this file is the discovery evidence, merged across runs (each result carries its own verified_at). Education, not advice.",
};
writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2));

const sqlEsc = (s) => String(s).replace(/'/g, "''");
const seed =
  `-- seed-universe.sql — generated by verify-universe.mjs on ${evidence.verified_at}\n` +
  `-- Greens only: ${greens.length} of ${merged.length} on record. Blocked names live in universe-verified.json.\n` +
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

console.log(
  `\n${aborted || ceilingStop ? "PARTIAL RUN (stopped early — run again tomorrow; it resumes). " : ""}` +
    `This run: ${newGreens.length} green / ${results.length} probed, ${callsMade} calls.  On record: ${greens.length} green / ${merged.length}.`,
);
console.log("Wrote scripts/universe-verified.json (evidence) and scripts/seed-universe.sql (the universe).");
console.log("Next: apply the seed to D1 (commands are in the seed file header), commit all three files.");
