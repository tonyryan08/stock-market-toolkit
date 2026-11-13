/**
 * Week 12 (decision 23): who is at the door.
 *
 * Cloudflare Access protects the whole Worker from its Access tab (the
 * 14 Aug 2026 release: one switch covers every route and the workers.dev
 * hostname). Access does the login — an email one-time code for the
 * addresses on the policy — and hands the Worker the identity on
 * `ctx.access` (`getIdentity()` → email, name …). The Worker validates no
 * token itself; it reads the identity and matches it to the student row.
 *
 * The rule (decision 23 b): with Access on, a student's page opens only for
 * the email on that student's row or for the tutor (`TUTOR_EMAILS`, a
 * secret: a comma-separated list, matched without case). `/me` is the
 * student's door — it finds the account by the signed-in email. With Access
 * off (`ctx.access` undefined: local dev without the `access.dev` block, or
 * the Worker made public) the code scheme of week 8 stands unchanged, so the
 * same code runs in both states and the gate is the deployment's choice.
 *
 * Nothing here is a security boundary on its own: Access is the gate; this
 * module decides which room a signed-in person may enter.
 */

export type Identity = { email: string; name: string | null };

/** The door's state for one request. */
export type Door = {
  /** Access authenticated this request (ctx.access present). */
  on: boolean;
  identity: Identity | null;
  /** The signed-in email is one of TUTOR_EMAILS. */
  tutor: boolean;
};

export const DOOR_OFF: Door = { on: false, identity: null, tutor: false };

/**
 * TUTOR_EMAILS: "a@x.ie, b@y.com" → ["a@x.ie", "b@y.com"], lower-cased, blanks dropped. A value typed the way a
 * `.dev.vars` line reads — `TUTOR_EMAILS="a@x.ie"`, or quoted — matched nobody, silently, at the v1.1.0 apply
 * (VC-25, OI-109): the key name and surrounding quotes are now stripped from each address before it is compared.
 */
export function tutorEmails(env: { TUTOR_EMAILS?: string }): string[] {
  return (env.TUTOR_EMAILS ?? "")
    .replace(/^\s*TUTOR_EMAILS\s*=/i, "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().replace(/^["'`]+|["'`]+$/g, "").toLowerCase())
    .filter((e) => e.includes("@"));
}

export function isTutor(email: string | null | undefined, env: { TUTOR_EMAILS?: string }): boolean {
  return !!email && tutorEmails(env).includes(email.trim().toLowerCase());
}

/** The shape the runtime gives us (worker-configuration.d.ts: CloudflareAccessContext). Typed loosely so a test can hand in a fake. */
export type AccessLike = { aud: string; getIdentity(): Promise<{ email?: string; name?: string } | undefined> };

/** Read the identity Access attached to this invocation; null identity when Access did not run or gave no email. */
export async function doorFrom(access: AccessLike | undefined, env: { TUTOR_EMAILS?: string }): Promise<Door> {
  if (!access) return DOOR_OFF;
  let who: { email?: string; name?: string } | undefined;
  try { who = await access.getIdentity(); } catch { who = undefined; }
  const email = who?.email?.trim().toLowerCase() ?? "";
  if (!email) return { on: true, identity: null, tutor: false };   // Access ran but named nobody (a service token, say): nobody's page opens
  return { on: true, identity: { email, name: who?.name?.trim() || null }, tutor: isTutor(email, env) };
}

/** Hono's `c.executionCtx` throws where there is no execution context (a plain test), and its type does not know
 *  `access` (the runtime's does: worker-configuration.d.ts); read it loosely. The door is off when there is none. */
export async function doorOf(c: { executionCtx: unknown; env: { TUTOR_EMAILS?: string } }): Promise<Door> {
  let access: AccessLike | undefined;
  try { access = (c.executionCtx as { access?: AccessLike } | undefined)?.access; } catch { access = undefined; }
  return doorFrom(access, c.env);
}

export type OwnerCheck =
  | { ok: true }
  | { ok: false; status: 403 | 503; kind: "unlinked" | "other" | "nobody" | "unavailable"; reason: string };

/**
 * May the person at the door open this student's page?
 * Access off → yes (the code is the key, as from week 8). The tutor → yes.
 * The row has no email → no, until the tutor links one. Another student's email → no; their own door is /me.
 */
export function ownerCheck(gate: Door, studentEmail: string | null | undefined): OwnerCheck {
  if (!gate.on || gate.tutor) return { ok: true };
  if (!gate.identity) return { ok: false, status: 403, kind: "nobody", reason: "Access let this request through without an email, so no student's page can open. Sign in with the email the tutor enrolled." };
  const own = (studentEmail ?? "").trim().toLowerCase();
  if (!own) return { ok: false, status: 403, kind: "unlinked", reason: `This account is not linked to an email yet, so it opens only for the tutor until it is (the tutor runs \`npm run enrol -- --set-email CODE ${gate.identity.email}\`). You are signed in as ${gate.identity.email}.` };
  if (own === gate.identity.email) return { ok: true };
  return { ok: false, status: 403, kind: "other", reason: `You are signed in as ${gate.identity.email}, and this is another student's page. Your own page is /me — and if this is your own page, the address on your row is not the one you signed in with: tell the tutor.` };
}

/** Load the row's email and decide, in one call for the routes. The query runs only when the door is on and the person is not the tutor. */
export async function ownerGate(c: { executionCtx: unknown; env: { TUTOR_EMAILS?: string; DB: D1Database } }, code: string): Promise<{ gate: Door; check: OwnerCheck }> {
  const gate = await doorOf(c);
  if (!gate.on || gate.tutor) return { gate, check: { ok: true } };
  let email: string | null = null;
  try {
    const row = await c.env.DB.prepare("SELECT email FROM students WHERE code = ?1").bind(code).first<{ email: string | null }>();
    if (!row) return { gate, check: { ok: true } };   // no such student: the route answers its own 404
    email = row.email;
  } catch (e) {
    // Fail closed for a student, open for the tutor — with the right reason (review N8): the column missing is migration
    // 0013 not applied; anything else is the database not answering just now.
    const missing = /no such column/i.test(String((e as Error)?.message ?? e));
    return { gate, check: missing ? ownerCheck(gate, null) : { ok: false, status: 503, kind: "unavailable", reason: "The account's email could not be read just now, so the page opens for the tutor only until it can — try again in a minute." } };
  }
  return { gate, check: ownerCheck(gate, email) };
}

/** The accounts linked to a signed-in email (normally one; the tutor's own test accounts may share one). */
export async function accountsFor(db: D1Database, email: string): Promise<{ code: string; name: string }[]> {
  try {
    // trim as well as lower (review N1): the enrol script normalises on write, a hand-written row may not be
    return (await db.prepare("SELECT code, name FROM students WHERE lower(trim(email)) = ?1 ORDER BY created_at").bind(email.trim().toLowerCase()).all<{ code: string; name: string }>()).results;
  } catch { return []; }
}
