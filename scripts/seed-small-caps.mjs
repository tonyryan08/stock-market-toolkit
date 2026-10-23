#!/usr/bin/env node
/**
 * Small-cap tier seeder (decision 14, 19 Oct 2026).
 *
 * The FMP sweep served none of the small caps (0 of 52), so this tier lives
 * on the second spine: Alpha Vantage for prices and accounts, SEC EDGAR for
 * EPS and the audit trail. EDGAR is keyed by CIK, not ticker, so the seed
 * needs each company's CIK — and while we are there, EDGAR's own name and
 * SIC sector, free, no key, no Alpha Vantage ration spent.
 *
 * Run:   npm run seed-small-caps        (reads EDGAR_USER_AGENT from .dev.vars)
 * Cost:  0 Alpha Vantage calls. ~1 + N EDGAR calls, spaced (fair-access: <10/s).
 *
 * Reads: scripts/universe-candidates.txt — every symbol below the "#TIER small" marker.
 * Writes (commit both):
 *   scripts/small-caps-seeded.json — evidence: symbol, CIK, EDGAR name, SIC, sector, or why not
 *   scripts/seed-small-caps.sql    — upserts into tickers with tier='small' (apply local, then remote)
 *
 * Nothing is fetched from Alpha Vantage here: whether AV serves each symbol is
 * discovered by the nightly visit itself, one company at a time, and written
 * to fetch_log and the ticker's status — the same way the FMP whitelist was.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadUserAgent() {
  if (process.env.EDGAR_USER_AGENT) return process.env.EDGAR_USER_AGENT.trim();
  try {
    const text = readFileSync(join(ROOT, ".dev.vars"), "utf8");
    const m = text.match(/EDGAR_USER_AGENT\s*=\s*"?([^"\r\n]+)"?/);
    if (m) return m[1].trim();
  } catch {}
  console.error(
    "No EDGAR_USER_AGENT found. EDGAR's fair-access policy wants a User-Agent naming the project and a contact.\n" +
      '  Add to .dev.vars:   EDGAR_USER_AGENT="stock-market-toolkit you@example.com"\n' +
      "  (and for the live Worker: npx wrangler secret put EDGAR_USER_AGENT)\n",
  );
  process.exit(1);
}

const UA = loadUserAgent();
const headers = { "user-agent": UA, accept: "application/json" };

// --- the tier: every symbol below the marker ------------------------------
const lines = readFileSync(join(HERE, "universe-candidates.txt"), "utf8").split(/\r?\n/);
const at = lines.findIndex((l) => l.trim() === "#TIER small");
if (at < 0) { console.error("Marker '#TIER small' not found in scripts/universe-candidates.txt"); process.exit(1); }
const symbols = [...new Set(lines.slice(at + 1).map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean))];
console.log(`Small-cap tier: ${symbols.length} symbols below the marker.\n`);

// --- 1) EDGAR's ticker → CIK map (one call, ~1 MB) ------------------------
const mapRes = await fetch("https://www.sec.gov/files/company_tickers.json", { headers });
if (!mapRes.ok) { console.error(`EDGAR ticker map: HTTP ${mapRes.status}${mapRes.status === 403 ? " — the User-Agent was refused; check EDGAR_USER_AGENT" : ""}`); process.exit(1); }
const map = await mapRes.json();
const byTicker = new Map();
for (const e of Object.values(map)) if (e && e.ticker) byTicker.set(String(e.ticker).toUpperCase(), { cik: String(e.cik_str).padStart(10, "0"), title: e.title ?? null });
console.log(`EDGAR ticker map: ${byTicker.size} listed companies.\n`);

// --- 2) per company: name + SIC from the submissions API --------------------
const SMALL = new Set(["of", "and", "the", "de", "da", "for"]);
const UPPER = new Set(["LLC", "LP", "PLC", "USA", "US", "AG", "SA", "NV", "II", "III"]);
function titleCase(s) {
  return String(s).toLowerCase().split(/\s+/).map((w, i) => {
    const u = w.toUpperCase().replace(/[.,]/g, "");
    if (UPPER.has(u)) return u;
    if (i > 0 && SMALL.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(" ").replace(/\bInc\b\.?/, "Inc").replace(/\bCorp\b\.?/, "Corp");
}
/** Graham treated financial enterprises separately (ch. 14 p. 361) — the screens key on this label. */
const sectorFromSic = (sic, desc) => {
  const n = parseInt(sic, 10);
  if (Number.isFinite(n) && n >= 6000 && n <= 6799) return "Financial Services";
  return desc ? titleCase(desc) : null;
};

const results = [];
for (const symbol of symbols) {
  const hit = byTicker.get(symbol);
  if (!hit) {
    results.push({ symbol, found: false, reason: "not on EDGAR's ticker map — delisted, acquired, or spelt differently there" });
    console.log(`✗ ${symbol.padEnd(6)} not on EDGAR's ticker map`);
    continue;
  }
  let name = hit.title ? titleCase(hit.title) : null;
  let sic = null, sicDescription = null, sector = null, note = null;
  try {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${hit.cik}.json`, { headers });
    if (r.ok) {
      const j = await r.json();
      if (j.name) name = titleCase(j.name);
      sic = j.sic ?? null;
      sicDescription = j.sicDescription ?? null;
      sector = sectorFromSic(sic, sicDescription);
    } else {
      note = `submissions HTTP ${r.status}`;
    }
  } catch (err) {
    note = `submissions unreachable: ${String(err.message ?? err).slice(0, 80)}`;
  }
  results.push({ symbol, found: true, cik: hit.cik, name, sic, sicDescription, sector, note });
  console.log(`✓ ${symbol.padEnd(6)} CIK ${hit.cik}  ${(name ?? "").padEnd(34)} ${sector ?? "?"}${note ? "  (" + note + ")" : ""}`);
  await sleep(150);
}

// --- outputs ----------------------------------------------------------------
const seededAt = new Date().toISOString();
const found = results.filter((r) => r.found);
writeFileSync(join(HERE, "small-caps-seeded.json"), JSON.stringify({
  seeded_at: seededAt, listed: symbols.length, found: found.length, results,
  note: "Small-cap tier seed evidence (decision 14). CIK, name and SIC are EDGAR's; whether Alpha Vantage serves each symbol is discovered by the nightly visit (fetch_log, tickers.status). Education, not advice.",
}, null, 2));

const sqlEsc = (s) => String(s).replace(/'/g, "''");
const seed =
  `-- seed-small-caps.sql — generated by seed-small-caps.mjs on ${seededAt}\n` +
  `-- ${found.length} of ${symbols.length} listed symbols found on EDGAR; the rest are in small-caps-seeded.json.\n` +
  `-- Apply:  npx wrangler d1 execute stock-market-db --local  --file=scripts/seed-small-caps.sql\n` +
  `--         npx wrangler d1 execute stock-market-db --remote --file=scripts/seed-small-caps.sql\n` +
  found.map((r) =>
    `INSERT INTO tickers (symbol, name, sector, status, tier, cik) VALUES ('${sqlEsc(r.symbol)}', ${r.name ? `'${sqlEsc(r.name)}'` : "NULL"}, ${r.sector ? `'${sqlEsc(r.sector)}'` : "NULL"}, 'active', 'small', '${r.cik}') ` +
    `ON CONFLICT(symbol) DO UPDATE SET name=excluded.name, sector=excluded.sector, status='active', tier='small', cik=excluded.cik;`,
  ).join("\n") + "\n";
writeFileSync(join(HERE, "seed-small-caps.sql"), seed);

console.log(`\n${found.length} of ${symbols.length} found on EDGAR. Wrote scripts/small-caps-seeded.json (evidence) and scripts/seed-small-caps.sql (the tier).`);
console.log("Next: apply the seed to D1 (commands in the file header), then ring the small-cap doorbell or wait for 23:10 UTC.");
