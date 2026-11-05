/**
 * Week 8's routes on the fake D1: the calculator, the tickets (JSON and the
 * form), the student's page. The SQL runs against the real local D1 in the
 * sandbox run recorded in BUILD-LOG; here the decisions and the shapes.
 */
import { describe, it, expect } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";

const env = (db: FakeD1) => ({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "", QUOTE_DAILY_CAP: "3" }) as any;
const ctx = { waitUntil() {}, passThroughOnException() {} } as any;
const get = (db: FakeD1, path: string) => worker.fetch(new Request(`http://localhost${path}`), env(db), ctx);
const postJson = (db: FakeD1, path: string, body: unknown) =>
  worker.fetch(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }), env(db), ctx);
const postForm = (db: FakeD1, path: string, fields: Record<string, string>) =>
  worker.fetch(new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() }), env(db), ctx);

const AAPL = { date: "2026-10-29", close: 348.91, instrument_risk: 18.18, state: "long", state_since: "2026-05-08" };
const STUDENT = { code: "K7PM-4R2X", name: "Test Student", capital: 10000 };
const JOURNAL = "The rule is long since May; the stop starts at 317.19; if it is hit I close on the Monday.";

/** A database with AAPL long, one enrolled student, no positions. */
const base = () => fakeD1()
  .on("SELECT tier, status, name FROM tickers WHERE symbol", (b) => ({ results: b[0] === "AAPL" ? [{ tier: "core", status: "active", name: "Apple" }] : b[0] === "SML" ? [{ tier: "small", status: "active", name: "Small Co" }] : b[0] === "BLK" ? [{ tier: "core", status: "blocked", name: "Blocked" }] : b[0] === "WRM" ? [{ tier: "core", status: "active", name: "Warming Co" }] : [] }))
  .on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", (b) => ({ results: b[0] === "AAPL" ? [AAPL] : b[0] === "WRM" ? [{ ...AAPL, instrument_risk: null, state: "warming" }] : [] }))
  .on("FROM students WHERE code", (b) => ({ results: b[0] === STUDENT.code ? [STUDENT] : [] }))
  .on("FROM positions WHERE code", () => ({ results: [] }))
  .on("FROM tickets WHERE code", () => ({ results: [] }))
  .on("SELECT symbol FROM tickers WHERE status = 'active' AND tier = 'core'", () => ({ results: [{ symbol: "AAPL" }, { symbol: "KO" }] }));

describe("POST /api/position-size", () => {
  it("validates the body before any SQL: not JSON, a bad ticker, a bad capital", async () => {
    const db = base();
    expect((await postJson(db, "/api/position-size", "not json")).status).toBe(400);
    expect((await postJson(db, "/api/position-size", { ticker: "AAPL'--", capital: 10000 })).status).toBe(400);
    expect((await postJson(db, "/api/position-size", { ticker: "AAPL", capital: -5 })).status).toBe(400);
    expect((await postJson(db, "/api/position-size", { ticker: "AAPL", capital: "ten" })).status).toBe(400);
    expect(db.log.length).toBe(0);
  });
  it("sizes AAPL for $10,000: 18 shares, stop $317.19, the reading and the rules table", async () => {
    const r = await postJson(base(), "/api/position-size", { ticker: "aapl", capital: "10,000" });
    expect(r.status).toBe(200);
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ ticker: "AAPL", as_of: "2026-10-29", price: 348.91, instrument_risk: 18.18, state: "long", units: 18, stop_level: 317.19, stop_gap: 31.72 });
    expect(j.sizing.targetExposure).toBe(6600.66);
    expect(j.reading).toMatch(/18 shares at \$348\.91/);
    expect(j.rules.riskTargetPct).toBe(12);
    expect(j.note).toMatch(/Education, not advice/);
  });
  it("the three-way 404 and the warming 422", async () => {
    const db = base();
    expect((await postJson(db, "/api/position-size", { ticker: "ZZZ", capital: 1000 })).status).toBe(404);
    expect((await (await postJson(db, "/api/position-size", { ticker: "BLK", capital: 1000 })).json() as any).error).toMatch(/outside the free data plan/);
    expect((await (await postJson(db, "/api/position-size", { ticker: "WRM", capital: 1000 })).json() as any).error).toMatch(/fewer than 128 closes/);
    expect((await postJson(db, "/api/position-size", { ticker: "WRM", capital: 1000 })).status).toBe(422);
  });
  it("the calculator keeps to the core tier and names a warming instrument (review F13)", async () => {
    const small = await postJson(base(), "/api/position-size", { ticker: "SML", capital: 10000 });
    expect(small.status).toBe(422);
    expect(((await small.json()) as any).error).toMatch(/small-cap tier: no sizing and no tickets until week 9/);
    const warmDb = base().on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", (b) => ({ results: b[0] === "WRM" ? [{ ...AAPL, state: "warming", days: 90 }] : [AAPL] }));
    const warm = await postJson(warmDb, "/api/position-size", { ticker: "WRM", capital: 10000 });
    expect(warm.status).toBe(200);
    expect(((await warm.json()) as any).caution).toMatch(/Sized on 90 closes: the rule is still warming up for WRM/);
    const page = await (await get(warmDb, "/size?ticker=WRM&capital=10000")).text();
    expect(page).toContain("Sized on 90 closes");
  });
  it("a too-small account is sized honestly: ok false, the checks say why and name the minimum", async () => {
    const j = (await (await postJson(base(), "/api/position-size", { ticker: "AAPL", capital: 500 })).json()) as any;
    expect(j.units).toBe(0);
    expect(j.sizing.ok).toBe(false);
    expect(j.sizing.checks[0].message).toMatch(/at least \$1,586\.00/);   // review F1
  });
});

describe("GET /size — the calculator page", () => {
  it("renders the arithmetic line by line for AAPL and $10,000", async () => {
    const r = await get(base(), "/size?ticker=AAPL&capital=10000");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain("$6,600.66");
    expect(html).toContain("$317.19");
    expect(html).toContain("<datalist id=\"universe\"><option value=\"AAPL\"><option value=\"KO\"></datalist>");
    expect(html).toContain("Education, not advice");
  });
  it("an empty form renders without an error; a bad ticker says so and escapes it", async () => {
    expect((await (await get(base(), "/size")).text())).not.toContain("class=\"empty\"");
    const html = await (await get(base(), "/size?ticker=%3Cb%3Ex%3C%2Fb%3E&capital=10")).text();
    expect(html).toContain("That doesn&#39;t look like a ticker symbol.".replace("&#39;", "'"));
    expect(html).not.toContain("<b>x</b>");
  });
});

describe("POST /api/tickets", () => {
  it("refuses a malformed ticket with every reason at once, before touching the database", async () => {
    const db = base();
    const r = await postJson(db, "/api/tickets", { code: "nope", ticker: "AAPL", side: "buy", journal: "short" });
    expect(r.status).toBe(422);
    const j = (await r.json()) as any;
    expect(j.reasons.map((x: any) => x.code)).toEqual(["code", "side", "journal"]);
    expect(db.log.length).toBe(0);
  });
  it("an unknown code is 404", async () => {
    expect((await postJson(base(), "/api/tickets", { code: "AAAA-2222", ticker: "AAPL", side: "open", journal: JOURNAL })).status).toBe(404);
  });
  it("THE EXIT CHECK over HTTP: an oversized ticket is 422 with the arithmetic, and nothing is written", async () => {
    const db = base();
    const r = await postJson(db, "/api/tickets", { code: STUDENT.code, ticker: "AAPL", side: "open", units: 40, journal: JOURNAL });
    expect(r.status).toBe(422);
    const j = (await r.json()) as any;
    expect(j.reasons[0].code).toBe("oversized");
    expect(j.reasons[0].message).toMatch(/supports \$6,600\.66 of AAPL — 18 shares at \$348\.91\. You asked for 40/);
    expect(db.ran("INSERT INTO").length).toBe(0);
  });
  it("accepts the rule's size: 201, the ticket and the position in ONE batch, the position's open_ticket_id from last_insert_rowid()", async () => {
    const db = base();
    const r = await postJson(db, "/api/tickets", { code: STUDENT.code, ticker: "AAPL", side: "open", journal: JOURNAL });
    expect(r.status).toBe(201);
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ accepted: true, side: "open", units: 18, fill_date: "2026-10-29", fill_price: 348.91, cost: 17.7, stop_level: 317.19, rule_units: 18, under_sized: false, exposure: 6280.38, cash_before: 10000 });
    const t = db.ran("INSERT INTO tickets")[0];
    expect(t.binds).toEqual([STUDENT.code, "AAPL", "open", 18, "2026-10-29", 348.91, 17.7, "long", JOURNAL, t.binds[9]]);
    const p = db.ran("INSERT INTO positions")[0];
    expect(p.sql).toContain("last_insert_rowid()");
    expect(p.binds).toEqual([STUDENT.code, "AAPL", "2026-10-29", 348.91, 18, 6280.38, 31.72, 317.19, 18.18]);
    // both statements went through batch(), in order, ticket first
    const i1 = db.log.findIndex((l) => l.sql.includes("INSERT INTO tickets"));
    const i2 = db.log.findIndex((l) => l.sql.includes("INSERT INTO positions"));
    expect(i2).toBe(i1 + 1);
  });
  it("the write re-checks the facts inside the transaction (review F8): a ticket that did not land is 409 and the position is not written", async () => {
    const db = base().on("INSERT INTO tickets", () => ({ changes: 0 }));   // the conditional INSERT found an open position that the read had not
    const r = await postJson(db, "/api/tickets", { code: STUDENT.code, ticker: "AAPL", side: "open", journal: JOURNAL });
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).reasons[0].message).toMatch(/landed first/);
    const t = db.ran("INSERT INTO tickets")[0];
    expect(t.sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM positions WHERE code = ?1 AND symbol = ?2 AND status = 'open')");
    expect(db.ran("INSERT INTO positions")[0].sql).toContain("WHERE changes() = 1");
  });
  it("the rule is flat → no opening ticket; the small-cap tier → not until week 9", async () => {
    const db = base().on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", () => ({ results: [{ ...AAPL, state: "flat" }] }));
    const j = (await (await postJson(db, "/api/tickets", { code: STUDENT.code, ticker: "AAPL", side: "open", journal: JOURNAL })).json()) as any;
    expect(j.reasons[0].message).toMatch(/The rule opens, you don't/);
    const s = (await (await postJson(base(), "/api/tickets", { code: STUDENT.code, ticker: "SML", side: "open", journal: JOURNAL })).json()) as any;
    expect(s.reasons[0].message).toMatch(/no tickets until week 9/);
  });
  it("closes a held position: 201 with the P&L, the ticket and the UPDATE in one batch", async () => {
    const open = { id: 5, code: STUDENT.code, symbol: "AAPL", status: "open", opened_on: "2026-10-01", entry_price: 330, units: 18, exposure: 5940, stop_gap: 30, high_since: 350, stop_level: 320, stop_hit_on: "2026-10-28", instrument_risk: 18, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 7, close_ticket_id: null };
    const opened = { id: 7, code: STUDENT.code, symbol: "AAPL", side: "open", units: 18, fill_date: "2026-10-01", fill_price: 330, cost: 16.85, signal_state: "long", journal: JOURNAL, created_at: "2026-10-01T20:00:00.000Z" };
    const db = base().on("FROM positions WHERE code", () => ({ results: [open] })).on("FROM tickets WHERE code", () => ({ results: [opened] }));
    const r = await postJson(db, "/api/tickets", { code: STUDENT.code, ticker: "AAPL", side: "close", journal: "Stop hit on the 28th; closing on the Monday as the rule says." });
    expect(r.status).toBe(201);
    const j = (await r.json()) as any;
    expect(j).toMatchObject({ side: "close", units: 18, fill_price: 348.91, cost: 17.7, stop_was_hit: true });
    expect(j.pnl).toBeCloseTo(305.83, 2);
    const u = db.ran("UPDATE positions SET status = 'closed'")[0];
    expect(u.sql).toContain("close_ticket_id = last_insert_rowid()");
    expect(u.binds).toEqual([5, "2026-10-29", 348.91, 305.83]);
  });
});

describe("GET /api/tickets/:code and the page", () => {
  it("the API: account, positions, tickets; a bad code 400; an unknown code 404", async () => {
    const j = (await (await get(base(), "/api/tickets/k7pm-4r2x")).json()) as any;
    expect(j.account).toEqual({ capital: 10000, realised: 0, invested: 0, openCosts: 0, cash: 10000 });
    expect((await get(base(), "/api/tickets/short")).status).toBe(400);
    expect((await get(base(), "/api/tickets/AAAA-2222")).status).toBe(404);
  });
  it("the page shows an open position with its stop, the distance and the STOP HIT stamp, and escapes the journal", async () => {
    const open = { id: 5, code: STUDENT.code, symbol: "AAPL", status: "open", opened_on: "2026-10-01", entry_price: 330, units: 18, exposure: 5940, stop_gap: 30, high_since: 350, stop_level: 320, stop_hit_on: "2026-10-28", instrument_risk: 18, closed_on: null, exit_price: null, pnl: null, open_ticket_id: 7, close_ticket_id: null };
    const opened = { id: 7, code: STUDENT.code, symbol: "AAPL", side: "open", units: 18, fill_date: "2026-10-01", fill_price: 330, cost: 16.85, signal_state: "long", journal: "Because <b>reasons</b>", created_at: "2026-10-01T20:00:00.000Z" };
    const db = base().on("FROM positions WHERE code", () => ({ results: [open] })).on("FROM tickets WHERE code", () => ({ results: [opened] }));
    const html = await (await get(db, "/tickets/K7PM-4R2X")).text();
    expect(html).toContain("STOP HIT 2026-10-28");
    expect(html).toContain("$320.00");
    expect(html).toContain("+8.3%");                  // (348.91 − 320) ÷ 348.91
    expect(html).toContain("Because &lt;b&gt;reasons&lt;/b&gt;");
    expect(html).not.toContain("<b>reasons</b>");
    expect(html).toContain("Cash<b>$4,043.15</b>");  // 10,000 − 5,940 − 16.85
  });
  it("the journal box carries no browser-side required/minlength: a blank journal reaches the server and the rule speaks (review F14)", async () => {
    const html = await (await get(base(), `/tickets/${STUDENT.code}`)).text();
    expect(html).not.toMatch(/<textarea[^>]*(required|minlength)/);
    expect(html).toMatch(/<meta name="referrer" content="same-origin">/);                       // review N12
    expect(html).toMatch(/onsubmit="[^"]*disabled=true/);                                         // review F8: one click, one post
    const r = await postForm(base(), `/tickets/${STUDENT.code}`, { symbol: "AAPL", side: "open", units: "", journal: "" });
    expect(r.status).toBe(422);
    expect(await r.text()).toMatch(/The journal entry is the ticket/);
  });
  it("the form: an accepted ticket re-renders the page with the flash; a refused one lists the reasons and keeps the text", async () => {
    const ok = await postForm(base(), "/tickets/K7PM-4R2X", { symbol: "AAPL", side: "open", units: "", journal: JOURNAL });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain("Ticket accepted: open 18 × AAPL at $348.91 on the 2026-10-29 close (cost $17.70). Stop $317.19.");
    const no = await postForm(base(), "/tickets/K7PM-4R2X", { symbol: "AAPL", side: "open", units: "40", journal: "too short" });
    expect(no.status).toBe(422);
    const html = await no.text();
    expect(html).toContain("The ticket was not accepted.");
    expect(html).toContain("The journal entry is the ticket.");
    expect(html).toContain(">too short</textarea>");
  });
});
