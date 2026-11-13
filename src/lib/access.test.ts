/**
 * Week 12 (decision 23): who is at the door, and which room they may enter.
 * Access itself is Cloudflare's; here the Worker's reading of the identity it
 * is handed, and the owner rule on a student's page.
 */
import { describe, it, expect } from "vitest";
import { tutorEmails, isTutor, doorFrom, doorOf, ownerCheck, ownerGate, accountsFor, DOOR_OFF, type AccessLike } from "./access";
import { fakeD1, asD1 } from "../jobs/fake-d1";

const access = (email?: string, name?: string): AccessLike => ({ aud: "test-aud", getIdentity: async () => (email === undefined ? undefined : { email, name }) });
const TUTOR = { TUTOR_EMAILS: "Tutor@Example.ie, second@example.com" };

describe("TUTOR_EMAILS", () => {
  it("is a comma- or space-separated list, matched without case; blanks and non-addresses dropped", () => {
    expect(tutorEmails(TUTOR)).toEqual(["tutor@example.ie", "second@example.com"]);
    expect(tutorEmails({ TUTOR_EMAILS: " a@b.c ;; nonsense , " })).toEqual(["a@b.c"]);
    expect(tutorEmails({})).toEqual([]);
    expect(isTutor("TUTOR@example.ie", TUTOR)).toBe(true);
    expect(isTutor("student@example.ie", TUTOR)).toBe(false);
    expect(isTutor(null, TUTOR)).toBe(false);
  });
});

describe("the door", () => {
  it("is off when Access did not run (no ctx.access): local dev without the dev block, or the Worker made public", async () => {
    expect(await doorFrom(undefined, TUTOR)).toEqual(DOOR_OFF);
    expect(await doorOf({ executionCtx: { waitUntil() {} }, env: TUTOR })).toEqual(DOOR_OFF);
    // Hono throws on c.executionCtx where there is none: the door is off, not an error
    const throwing = { get executionCtx(): unknown { throw new Error("This context has no ExecutionContext"); }, env: TUTOR };
    expect(await doorOf(throwing)).toEqual(DOOR_OFF);
  });
  it("reads the identity Access attached — the email lower-cased, the name kept, the tutor recognised", async () => {
    expect(await doorFrom(access("Ada@Example.com", "Ada Lovelace"), TUTOR)).toEqual({ on: true, identity: { email: "ada@example.com", name: "Ada Lovelace" }, tutor: false });
    expect(await doorFrom(access("second@example.com"), TUTOR)).toEqual({ on: true, identity: { email: "second@example.com", name: null }, tutor: true });
    expect(await doorOf({ executionCtx: { access: access("ada@example.com") }, env: TUTOR })).toMatchObject({ on: true, identity: { email: "ada@example.com" } });
  });
  it("is on with nobody named when Access ran but gave no email (a service token, say) — and no page opens for that", async () => {
    expect(await doorFrom(access(undefined), TUTOR)).toEqual({ on: true, identity: null, tutor: false });
    expect(await doorFrom(access(""), TUTOR)).toEqual({ on: true, identity: null, tutor: false });
    const failing: AccessLike = { aud: "x", getIdentity: async () => { throw new Error("identity service down"); } };
    expect(await doorFrom(failing, TUTOR)).toEqual({ on: true, identity: null, tutor: false });
    expect(ownerCheck({ on: true, identity: null, tutor: false }, "ada@example.com")).toMatchObject({ ok: false, status: 403, kind: "nobody" });
  });
});

describe("the owner rule (decision 23 b)", () => {
  const ada = { on: true, identity: { email: "ada@example.com", name: null }, tutor: false };
  const tutor = { on: true, identity: { email: "tutor@example.ie", name: null }, tutor: true };
  it("door off: the code is the key, as from week 8 — any page opens", () => {
    expect(ownerCheck(DOOR_OFF, "someone@else.com")).toEqual({ ok: true });
    expect(ownerCheck(DOOR_OFF, null)).toEqual({ ok: true });
  });
  it("the tutor opens every page; a student opens their own, matched without case; another student's is refused with the way to their own", () => {
    expect(ownerCheck(tutor, null)).toEqual({ ok: true });
    expect(ownerCheck(tutor, "ada@example.com")).toEqual({ ok: true });
    expect(ownerCheck(ada, "Ada@Example.COM ")).toEqual({ ok: true });
    const other = ownerCheck(ada, "bob@example.com");
    expect(other).toMatchObject({ ok: false, status: 403, kind: "other" });
    expect((other as any).reason).toMatch(/signed in as ada@example\.com, and this is another student's page\. Your own page is \/me — and if this is your own page, the address on your row is not the one you signed in with: tell the tutor/);
  });
  it("an account with no email yet opens for the tutor only, and says what links it", () => {
    const r = ownerCheck(ada, null);
    expect(r).toMatchObject({ ok: false, status: 403, kind: "unlinked" });
    expect((r as any).reason).toMatch(/not linked to an email yet/);
    expect((r as any).reason).toMatch(/--set-email CODE ada@example\.com/);
    expect(ownerCheck(ada, "")).toMatchObject({ kind: "unlinked" });
  });
});

describe("ownerGate on the database", () => {
  const db = (rows: Record<string, unknown>[], fail = false) => fakeD1().on("SELECT email FROM students WHERE code", () => { if (fail) throw new Error("no such column: email"); return { results: rows }; });
  const c = (email: string | null, d: ReturnType<typeof fakeD1>, env: Record<string, string> = TUTOR) =>
    ({ executionCtx: email === null ? {} : { access: access(email) }, env: { ...env, DB: asD1(d) } });
  it("runs no query while the door is off or the tutor is here", async () => {
    const off = db([{ email: "ada@example.com" }]);
    expect((await ownerGate(c(null, off), "K7PM-4R2X")).check).toEqual({ ok: true });
    expect(off.log).toHaveLength(0);
    const t = db([{ email: "ada@example.com" }]);
    expect((await ownerGate(c("tutor@example.ie", t), "K7PM-4R2X")).check).toEqual({ ok: true });
    expect(t.log).toHaveLength(0);
  });
  it("one query for a student: their own email opens, another's is refused, no such student is left to the route's 404", async () => {
    const own = db([{ email: "ada@example.com" }]);
    expect((await ownerGate(c("ada@example.com", own), "K7PM-4R2X")).check).toEqual({ ok: true });
    expect(own.ran("SELECT email FROM students WHERE code")).toHaveLength(1);
    expect((await ownerGate(c("bob@example.com", db([{ email: "ada@example.com" }])), "K7PM-4R2X")).check).toMatchObject({ ok: false, kind: "other" });
    expect((await ownerGate(c("bob@example.com", db([])), "ZZZZ-9999")).check).toEqual({ ok: true });
  });
  it("migration 0013 not applied (no email column): every account is unlinked — opens for the tutor only, fails closed for students; any other error is 503 'unavailable' (review N8)", async () => {
    expect((await ownerGate(c("ada@example.com", db([], true)), "K7PM-4R2X")).check).toMatchObject({ ok: false, status: 403, kind: "unlinked" });
    expect((await ownerGate(c("tutor@example.ie", db([], true)), "K7PM-4R2X")).check).toEqual({ ok: true });
    const down = fakeD1().on("SELECT email FROM students WHERE code", () => { throw new Error("D1_ERROR: database is overloaded"); });
    expect((await ownerGate(c("ada@example.com", down), "K7PM-4R2X")).check).toMatchObject({ ok: false, status: 503, kind: "unavailable" });
    expect((await ownerGate(c("tutor@example.ie", down), "K7PM-4R2X")).check).toEqual({ ok: true });
  });
  it("accountsFor finds the accounts linked to an email, lower-cased and trimmed on both sides (review N1); none when the column is missing", async () => {
    const d = fakeD1().on("FROM students WHERE lower(trim(email)) = ?1", (b) => ({ results: b[0] === "ada@example.com" ? [{ code: "K7PM-4R2X", name: "Ada" }] : [] }));
    expect(await accountsFor(asD1(d), " Ada@Example.com ")).toEqual([{ code: "K7PM-4R2X", name: "Ada" }]);
    expect(await accountsFor(asD1(d), "nobody@example.com")).toEqual([]);
    const broken = fakeD1().on("FROM students WHERE lower(trim(email))", () => { throw new Error("no such column"); });
    expect(await accountsFor(asD1(broken), "ada@example.com")).toEqual([]);
  });
});
