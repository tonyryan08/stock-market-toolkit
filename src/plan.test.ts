/**
 * v1.1 (decision 24): the planner's routes — who may open it (the door off: the code; the door on: the tutor only),
 * the page's picks and overrides on the judge's facts, repopulate, save (and the missing table), the CSV, the JSON,
 * a cross-site POST refused, and raising tickets through the ticket judge with its refusals shown under the rows —
 * the v1.1.0 review's F1–F3, S1–S4, N2–N4, N9 pinned on the routes.
 */
import { describe, it, expect } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";

const ADA = { code: "K7PM-4R2X", name: "Ada Lovelace", capital: 10000, instruments: 2, email: "ada@example.com" };
const TUTOR = "tutor@example.ie";
const THESIS = "the gate opened and the P/E is under fifteen; a close below the stop proves me wrong";

const env = (db: FakeD1) => ({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "", ANTHROPIC_API_KEY: "k", TUTOR_EMAILS: TUTOR }) as any;
const ctx = (email?: string) => ({ waitUntil() {}, passThroughOnException() {}, ...(email === undefined ? {} : { access: { aud: "test-aud", getIdentity: async () => ({ email, name: "Someone" }) } }) }) as any;
const req = (db: FakeD1, path: string, email?: string, init?: RequestInit) => worker.fetch(new Request(`http://localhost${path}`, init), env(db), ctx(email));
const form = (fields: Record<string, string>, headers: Record<string, string> = {}): RequestInit => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams(fields).toString() });

// the books: GOOD passes the defensive screen outright (the clean survivor of graham.test.ts), DEAR fails P/E and P/B
const years = (symbol: string) => [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
  symbol, fiscal_year: String(fy), period_end: `${fy}-12-31`, revenue: 2e9, net_income: null, eps_diluted: [5, 4.6, 4.4, 4, 3.8][i],
  current_assets: 400, current_liabilities: 150, total_assets: null, total_liabilities: null, long_term_debt: 100, shareholders_equity: 2000, shares_diluted: 50, goodwill_and_intangibles: null, readings: null,
}));
const divs = (symbol: string) => Array.from({ length: 11 }, (_, i) => 2016 + i).flatMap((y) => [{ symbol, ex_date: `${y}-03-01`, amount: 0.5 }, { symbol, ex_date: `${y}-09-01`, amount: 0.5 }]);
const sig = (symbol: string, over: Record<string, unknown> = {}) => ({ symbol, name: `${symbol} Co`, tier: "core", date: "2026-11-13", close: 60, ewma_fast: 61, ewma_slow: 59, instrument_risk: 20, forecast: 8.2, state: "long", state_since: "2026-09-01", days: 1260, computed_at: "x", quarantined: null, ...over });

type Pos = Record<string, unknown>;
type Tkt = Record<string, unknown>;
/** The fake database: the books, tonight's signals, one student with N = 2 — and `positions`/`tickets` lists the ticket's inserts append to. */
function db(opts: { signals?: Record<string, unknown>[]; positions?: Pos[]; saved?: string | null; plansTable?: boolean; plansDown?: boolean } = {}) {
  const positions: Pos[] = opts.positions ?? [];
  const tickets: Tkt[] = [];
  const signals = opts.signals ?? [sig("GOOD"), sig("DEAR", { close: 100, forecast: 3.1 }), sig("FLAT", { state: "flat", forecast: -2 })];
  const bySymbol = new Map(signals.map((s) => [s.symbol as string, s]));
  let saved: string | null = opts.saved ?? null;
  const d = fakeD1()
    .on("SELECT symbol, name, sector, tier FROM tickers WHERE status = 'active' ORDER BY symbol", () => ({ results: [{ symbol: "DEAR", name: "Dear Co", sector: "Tech", tier: "core" }, { symbol: "FLAT", name: "Flat Co", sector: "Tech", tier: "core" }, { symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive", tier: "core" }] }))
    .on("FROM fundamentals_annual ORDER BY symbol", () => ({ results: [...years("DEAR"), ...years("GOOD"), ...years("FLAT")] }))
    .on("SELECT symbol, ex_date, amount FROM dividends", () => ({ results: [...divs("DEAR"), ...divs("GOOD"), ...divs("FLAT")] }))
    .on("JOIN (SELECT symbol, MAX(date) AS d FROM daily_prices GROUP BY symbol)", () => ({ results: [{ symbol: "DEAR", date: "2026-11-13", adj_close: 100 }, { symbol: "GOOD", date: "2026-11-13", adj_close: 60 }, { symbol: "FLAT", date: "2026-11-13", adj_close: 60 }] }))
    .on("FROM signals s", () => ({ results: signals }))
    .on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", (b) => ({ results: bySymbol.has(b[0] as string) ? [bySymbol.get(b[0] as string)!] : [] }))
    .on("SELECT tier, status, name FROM tickers WHERE symbol", (b) => ({ results: bySymbol.has(b[0] as string) ? [{ tier: "core", status: "active", name: `${b[0]} Co` }] : [] }))
    .on("FROM students WHERE lower(trim(email)) = ?1", (b) => ({ results: b[0] === ADA.email ? [{ code: ADA.code, name: ADA.name }] : [] }))
    .on("FROM students WHERE code", (b) => ({ results: b[0] === ADA.code ? [{ code: ADA.code, name: ADA.name, capital: ADA.capital, instruments: ADA.instruments }] : [] }))
    .on("SELECT email FROM students WHERE code", (b) => ({ results: b[0] === ADA.code ? [{ email: ADA.email }] : [] }))
    .on("FROM positions WHERE code", () => ({ results: positions.map((p) => ({ ...p })) }))
    .on("FROM tickets WHERE code", () => ({ results: tickets.map((t) => ({ ...t })) }))
    .on("INSERT INTO tickets", (b) => { tickets.push({ id: tickets.length + 1, code: b[0], symbol: b[1], side: b[2], units: b[3], fill_date: b[4], fill_price: b[5], cost: b[6], signal_state: b[7], journal: b[8], created_at: b[9] }); return { results: [], changes: 1 }; })
    .on("INSERT INTO positions", (b) => { positions.push({ id: positions.length + 1, code: b[0], symbol: b[1], status: "open", opened_on: b[2], entry_price: b[3], units: b[4], exposure: b[5], stop_gap: b[6], high_since: b[3], stop_level: b[7], stop_hit_on: null, instrument_risk: b[8], realign_date: null, closed_on: null, exit_price: null, pnl: null, open_ticket_id: tickets.length, close_ticket_id: null }); return { results: [], changes: 1 }; })
    .on("SELECT body FROM plans WHERE code", () => (opts.plansTable === false ? { error: "D1_ERROR: no such table: plans" } : opts.plansDown ? { error: "D1_ERROR: storage caused object reset" } : { results: saved ? [{ body: saved }] : [] }))
    .on("INSERT INTO plans", (b) => { if (opts.plansTable === false) return { error: "D1_ERROR: no such table: plans" }; if (opts.plansDown) return { error: "D1_ERROR: storage caused object reset" }; saved = String(b[1]); return { results: [], changes: 1 }; });
  return Object.assign(d, { positions, tickets, savedBody: () => saved });
}

describe("who may open the planner (decision 24 d)", () => {
  it("the door off: the code is the key — the page opens; a bad code is 400; an unknown student 404", async () => {
    const r = await req(db(), `/plan/${ADA.code}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("<h1>The planner <span class=\"sym\">· Ada Lovelace</span></h1>");
    expect(html).toContain("The door is off on this deployment: the code is the key.");
    expect((await req(db(), "/plan/nope")).status).toBe(400);
    expect((await req(db(), "/plan/AAAA-2222")).status).toBe(404);
  });
  it("the door on: a student is refused with the way to their own page; the tutor opens; the chooser lists the tutor's linked accounts and the landing links the planner for the tutor only", async () => {
    const student = await req(db(), `/plan/${ADA.code}`, ADA.email);
    expect(student.status).toBe(403);
    expect(await student.text()).toContain("The planner is the tutor's for now — you are signed in as ada@example.com. Your own page is /me.");
    const tutor = await req(db(), `/plan/${ADA.code}`, TUTOR);
    expect(tutor.status).toBe(200);
    expect(await tutor.text()).toContain("Signed in as tutor@example.ie (the tutor)");
    const chooser = await req(db(), "/plan", TUTOR);
    expect(chooser.status).toBe(200);
    expect(await chooser.text()).toContain("Plan for a paper account by its code");
    expect((await req(db(), "/plan", ADA.email)).status).toBe(403);
    expect((await req(db(), `/api/plan/${ADA.code}`, ADA.email)).status).toBe(403);
    expect((await req(db(), `/plan/${ADA.code}/plan.csv`, ADA.email)).status).toBe(403);
    const landingTutor = await (await req(db(), "/", TUTOR)).text();
    expect(landingTutor).toContain('<a href="/plan">the planner</a>');
    const landingStudent = await (await req(db(), "/", ADA.email)).text();
    expect(landingStudent).not.toContain('href="/plan"');
  });
  it("review N4: a POST from another site is refused before anything is read — Sec-Fetch-Site or the Origin names it; a request with neither (curl) is not cross-site", async () => {
    const d = db();
    const byOrigin = await req(d, `/plan/${ADA.code}`, TUTOR, form({ action: "raise", pick_GOOD: "on", thesis_GOOD: THESIS }, { origin: "https://evil.example" }));
    expect(byOrigin.status).toBe(403);
    expect(await byOrigin.text()).toContain("The form was posted from another site, so nothing was done.");
    const bySite = await req(d, `/plan/${ADA.code}`, TUTOR, form({ action: "raise", pick_GOOD: "on", thesis_GOOD: THESIS }, { "sec-fetch-site": "cross-site" }));
    expect(bySite.status).toBe(403);
    const nullOrigin = await req(d, `/plan/${ADA.code}`, TUTOR, form({ action: "recompute" }, { origin: "null" }));
    expect(nullOrigin.status).toBe(403);
    expect(d.ran("INSERT INTO tickets").length).toBe(0);
    const same = await req(d, `/plan/${ADA.code}`, TUTOR, form({ action: "recompute" }, { origin: "http://localhost", "sec-fetch-site": "same-origin" }));
    expect(same.status).toBe(200);
  });
});

describe("the page: tonight's top names on the judge's facts, every row overwritable", () => {
  it("GET: GOOD (the gate) ranks first and DEAR (long, fails both) second; both picked for N = 2; FLAT under 'not eligible' with the ticket's reason; the rule's size and stop printed; the units cell is a placeholder, the thesis empty (S1)", async () => {
    const html = await (await req(db(), `/plan/${ADA.code}`)).text();
    expect(html).toContain("tonight's top names (nothing saved yet)");
    expect(html).toMatch(/name="pick_GOOD" checked/);
    expect(html).toMatch(/name="pick_DEAR" checked/);
    expect(html).toContain("<span class=\"band gate\">GATE</span>");
    expect(html).toContain("<span class=\"band long\">long</span>");
    // GOOD at $60, 20% risk, 10000 × 6% ÷ 20% = $3,000 → 50 shares; stop gap ½ × 20% × 60 = $6.00, stop $54.00
    expect(html).toMatch(/name="units_GOOD" value="" placeholder="50"/);
    expect(html).toMatch(/name="units_DEAR" value="" placeholder="29"/);   // on $9,990.50 after GOOD's cost: 29 of DEAR at $100 (F3)
    expect(html).toContain("$54.00<br><span class=\"why\">gap $6.00 · $300.00 to the stop</span>");
    expect(html).toMatch(/<textarea class="thesis" name="thesis_GOOD"[^>]*><\/textarea>/);
    expect(html).toContain("<p class=\"facts\">GOOD: rule LONG since 2026-09-01 (forecast +8.2); Graham 7/7 ·");
    expect(html).toContain("$10,000.00 · $10,000.00 cash");
    expect(html).not.toContain('name="capital"');
    expect(html).not.toContain('name="positions"');
    expect(html).toContain("the rule is FLAT tonight — the rule opens, you don't");
    expect(html).toContain("Eligible tonight — 2 names, by the tests");
    expect(html).toContain("Not eligible tonight — 1 name, with the reason the ticket would give");
    expect(html).toContain("No exchange rate typed, so the euro columns are blank");
    expect(html).toContain("the course's, not a broker order");
    expect(html).toContain("the forecast (the rule's trend strength, from the price series)");
    expect(html).toContain("Education, not advice. The planner is a screen and a calculator");
    expect(html).not.toContain("${");
  });
  it("POST recompute: the typed units stand — 20 of GOOD is under-sized and fine, 80 is flagged in the plan's words; a typo is refused (S2); the euro columns appear at a typed rate; the cell keeps what was typed", async () => {
    const r = await req(db(), `/plan/${ADA.code}`, undefined, form({ action: "recompute", eurusd: "1.08", spread: "0.1", pick_GOOD: "on", units_GOOD: "80", thesis_GOOD: THESIS, pick_DEAR: "on", units_DEAR: "2O", thesis_DEAR: "" }));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/name="units_GOOD" value="80" placeholder="80"/);
    expect(html).toContain("Oversized: the rule's size is 50 shares; 80 would carry 9.6% a year against the 6% target. The ticket will refuse it; fewer is allowed.");
    expect(html).toMatch(/class="units bad" name="units_DEAR" value="2O"/);
    expect(html).toContain("Units must be a whole number of shares, at least 1 — &quot;2O&quot; could not be read.");
    expect(html).toContain("€4,444.44<br><span class=\"why\">stop €50.00 · €444.44 to the stop · trip €30.67</span>");   // 80 × $60 ÷ 1.08; the stop $54 ÷ 1.08; 80 × $6 ÷ 1.08
    expect(html).toContain("at 1.08 USD/EUR");
    expect(html).toContain("commission + conversion to open");
    expect(html).toContain("to the stops, before costs");
    expect(html).not.toContain("No exchange rate typed");
    expect(html).toContain(`<textarea class="thesis" name="thesis_GOOD" aria-label="thesis for GOOD" maxlength="1000" placeholder="Thesis: why this name, what would prove you wrong, why this size — at least 20 characters; the facts above are the planner's, the decision is yours">${THESIS}</textarea>`);
  });
  it("review S4: a bad input keeps every tick, units cell and thesis typed, names the field, and uses the default for it", async () => {
    const r = await req(db(), `/plan/${ADA.code}`, undefined, form({ action: "recompute", eurusd: "12", spread: "abc", pick_DEAR: "on", units_DEAR: "7", thesis_DEAR: THESIS }));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("The exchange rate must be a plain number from 0.2 to 5 (US dollars per euro) — it was left blank. The spread must be a plain number from 0 to 10 (percent of the value) — 0.1% was used.");
    expect(html).toMatch(/name="pick_DEAR" checked/);
    expect(html).not.toMatch(/name="pick_GOOD" checked/);
    expect(html).toMatch(/name="units_DEAR" value="7"/);
    expect(html).toContain(`>${THESIS}</textarea>`);
  });
  it("POST repopulate picks the top names again whatever was ticked; nothing is saved", async () => {
    const d = db();
    const r = await req(d, `/plan/${ADA.code}`, undefined, form({ action: "repopulate", pick_DEAR: "on", units_DEAR: "3" }));
    const html = await r.text();
    expect(html).toContain("Repopulated from the 2026-11-13 close: the top 2 of 2 eligible names, by the tests. Nothing is saved until you say so.");
    expect(html).toMatch(/name="pick_GOOD" checked/);
    expect(html).toMatch(/name="units_DEAR" value="" placeholder="29"/);
    expect(d.ran("INSERT INTO plans").length).toBe(0);
  });
  it("POST save writes one row per account — the picks as typed, blanks kept blank (S1), never tonight's figures; the next GET shows it; a missing table says so; a database fault is a 503 (N9)", async () => {
    const d = db();
    const r = await req(d, `/plan/${ADA.code}`, undefined, form({ action: "save", eurusd: "1.08", pick_GOOD: "on", units_GOOD: "20", thesis_GOOD: THESIS, pick_DEAR: "on", units_DEAR: "", thesis_DEAR: "" }));
    expect(r.status).toBe(200);
    expect(await r.text()).toContain("Plan saved for Ada Lovelace: 2 names, as of the 2026-11-13 close.");
    expect(d.ran("INSERT INTO plans").length).toBe(1);
    expect(JSON.parse(d.savedBody()!)).toEqual({ inputs: { eurUsd: 1.08, spreadPct: 0.1 }, picks: [{ symbol: "GOOD", units: 20, thesis: THESIS }, { symbol: "DEAR", units: null, thesis: "" }] });
    const again = await (await req(d, `/plan/${ADA.code}`)).text();
    expect(again).toContain("a saved plan is shown");
    expect(again).toMatch(/name="units_GOOD" value="20" placeholder="20"/);
    expect(again).toMatch(/name="units_DEAR" value="" placeholder="\d+"/);   // the blank cell re-sizes with the rule
    expect(again).toContain(`>${THESIS}</textarea>`);
    const missing = db({ plansTable: false });
    const m = await req(missing, `/plan/${ADA.code}`, undefined, form({ action: "save", pick_GOOD: "on" }));
    expect(m.status).toBe(503);
    expect(await m.text()).toContain("Not saved: the plans table is missing — migration 0014 has not been applied to this database.");
    const page = await req(missing, `/plan/${ADA.code}`);
    expect(page.status).toBe(200);   // the page still opens without the table
    expect(await page.text()).toContain("tonight's top names (nothing saved yet)");
    const down = db({ plansDown: true });
    const dn = await req(down, `/plan/${ADA.code}`, undefined, form({ action: "save", pick_GOOD: "on" }));
    expect(dn.status).toBe(503);
    expect(await dn.text()).toContain("Not saved: the database did not answer just now.");
    expect(await (await req(down, `/plan/${ADA.code}`)).text()).toContain("the saved plan could not be read just now — tonight's top names are shown");
  });
  it("the CSV and the JSON carry the same plan; the JSON states the order, the sizing and the note", async () => {
    const csv = await req(db(), `/plan/${ADA.code}/plan.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toMatch(/^text\/csv/);
    expect(csv.headers.get("content-disposition")).toBe(`attachment; filename="plan-${ADA.code}-2026-11-13.csv"`);
    const text = await csv.text();
    expect(text.split("\r\n")[0]).toMatch(/^rank,symbol,name,band,rule_long_since,forecast,instrument_risk_pct,graham,close_usd,sized_on_usd,/);
    expect(text).toMatch(/\r\n1,GOOD,GOOD Co,gate,2026-09-01,8\.2,20,7\/7 · \d\/6,60,10000,50,50,3000,30,6,6,54,300,9\.5,19,0\.63,,,,,,,,,"GOOD: rule LONG since/);
    const j = (await (await req(db(), `/api/plan/${ADA.code}`)).json()) as any;
    expect(j.as_of_close).toBe("2026-11-13");
    expect(j.per_instrument_target_pct).toBe(6);
    expect(j.account_tonight).toEqual({ value: 10000, cash: 10000, open_positions: 0, risk_used_pct: 0, instruments: 2 });
    expect(j.candidates.map((c: any) => [c.symbol, c.rank, c.band, c.eligible])).toEqual([["GOOD", 1, "gate", true], ["DEAR", 2, "long", true], ["FLAT", null, null, false]]);
    expect(j.candidates[2].why).toBe("the rule is FLAT tonight — the rule opens, you don't");
    expect(j.plan.rows.map((r: any) => [r.symbol, r.sizedOn, r.units, r.stopLevel, r.blocked])).toEqual([["GOOD", 10000, 50, 54, true], ["DEAR", 9990.5, 29, 90, true]]);
    expect(j.order).toMatch(/never a return/);
    expect(j.sizing).toMatch(/the ticket judge's own facts/);
    expect(j.note).toMatch(/^Education, not advice/);
  });
});

describe("raising the tickets goes through the ticket judge (decision 24 e)", () => {
  it("one opening ticket per ticked row with the facts and the thesis as its journal; an accepted row shows its fill and stop and drops out of the candidates as held; an oversized row is refused in the judge's words and nothing is written for it", async () => {
    const d = db();
    const r = await req(d, `/plan/${ADA.code}`, TUTOR, form({ action: "raise", pick_GOOD: "on", units_GOOD: "", thesis_GOOD: THESIS, pick_DEAR: "on", units_DEAR: "40", thesis_DEAR: "forty shares on purpose, over the rule's size" }));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("1 of 2 tickets accepted — the refusals are under each row. The account's page has the positions: /tickets/K7PM-4R2X.");
    expect(html).toContain("Ticket accepted: open 50 × GOOD at $60.00 on the 2026-11-13 close, stop $54.00");
    expect(html).toMatch(/Oversized\. At 20\.00% instrument risk and the 6% target \(12% ÷ 2 instruments\), an account worth \$9,990\.50 supports \$2,997\.15 of DEAR — 29 shares at \$100\.00\. You asked for 40/);
    expect(d.ran("INSERT INTO tickets").length).toBe(1);
    expect(d.tickets[0]).toMatchObject({ symbol: "GOOD", units: 50, journal: `GOOD: rule LONG since 2026-09-01 (forecast +8.2); Graham 7/7 · ${(d.tickets[0].journal as string).match(/Graham 7\/7 · (\d\/6)/)![1]}; 50 of the rule's 50 shares at the 6% target; stop $54.00 (gap $6.00), trailing the high; if it is hit I close on the next close. Thesis: ${THESIS}` });
    expect(d.positions.length).toBe(1);
    expect(d.positions[0]).toMatchObject({ symbol: "GOOD", units: 50, entry_price: 60, stop_level: 54 });
    // GOOD is now held: it has left the eligible table; DEAR stays ticked with its 40; the page after is on the account as it now is
    expect(html).toContain("already held: 50 shares opened 2026-11-13 — one position per instrument");
    expect(html).not.toMatch(/name="pick_GOOD" checked/);
    expect(html).toMatch(/name="pick_DEAR" checked/);
    expect(html).toContain("Eligible tonight — 1 name, by the tests");
    expect(html).toContain("$9,990.50 · $6,990.50 cash");
  });
  it("F2: a row with no thesis is not raised — no INSERT, the sentence under the row; F2 with a thesis under 20 characters likewise", async () => {
    const d = db();
    const r = await req(d, `/plan/${ADA.code}`, undefined, form({ action: "raise", pick_GOOD: "on", units_GOOD: "10", thesis_GOOD: "", pick_DEAR: "on", units_DEAR: "", thesis_DEAR: "too short" }));
    const html = await r.text();
    expect(html).toContain("0 of 2 tickets accepted — the refusals are under each row.");
    expect(html).toContain("Write the thesis — what would prove you wrong, and why this size — in at least 20 characters. The facts above are the planner's; the decision is yours, and the journal entry is the ticket.");
    expect(d.ran("INSERT INTO tickets").length).toBe(0);
    expect(html).toContain("Not raised:");
  });
  it("review S3: a ticked name that is not eligible is counted, not tried; nothing ticked is nothing raised", async () => {
    const d = db({ positions: [{ id: 1, code: ADA.code, symbol: "GOOD", status: "open", opened_on: "2026-11-10", entry_price: 60, units: 50, exposure: 3000, stop_gap: 6, high_since: 60, stop_level: 54, stop_hit_on: null, instrument_risk: 20, realign_date: null, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 1, close_ticket_id: null }] });
    const r = await req(d, `/plan/${ADA.code}`, undefined, form({ action: "raise", pick_GOOD: "on", thesis_GOOD: THESIS }));
    expect(await r.text()).toContain("Nothing raised: 1 ticked row is not eligible tonight (see the notes).");
    expect(d.ran("INSERT INTO tickets").length).toBe(0);
    const none = await req(db(), `/plan/${ADA.code}`, undefined, form({ action: "raise" }));
    expect(await none.text()).toContain("Nothing to raise: no row is ticked.");
  });
  it("review N2: only the account's room is tried, in rank order, and the rows left are named", async () => {
    const d = db({ signals: [sig("GOOD"), sig("DEAR", { close: 100, forecast: 3.1 }), sig("FLAT", { forecast: 2 })] });   // three longs, N = 2
    const r = await req(d, `/plan/${ADA.code}`, undefined, form({ action: "raise", pick_GOOD: "on", units_GOOD: "5", thesis_GOOD: THESIS, pick_DEAR: "on", units_DEAR: "5", thesis_DEAR: THESIS, pick_FLAT: "on", units_FLAT: "5", thesis_FLAT: THESIS }));
    const html = await r.text();
    expect(html).toContain("2 of 2 tickets accepted. 1 ticked row was left as it is (DEAR): the account has room for 2.");   // FLAT, with GOOD's books, passes the screen and ranks second; DEAR (fails P/E, P/B) is the row left
    expect(d.ran("INSERT INTO tickets").length).toBe(2);
  });
  it("the door on: a student cannot raise through the planner (403 before anything is read); the tutor can", async () => {
    const d = db();
    const r = await req(d, `/plan/${ADA.code}`, ADA.email, form({ action: "raise", pick_GOOD: "on", thesis_GOOD: THESIS }));
    expect(r.status).toBe(403);
    expect(d.ran("INSERT INTO tickets").length).toBe(0);
  });
});
