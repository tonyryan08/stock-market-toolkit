/**
 * Week 12 (decision 23): the student's door, and the kit's.
 *
 *   GET /me       — the signed-in student's own page, found by the email Access
 *                   handed over: a redirect to /tickets/<code>. With Access off
 *                   it says so and points at the code scheme; with nobody linked
 *                   to the email it says what the tutor does about it.
 *   GET /api/me   — the same as JSON (what the page's own scripts could ask;
 *                   no email of anyone else's is ever in it).
 *   GET /kit      — the takeaway kit, assembled: every kit document with what it
 *                   is for and a link to its page in the open repository.
 */
import { Hono } from "hono";
import { PAGE_CSS, FONTS_HTML, SHARED_CSS, esc, nav } from "./page";
import { doorOf, accountsFor, type Door } from "./lib/access";
import { CODE } from "./lib/tickets";

type Env = { DB: D1Database; TUTOR_EMAILS?: string };

export const me = new Hono<{ Bindings: Env }>();

const NOTE = "Education, not advice. Nothing on this site is a recommendation to buy or sell anything.";
const REPO = "https://github.com/tonyryan08/stock-market-toolkit/blob/main/";

/** The kit, in the order a student meets it. Paths are the repository's; the README's kit section lists the same. */
export const KIT: { file: string; title: string; week: string; what: string }[] = [
  { file: "kit/student-quickstart.md", title: "Student quickstart", week: "week 1, kept current", what: "What you need, how the site grows week by week, how to sign in and find your page, and why the code is public." },
  { file: "kit/decision-journal.md", title: "The decision journal", week: "week 1", what: "The template every ticket's journal entry follows: the trigger, the thesis, what would prove you wrong, the size and why, when you will judge it." },
  { file: "kit/starter-system-rules-card.md", title: "The Starter System — the rules card", week: "weeks 7–9", what: "The seven rules the toolkit enforces, one page: the opening rule, the risk target, sizing, the stop, costs, the Monday routine, what the ticket refuses." },
  { file: "kit/reading-list.md", title: "The reading list", week: "week 1, grown since", what: "Graham, Carver, Peacock and the rest — what each is for and which chapters the course leans on." },
  { file: "kit/costs-and-tax-walkthrough.md", title: "Costs and tax — the walkthrough", week: "week 11", what: "A broker's mechanics and the Irish costs and tax on a paper trade, every figure dated, the Bill marked as a Bill." },
  { file: "kit/scam-spotting-notes.md", title: "Scam-spotting notes", week: "weeks 6 and 11", what: "Stories versus numbers, and the platform itself: the register, the number, the fee page, the exit — the red flags one breath each." },
  { file: "kit/demo-day.md", title: "Demo day — the rubric and the retrospective", week: "week 12", what: "How one decision is presented and judged on process alone, and the questions the course asks of itself at the end." },
];

function shell(title: string, eyebrow: string, body: string, active = "/me"): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="referrer" content="same-origin">${FONTS_HTML}<style>${PAGE_CSS}${SHARED_CSS}
  .doors { list-style: none; padding: 0; margin: 1.2rem 0; }
  .doors li { padding: .7rem 0; border-top: 1px solid var(--rule); }
  .doors li:last-child { border-bottom: 1px solid var(--rule); }
  .doors b { display: block; font-size: 1.05rem; }
  .doors i { color: var(--faint); font-style: normal; font-size: .85rem; }
  .doors p { margin: .25rem 0 0; }
  .who { font-size: .9rem; color: var(--faint); }
  form.code { display:flex; gap:.6rem; flex-wrap:wrap; align-items:flex-end; margin:1rem 0 1.4rem; }
  form.code label { display:flex; flex-direction:column; gap:.25rem; font-size:.85rem; color:var(--faint); }
  form.code input { font: inherit; font-family:"IBM Plex Mono",monospace; letter-spacing:.08em; text-transform:uppercase; padding:.45rem .6rem; border:1.5px solid var(--rule); border-radius:4px; width:11rem; }
  form.code button { font: inherit; font-weight:600; padding:.5rem .9rem; border:1.5px solid var(--entry); border-radius:4px; background:var(--entry); color:#fff; cursor:pointer; }
</style></head>
<body><main>${nav(active)}<p class="eyebrow">${esc(eyebrow)}</p>${body}<footer><p class="notice">${NOTE}</p></footer></main></body></html>`;
}

/** The landing's "New this week" sentence about the door, in both states (v1.0.0 review S1): the off state is a real
 *  deployment state — the hours between the deploy and the switch, or a policy taken down on the night. */
export function doorSentence(gate: Door): string {
  return gate.on
    ? `You signed in with a code sent to your email. <a href="/me">Your page</a> opens for you and the tutor, and for nobody else.`
    : `On this copy of the site the sign-in is <strong>off</strong>, so <a href="/me">your page</a> is found by your code, not your email. Share a screenshot of it, not the link.`;
}

/** Cloudflare serves this path on every Access-protected host: it ends the session and shows the login page again (review N4). */
export const SIGN_OUT = "/cdn-cgi/access/logout";

/** The one line the landing page shows about the door — empty when Access is off (nothing to say). */
export function whoLine(gate: Door, accounts: { code: string; name: string }[]): string {
  if (!gate.on) return "";
  if (!gate.identity) return `<p class="who">Signed in through Cloudflare Access, but with no email on the identity — ask the tutor.</p>`;
  const who = esc(gate.identity.email) + (gate.tutor ? " (the tutor)" : "");
  // v1.1 (decision 24 d): the planner is the tutor's; the link shows for the tutor only
  const out = `${gate.tutor ? ` &middot; <a href="/plan">the planner</a>` : ""} &middot; <a href="${SIGN_OUT}">sign out</a></p>`;
  if (accounts.length === 1) return `<p class="who">Signed in as ${who} &middot; <a href="/tickets/${esc(accounts[0].code)}">your page</a> &middot; <a href="/kit">the kit</a>${out}`;
  if (accounts.length > 1) return `<p class="who">Signed in as ${who} &middot; <a href="/me">your pages (${accounts.length})</a> &middot; <a href="/kit">the kit</a>${out}`;
  return `<p class="who">Signed in as ${who}${gate.tutor ? ` &middot; the enrolment list is <code>npm run enrol -- --list</code>` : " &middot; no account is linked to this email yet — the tutor links it"} &middot; <a href="/kit">the kit</a>${out}`;
}

/** The box for a code (v1.2.0, the reader review): a GET form back to /me, which redirects to the page. No script. */
function codeBox(typed: string, wrong: boolean): string {
  return `<form class="code" method="get" action="/me"><label for="code">Your code — eight characters, from the tutor<input id="code" name="code" value="${esc(typed)}" placeholder="K7PM-4R2X" autocomplete="off" required></label><button type="submit">Open my page</button></form>${wrong ? `<p class="empty">That doesn't look like a student code — eight characters like K7PM-4R2X.</p>` : ""}`;
}

me.get("/me", async (c) => {
  const gate = await doorOf(c);
  // A code typed into the box (v1.2.0): the shape checked here, the page itself answers whether the account exists.
  const typed = (c.req.query("code") ?? "").trim().toUpperCase();
  if (typed && CODE.test(typed)) return c.redirect(`/tickets/${typed}`, 302);
  const wrong = typed.length > 0;
  if (!gate.on) {
    return c.html(shell("Your page", "Your page", `<h1>Your page</h1><p class="lede">Your page is your paper account: tonight's report, the stop line (the price at which the rules say sell), your tickets and your journal. Sign-in is switched off on this copy of the site, so it is found by your code, not your email. Type the code the tutor gave you.</p>${codeBox(typed, wrong)}`, "/me"), wrong ? 400 : 200, { "cache-control": "no-store" });
  }
  if (!gate.identity) return c.html(shell("Your page", "Your page", `<h1>Your page</h1><p class="empty">The door let this request through without an email, so there is no account to find. Sign in with the email the tutor enrolled you with.</p>`, "/me"), 403, { "cache-control": "no-store" });
  const accounts = await accountsFor(c.env.DB, gate.identity.email);
  if (accounts.length === 1) return c.redirect(`/tickets/${accounts[0].code}`, 302);
  if (accounts.length > 1) {
    const list = accounts.map((a) => `<li><b><a href="/tickets/${esc(a.code)}">${esc(a.name)}</a></b><i>a paper account linked to ${esc(gate.identity!.email)}</i></li>`).join("");
    return c.html(shell("Your pages", "Your pages", `<h1>Your pages</h1><p class="lede">${accounts.length} paper accounts (pretend dollars, real prices, a real record) are linked to ${esc(gate.identity.email)}${gate.tutor ? " — the tutor's test accounts" : ""}. Pick one to open it.</p><ul class="doors">${list}</ul>`, "/me"), 200, { "cache-control": "no-store" });
  }
  const tutor = gate.tutor
    ? `<p class="empty">You are signed in as the tutor (${esc(gate.identity.email)}). No paper account is linked to that email; every student's page opens for you by its code — type one here, or <code>npm run enrol -- --list</code> lists them.</p>${codeBox(typed, wrong)}`
    : `<p class="empty">You are signed in as ${esc(gate.identity.email)}, and no paper account is linked to that email yet. Ask the tutor to link it; then this page opens your account.</p>`;
  return c.html(shell("Your page", "Your page", `<h1>Your page</h1>${tutor}`, "/me"), 404, { "cache-control": "no-store" });
});

me.get("/api/me", async (c) => {
  const gate = await doorOf(c);
  const accounts = gate.on && gate.identity ? await accountsFor(c.env.DB, gate.identity.email) : [];
  return c.json({ access: gate.on, email: gate.identity?.email ?? null, tutor: gate.tutor, accounts: accounts.map((a) => ({ code: a.code, name: a.name })), note: NOTE }, 200, { "cache-control": "no-store" });
});

me.get("/kit", async (c) => {
  const items = KIT.map((k) => `<li><b><a href="${REPO}${k.file}">${esc(k.title)}</a></b><i>${esc(k.week)} &middot; <code>${esc(k.file)}</code></i><p>${esc(k.what)}</p></li>`).join("");
  return c.html(shell("The takeaway kit", "The kit", `<h1>The takeaway kit</h1><p class="lede">The seven documents you take home from the course: the quickstart, the journal to write in, the rules on one page, the reading list, what a trade costs, how to spot a scam, and demo day's questions. Print the rules card and the journal; keep the links to the rest. Each opens on the course's public repository (GitHub).</p><ul class="doors">${items}</ul><p class="who">The site itself stays where it is for the class: your paper account, the signals, the watchlist, the tutor, the review, the costs worksheet.</p>`, "/kit"));
});
