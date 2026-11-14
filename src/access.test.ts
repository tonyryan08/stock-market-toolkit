/**
 * Week 12 (decision 23): the door on the routes. The fake execution context
 * carries what Cloudflare Access would attach (ctx.access); the fake D1 holds
 * two students, one of them linked to an email. Every student route is tried
 * four ways: the door off, the owner, another student, the tutor.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";
import { KIT } from "./me";

const ADA = { code: "K7PM-4R2X", name: "Ada Lovelace", capital: 10000, instruments: 1, email: "ada@example.com" };
const BOB = { code: "Q2WD-8HJ3", name: "Bob Unlinked", capital: 10000, instruments: 1, email: null };
const TUTOR = "tutor@example.ie";

const env = (db: FakeD1, over: Record<string, string> = {}) => ({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "", ANTHROPIC_API_KEY: "k", TUTOR_EMAILS: `${TUTOR}, other-tutor@example.ie`, ...over }) as any;
/** The execution context: with `email` undefined the door is off (no ctx.access); with an email, Access authenticated it. */
const ctx = (email?: string) => ({ waitUntil() {}, passThroughOnException() {}, ...(email === undefined ? {} : { access: { aud: "test-aud", getIdentity: async () => ({ email, name: "Someone" }) } }) }) as any;
const req = (db: FakeD1, path: string, email?: string, init?: RequestInit, over?: Record<string, string>) => worker.fetch(new Request(`http://localhost${path}`, init), env(db, over), ctx(email));
const form = (fields: Record<string, string>): RequestInit => ({ method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(fields).toString() });
const json = (body: unknown): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const AAPL = { date: "2026-10-29", close: 348.91, instrument_risk: 18.18, state: "long", state_since: "2026-05-08" };
const db = () => fakeD1()
  .on("SELECT tier, status, name FROM tickers WHERE symbol", (b) => ({ results: b[0] === "AAPL" ? [{ tier: "core", status: "active", name: "Apple" }] : [] }))
  .on("FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", () => ({ results: [AAPL] }))
  .on("FROM students WHERE lower(trim(email)) = ?1", (b) => ({ results: b[0] === ADA.email ? [{ code: ADA.code, name: ADA.name }] : [] }))
  // the row the routes load carries NO email (the loader selects four columns); the gate's own query, registered after
  // (later registrations win), is the only place the email comes from — so a gate reading the wrong column fails here (review N3)
  .on("FROM students WHERE code", (b) => ({ results: b[0] === ADA.code ? [{ code: ADA.code, name: ADA.name, capital: ADA.capital, instruments: ADA.instruments }] : b[0] === BOB.code ? [{ code: BOB.code, name: BOB.name, capital: BOB.capital, instruments: BOB.instruments }] : [] }))
  .on("SELECT email FROM students WHERE code", (b) => ({ results: b[0] === ADA.code ? [{ email: ADA.email }] : b[0] === BOB.code ? [{ email: null }] : [] }))
  .on("FROM positions WHERE code", () => ({ results: [] }))
  .on("FROM tickets WHERE code", () => ({ results: [] }))
  .on("FROM risk_reports WHERE code", () => ({ results: [] }))
  .on("FROM tickers t LEFT JOIN signals s ON s.symbol = t.symbol", () => ({ results: [{ symbol: "AAPL" }] }))
  .on("SELECT MAX(date) AS d FROM signals", () => ({ results: [{ d: "2026-10-29" }] }))
  .on("SELECT MAX(date) AS date FROM signals", () => ({ results: [{ date: "2026-10-29" }] }))
  .on("SELECT DISTINCT date FROM signals", () => ({ results: [{ date: "2026-10-29" }] }))
  .on("FROM reviews WHERE code = ?1 AND outcome = 'answered'", () => ({ results: [] }))
  .on("FROM reviews WHERE code = ?1 AND asked_at >= ?2", () => ({ results: [{ n: 0 }] }))
  .on("INSERT INTO reviews", () => ({ results: [{ id: 1 }] }));

afterEach(() => vi.unstubAllGlobals());

describe("the student's page, four ways (decision 23 b)", () => {
  it("door off: the code is the key — the page opens for anyone with it, the lede says to share a screenshot", async () => {
    const r = await req(db(), `/tickets/${ADA.code}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/share a screenshot, not the link/);
  });
  it("the owner: opens, the lede says who is signed in and that the page is theirs and the tutor's", async () => {
    const r = await req(db(), `/tickets/${ADA.code}`, ADA.email);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/Signed in as ada@example\.com: this page opens only for you and the tutor\./);
    expect(html).not.toMatch(/share a screenshot/);
  });
  it("another student: 403, the reason names their own door; the tutor: opens, named as the tutor", async () => {
    const other = await req(db(), `/tickets/${ADA.code}`, "bob@example.com");
    expect(other.status).toBe(403);
    const otherHtml = await other.text();
    expect(otherHtml).toMatch(/another student's page\. Your own page is \/me/);
    expect(otherHtml).toMatch(/if this is your own page, the address on your row is not the one you signed in with: tell the tutor/);   // review N7
    // Access ran but named nobody (a service token, say): no student's page opens — on the route, not only in the unit test (review N3)
    const nobody = await worker.fetch(new Request(`http://localhost/tickets/${ADA.code}`), env(db()), { waitUntil() {}, passThroughOnException() {}, access: { aud: "a", getIdentity: async () => undefined } } as any);
    expect(nobody.status).toBe(403);
    expect(await nobody.text()).toMatch(/without an email, so no student's page can open/);
    const tutor = await req(db(), `/tickets/${ADA.code}`, TUTOR.toUpperCase());
    expect(tutor.status).toBe(200);
    expect(await tutor.text()).toMatch(/Signed in as tutor@example\.ie \(the tutor\)/);
  });
  it("an unlinked account opens for the tutor only; its own student-to-be is told what links it", async () => {
    expect((await req(db(), `/tickets/${BOB.code}`, TUTOR)).status).toBe(200);
    const r = await req(db(), `/tickets/${BOB.code}`, "bob@example.com");
    expect(r.status).toBe(403);
    expect(await r.text()).toMatch(/not linked to an email yet/);
  });
  it("review N8: a missing email column reads as unlinked (migration 0013 not applied); any other database error is 503 with its own reason — the tutor opens either way", async () => {
    const missing = db().on("SELECT email FROM students WHERE code", () => { throw new Error("D1_ERROR: no such column: email"); });
    const r1 = await req(missing, `/tickets/${ADA.code}`, ADA.email);
    expect(r1.status).toBe(403);
    expect(await r1.text()).toMatch(/not linked to an email yet/);
    expect((await req(db().on("SELECT email FROM students WHERE code", () => { throw new Error("D1_ERROR: no such column: email"); }), `/tickets/${ADA.code}`, TUTOR)).status).toBe(200);
    const down = db().on("SELECT email FROM students WHERE code", () => { throw new Error("D1_ERROR: database is overloaded"); });
    const r2 = await req(down, `/tickets/${ADA.code}`, ADA.email);
    expect(r2.status).toBe(503);
    expect(await r2.text()).toMatch(/could not be read just now/);
    expect((await req(db().on("SELECT email FROM students WHERE code", () => { throw new Error("D1_ERROR: database is overloaded"); }), `/tickets/${ADA.code}`, TUTOR)).status).toBe(200);
  });
  it("the 404 and 400 come before the door: no such student, a malformed code", async () => {
    expect((await req(db(), "/tickets/ZZZZ-9999", "bob@example.com")).status).toBe(404);
    expect((await req(db(), "/tickets/nope", "bob@example.com")).status).toBe(400);
  });
});

describe("writing a ticket, four ways", () => {
  const fields = { symbol: "AAPL", side: "open", units: "", journal: "The rule is long since May; the stop starts at 317.19; if it is hit I close on the Monday." };
  it("the form: another student's code is refused with 403 and nothing is written; the owner's and the tutor's go through to the ticket", async () => {
    const d = db();
    const r = await req(d, `/tickets/${ADA.code}`, "bob@example.com", form(fields));
    expect(r.status).toBe(403);
    expect(d.ran("INSERT INTO tickets")).toHaveLength(0);
    for (const who of [ADA.email, TUTOR, undefined]) {
      const d2 = db();
      const ok = await req(d2, `/tickets/${ADA.code}`, who, form(fields));
      expect(ok.status, String(who)).toBe(200);                      // the form answers the page; the ticket's own verdict is in it
      expect(d2.ran("INSERT INTO tickets"), String(who)).toHaveLength(1);   // and the door let the write through (review N3)
    }
  });
  it("the JSON API carries the code in its body: the same rule; a malformed code is left to the ticket's own 422", async () => {
    const d = db();
    const r = await req(d, "/api/tickets", "bob@example.com", json({ code: ADA.code, ticker: "AAPL", side: "open", journal: fields.journal }));
    expect(r.status).toBe(403);
    expect(((await r.json()) as any).error).toMatch(/another student's page/);
    expect(d.ran("INSERT INTO tickets")).toHaveLength(0);
    expect((await req(db(), "/api/tickets", "bob@example.com", json({ code: "nope", ticker: "AAPL", side: "open", journal: fields.journal }))).status).toBe(422);
    expect((await req(db(), "/api/tickets", ADA.email, json({ code: ADA.code, ticker: "AAPL", side: "open", journal: fields.journal }))).status).not.toBe(403);
  });
  it("v1.0.0 review F1: a code that is not a string — an array that String() would turn into a code — never reaches the parser as a code: refused, nothing written, no gate query, whoever is signed in", async () => {
    for (const who of ["bob@example.com", ADA.email, TUTOR, undefined]) {
      for (const shape of [[ADA.code], [` ${ADA.code.toLowerCase()} `], { toString: () => ADA.code }, 12345678]) {
        const d = db();
        const r = await req(d, "/api/tickets", who, json({ code: shape, ticker: "AAPL", side: "open", journal: fields.journal }));
        expect(r.status, `${String(who)} ${JSON.stringify(shape)}`).toBe(422);
        const j = (await r.json()) as any;
        expect(j.reasons.map((x: any) => x.code)).toContain("code");
        expect(d.ran("INSERT INTO tickets")).toHaveLength(0);
        expect(d.ran("SELECT email FROM students WHERE code")).toHaveLength(0);
      }
    }
    // and the string shape, padded and lower-cased, is normalised once and gated: another student's → 403
    const d = db();
    expect((await req(d, "/api/tickets", "bob@example.com", json({ code: ` ${ADA.code.toLowerCase()} `, ticker: "AAPL", side: "open", journal: fields.journal }))).status).toBe(403);
    expect(d.ran("INSERT INTO tickets")).toHaveLength(0);
  });
  it("the account's JSON and the risk report follow the same rule", async () => {
    expect((await req(db(), `/api/tickets/${ADA.code}`, "bob@example.com")).status).toBe(403);
    expect((await req(db(), `/api/risk/${ADA.code}`, "bob@example.com")).status).toBe(403);
    expect((await req(db(), `/api/tickets/${ADA.code}`, ADA.email)).status).toBe(200);
    expect((await req(db(), `/api/risk/${ADA.code}`, TUTOR)).status).toBe(200);
    expect((await req(db(), `/api/risk/${ADA.code}`)).status).toBe(200);
  });
});

describe("the review, four ways — no reading is ever spent on another student's account", () => {
  it("the page and the API refuse another student before any audit or call; the owner and the tutor are served", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const d = db();
    expect((await req(d, `/tickets/${ADA.code}/review`, "bob@example.com")).status).toBe(403);
    expect((await req(d, `/api/explain-my-portfolio/${ADA.code}?ai=1`, "bob@example.com")).status).toBe(403);
    const post = await req(d, `/tickets/${ADA.code}/review`, "bob@example.com", { method: "POST" });
    expect(post.status).toBe(403);
    expect(d.ran("INSERT INTO reviews")).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await req(db(), `/tickets/${ADA.code}/review`, ADA.email)).status).toBe(200);
    expect((await req(db(), `/tickets/${ADA.code}/review`, TUTOR)).status).toBe(200);
    expect((await req(db(), `/api/explain-my-portfolio/${ADA.code}`, ADA.email)).status).toBe(200);
    expect((await req(db(), `/api/explain-my-portfolio/${ADA.code}`)).status).toBe(200);
  });
});

describe("/me — the student's door", () => {
  it("door off: says the code is the way; nobody named: 403", async () => {
    const off = await req(db(), "/me");
    expect(off.status).toBe(200);
    expect(await off.text()).toMatch(/Sign-in is switched off on this copy of the site/);
    const nobody = worker.fetch(new Request("http://localhost/me"), env(db()), { waitUntil() {}, passThroughOnException() {}, access: { aud: "a", getIdentity: async () => undefined } } as any);
    expect((await nobody).status).toBe(403);
  });
  it("a linked student is sent to their page; an unlinked email is told what the tutor does; the tutor without an account is told where the list is", async () => {
    const ada = await req(db(), "/me", ADA.email);
    expect(ada.status).toBe(302);
    expect(ada.headers.get("location")).toBe(`/tickets/${ADA.code}`);
    const bob = await req(db(), "/me", "bob@example.com");
    expect(bob.status).toBe(404);
    expect(await bob.text()).toMatch(/no paper account is linked to that email yet/);
    const tutor = await req(db(), "/me", TUTOR);
    expect(tutor.status).toBe(404);
    const tutorHtml = await tutor.text();
    expect(tutorHtml).toMatch(/signed in as the tutor \(tutor@example\.ie\)/);
    expect(tutorHtml).toMatch(/npm run enrol -- --list/);
  });
  it("two accounts on one email (the tutor's test books): a page of doors, not a redirect", async () => {
    const two = db().on("FROM students WHERE lower(trim(email)) = ?1", () => ({ results: [{ code: ADA.code, name: "Test One" }, { code: BOB.code, name: "Test Two" }] }));
    const r = await req(two, "/me", TUTOR);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/2 paper accounts \(pretend dollars, real prices, a real record\) are linked/);
    expect(html).toMatch(new RegExp(`href="/tickets/${ADA.code}"`));
    expect(html).toMatch(new RegExp(`href="/tickets/${BOB.code}"`));
  });
  it("/api/me says who is here and which accounts, and nothing about anyone else", async () => {
    const j = (await (await req(db(), "/api/me", ADA.email)).json()) as any;
    expect(j).toEqual({ access: true, email: ADA.email, tutor: false, accounts: [{ code: ADA.code, name: ADA.name }], note: expect.stringMatching(/Education, not advice/) });
    expect(Object.keys(j).sort()).toEqual(["access", "accounts", "email", "note", "tutor"]);   // the exact key set (review N3): nothing else — not the tutor's addresses
    const off = (await (await req(db(), "/api/me")).json()) as any;
    expect(off).toEqual({ access: false, email: null, tutor: false, accounts: [], note: expect.stringMatching(/Education, not advice/) });
  });
});

describe("the landing and the kit", () => {
  it("the landing carries one line about the door when it is on — who, and where their page is — and nothing when it is off", async () => {
    const off = await (await req(db(), "/")).text();
    expect(off).not.toMatch(/Signed in/);
    expect(off).not.toMatch(/<!--who-->|<!--door-->/);
    // review S1: the "New this week" sentence follows the door — off: the address is still the key
    expect(off).toMatch(/On this copy of the site the sign-in is <strong>off<\/strong>, so <a href="\/me">your page<\/a> is found by your code, not your email\. Share a screenshot of it, not the link\./);   // v1.2.0: the reader review's longest sentence, split
    expect(off).not.toMatch(/for nobody else/);
    const ada = await (await req(db(), "/", ADA.email)).text();
    expect(ada).toMatch(new RegExp(`Signed in as ada@example\\.com &middot; <a href="/tickets/${ADA.code}">your page</a>`));
    expect(ada).toMatch(/You signed in with a code sent to your email\. <a href="\/me">Your page<\/a> opens for you and the tutor, and for nobody else\./);
    expect(ada).not.toMatch(/the door is <strong>off/);
    expect(ada).toMatch(/<a href="\/cdn-cgi\/access\/logout">sign out<\/a>/);   // review N4: how to sign out, on the page
    expect(off).not.toMatch(/sign out/);
    const tutor = await (await req(db(), "/", TUTOR)).text();
    expect(tutor).toMatch(/Signed in as tutor@example\.ie \(the tutor\) &middot; the enrolment list is/);
    const bob = await (await req(db(), "/", "bob@example.com")).text();
    expect(bob).toMatch(/no account is linked to this email yet/);
  });
  it("v1.2 (decision 25): the landing leads with the cards, the header is on every page with the current page marked, and the planner's card and link follow the door (the tutor; anyone when the door is off; never a student)", async () => {
    // door off: the code is the key, so the planner is open to anyone — its card and its link show (plannerOpen)
    const off = await (await req(db(), "/")).text();
    expect(off).toContain('<nav class="doors" aria-label="What you do here">');
    for (const href of ["/me", "/watchlist", "/signals", "/tutor", "/costs", "/kit"]) expect(off).toContain(`<a class="door${href === "/me" ? " first" : ""}" href="${href}"><h2>`);
    expect(off).toContain('<a class="home" href="/" aria-current="page">Intro to the Stock Market</a>');
    expect(off).toContain('<a class="door" href="/plan"><h2>The planner</h2>');
    expect(off).toContain('<a href="/plan">Planner</a>');
    expect(off).not.toContain("<!--planner");   // the mark is always filled by the middleware
    expect(off).not.toContain('class="back"');   // the grey crumb line is gone from every page
    expect(off).toContain('<p class="start"><strong>New here?</strong>');   // the reader review: which card first
    expect(off).toContain('<ul class="key" aria-label="The course\'s words">');   // the six-line key
    expect(off).toContain('<details class="ledger">');   // the builder's log, folded
    // fix1: the look-up box sits directly under the cards, before the promises, with the reference shelf as buttons
    expect(off.indexOf('<h2>Look up a company</h2>')).toBeGreaterThan(off.indexOf('</nav>', off.indexOf('<nav class="doors"')));
    expect(off.indexOf('<h2>Look up a company</h2>')).toBeLessThan(off.indexOf('<div class="promises">'));
    for (const [href, label] of [["/screen", "The Graham screen &mdash; seven tests, run tonight"], ["/card", "The checklist cards"], ["/explain/NVDA", "A company explained, with its receipts"], ["/size", "The calculator &mdash; how many shares, where the stop goes"]]) expect(off).toContain(`<a class="btn alt" href="${href}">${label}</a>`);
    expect(off).not.toContain("Also here:");
    expect(off).not.toContain("all 86 companies");   // the count is the signals page's to compute (review N8)
    // the header, with the page's own link marked, on the pages a student meets
    for (const [path, label] of [["/signals", "Signals"], ["/watchlist", "Watchlist"], ["/costs", "Costs &amp; tax"], ["/kit", "The kit"], ["/tutor", "Ask the tutor"]] as const) {
      const html = await (await req(db(), path)).text();
      expect(html).toContain('<nav class="top" aria-label="The course site">');
      expect(html).toContain(`<a href="${path}" aria-current="page">${label}</a>`);
      expect(html).not.toContain('class="back"');
      expect(html).not.toContain("<!--planner");
    }
    const size = await (await req(db(), "/size")).text();
    expect(size).toContain('<nav class="top" aria-label="The course site">');
    expect(size).not.toMatch(/<a href="[^"]*" aria-current="page">/);   // the calculator is not in the header; no link is marked
    // the door on, the tutor: the planner's card on the landing and its link in EVERY header (review S2), marked current on the planner
    const tutor = await (await req(db(), "/", TUTOR)).text();
    expect(tutor).toContain('<a class="door" href="/plan"><h2>The planner</h2>');
    expect(tutor).toContain('<a href="/plan">Planner</a>');
    const tutorSignals = await (await req(db(), "/signals", TUTOR)).text();
    expect(tutorSignals).toContain('<a href="/plan">Planner</a>');
    const tutorPlan = await (await req(db(), "/plan", TUTOR)).text();
    expect(tutorPlan).toContain('<a href="/plan" aria-current="page">Planner</a>');
    // the door on, a student: no card, no link anywhere — the planner's own 403 page included (review S1)
    const ada = await (await req(db(), "/", ADA.email)).text();
    expect(ada).not.toContain('href="/plan"');
    expect(ada).not.toContain(">Planner<");
    const adaSignals = await (await req(db(), "/signals", ADA.email)).text();
    expect(adaSignals).not.toContain(">Planner<");
    const adaPlan = await req(db(), "/plan", ADA.email);
    expect(adaPlan.status).toBe(403);
    const adaPlanHtml = await adaPlan.text();
    expect(adaPlanHtml).not.toContain(">Planner<");
    expect(adaPlanHtml).not.toContain("<!--planner");
    // JSON passes the middleware untouched
    const api = await req(db(), "/api/me", TUTOR);
    expect(api.headers.get("content-type")).toMatch(/json/);
    expect((await api.json() as { tutor: boolean }).tutor).toBe(true);
  });
  it("v1.2.0: /me with the door off takes a code in a box — the right shape redirects to the page, the wrong shape says so (the reader review's dead end)", async () => {
    const page = await req(db(), "/me");
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<form class="code" method="get" action="/me">');
    expect(html).toContain("Your page is your paper account: tonight's report, the stop line (the price at which the rules say sell)");
    const go = await req(db(), "/me?code=k7pm-4r2x");
    expect(go.status).toBe(302);
    expect(go.headers.get("location")).toBe("/tickets/K7PM-4R2X");
    const bad = await req(db(), "/me?code=hello");
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain("That doesn't look like a student code — eight characters like K7PM-4R2X.");
    // the door on: the tutor with no linked account gets the box too; a student with no account does not (the tutor links it)
    const tutor = await (await req(db(), "/me", TUTOR)).text();
    expect(tutor).toContain('<form class="code" method="get" action="/me">');
    const bob = await (await req(db(), "/me", "bob@example.com")).text();
    expect(bob).not.toContain('<form class="code"');
    // a typed code redirects whoever is at the door; the page itself decides whether it opens (ownerGate)
    expect((await req(db(), "/me?code=K7PM-4R2X", "bob@example.com")).status).toBe(302);
  });
  it("/kit lists every kit document with its repository path, in the order a student meets it", async () => {
    const r = await req(db(), "/kit");
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(KIT).toHaveLength(7);
    for (const k of KIT) expect(html).toContain(`blob/main/${k.file}`);
    expect(html).toMatch(/Education, not advice/);
  });
});
