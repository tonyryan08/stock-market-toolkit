/**
 * v1.1 (decision 24): the portfolio planner — the tutor's workbook after the course.
 *
 *   GET  /plan              which account to plan for (the accounts linked to the signed-in email, or a code)
 *   GET  /plan/:code        the planner: tonight's candidates ranked by the tests, the picks sized, stopped and priced
 *   POST /plan/:code        the same form back — recompute (keep the picks), repopulate (the top names again),
 *                           save (one row per account), raise (each included row through the ticket judge)
 *   GET  /plan/:code/plan.csv   the current plan as CSV (the saved one, or tonight's top names)
 *   GET  /api/plan/:code    the same as JSON
 *
 * Tutor-only while the door is on; with the door off the code is the key, as on every student page. The sizes are
 * the judge's — the account's value tonight, its ledger cash, its enrolled instrument count — never a typed capital
 * (the v1.1.0 review's F1). Nothing here is a position until handleTicket accepts it: the planner proposes, the ticket
 * judge decides. Education, not advice: a screen and a calculator, never a pick.
 */
import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, SHARED_CSS, esc, nav } from "./page";
import { doorOf, accountsFor, type Door } from "./lib/access";
import { CODE, JOURNAL_MIN, JOURNAL_MAX, type Student, type Reason } from "./lib/tickets";
import { markToMarket } from "./lib/risk";
import { SIZING, fmtPct } from "./lib/sizing";
import { RULE as SIGNAL_RULE } from "./lib/signals";
import type { GateRow } from "./lib/gate";
import { BROKER } from "./lib/costs";
import { SIGN_OUT } from "./me";
import { loadStudent, loadPositions, loadTickets, latestFor, handleTicket, type TicketOutcome } from "./portfolio";
import {
  rankCandidates, buildPlan, topPicks, parseInputs, parseUnits, parseSavedPlan, planCsv, DEFAULT_INPUTS,
  type Candidate, type Plan, type PlanInputs, type PickInput, type SavedPlan, type Account,
} from "./lib/plan";

type Env = { DB: D1Database; TUTOR_EMAILS?: string };

const NOTE = "Education, not advice. The planner is a screen and a calculator: the names are what two rules say tonight, the sizes are what Carver's rule would hold in a paper account, and nothing on this page is a recommendation to buy, hold or sell anything.";

/** Who may open the planner: the door off → anyone with the code (week 8's scheme); the door on → the tutor only (decision 24 d). */
/** Is the planner open to the person at the door? The tutor's; anyone's when the door is off (the code is the key). The header's link and the landing's card follow this (v1.2.0 review S1, S2). */
export const plannerOpen = (gate: Door): boolean => !gate.on || gate.tutor;

export function plannerCheck(gate: Door): { ok: true } | { ok: false; status: 403; reason: string } {
  if (plannerOpen(gate)) return { ok: true };
  return { ok: false, status: 403, reason: `The planner is the tutor's for now${gate.identity ? ` — you are signed in as ${gate.identity.email}` : ""}. Your own page is /me.` };
}

/**
 * The planner's POST is the tutor's and can write a ticket, so a form posted from another site is refused (review N4):
 * a browser names the site in `Sec-Fetch-Site` or the `Origin`; a request without either (curl, a test) is not cross-site.
 */
export function crossSite(headers: { get(name: string): string | null }, url: string): boolean {
  const site = headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return true;
  const origin = headers.get("origin");
  if (!origin) return false;
  if (origin === "null") return true;
  try { return new URL(origin).host !== new URL(url).host; } catch { return true; }
}

export type GateLoader = (env: Env) => Promise<GateRow[]>;

type Loaded = {
  student: Student; candidates: Candidate[]; asOf: string | null;
  account: Account;
  saved: SavedPlan | null;
  /** The saved plan could not be read just now (the table missing is not an error: nothing is saved). */
  savedUnreadable: boolean;
};

async function loadSaved(db: D1Database, code: string): Promise<{ saved: SavedPlan | null; unreadable: boolean }> {
  try {
    const row = await db.prepare("SELECT body FROM plans WHERE code = ?1").bind(code).first<{ body: string }>();
    return { saved: parseSavedPlan(row?.body), unreadable: false };
  } catch (e) {
    const missing = /no such table/i.test(String((e as Error)?.message ?? e));
    return { saved: null, unreadable: !missing };   // migration 0014 not applied: nothing saved; anything else: say so (review N9)
  }
}

async function savePlan(db: D1Database, code: string, plan: SavedPlan, asOf: string | null): Promise<string | null> {
  try {
    await db.prepare("INSERT INTO plans (code, body, as_of, saved_at) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(code) DO UPDATE SET body = excluded.body, as_of = excluded.as_of, saved_at = excluded.saved_at")
      .bind(code, JSON.stringify(plan), asOf, new Date().toISOString()).run();
    return null;
  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    return /no such table/i.test(msg) ? "Not saved: the plans table is missing — migration 0014 has not been applied to this database." : "Not saved: the database did not answer just now. Try again in a minute.";
  }
}

/** The ranked rows, the account tonight and the saved plan, for one code. */
async function load(env: Env, loadGate: GateLoader, student: Student): Promise<Loaded> {
  const [rows, positions, tickets, savedRead] = await Promise.all([loadGate(env), loadPositions(env.DB, student.code), loadTickets(env.DB, student.code), loadSaved(env.DB, student.code)]);
  const latest = await latestFor(env.DB, positions.filter((p) => p.status === "open").map((p) => p.symbol));
  const marked = markToMarket(student, positions, tickets, latest);
  const candidates = rankCandidates(rows, positions);
  const asOf = rows.reduce<string | null>((m, r) => (m === null || r.date > m ? r.date : m), null);
  return {
    student, candidates, asOf,
    account: { value: marked.value, cash: marked.cash, riskUsedPct: marked.riskUsedPct, openCount: positions.filter((p) => p.status === "open").length, instruments: student.instruments },
    saved: savedRead.saved, savedUnreadable: savedRead.unreadable,
  };
}

/** The picks from the form: every ticked row, its units cell as typed (read or kept as text), its thesis as typed. */
function picksFromForm(form: Record<string, unknown>, candidates: Candidate[]): PickInput[] {
  const out: PickInput[] = [];
  for (const c of candidates) {
    if (form[`pick_${c.symbol}`] === undefined) continue;
    const u = parseUnits(typeof form[`units_${c.symbol}`] === "string" ? (form[`units_${c.symbol}`] as string) : undefined);
    const thesis = String(form[`thesis_${c.symbol}`] ?? "").slice(0, JOURNAL_MAX);
    out.push({ symbol: c.symbol, units: u.units, ...(u.unitsText !== undefined ? { unitsText: u.unitsText } : {}), thesis });
  }
  return out;
}

const roomOf = (l: Loaded) => Math.max(0, l.account.instruments - l.account.openCount);

/** The plan to show on a GET: the saved one, else tonight's top names. */
function currentPlan(l: Loaded): Plan {
  const inputs: PlanInputs = l.saved?.inputs ?? DEFAULT_INPUTS;
  const picks = l.saved?.picks ?? topPicks(l.candidates, roomOf(l));
  return buildPlan(l.candidates, picks, inputs, l.account, l.asOf);
}

export function planRoutes(loadGate: GateLoader): Hono<{ Bindings: Env }> {
  const plan = new Hono<{ Bindings: Env }>();

  plan.get("/plan", async (c) => {
    const gate = await doorOf(c);
    const check = plannerCheck(gate);
    if (!check.ok) return c.html(emptyPage(check.reason), check.status);
    const accounts = gate.on && gate.identity ? await accountsFor(c.env.DB, gate.identity.email) : [];
    return c.html(chooserPage(gate, accounts), 200, { "cache-control": "no-store" });
  });

  const guard = async (c: { executionCtx: unknown; env: Env; req: { param(k: string): string } }): Promise<{ ok: true; code: string; gate: Door; student: Student } | { ok: false; status: 400 | 403 | 404; reason: string }> => {
    const code = c.req.param("code").trim().toUpperCase();
    if (!CODE.test(code)) return { ok: false, status: 400, reason: "That doesn't look like a student code — eight characters like K7PM-4R2X." };
    const gate = await doorOf(c);
    const check = plannerCheck(gate);
    if (!check.ok) return { ok: false, status: 403, reason: check.reason };
    const student = await loadStudent(c.env.DB, code);
    if (!student) return { ok: false, status: 404, reason: "No student with that code. Codes come from the tutor's enrolment." };
    return { ok: true, code, gate, student };
  };

  plan.get("/plan/:code", async (c) => {
    const g = await guard(c);
    if (!g.ok) return c.html(emptyPage(g.reason), g.status);
    const l = await load(c.env, loadGate, g.student);
    return c.html(planPage(l, currentPlan(l), g.gate, null, []), 200, { "cache-control": "no-store" });
  });

  plan.post("/plan/:code", async (c) => {
    const g = await guard(c);
    if (!g.ok) return c.html(emptyPage(g.reason), g.status);
    if (crossSite(c.req.raw.headers, c.req.url)) return c.html(emptyPage("The form was posted from another site, so nothing was done. Open the planner from this site and try again."), 403);
    const form = (await c.req.parseBody()) as Record<string, unknown>;
    const l = await load(c.env, loadGate, g.student);
    const action = String(form.action ?? "recompute");
    const parsed = parseInputs(Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" ? v : undefined])));
    const inputs = parsed.inputs;
    const picks = action === "repopulate" ? topPicks(l.candidates, roomOf(l)) : picksFromForm(form, l.candidates);
    const built = buildPlan(l.candidates, picks, inputs, l.account, l.asOf);
    let flash: Flash | null = parsed.errors.length ? { kind: "no", text: parsed.errors.join(" ") } : null;
    const outcomes: RowOutcome[] = [];
    let status: 200 | 503 = 200;
    if (action === "save") {
      // the picks as TYPED (a blank units cell stays blank, so the saved plan re-sizes with the rule each night; the
      // thesis is the writer's words) — never the computed figures
      const err = await savePlan(c.env.DB, g.code, { inputs, picks: picks.map((x) => ({ symbol: x.symbol, units: x.units, thesis: x.thesis.trim() })) }, l.asOf);
      flash = err ? { kind: "no", text: err } : { kind: "ok", text: `Plan saved for ${g.student.name}: ${built.rows.length} name${built.rows.length === 1 ? "" : "s"}, as of the ${l.asOf ?? "—"} close. Repopulate rebuilds it from tonight's rows; the saved one is what this page shows until then.` };
      if (err) status = 503;   // the request did not do what was asked (review N9)
    } else if (action === "raise") {
      const dropped = picks.length - built.rows.length;
      if (built.rows.length === 0) {
        flash = { kind: "no", text: dropped > 0 ? `Nothing raised: ${dropped} ticked row${dropped === 1 ? " is" : "s are"} not eligible tonight (see the notes).` : "Nothing to raise: no row is ticked." };
      } else {
        // at most the account's room is tried, in rank order (review N2): the judge would refuse the rest as concentration
        const room = roomOf(l);
        const tried = built.rows.slice(0, room);
        const left = built.rows.slice(room);
        if (tried.length === 0) {
          // no room tonight: nothing is tried, and the sentence says why (VC-25, OI-110 — "0 of 0 tickets accepted" was the first wording)
          flash = { kind: "no", text: `Nothing raised: the account has no room — ${l.account.instruments} instrument${l.account.instruments === 1 ? "" : "s"}, ${l.account.openCount} open. ${left.length} ticked row${left.length === 1 ? " was" : "s were"} left as ${left.length === 1 ? "it is" : "they are"} (${left.map((r) => r.symbol).join(", ")}). Close a position, or set more instruments (npm run enrol -- --set-instruments CODE N).` };
          return c.html(planPage(l, built, g.gate, flash, []), 200, { "cache-control": "no-store" });
        }
        for (const r of tried) {
          if (r.blocked) {
            const why: Reason = { code: "planner", message: r.unitsText !== null ? r.problems[0] : r.units === 0 ? "0 shares: nothing to raise — fit a row above, or overwrite." : `Write the thesis — what would prove you wrong, and why this size — in at least ${JOURNAL_MIN} characters. The facts above are the planner's; the decision is yours, and the journal entry is the ticket.` };
            outcomes.push({ symbol: r.symbol, units: r.units, out: { status: 422, body: { error: "Not raised.", reasons: [why] }, reasons: [why] } });
            continue;
          }
          const out: TicketOutcome = await handleTicket(c.env.DB, { code: g.code, symbol: r.symbol, side: "open", units: String(r.units), journal: r.journal });
          outcomes.push({ symbol: r.symbol, units: r.units, out });
        }
        const accepted = outcomes.filter((o) => o.out.status === 201).length;
        const leftNote = left.length ? ` ${left.length} ticked row${left.length === 1 ? " was" : "s were"} left as ${left.length === 1 ? "it is" : "they are"} (${left.map((r) => r.symbol).join(", ")}): the account has room for ${room}.` : "";
        const droppedNote = dropped > 0 ? ` ${dropped} ticked row${dropped === 1 ? " is" : "s are"} not eligible tonight (see the notes).` : "";
        flash = { kind: accepted === outcomes.length ? "ok" : "no", text: `${accepted} of ${outcomes.length} ticket${outcomes.length === 1 ? "" : "s"} accepted${accepted < outcomes.length ? " — the refusals are under each row" : ""}.${leftNote}${droppedNote} The account's page has the positions: /tickets/${g.code}.` };
        // the account changed: reload the picture (held names drop out of the candidates; the cash and the budget move)
        const after = await load(c.env, loadGate, g.student);
        const remaining = picks.filter((p) => !outcomes.some((o) => o.symbol === p.symbol && o.out.status === 201));
        const rebuilt = buildPlan(after.candidates, remaining, inputs, after.account, after.asOf);
        return c.html(planPage(after, rebuilt, g.gate, flash, outcomes), 200, { "cache-control": "no-store" });
      }
    } else if (action === "repopulate") {
      const n = l.candidates.filter((x) => x.eligible).length;
      flash = { kind: flash ? "no" : "ok", text: `${flash ? flash.text + " " : ""}Repopulated from the ${l.asOf ?? "—"} close: the top ${built.rows.length} of ${n} eligible name${n === 1 ? "" : "s"}, by the tests. Nothing is saved until you say so.` };
    }
    return c.html(planPage(l, built, g.gate, flash, outcomes), status, { "cache-control": "no-store" });
  });

  plan.get("/plan/:code/plan.csv", async (c) => {
    const g = await guard(c);
    if (!g.ok) return c.text(g.reason, g.status);
    const l = await load(c.env, loadGate, g.student);
    const csv = planCsv(currentPlan(l));
    return c.body(csv, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="plan-${g.code}-${l.asOf ?? "tonight"}.csv"`, "cache-control": "no-store" });
  });

  plan.get("/api/plan/:code", async (c) => {
    const g = await guard(c);
    if (!g.ok) return c.json({ error: g.reason }, g.status);
    const l = await load(c.env, loadGate, g.student);
    const p = currentPlan(l);
    return c.json({
      code: g.code, name: g.student.name, as_of_close: l.asOf, saved: l.saved !== null, saved_unreadable: l.savedUnreadable,
      account_tonight: { value: l.account.value, cash: l.account.cash, open_positions: l.account.openCount, risk_used_pct: l.account.riskUsedPct, instruments: l.account.instruments },
      inputs: p.inputs, per_instrument_target_pct: p.targetPct,
      candidates: l.candidates.map((x) => ({ rank: x.rank, symbol: x.symbol, name: x.name, band: x.band, eligible: x.eligible, why: x.why, state: x.state, state_since: x.state_since ?? null, forecast: x.forecast, instrument_risk: x.instrument_risk, graham: { defensive: x.defensive, enterprising: x.enterprising }, close: x.close })),
      plan: { rows: p.rows, totals: p.totals, connectivity: p.connectivity, notes: p.notes },
      order: "the watchlist's bands (gate, near miss, long failing both, long without books), then defensive tests passed, enterprising tests passed, the forecast (the rule's trend strength, from the price series), the lower instrument risk — never a return (decision 24 b)",
      sizing: "each row on the account's value tonight less the opening costs of the rows above, at 12% ÷ N (N the enrolled count), fitted in rank order to the ledger cash — the ticket judge's own facts",
      broker: BROKER.name, rules: SIZING, note: NOTE,
    }, 200, { "cache-control": "no-store" });
  });

  return plan;
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------
type Flash = { kind: "ok" | "no"; text: string };
type RowOutcome = { symbol: string; units: number; out: TicketOutcome };

const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const euro = (v: number) => `€${v.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CSS = `
  main { max-width: 64rem; }
  @media (min-width: 1100px) { main { max-width: 76rem; } }   /* the eligible table has sixteen columns; on a wide screen it gets the room */
  h2 { font-family:"Libre Caslon Text",serif; font-size:1.2rem; margin:1.6rem 0 .4rem; }
  .flash { border-radius:6px; padding:.7rem 1rem; margin:1rem 0; font-size:.92rem; }
  .flash.ok { background:#E3EFE7; border:1px solid var(--entry); } .flash.no { background:#F6E4E1; border:1px solid var(--stamp); }
  .inputs { display:grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap:.8rem 1.2rem; background:rgba(255,255,255,.55); border:1px solid var(--rule); border-radius:6px; padding:.9rem 1rem; margin:1rem 0; }
  .inputs label { display:block; font-size:.78rem; color:var(--faint); text-transform:uppercase; letter-spacing:.04em; }
  .inputs input { width:100%; font:inherit; font-family:"IBM Plex Mono",monospace; padding:.35rem .5rem; border:1px solid var(--rule); border-radius:4px; background:#fff; }
  .inputs small { display:block; color:var(--faint); font-size:.75rem; margin-top:.2rem; }
  .inputs .fact { font-family:"IBM Plex Mono",monospace; font-size:.95rem; padding:.35rem 0; }
  .actions { display:flex; gap:.6rem; flex-wrap:wrap; margin:1rem 0; align-items:center; }
  .actions button { font:inherit; padding:.45rem .9rem; border-radius:4px; border:1.5px solid var(--entry); background:#fff; color:var(--entry); cursor:pointer; }
  .actions button.primary { background:var(--entry); color:#fff; }
  .actions button.raise { border-color:var(--stamp); color:var(--stamp); }
  table { width:100%; border-collapse:collapse; font-size:.82rem; }
  th, td { padding:.35rem .45rem; border-bottom:1px solid var(--rule); text-align:left; vertical-align:top; }
  thead th { color:var(--faint); font-weight:400; font-size:.72rem; letter-spacing:.04em; text-transform:uppercase; white-space:nowrap; }
  thead th .sub { display:block; text-transform:none; letter-spacing:0; font-size:.68rem; white-space:nowrap; }
  tbody th { font-weight:500; white-space:nowrap; }
  td.n, th.n { text-align:right; font-family:"IBM Plex Mono",monospace; white-space:nowrap; }
  .nm { display:block; color:var(--faint); font-weight:400; font-size:.72rem; white-space:normal; }
  .band { font-family:"IBM Plex Mono",monospace; font-size:.65rem; letter-spacing:.06em; border:1.4px solid var(--entry); color:var(--entry); border-radius:3px; padding:0 .3rem; white-space:nowrap; }
  .band.near { border-color:var(--faint); color:var(--faint); } .band.long, .band.no_books { border-color:#B7C0BA; color:var(--faint); }
  .why { color:var(--faint); font-size:.78rem; }
  tr.off th, tr.off td { color:var(--faint); }
  .units { width:4.5rem; font:inherit; font-family:"IBM Plex Mono",monospace; padding:.2rem .3rem; border:1px solid var(--rule); border-radius:4px; text-align:right; }
  .units.bad { border-color:var(--stamp); }
  .facts { font-size:.8rem; color:var(--faint); margin:0 0 .25rem; font-family:"IBM Plex Mono",monospace; }
  textarea.thesis { width:100%; min-height:3rem; font:inherit; font-size:.82rem; padding:.35rem .5rem; border:1px solid var(--rule); border-radius:4px; background:#fff; }
  .problem { color:var(--stamp); font-size:.8rem; margin:.2rem 0 0; }
  .refused { color:var(--stamp); font-size:.8rem; } .accepted { color:var(--entry); font-size:.8rem; }
  .totals { display:flex; gap:1.4rem; flex-wrap:wrap; margin:.8rem 0; font-family:"IBM Plex Mono",monospace; font-size:.85rem; }
  .totals b { display:block; font-size:1.15rem; } .totals .over b { color:var(--stamp); }
  .note { font-size:.85rem; color:var(--faint); margin:.4rem 0; }
  .rule { background:rgba(255,255,255,.5); border:1px solid var(--rule); border-radius:6px; padding:.8rem 1rem; font-size:.85rem; margin:1rem 0; }
  .who { font-size:.9rem; color:var(--faint); }
  .doors { list-style:none; padding:0; margin:1.2rem 0; } .doors li { padding:.6rem 0; border-top:1px solid var(--rule); } .doors li:last-child { border-bottom:1px solid var(--rule); }
  details summary { cursor:pointer; color:var(--entry); font-size:.9rem; margin:.6rem 0; }
  @media (max-width: 760px) {
    .nm { display:none; } td.hide, th.hide { display:none; }
    /* the eligible table becomes a card per company: each cell on its own line with its label (decision 25 d) */
    table.plan, table.plan tbody, table.plan tr, table.plan td, table.plan th { display:block; }
    table.plan thead { display:none; }
    table.plan tr { border:1px solid var(--rule); border-radius:6px; background:rgba(255,255,255,.55); padding:.5rem .7rem; margin:0 0 .7rem; }
    table.plan tr.journal-row { margin-top:-.75rem; border-top:0; border-radius:0 0 6px 6px; }
    table.plan td, table.plan th { border:0; padding:.15rem 0; text-align:left; white-space:normal; }
    table.plan td.n { text-align:left; }
    table.plan td.hide { display:block; }
    table.plan tbody th { font-size:1rem; }
    table.plan tbody th .nm { display:inline; margin-left:.4rem; }
    table.plan td[data-label]::before { content:attr(data-label) ": "; color:var(--faint); font-family:"IBM Plex Sans",sans-serif; font-size:.75rem; text-transform:uppercase; letter-spacing:.04em; }
    table.plan td[data-label=""]::before { content:""; }
    table.plan td:empty { display:none; }
    .inputs { grid-template-columns:1fr; }
  }
`;

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="referrer" content="same-origin">${FONTS_HTML}<style>${PAGE_CSS}${SHARED_CSS}${CSS}</style></head>
<body><main>${nav("/plan")}<p class="eyebrow">The planner &middot; the tutor's workbook</p>${body}<footer><p class="notice">${NOTE}</p></footer></main></body></html>`;
}

function emptyPage(reason: string): string {
  return shell("The planner", `<h1>The planner</h1><p class="who" style="color:var(--stamp)">${esc(reason)}</p>`);
}

function chooserPage(gate: Door, accounts: { code: string; name: string }[]): string {
  const list = accounts.length
    ? `<ul class="doors">${accounts.map((a) => `<li><b><a href="/plan/${esc(a.code)}">${esc(a.name)}</a></b> <span class="who">a paper account linked to your email</span></li>`).join("")}</ul>`
    : "";
  const who = gate.on && gate.identity ? `<p class="who">Signed in as ${esc(gate.identity.email)}${gate.tutor ? " (the tutor)" : ""} · <a href="${SIGN_OUT}">sign out</a></p>` : `<p class="who">The door is off on this deployment: the code is the key, as on every student page.</p>`;
  return shell("The planner", `<h1>The planner</h1><p class="lede">The planner is the tutor's workbook. It takes tonight's companies, ranks them by the course's tests (never by what went up), sizes the top ones for a paper account, shows each one's stop (where the rule says sell) and costs — in dollars, and in euro at a rate you type — and can raise the tickets through the judge, which refuses exactly as a student's page would. Pick an account to start.</p>${who}${list}
  <form class="inputs" method="get" onsubmit="event.preventDefault();var c=this.c.value.trim().toUpperCase();if(c)location.href='/plan/'+encodeURIComponent(c)" style="grid-template-columns:1fr auto;align-items:end">
    <div><label for="c">Plan for a paper account by its code</label><input id="c" name="c" placeholder="K7PM-4R2X" autocapitalize="characters" autocomplete="off" spellcheck="false"></div>
    <div><button type="submit" style="font:inherit;padding:.45rem .9rem;border-radius:4px;border:1.5px solid var(--entry);background:var(--entry);color:#fff;cursor:pointer">Open</button></div>
  </form>`);
}

function planPage(l: Loaded, p: Plan, gate: Door, flash: Flash | null, outcomes: RowOutcome[]): string {
  const s = l.student;
  const a = p.account;
  const picked = new Map(p.rows.map((r) => [r.symbol, r]));
  const outcomeOf = new Map(outcomes.map((o) => [o.symbol, o]));
  const who = gate.on && gate.identity ? `Signed in as ${esc(gate.identity.email)}${gate.tutor ? " (the tutor)" : ""} · <a href="${SIGN_OUT}">sign out</a>` : "The door is off on this deployment: the code is the key.";
  const eligible = l.candidates.filter((c) => c.eligible);
  const rest = l.candidates.filter((c) => !c.eligible);
  const eur = p.inputs.eurUsd;

  const outcomeHtmlOf = (c: Candidate) => {
    const o = outcomeOf.get(c.symbol);
    if (!o) return "";
    return o.out.status === 201
      ? `<p class="accepted">Ticket accepted: open ${o.units} × ${esc(o.symbol)} at ${money(o.out.body.fill_price as number)} on the ${esc(String(o.out.body.fill_date))} close, stop ${money(o.out.body.stop_level as number)} — on <a href="/tickets/${esc(s.code)}">the account's page</a>.</p>`
      : `<p class="refused">${o.out.body.error === "Not raised." ? "Not raised:" : "The ticket was not accepted:"}</p><ul class="refused">${(o.out.reasons ?? []).map((x: Reason) => `<li>${esc(x.message)}</li>`).join("")}</ul>`;
  };

  const scores = (c: Candidate) => esc(c.defensive || c.enterprising ? `${c.defensive ? `${c.defensive.passes}/${c.defensive.applicable}` : "—"} · ${c.enterprising ? `${c.enterprising.passes}/${c.enterprising.applicable}` : "—"}` : "—");

  const candidateRow = (c: Candidate) => {
    const r = picked.get(c.symbol);
    const on = !!r;
    const outcomeHtml = outcomeHtmlOf(c);
    const problems = r?.problems ?? [];
    const unitsValue = r ? (r.unitsText ?? (r.typedUnits === null ? "" : String(r.typedUnits))) : "";
    return `<tr class="${on ? "on" : ""}" role="row">
      <td role="cell" data-label="Pick"><input type="checkbox" name="pick_${esc(c.symbol)}" ${on ? "checked" : ""} aria-label="include ${esc(c.symbol)}"></td>
      <td role="cell" class="n" data-label="Rank">${c.rank ?? ""}</td>
      <th scope="row" role="rowheader"><a href="/prices/${esc(c.symbol)}">${esc(c.symbol)}</a><span class="nm">${esc(c.name ?? "")}</span></th>
      <td role="cell" data-label="Band"><span class="band ${c.band ?? ""}">${esc(c.band === "gate" ? "GATE" : c.band === "near" ? "near" : c.band === "long" ? "long" : "no books")}</span></td>
      <td role="cell" class="n hide" data-label="Graham" title="Graham tests passed: defensive of 7 · enterprising of 6">${scores(c)}</td>
      <td role="cell" class="n hide" data-label="Forecast">${c.forecast === null ? "—" : `${c.forecast > 0 ? "+" : ""}${c.forecast.toFixed(1)}`}</td>
      <td role="cell" class="n" data-label="Price moves a year">${c.instrument_risk === null ? "—" : `${c.instrument_risk.toFixed(1)}%`}</td>
      <td role="cell" class="n hide" data-label="Long since">${esc(c.state_since ?? "—")}</td>
      <td role="cell" class="n" data-label="Close $">${c.close.toFixed(2)}</td>
      <td role="cell" class="n" data-label="Rule's size">${r ? r.ruleUnits : ""}</td>
      <td role="cell" class="n" data-label="Units"><input class="units${r?.unitsText ? " bad" : ""}" name="units_${esc(c.symbol)}" value="${esc(unitsValue)}" placeholder="${r ? String(r.units) : "rule's"}" inputmode="numeric" aria-label="units of ${esc(c.symbol)} (blank: the rule's size, fitted)"></td>
      <td role="cell" class="n" data-label="Exposure">${r ? money(r.exposure) : ""}</td>
      <td role="cell" class="n" data-label="Adds to the account's risk">${r ? `${r.achievedRiskPct.toFixed(1)}%` : ""}</td>
      <td role="cell" class="n" data-label="Stop $">${r ? `${money(r.stopLevel)}<br><span class="why">gap ${money(r.stopGap)}<br>${money(r.stopDistance)} to the stop</span>` : ""}</td>
      <td role="cell" class="n hide" data-label="Cost to open">${r ? `${money(r.costs.open)}<br><span class="why">trip ${r.costs.roundTripPct === null ? "—" : `${r.costs.roundTripPct.toFixed(2)}%`}</span>` : ""}</td>
      <td role="cell" class="n" data-label="In euro">${r && r.eur ? `${euro(r.eur.value)}<br><span class="why">stop ${euro(r.eur.stopLevel)}<br>${euro(r.eur.stopDistance)} to the stop<br>trip ${euro(r.eur.roundTrip)}</span>` : r ? `<span class="why">—</span>` : ""}</td>
    </tr>
    ${on ? `<tr class="journal-row" role="row"><td role="cell" colspan="2"></td><td role="cell" colspan="14"><p class="facts">${esc(r!.facts)}</p><textarea class="thesis" name="thesis_${esc(c.symbol)}" aria-label="thesis for ${esc(c.symbol)}" maxlength="${JOURNAL_MAX}" placeholder="Thesis: why this name, what would prove you wrong, why this size — at least ${JOURNAL_MIN} characters; the facts above are the planner's, the decision is yours">${esc(r!.thesis)}</textarea>${problems.map((x) => `<p class="problem">${esc(x)}</p>`).join("")}${outcomeHtml}</td></tr>` : outcomeHtml ? `<tr><td colspan="2"></td><td colspan="14">${outcomeHtml}</td></tr>` : ""}`;
  };

  const restRow = (c: Candidate) => `<tr class="off">
      <td></td><td></td>
      <th scope="row"><a href="/prices/${esc(c.symbol)}">${esc(c.symbol)}</a><span class="nm">${esc(c.name ?? "")}</span></th>
      <td><span class="tag ${esc(c.state)}">${c.state === "long" ? "LONG" : c.state === "flat" ? "FLAT" : "WARMING UP"}</span></td>
      <td class="n hide">${scores(c)}</td>
      <td class="n hide">${c.forecast === null ? "—" : `${c.forecast > 0 ? "+" : ""}${c.forecast.toFixed(1)}`}</td>
      <td class="n">${c.instrument_risk === null ? "—" : `${c.instrument_risk.toFixed(1)}%`}</td>
      <td class="n hide">${esc(c.state_since ?? "—")}</td>
      <td class="n">${c.close.toFixed(2)}</td>
      <td colspan="7" class="why">${esc(c.why ?? "")}${outcomeHtmlOf(c)}</td>
    </tr>`;

  const t = p.totals;
  const totals = `<div class="totals">
      <span><b>${p.rows.length}</b> name${p.rows.length === 1 ? "" : "s"} picked · room for ${t.roomFor} (${a.instruments} instrument${a.instruments === 1 ? "" : "s"}, ${t.openCount} open)</span>
      <span><b>${money(t.exposure)}</b> exposure · ${t.weightPct.toFixed(0)}% of ${money(a.value)}</span>
      <span class="${t.overBudget ? "over" : ""}"><b>${t.riskWithOpen.toFixed(1)}%</b> risk a year with the open positions (plan ${t.riskPct.toFixed(1)}% + open ${a.riskUsedPct.toFixed(1)}%) · target ${SIZING.riskTargetPct}%</span>
      <span><b>${money(t.costOpen)}</b> to open (course model) · cash after ${money(t.cashAfter)}</span>
      ${t.eur ? `<span><b>${euro(t.eur.exposure)}</b> at ${p.inputs.eurUsd} USD/EUR · ${euro(t.eur.costOpen)} commission + conversion to open · ${euro(t.eur.roundTrip)} round trips (spread once) · ${euro(t.eur.stopDistance)} to the stops, before costs</span>` : ""}
    </div>`;

  return shell(`The planner — ${s.name}`, `
  <h1>The planner <span class="sym">· ${esc(s.name)}</span></h1>
  <p class="lede">This is the plan for one paper account: tonight's companies, ranked by the tests, with the top ones sized and stopped for it. Tick, untick or change any row, then save, or raise the tickets. The order: the ones on the watchlist first (Graham's checklist passed and the trend rule LONG), then the near misses (one test short), then the rest the rule says LONG on. Within each group: more of Graham's seven defensive tests passed, then more of his six enterprising tests, then a stronger trend (the forecast, capped at ±20), then a calmer price (the instrument risk — how much it moves in a year). Never by what went up. The top ones are ticked and sized for this account at ${SIZING.riskTargetPct}% ÷ N risk a year (N is how many companies the account runs at once) on its value tonight — the figures the ticket judge reads — with the stop (where the rule says sell) and the costs. ${l.asOf ? `As of the ${esc(l.asOf)} close.` : "No signals computed yet."} Change anything; the judge (the rules, read against the account before a ticket is accepted) still refuses what breaks them.</p>
  <p class="who">${who} · <a href="/tickets/${esc(s.code)}">the account's page</a> · <a href="/plan/${esc(s.code)}/plan.csv">download the plan as CSV</a> · <a href="/api/plan/${esc(s.code)}">JSON</a>${l.saved ? " · <em>a saved plan is shown</em>" : l.savedUnreadable ? " · <em>the saved plan could not be read just now — tonight's top names are shown</em>" : " · <em>tonight's top names (nothing saved yet)</em>"}</p>
  ${flash ? `<div class="flash ${flash.kind}">${esc(flash.text)}</div>` : ""}
  <form method="post" action="/plan/${esc(s.code)}">
    <div class="inputs">
      <div><label>The account tonight</label><div class="fact">${money(a.value)} · ${money(a.cash)} cash</div><small>${t.openCount} open, ${a.riskUsedPct.toFixed(1)}% risk used — the value the sizes are taken on, as the ticket judge takes them.</small></div>
      <div><label>Instruments, N</label><div class="fact">${a.instruments} · ${fmtPct(p.targetPct)}% each</div><small>Set by <code>npm run enrol</code>; each position is sized at ${SIZING.riskTargetPct}% ÷ N.</small></div>
      <div><label for="eurusd">US dollars per euro</label><input id="eurusd" name="eurusd" value="${eur ?? ""}" inputmode="decimal" placeholder="from your broker's screen"><small>Typed, never fetched. Blank leaves the euro columns blank.</small></div>
      <div><label for="spread">Spread estimate (% of value)</label><input id="spread" name="spread" value="${p.inputs.spreadPct}" inputmode="decimal"><small>The toll of buying and selling at once: about 0.1% for a big company; a small company's can be ten times that.</small></div>
    </div>
    <div class="actions">
      <button type="submit" name="action" value="recompute" class="primary">Recompute</button>
      <button type="submit" name="action" value="repopulate">Repopulate</button>
      <button type="submit" name="action" value="save">Save plan</button>
      <button type="submit" name="action" value="raise" class="raise" onclick="return confirm('Raise one opening ticket per ticked row, through the ticket judge? The facts and your thesis are the journal entry — the ticket.')">Raise the tickets</button>
      <span class="note"><em>Recompute</em> keeps your ticks and redoes the arithmetic · <em>Repopulate</em> picks the top names again from tonight's rows · <em>Save</em> keeps the picks as you typed them (a blank units cell stays the rule's, re-sized each night) · <em>Raise</em> writes each ticked row through the ticket judge, which refuses exactly as the account's page would.</span>
    </div>
    ${totals}
    ${p.notes.length ? `<ul class="note">${p.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
    <h2>Eligible tonight — ${eligible.length} name${eligible.length === 1 ? "" : "s"}, by the tests</h2>
    <div class="wrap"><table class="plan" role="table" aria-label="Eligible tonight">
      <thead role="rowgroup"><tr role="row"><th role="columnheader">Pick</th><th role="columnheader" class="n">#</th><th role="columnheader">Instrument</th><th role="columnheader">Band</th><th role="columnheader" class="n hide" title="Graham tests passed: defensive of 7 · enterprising of 6">Graham</th><th role="columnheader" class="n hide">Forecast</th><th role="columnheader" class="n" title="Annualised volatility">Risk</th><th role="columnheader" class="n hide">Long since</th><th role="columnheader" class="n">Close $</th><th role="columnheader" class="n" title="The Starter System's size at the target, on the value tonight less the costs of the rows above">Rule</th><th role="columnheader" class="n" title="Blank: the rule's size, fitted to the cash left">Units</th><th role="columnheader" class="n">Exposure</th><th role="columnheader" class="n" title="weight × instrument risk">Risk/yr</th><th role="columnheader" class="n" title="The course's stop: read on the close, acted on the next day by a ticket — not a resting stop-loss order at a broker">Stop $<span class="sub">not a broker order</span></th><th role="columnheader" class="n hide">Cost to open</th><th role="columnheader" class="n">In euro</th></tr></thead>
      <tbody role="rowgroup">${eligible.length ? eligible.map(candidateRow).join("") : `<tr role="row"><td role="cell" colspan="16" class="why">Nothing is eligible tonight: no name is long on the rule without a reason the ticket would refuse. The rule's answer is cash — and a journal line that says "waiting".</td></tr>`}</tbody>
    </table></div>
    <details><summary>Not eligible tonight — ${rest.length} name${rest.length === 1 ? "" : "s"}, with the reason the ticket would give</summary>
    <div class="wrap"><table>
      <thead><tr><th></th><th></th><th>Instrument</th><th>Rule</th><th class="n hide">Graham</th><th class="n hide">Forecast</th><th class="n">Risk</th><th class="n hide">Since</th><th class="n">Close $</th><th colspan="7">Why not</th></tr></thead>
      <tbody>${rest.map(restRow).join("")}</tbody>
    </table></div></details>
  </form>
  <div class="rule"><b>The arithmetic, in full</b> — the same constants the ticket judge and the nightly stop tracker use, on the judge's facts. Target exposure = the account's value tonight (less the opening costs of the rows above) × (${SIZING.riskTargetPct}% ÷ N) ÷ instrument risk, capped at the value (no leverage) · units = the whole shares that fit (fewer allowed, never more), then fitted to the ledger cash left in rank order · stop gap = ½ × instrument risk × entry, fixed at entry · stop = the highest close since entry − gap, read on the close and acted on the next day by a ticket — <strong>not a resting stop-loss order at a broker</strong> (the costs-and-tax walkthrough says why: gaps and intraday noise) · a trade costs $${SIZING.costPerTrade} + ${SIZING.fxPct}% in the course's model; the euro lines are ${esc(BROKER.name)}: €${BROKER.usShare.toFixed(2)} an order, ${BROKER.fxPct}% conversion each way, the spread as typed, and ${esc(p.connectivity.note)} The rule: ${esc(SIGNAL_RULE.fastSpan + "/" + SIGNAL_RULE.slowSpan)}-day EWMAC, long-only; a name warms up for ${SIGNAL_RULE.minMatureDays} closes.</div>
  <p class="note">The journal entry is the ticket: the planner writes the facts (the rule, the screens, the size, the stop) and you write the thesis — at least ${JOURNAL_MIN} characters; a row with none is not raised. What would prove you wrong is not on any sheet.</p>`);
}
