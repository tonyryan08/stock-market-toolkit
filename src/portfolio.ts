/**
 * Week 8: how much to bet — the position-size calculator, the tickets and the
 * student's page. D1 only (invariant 4): the facts come from the signals
 * table the nightly pass writes; nothing here calls a provider.
 *
 *   POST /api/position-size   { capital, ticker } → the rule's size and stop, with the arithmetic
 *   GET  /size?ticker=&capital=  the same as a page, for the lesson
 *   POST /api/tickets         { code, ticker, side, units?, journal } → accepted (201) or refused (422, reasons)
 *   GET  /api/tickets/:code   the student's positions, tickets and account (marked to market from week 9)
 *   GET  /tickets/:code       the student's page, with the ticket form and the risk report
 *   POST /tickets/:code       the form's ticket (same rules as the API)
 *   GET  /api/risk/:code      week 9: tonight's risk report computed on request, and the nightly rows
 *
 * Input validation is the Cloudflare lesson of the week: every field bounded
 * before any SQL; the student code and the ticker are regex-gated; a ticket
 * and its position change in ONE D1 batch, so a half-written trade cannot
 * exist. Education, not advice: a ticket is what a rule-following paper
 * account would do; the toolkit never says whether to do it.
 */
import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, SHARED_CSS, esc } from "./page";
import { SIZING, sizePosition, describeSizing, SizeInputError, type Sizing } from "./lib/sizing";
import { RULE as SIGNAL_RULE } from "./lib/signals";
import { CODE, JOURNAL_MIN, JOURNAL_MAX, parseTicket, decideTicket, accountOf, type Facts, type PositionRow, type TicketRow, type SignalFact, type Student, type Reason } from "./lib/tickets";
import { markToMarket, buildReport, describeReport, type RiskReport, type Latest as RiskLatest } from "./lib/risk";
import { targetFor, fmtPct } from "./lib/sizing";

type Env = { DB: D1Database };
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;
const NOTE = "Education, not advice. The size is what Carver's rule would hold in a paper account at a 12% risk target — not a recommendation to buy, hold or sell anything.";

export const portfolio = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Facts from D1
// ---------------------------------------------------------------------------
async function latestSignal(db: D1Database, symbol: string): Promise<SignalFact | null> {
  return db.prepare("SELECT date, close, instrument_risk, state, state_since, days, quarantined FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1").bind(symbol).first<SignalFact>();
}
async function tickerInfo(db: D1Database, symbol: string): Promise<{ tier: string; status: string; name: string | null } | null> {
  return db.prepare("SELECT tier, status, name FROM tickers WHERE symbol = ?1").bind(symbol).first<{ tier: string; status: string; name: string | null }>();
}
async function loadStudent(db: D1Database, code: string): Promise<Student | null> {
  const s = await db.prepare("SELECT code, name, capital, instruments FROM students WHERE code = ?1").bind(code).first<Student>();
  return s ? { ...s, instruments: Math.max(1, Math.min(SIZING.maxInstruments, Number(s.instruments) || 1)) } : null;
}
type RiskRow = { date: string; account_value: number; cash: number; market_value: number; open_pnl: number; realised_pnl: number; hwm: number; drawdown_pct: number; risk_used_pct: number; risk_target_pct: number; instruments: number; open_positions: number; nearest_stop_pct: number | null; stop_hits: number; flags: string; computed_at: string };
async function loadRiskRows(db: D1Database, code: string, limit = 10): Promise<RiskRow[]> {
  return (await db.prepare("SELECT * FROM risk_reports WHERE code = ?1 ORDER BY date DESC LIMIT ?2").bind(code, limit).all<RiskRow>()).results;
}
/** The latest close the toolkit holds for any instrument — the night a report is "as of" (reviews F2/F6 of v0.11.0). */
async function latestNight(db: D1Database): Promise<string | null> {
  return (await db.prepare("SELECT MAX(date) AS d FROM signals").first<{ d: string | null }>())?.d ?? null;
}
/**
 * Tonight's report on request: the same arithmetic the nightly job writes, with the high-water mark carried from the
 * last written row, as of the night (the latest close for any instrument) — or, before any signal row exists, the
 * positions' latest close, then the last row's date, and "—" only when there is nothing at all to date it by.
 */
function reportNow(student: Student, positions: PositionRow[], tickets: TicketRow[], latest: RiskLatest, rows: RiskRow[], night: string | null): RiskReport {
  const marked = markToMarket(student, positions, tickets, latest);
  const prev = rows[0] ?? null;
  return buildReport(student, marked, prev ? Math.max(prev.hwm, prev.account_value) : null, night ?? marked.date ?? prev?.date ?? "—");
}
async function loadPositions(db: D1Database, code: string): Promise<PositionRow[]> {
  return (await db.prepare("SELECT * FROM positions WHERE code = ?1 ORDER BY id").bind(code).all<PositionRow>()).results;
}
async function loadTickets(db: D1Database, code: string): Promise<TicketRow[]> {
  return (await db.prepare("SELECT * FROM tickets WHERE code = ?1 ORDER BY id").bind(code).all<TicketRow>()).results;
}

/** The sizing for a ticker from its latest signal row, or the reason there is none. */
async function sizeFor(db: D1Database, ticker: string, capital: number, instruments = 1): Promise<
  | { ok: true; sizing: Sizing; signal: SignalFact; name: string | null; tier: string; reading: string; caution: string | null }
  | { ok: false; status: 400 | 404 | 422; error: string }
> {
  const t = await tickerInfo(db, ticker);
  if (!t) return { ok: false, status: 404, error: `"${ticker}" is not in the course universe. The universe is the verified list at /api/universe.` };
  if (t.status !== "active") return { ok: false, status: 404, error: `"${ticker}" is in the universe but outside the free data plan — no prices, no signal.` };
  const sig = await latestSignal(db, ticker);
  if (!sig) return { ok: false, status: 404, error: `No signal row for "${ticker}" yet — the nightly pass (23:00 UTC) has not reached it.` };
  // The calculator keeps to what the tickets allow (review F13; week 9, decision 20): a small-tier symbol
  // once its rule is mature and nothing in its series is unexplained.
  if (t.tier !== "core") {
    if (sig.quarantined) return { ok: false, status: 422, error: `"${ticker}" is quarantined: ${sig.quarantined} No sizing and no tickets until a splits row explains the jump.` };
    if (sig.state === "warming") return { ok: false, status: 422, error: `"${ticker}" is in the small-cap tier and its rule is still warming up (${sig.days} closes stored of the ${SIGNAL_RULE.minMatureDays} it needs): no sizing and no tickets yet.` };
  }
  if (!(sig.instrument_risk && sig.instrument_risk > 0)) return { ok: false, status: 422, error: `"${ticker}" has no instrument risk on ${sig.date} (${sig.state}: fewer than ${SIGNAL_RULE.minMatureDays} closes) — nothing to size.` };
  try {
    // Week 9 (review F7 of v0.11.0): the calculator sizes at the per-instrument target, 12% ÷ N, as the ticket does.
    const sizing = sizePosition({ capital, price: sig.close, instrumentRiskPct: sig.instrument_risk, targetPct: targetFor(instruments) });
    const caution = sig.state === "warming"
      ? `Sized on ${sig.days ?? "fewer than " + SIGNAL_RULE.minMatureDays} closes: the rule is still warming up for ${ticker} and its instrument risk is not yet trusted — the ticket route will refuse an opening ticket until the rule is long.`
      : null;
    return { ok: true, sizing, signal: sig, name: t.name, tier: t.tier, reading: describeSizing(sizing, ticker), caution };
  } catch (err) {
    if (err instanceof SizeInputError) return { ok: false, status: 400, error: err.message };
    throw err;
  }
}

/** 1–4 instruments; blank means 1 (the Starter System); anything else is refused. */
function parseInstruments(raw: unknown): number | null {
  if (raw === undefined || raw === null || String(raw).trim() === "") return 1;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  return Number.isInteger(n) && n >= 1 && n <= SIZING.maxInstruments ? n : null;
}

function parseCapital(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && n > 0 && n <= 1e9 ? n : null;
}

// ---------------------------------------------------------------------------
// POST /api/position-size
// ---------------------------------------------------------------------------
portfolio.post("/api/position-size", async (c) => {
  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { return c.json({ error: "Send JSON: { \"capital\": 10000, \"ticker\": \"AAPL\" }" }, 400); }
  const ticker = String(body.ticker ?? body.symbol ?? "").trim().toUpperCase();
  if (!TICKER.test(ticker)) return c.json({ error: "That doesn't look like a ticker symbol." }, 400);
  const capital = parseCapital(body.capital);
  if (capital === null) return c.json({ error: "capital must be a positive number of dollars, at most 1,000,000,000." }, 400);
  const instruments = parseInstruments(body.instruments);
  if (instruments === null) return c.json({ error: `instruments must be a whole number from 1 to ${SIZING.maxInstruments} (each position is sized at ${SIZING.riskTargetPct}% ÷ N).` }, 400);
  const r = await sizeFor(c.env.DB, ticker, capital, instruments);
  if (!r.ok) return c.json({ ticker, error: r.error }, r.status);
  return c.json({
    ticker, name: r.name, tier: r.tier, as_of: r.signal.date, price: r.signal.close, instrument_risk: r.signal.instrument_risk, state: r.signal.state,
    instruments, per_instrument_target_pct: targetFor(instruments),
    units: r.sizing.units, stop_level: r.sizing.stopLevel, stop_gap: r.sizing.stopGap,
    sizing: r.sizing, reading: r.reading, caution: r.caution, rules: SIZING,
    note: NOTE,
  });
});

// ---------------------------------------------------------------------------
// GET /size — the calculator page
// ---------------------------------------------------------------------------
portfolio.get("/size", async (c) => {
  const tickerRaw = (c.req.query("ticker") ?? "").trim().toUpperCase();
  const capitalRaw = c.req.query("capital") ?? "";
  const instrumentsRaw = c.req.query("instruments") ?? "";
  const instruments = parseInstruments(instrumentsRaw);
  // The list offers every core-tier name and each small cap whose rule is mature and not quarantined
  // (Phase 3 review H5: the lede said "core-tier" after week 9 made the small tier ticketable).
  const universe = (await c.env.DB.prepare(
    "SELECT t.symbol FROM tickers t LEFT JOIN signals s ON s.symbol = t.symbol AND s.date = (SELECT MAX(date) FROM signals WHERE symbol = t.symbol) " +
    "WHERE t.status = 'active' AND (t.tier = 'core' OR (s.state IS NOT NULL AND s.state <> 'warming' AND s.quarantined IS NULL)) ORDER BY t.symbol",
  ).all<{ symbol: string }>()).results.map((r) => r.symbol);
  let result: Awaited<ReturnType<typeof sizeFor>> | null = null;
  let error: string | null = null;
  const capital = capitalRaw === "" ? null : parseCapital(capitalRaw);
  if (tickerRaw || capitalRaw) {
    if (!TICKER.test(tickerRaw)) error = "That doesn't look like a ticker symbol.";
    else if (capital === null) error = "Capital must be a positive number of dollars.";
    else if (instruments === null) error = `Instruments must be a whole number from 1 to ${SIZING.maxInstruments}.`;
    else {
      result = await sizeFor(c.env.DB, tickerRaw, capital, instruments);
      if (!result.ok) error = result.error;
    }
  }
  return c.html(sizePage(tickerRaw, capitalRaw, instrumentsRaw, universe, result && result.ok ? result : null, error));
});

const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function sizePage(ticker: string, capital: string, instrumentsRaw: string, universe: string[], r: { sizing: Sizing; signal: SignalFact; name: string | null; reading: string; caution: string | null } | null, error: string | null): string {
  const list = universe.map((s) => `<option value="${esc(s)}">`).join("");
  const n = parseInstruments(instrumentsRaw) ?? 1;
  const target = r ? r.sizing.input.targetPct ?? SIZING.riskTargetPct : targetFor(n);
  const share = n > 1 ? ` (${SIZING.riskTargetPct}% ÷ ${n} instruments)` : "";
  let body = "";
  if (error) body = `<p class="empty">${esc(error)}</p>`;
  if (r) {
    const s = r.sizing;
    const sig = r.signal;
    const row = (k: string, v: string, how = "") => `<tr><th scope="row">${k}</th><td class="v">${v}</td><td class="how">${how}</td></tr>`;
    body = `
  <p class="reading">${esc(r.reading)}</p>${r.caution ? `<p class="empty">${esc(r.caution)}</p>` : ""}
  <div class="wrap"><table>
    <thead><tr><th>Step</th><th>Value</th><th>How</th></tr></thead><tbody>
    ${row("Latest close", money(sig.close), `${esc(sig.date)} · the rule is <b>${esc(sig.state.toUpperCase())}</b>${sig.state_since ? ` since ${esc(sig.state_since)}` : ""}`)}
    ${row("Instrument risk", `${sig.instrument_risk!.toFixed(2)}% a year`, "the signals page's σ of daily % returns × 16")}
    ${row("Target exposure", money(s.targetExposure), `${money(s.input.capital)} × ${fmtPct(target)}${share} ÷ ${sig.instrument_risk!.toFixed(2)}${s.capped ? " — capped at the whole account (no leverage)" : ""}`)}
    ${row("Whole shares", `${s.units}`, `⌊${money(s.targetExposure)} ÷ ${money(sig.close)}⌋`)}
    ${row("Position", money(s.exposure), `${s.units} × ${money(sig.close)} = ${s.weightPct.toFixed(1)}% of the account, carrying ${s.achievedRiskPct.toFixed(2)}% a year`)}
    ${row("Stop gap", money(s.stopGap), `½ × ${sig.instrument_risk!.toFixed(2)}% × ${money(sig.close)} — fixed at entry`)}
    ${row("First stop", money(s.stopLevel), `${money(sig.close)} − ${money(s.stopGap)}; it follows the highest close since entry, never down`)}
    ${row("Cost of a trade", money(s.costs.open), `$${SIZING.costPerTrade} + ${SIZING.fxPct}% × ${money(s.exposure)}`)}
    ${row("Round trip", `${money(s.costs.roundTrip)} (${s.costs.roundTripPct.toFixed(2)}%)`, `two trades; the course's limit is ${SIZING.maxRoundTripCostPct}% of the position`)}
    ${row("Minimum account", money(s.minimumCapital), `for ${esc(ticker)} at this price and risk${n > 1 ? ` with ${n} instruments` : ""}: one share and a round trip under ${SIZING.maxRoundTripCostPct}%`)}
    </tbody></table></div>
  <ul class="checks">${s.checks.map((k) => `<li class="${k.ok ? "ok" : "no"}">${k.ok ? "✓" : "✗"} ${esc(k.message)}</li>`).join("")}</ul>
  ${s.ok ? "" : `<p class="verdict">The rule cannot take this position with this account. Nothing is wrong with the company; the account is too small for the share at this risk.</p>`}`;
  }
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>How much to bet — the position-size calculator</title>
<meta name="referrer" content="same-origin">
${FONTS_HTML}
<style>
${PAGE_CSS}
${SHARED_CSS}
  main { max-width: 50rem; }
  form.calc { display:flex; gap:.8rem; flex-wrap:wrap; align-items:flex-end; margin:1rem 0 1.4rem; }
  form.calc label { display:flex; flex-direction:column; font-size:.8rem; color:var(--faint); gap:.2rem; }
  form.calc input { font: inherit; padding:.4rem .5rem; border:1px solid var(--rule); border-radius:4px; background:#fff; min-width:9rem; }
  form.calc button { font: inherit; padding:.45rem .9rem; border:1px solid var(--entry); background:var(--entry); color:#fff; border-radius:4px; cursor:pointer; }
  .reading { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:.8rem 1rem; margin:1rem 0; }
  table { width:100%; border-collapse:collapse; font-size:.88rem; }
  th, td { padding:.4rem .5rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:top; }
  thead th { color:var(--faint); font-weight:400; font-size:.75rem; letter-spacing:.04em; text-transform:uppercase; }
  tbody th { font-weight:500; white-space:nowrap; }
  td.v { font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  td.how { color:var(--faint); font-size:.82rem; }
  .checks { list-style:none; padding:0; margin:1rem 0; font-size:.88rem; }
  .checks li { padding:.3rem 0; } .checks li.no { color:var(--stamp); } .checks li.ok { color:var(--entry); }
  .verdict { font-weight:600; }
  .empty { color:var(--stamp); }
  .rule { background:rgba(255,255,255,.5); border:1px solid var(--rule); border-radius:6px; padding:.8rem 1rem; font-size:.85rem; margin:1.2rem 0; }
</style></head>
<body><main>
  <p class="back"><a href="/">← course home</a> · <a href="/signals">signals</a></p>
  <p class="eyebrow">Weeks 8–9 · how much to bet</p>
  <h1>The position-size calculator</h1>
  <p class="lede">Carver's Starter System, unleveraged: a ${SIZING.riskTargetPct}% risk target shared equally between the instruments an account runs (${SIZING.riskTargetPct}% ÷ N each, N = 1 unless the tutor set more), the stop at half the annual instrument risk below the high since entry, whole shares, $${SIZING.costPerTrade} + ${SIZING.fxPct}% a trade. Type an account value and a ticker — any core-tier name, or a small cap once its rule has ${SIGNAL_RULE.minMatureDays} closes (the list offers the ones that do); the arithmetic is shown line by line so you can check every number on a calculator. The ticket sizes on the account's <em>current</em> value — type that, not the capital enrolled.</p>
  <form class="calc" method="get" action="/size">
    <label>Ticker <input name="ticker" list="universe" value="${esc(ticker)}" placeholder="AAPL" required maxlength="12"><datalist id="universe">${list}</datalist></label>
    <label>Account value, $ <input name="capital" inputmode="decimal" value="${esc(capital)}" placeholder="10000" required maxlength="14"></label>
    <label>Instruments (1–${SIZING.maxInstruments}) <input name="instruments" inputmode="numeric" value="${esc(instrumentsRaw)}" placeholder="1" maxlength="1"></label>
    <button type="submit">Size it</button>
  </form>
  ${body}
  <div class="rule"><b>The rule, in full.</b> Target exposure = account value × (${SIZING.riskTargetPct}% ÷ N instruments) ÷ instrument risk, capped at the account (no leverage) · units = whole shares that fit · stop gap = ½ × instrument risk × entry price, fixed at entry · stop = highest close since entry − gap · a trade costs $${SIZING.costPerTrade} + ${SIZING.fxPct}% · a position whose round trip costs more than ${SIZING.maxRoundTripCostPct}% is too small to trade. The constants live in one table, <code>src/lib/sizing.ts</code>, which the ticket route and the nightly stop tracker share.</div>
  <footer><p class="notice">${NOTE}</p></footer>
</main></body></html>`;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------
async function factsFor(db: D1Database, student: Student, symbol: string): Promise<Facts> {
  const t = await tickerInfo(db, symbol);
  const [signal, positions, tickets] = await Promise.all([t ? latestSignal(db, symbol) : Promise.resolve(null), loadPositions(db, student.code), loadTickets(db, student.code)]);
  // Week 9: the open positions' latest closes, to mark the account to market before sizing.
  const latest = await latestFor(db, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  return { student, tier: t?.tier ?? null, tickerStatus: t?.status ?? null, signal, positions, tickets, latest };
}

/**
 * Accept a decided ticket: the ticket row and its position in one batch — one transaction.
 * The facts were read before the decision; the write re-checks them inside the transaction
 * (review F8): an opening ticket lands only if no open position exists for the code and
 * symbol, a closing ticket only if the position is still open, and the second statement
 * runs only if the first inserted (`changes() = 1`). Two simultaneous tickets cannot both
 * land; the loser is told to reload. Returns the ticket id, or null when nothing landed.
 */
async function acceptTicket(db: D1Database, req: { code: string; symbol: string; journal: string }, d: Exclude<ReturnType<typeof decideTicket>, { ok: false }>, now: string): Promise<{ landed: true; id: number | null } | { landed: false }> {
  const cols = "code, symbol, side, units, fill_date, fill_price, cost, signal_state, journal, created_at";
  const ticket = d.side === "open"
    ? db.prepare(
        `INSERT INTO tickets (${cols}) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
         WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = ?1 AND symbol = ?2 AND status = 'open')`,
      ).bind(req.code, req.symbol, d.side, d.units, d.fillDate, d.fillPrice, d.cost, d.signalState, req.journal, now)
    : db.prepare(
        `INSERT INTO tickets (${cols}) SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
         WHERE EXISTS (SELECT 1 FROM positions WHERE id = ?11 AND status = 'open')`,
      ).bind(req.code, req.symbol, d.side, d.units, d.fillDate, d.fillPrice, d.cost, d.signalState, req.journal, now, d.position.id);
  const second = d.side === "open"
    ? db.prepare(
        `INSERT INTO positions (code, symbol, status, opened_on, entry_price, units, exposure, stop_gap, high_since, stop_level, stop_hit_on, instrument_risk, realign_date, tracked_on, open_ticket_id)
         SELECT ?1, ?2, 'open', ?3, ?4, ?5, ?6, ?7, ?4, ?8, NULL, ?9, NULL, ?3, last_insert_rowid() WHERE changes() = 1`,
      ).bind(req.code, req.symbol, d.fillDate, d.fillPrice, d.units, Math.round(d.units * d.fillPrice * 100) / 100, d.sizing.stopGap, d.sizing.stopLevel, d.sizing.input.instrumentRiskPct)
    : db.prepare("UPDATE positions SET status = 'closed', closed_on = ?2, exit_price = ?3, pnl = ?4, close_ticket_id = last_insert_rowid() WHERE id = ?1 AND status = 'open' AND changes() = 1")
        .bind(d.position.id, d.fillDate, d.fillPrice, d.pnl);
  const res = await db.batch([ticket, second]);
  const meta = res[0]?.meta as { last_row_id?: number; changes?: number } | undefined;
  if (typeof meta?.changes === "number" && meta.changes === 0) return { landed: false };
  const id = meta?.last_row_id;
  return { landed: true, id: typeof id === "number" ? id : null };
}

type TicketOutcome = { status: 201 | 404 | 409 | 422; body: Record<string, unknown>; reasons?: Reason[] };

async function handleTicket(db: D1Database, raw: Record<string, unknown>): Promise<TicketOutcome> {
  const parsed = parseTicket(raw);
  if (!parsed.ok) return { status: 422, body: { error: "The ticket was not accepted.", reasons: parsed.reasons }, reasons: parsed.reasons };
  const req = parsed.req;
  const student = await loadStudent(db, req.code);
  if (!student) return { status: 404, body: { error: "No student with that code. Codes come from the tutor's enrolment." }, reasons: [{ code: "code", message: "No student with that code." }] };
  const facts = await factsFor(db, student, req.symbol);
  const d = decideTicket(req, facts);
  if (!d.ok) return { status: 422, body: { error: "The ticket was not accepted.", code: req.code, symbol: req.symbol, side: req.side, reasons: d.reasons }, reasons: d.reasons };
  const now = new Date().toISOString();
  const landed = await acceptTicket(db, req, d, now);
  if (!landed.landed) {
    const r: Reason = { code: "raced", message: `Another ticket for ${req.symbol} landed first (a double click, or a second tab): nothing was written. Reload the page and look before writing again.` };
    return { status: 409, body: { error: "The ticket was not accepted.", code: req.code, symbol: req.symbol, side: req.side, reasons: [r] }, reasons: [r] };
  }
  const id = landed.id;
  const account = accountOf(student.capital, facts.positions, facts.tickets);
  const common = { accepted: true, id, code: req.code, symbol: req.symbol, side: d.side, units: d.units, fill_date: d.fillDate, fill_price: d.fillPrice, cost: d.cost, signal_state: d.signalState, journal: req.journal, cash_before: account.cash, note: NOTE };
  if (d.side === "open") {
    return { status: 201, body: { ...common, exposure: Math.round(d.units * d.fillPrice * 100) / 100, stop_gap: d.sizing.stopGap, stop_level: d.sizing.stopLevel, rule_units: d.sizing.units, under_sized: d.underSized, reading: describeSizing(d.sizing, req.symbol) } };
  }
  return { status: 201, body: { ...common, entry_price: d.position.entry_price, pnl: d.pnl, stop_was_hit: d.stopWasHit, opened_on: d.position.opened_on } };
}

portfolio.post("/api/tickets", async (c) => {
  let body: Record<string, unknown>;
  try { body = (await c.req.json()) as Record<string, unknown>; } catch { return c.json({ error: "Send JSON: { \"code\", \"ticker\", \"side\": \"open\"|\"close\", \"units\"?, \"journal\" }" }, 400); }
  const out = await handleTicket(c.env.DB, body);
  return c.json(out.body, out.status);
});

portfolio.get("/api/tickets/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!CODE.test(code)) return c.json({ error: "That doesn't look like a student code." }, 400);
  const student = await loadStudent(c.env.DB, code);
  if (!student) return c.json({ error: "No student with that code." }, 404);
  const [positions, tickets, rows, night] = await Promise.all([loadPositions(c.env.DB, code), loadTickets(c.env.DB, code), loadRiskRows(c.env.DB, code, 1), latestNight(c.env.DB)]);
  const account = accountOf(student.capital, positions, tickets);
  const latest = await latestFor(c.env.DB, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  const report = reportNow(student, positions, tickets, latest, rows, night);
  return c.json({ code, name: student.name, instruments: student.instruments, per_instrument_target_pct: targetFor(student.instruments), account, value: report.accountValue, open_pnl: report.openPnl, drawdown_pct: report.drawdownPct, positions, tickets, rules: SIZING, note: NOTE });
});

// ---------------------------------------------------------------------------
// Week 9: the risk report — tonight's, computed on request, and the nightly rows
// ---------------------------------------------------------------------------
portfolio.get("/api/risk/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!CODE.test(code)) return c.json({ error: "That doesn't look like a student code." }, 400);
  const student = await loadStudent(c.env.DB, code);
  if (!student) return c.json({ error: "No student with that code." }, 404);
  const [positions, tickets, rows, night] = await Promise.all([loadPositions(c.env.DB, code), loadTickets(c.env.DB, code), loadRiskRows(c.env.DB, code, 30), latestNight(c.env.DB)]);
  const latest = await latestFor(c.env.DB, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  const r = reportNow(student, positions, tickets, latest, rows, night);
  const { marked, ...report } = r;
  return c.json({
    code, name: student.name, enrolled_capital: student.capital, report: { ...report, positions: marked.contributions, reading: describeReport(r, student.capital) },
    nightly: rows.map((x) => ({ ...x, flags: safeFlags(x.flags) })),
    rules: { risk_target_pct: SIZING.riskTargetPct, per_instrument_pct: targetFor(student.instruments), max_instruments: SIZING.maxInstruments, budget_tolerance_pct: SIZING.budgetTolerancePct, drawdown_note_pct: SIZING.drawdownNotePct },
    note: NOTE,
  });
});
const safeFlags = (f: string): string[] => { try { const v = JSON.parse(f); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };

// ---------------------------------------------------------------------------
// The student's page and its form
// ---------------------------------------------------------------------------
type Latest = Record<string, SignalFact>;
async function latestFor(db: D1Database, symbols: string[]): Promise<Latest> {
  const out: Latest = {};
  for (const s of [...new Set(symbols)]) { const sig = await latestSignal(db, s); if (sig) out[s] = sig; }
  return out;
}

portfolio.get("/tickets/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!CODE.test(code)) return c.html(ticketsEmptyPage("That doesn't look like a student code — eight characters like K7PM-4R2X."), 400);
  const student = await loadStudent(c.env.DB, code);
  if (!student) return c.html(ticketsEmptyPage("No student with that code. Codes come from the tutor's enrolment."), 404);
  const [positions, tickets, rows, night] = await Promise.all([loadPositions(c.env.DB, code), loadTickets(c.env.DB, code), loadRiskRows(c.env.DB, code), latestNight(c.env.DB)]);
  const latest = await latestFor(c.env.DB, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  return c.html(ticketsPage(student, positions, tickets, latest, null, {}, rows, night));
});

portfolio.post("/tickets/:code", async (c) => {
  const code = c.req.param("code").trim().toUpperCase();
  if (!CODE.test(code)) return c.html(ticketsEmptyPage("That doesn't look like a student code."), 400);
  const form = await c.req.parseBody();
  const raw: Record<string, unknown> = { code, symbol: form.symbol, side: form.side, units: form.units, journal: form.journal };
  const out = await handleTicket(c.env.DB, raw);
  const student = await loadStudent(c.env.DB, code);
  if (!student) return c.html(ticketsEmptyPage("No student with that code."), 404);
  const [positions, tickets, rows, night] = await Promise.all([loadPositions(c.env.DB, code), loadTickets(c.env.DB, code), loadRiskRows(c.env.DB, code), latestNight(c.env.DB)]);
  const latest = await latestFor(c.env.DB, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  const flash = out.status === 201
    ? { kind: "ok" as const, text: `Ticket accepted: ${out.body.side} ${out.body.units} × ${out.body.symbol} at ${money(out.body.fill_price as number)} on the ${out.body.fill_date} close (cost ${money(out.body.cost as number)}).${out.body.side === "open" ? ` Stop ${money(out.body.stop_level as number)}.` : ` P&L ${money(out.body.pnl as number)}.`}` }
    : { kind: "no" as const, text: "The ticket was not accepted.", reasons: out.reasons ?? [] };
  const keep: Record<string, string> = out.status === 201 ? {} : { symbol: String(form.symbol ?? ""), side: String(form.side ?? ""), units: String(form.units ?? ""), journal: String(form.journal ?? "") };
  return c.html(ticketsPage(student, positions, tickets, latest, flash, keep, rows, night), out.status === 201 ? 200 : out.status);
});

function ticketsEmptyPage(reason: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Tickets</title><meta name="referrer" content="same-origin">${FONTS_HTML}<style>${PAGE_CSS} .empty{color:var(--stamp)}</style></head>
<body><main><p class="back"><a href="/">← course home</a></p><p class="eyebrow">Week 8 · tickets</p><h1>Paper tickets</h1><p class="empty">${esc(reason)}</p><footer><p class="notice">${NOTE}</p></footer></main></body></html>`;
}

function ticketsPage(student: Student, positions: PositionRow[], tickets: TicketRow[], latest: Latest, flash: { kind: "ok" | "no"; text: string; reasons?: Reason[] } | null, keep: Record<string, string>, riskRows: RiskRow[] = [], night: string | null = null): string {
  const account = accountOf(student.capital, positions, tickets);
  const open = positions.filter((p) => p.status === "open");
  const closed = positions.filter((p) => p.status === "closed");
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
  const report = reportNow(student, positions, tickets, latest, riskRows, night);
  const reading = describeReport(report, student.capital);
  const since = student.capital > 0 ? ((report.accountValue - student.capital) / student.capital) * 100 : 0;
  // One set of words for the flags — the page, the lesson and the deck (review F9 iv of v0.11.0).
  const flagWords: Record<string, string> = { over_budget: `over the ${SIZING.riskTargetPct}% budget`, stop_hit: "stop hit", drawdown: `drawdown ≥ ${SIZING.drawdownNotePct}%`, missing_close: "no close stored", too_many_positions: "more positions than instruments" };
  const historyRows = riskRows.map((x) => `<tr><td class="d">${esc(x.date)}</td><td class="n">${money(x.account_value)}</td><td class="n">${money(x.open_pnl)}</td><td class="n">${x.drawdown_pct.toFixed(1)}%</td><td class="n">${x.risk_used_pct.toFixed(1)}% / ${x.risk_target_pct}%</td><td class="n">${x.open_positions}</td><td class="n">${x.nearest_stop_pct === null ? "—" : `${x.nearest_stop_pct.toFixed(1)}%`}</td><td>${safeFlags(x.flags).map((f) => `<span class="tag flag">${esc(flagWords[f] ?? f)}</span>`).join(" ")}</td></tr>`).join("");
  const openRows = open.map((p) => {
    const l = latest[p.symbol];
    const close = l?.close ?? null;
    const dist = close !== null ? ((close - p.stop_level) / close) * 100 : null;
    const unreal = close !== null ? (close - p.entry_price) * p.units : null;
    return `<tr class="${p.stop_hit_on ? "hit" : ""}">
      <th scope="row"><a href="/prices/${esc(p.symbol)}">${esc(p.symbol)}</a></th>
      <td class="n">${p.units}</td><td class="n">${money(p.entry_price)}<span class="sub">${esc(p.opened_on)}${p.realign_date ? ` · re-aligned ${esc(p.realign_date)}` : ""}</span></td>
      <td class="n">${close === null ? "—" : money(close)}<span class="sub">${l ? esc(l.date) : ""}</span></td>
      <td class="n">${money(p.stop_level)}<span class="sub">high ${money(p.high_since)} − ${money(p.stop_gap)}</span></td>
      <td class="n">${dist === null ? "—" : pct(dist)}</td>
      <td class="n">${unreal === null ? "—" : money(unreal)}</td>
      <td>${p.stop_hit_on ? `<span class="tag hit">STOP HIT ${esc(p.stop_hit_on)}</span><span class="sub">the rule says close — write the close ticket</span>` : l ? `<span class="tag ${esc(l.state)}">${esc(l.state.toUpperCase())}</span>` : ""}</td>
    </tr>`;
  }).join("");
  const closedRows = closed.map((p) => `<tr><th scope="row">${esc(p.symbol)}</th><td class="n">${p.units}</td><td class="n">${money(p.entry_price)}<span class="sub">${esc(p.opened_on)}${p.realign_date ? ` · re-aligned ${esc(p.realign_date)}` : ""}</span></td><td class="n">${p.exit_price === null ? "—" : money(p.exit_price)}<span class="sub">${esc(p.closed_on ?? "")}</span></td><td class="n ${(p.pnl ?? 0) >= 0 ? "pos" : "neg"}">${p.pnl === null ? "—" : money(p.pnl)}</td><td>${p.stop_hit_on ? `stop hit ${esc(p.stop_hit_on)}` : ""}</td></tr>`).join("");
  const ticketRows = [...tickets].reverse().map((t) => `<tr><td class="n">#${t.id}</td><td class="d">${esc(t.created_at.slice(0, 10))}</td><td>${esc(t.side)}</td><th scope="row">${esc(t.symbol)}</th><td class="n">${t.units}</td><td class="n">${money(t.fill_price)}<span class="sub">${esc(t.fill_date)} · ${esc(t.signal_state ?? "")}</span></td><td class="n">${money(t.cost)}</td><td class="j">${esc(t.journal)}</td></tr>`).join("");
  const flashHtml = flash
    ? flash.kind === "ok"
      ? `<div class="flash ok">${esc(flash.text)}</div>`
      : `<div class="flash no"><b>${esc(flash.text)}</b><ul>${(flash.reasons ?? []).map((r) => `<li>${esc(r.message)}</li>`).join("")}</ul></div>`
    : "";
  const sel = (v: string) => (keep.side === v ? " selected" : "");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tickets — ${esc(student.name)}</title>
<meta name="referrer" content="same-origin">
${FONTS_HTML}
<style>
${PAGE_CSS}
${SHARED_CSS}
  main { max-width: 56rem; }
  .acct { display:flex; gap:1.4rem; flex-wrap:wrap; margin:.6rem 0 1.2rem; font-family:"IBM Plex Mono",monospace; font-size:.85rem; }
  .acct b { font-size:1.25rem; display:block; }
  .acct i { display:block; font-style:normal; color:var(--faint); font-size:.72rem; font-family:"IBM Plex Sans",sans-serif; }
  .when { font-family:"IBM Plex Sans",sans-serif; font-size:.78rem; color:var(--faint); font-weight:400; margin-left:.4rem; }
  .report { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:.6rem 1rem; margin:.4rem 0 1rem; font-size:.9rem; }
  .report p { margin:.4rem 0; }
  .tag.flag { background:#F1EBD6; color:#6b5d2a; margin-right:.2rem; }
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.2rem; margin:1.6rem 0 .5rem; }
  table { width:100%; border-collapse:collapse; font-size:.85rem; }
  th, td { padding:.4rem .5rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:top; }
  thead th { color:var(--faint); font-weight:400; font-size:.72rem; letter-spacing:.04em; text-transform:uppercase; }
  tbody th { font-weight:500; white-space:nowrap; }
  td.n { font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  td.j { font-size:.8rem; min-width:18rem; max-width:24rem; }
  td.d { white-space:nowrap; }
  .sub { display:block; color:var(--faint); font-size:.72rem; font-family:"IBM Plex Sans",sans-serif; }
  .tag { font-size:.68rem; } .tag.hit { background:var(--stamp); color:#fff; }
  tr.hit td, tr.hit th { background:rgba(180,56,46,.07); }
  .pos { color:var(--entry); } .neg { color:var(--stamp); }
  .flash { border-radius:6px; padding:.8rem 1rem; margin:1rem 0; font-size:.9rem; }
  .flash.ok { background:rgba(62,107,84,.12); border:1px solid var(--entry); } .flash.no { background:rgba(180,56,46,.08); border:1px solid var(--stamp); }
  .flash ul { margin:.4rem 0 0 1.1rem; }
  form.ticket { background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:1rem; margin:1rem 0; display:grid; gap:.7rem; grid-template-columns: 1fr 1fr 1fr; }
  form.ticket label { display:flex; flex-direction:column; font-size:.8rem; color:var(--faint); gap:.2rem; }
  form.ticket input, form.ticket select, form.ticket textarea { font: inherit; padding:.4rem .5rem; border:1px solid var(--rule); border-radius:4px; background:#fff; }
  form.ticket .wide { grid-column: 1 / -1; }
  form.ticket textarea { min-height: 5rem; }
  form.ticket button { font: inherit; padding:.5rem 1rem; border:1px solid var(--entry); background:var(--entry); color:#fff; border-radius:4px; cursor:pointer; justify-self:start; }
  @media (max-width: 600px) { form.ticket { grid-template-columns: 1fr; } }
  .empty { color:var(--faint); font-style:italic; }
</style></head>
<body><main>
  <p class="back"><a href="/">← course home</a> · <a href="/signals">signals</a> · <a href="/size">calculator</a> · <a href="/tickets/${esc(student.code)}/review">review my process</a> · <a href="/costs">costs &amp; tax</a></p>
  <p class="eyebrow">Weeks 8–9 · paper portfolio</p>
  <h1>${esc(student.name)}</h1>
  <p class="lede">A paper account enrolled at ${money(student.capital)}, run by Carver's rule: open when the rule is long, size by instrument risk on the account's current value, close at the stop, write every decision down. This account runs ${student.instruments} instrument${student.instruments === 1 ? "" : "s"} — each position sized at ${fmtPct(targetFor(student.instruments))}% a year${student.instruments > 1 ? ` (${SIZING.riskTargetPct}% ÷ ${student.instruments})` : ""}. The page's address is its key: share a screenshot, not the link.</p>
  <div class="acct">
    <span>Account value<b>${money(report.accountValue)}</b><i>${since >= 0 ? "+" : "−"}${Math.abs(since).toFixed(1)}% since enrolment</i></span>
    <span>Cash<b>${money(account.cash)}</b></span>
    <span>Open P&amp;L<b class="${report.openPnl >= 0 ? "pos" : "neg"}">${money(report.openPnl)}</b></span>
    <span>Realised P&amp;L<b class="${account.realised >= 0 ? "pos" : "neg"}">${money(account.realised)}</b></span>
    <span>Drawdown<b class="${report.drawdownPct >= SIZING.drawdownNotePct ? "neg" : ""}">${report.drawdownPct.toFixed(1)}%</b><i>high ${money(report.hwm)}</i></span>
    <span>Risk used<b>${report.riskUsedPct.toFixed(1)}%</b><i>of the ${SIZING.riskTargetPct}% budget</i></span>
  </div>
  ${flashHtml}
  <h2>Risk report <span class="when">${report.date === "—" ? "before the first nightly close" : `as of the ${esc(report.date)} close`}</span></h2>
  <div class="report">${reading.map((l) => `<p>${esc(l)}</p>`).join("")}</div>
  <h2>Open positions</h2>
  ${open.length ? `<div class="wrap"><table><thead><tr><th>Symbol</th><th>Units</th><th>Entry</th><th>Latest close</th><th>Stop</th><th>To the stop</th><th>Unrealised</th><th>Tonight's rule</th></tr></thead><tbody>${openRows}</tbody></table></div>` : `<p class="empty">None. The rule opens; you write the ticket.</p>`}
  <h2>Write a ticket</h2>
  <form class="ticket" method="post" action="/tickets/${esc(student.code)}" onsubmit="var b=this.querySelector('button');if(b.disabled)return false;b.disabled=true;b.textContent='Writing…';">
    <label>Ticker <input name="symbol" value="${esc(keep.symbol ?? "")}" placeholder="AAPL" required maxlength="12"></label>
    <label>Side <select name="side"><option value="open"${sel("open")}>open</option><option value="close"${sel("close")}>close</option></select></label>
    <label>Units (blank = the rule's size) <input name="units" inputmode="numeric" value="${esc(keep.units ?? "")}" placeholder="" maxlength="7"></label>
    <label class="wide">Decision journal — why, in your own words (at least ${JOURNAL_MIN} characters: what the rule said, where the stop is, what you will do if it is hit) <textarea name="journal" maxlength="${JOURNAL_MAX}">${esc(keep.journal ?? "")}</textarea></label>
    <button type="submit">Write the ticket</button>
  </form>
  <h2>Closed positions</h2>
  ${closed.length ? `<div class="wrap"><table><thead><tr><th>Symbol</th><th>Units</th><th>Entry</th><th>Exit</th><th>P&amp;L</th><th></th></tr></thead><tbody>${closedRows}</tbody></table></div>` : `<p class="empty">None yet.</p>`}
  <h2>Tickets</h2>
  ${tickets.length ? `<div class="wrap"><table><thead><tr><th>#</th><th>Written</th><th>Side</th><th>Symbol</th><th>Units</th><th>Fill</th><th>Cost</th><th>Journal</th></tr></thead><tbody>${ticketRows}</tbody></table></div>` : `<p class="empty">None yet. The first one is the hardest.</p>`}
  <h2>Nightly reports <span class="when">${riskRows.length ? `the last ${riskRows.length} written by the 23:00 UTC job` : "none yet — the first is written by the 23:00 UTC job tonight"}</span></h2>
  ${riskRows.length ? `<div class="wrap"><table><thead><tr><th>Close</th><th>Value</th><th>Open P&amp;L</th><th>Drawdown</th><th>Risk used</th><th>Open</th><th>Nearest stop</th><th>Flags</th></tr></thead><tbody>${historyRows}</tbody></table></div>` : `<p class="empty">None yet — the first is written after the next 23:00 UTC run. The report above is computed now from the same arithmetic.</p>`}
  <footer><p class="notice">${NOTE}</p><p>Fills are the latest nightly close the toolkit holds when the ticket is written (the decision close), in the adjusted series; the stop tracker and the risk report run after the signal pass at 23:00 UTC; the tutor reviews process, never outcomes. Drawdowns are normal: the report says how far below the high the account is and leaves the feeling to the journal.</p></footer>
</main></body></html>`;
}
