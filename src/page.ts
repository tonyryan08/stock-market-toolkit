/**
 * The pages' shared skin — the palette, the type, the escape — lifted out of
 * index.ts in week 8 so the portfolio routes (src/portfolio.ts) can use it.
 */
export const PAGE_CSS = `
  :root { --paper:#EEF2E9; --ink:#182620; --rule:#B7C6D4; --entry:#3E6B54; --stamp:#B4382E; --faint:#6B7A72; }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--paper); color: var(--ink); font-family: "IBM Plex Sans", system-ui, sans-serif; line-height: 1.55; padding: 2.5rem 1.25rem 4rem; }
  main { max-width: 46rem; margin: 0 auto; position: relative; }
  .eyebrow { font-family:"IBM Plex Mono",monospace; font-size:.75rem; letter-spacing:.12em; text-transform:uppercase; color:var(--faint); }
  h1 { font-family:"Libre Caslon Text",serif; font-weight:700; font-size:clamp(1.6rem,5vw,2.4rem); line-height:1.1; margin:.4rem 0 .2rem; }
  a { color: var(--entry); }
  /* v1.2 (decision 25 b): a page's main actions as buttons, not a crumb line */
  .actions { display:flex; gap:.6rem; flex-wrap:wrap; align-items:center; margin:.4rem 0 1.2rem; }
  a.btn { display:inline-block; padding:.45rem .9rem; border:1.5px solid var(--entry); border-radius:4px; background:var(--entry); color:#fff; text-decoration:none; font-weight:600; font-size:.9rem; }
  a.btn.alt { background:transparent; color:var(--entry); }
  a.btn:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
  /* v1.2 (decision 25 b): the header on every page — the things to do, in readable type, where the eye lands */
  nav.top { display:flex; flex-wrap:wrap; gap:.25rem .9rem; align-items:baseline; padding:0 0 .7rem; margin:0 0 1.4rem; border-bottom:2px solid var(--ink); font-size:.9rem; }
  nav.top a { color:var(--entry); text-decoration:none; font-weight:600; padding:.15rem 0; border-bottom:2px solid transparent; }
  nav.top a:hover { border-bottom-color:var(--entry); }
  nav.top a[aria-current="page"] { color:var(--ink); border-bottom-color:var(--ink); }
  nav.top .home { font-family:"Libre Caslon Text",serif; font-weight:700; color:var(--ink); margin-right:.4rem; }
  @media (max-width: 600px) { nav.top { font-size:.9rem; gap:.2rem .8rem; } }
  footer { margin-top:2.5rem; padding-top:1rem; border-top:2px solid var(--ink); font-size:.8rem; color:var(--faint); }
  footer .notice { color:var(--stamp); font-weight:600; }
  a:focus-visible { outline:2px solid var(--entry); outline-offset:2px; }
`;
/**
 * The classes several pages share (week 10, OI-69 — they had been defined
 * page by page since week 7): the lede under a title, the state tags the
 * signals page and the student's page both print, a scrolling table wrapper
 * and the caption line. A page that needs a variant overrides after this.
 */
export const SHARED_CSS = `
  .lede { color:var(--faint); font-size:.95rem; margin:.3rem 0 1rem; } .lede + .lede { margin-top:-.4rem; }
  .tag { font-family:"IBM Plex Mono",monospace; font-size:.7rem; padding:.1rem .4rem; border-radius:3px; letter-spacing:.04em; white-space:nowrap; }
  .tag.long { background:#3E6B54; color:#fff; } .tag.flat { background:#E3E8E4; color:#3b4a42; } .tag.warming { background:#F1EBD6; color:#6b5d2a; }
  .wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
  .caption { font-size:.8rem; color:var(--faint); margin-top:.7rem; line-height:1.5; }
  .sym { color:var(--faint); font-size:.6em; }
  .gap { margin:1rem 0; }
  th.l { text-align:left; }
`;
export const FONTS_HTML = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">`;
export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");   // `"` too: esc is used inside attribute values (v0.10.0 review F10)

/** The header's links, in order — the things a visitor does (decision 25 b). The planner's link is added per request (below). */
export const NAV_LINKS: ReadonlyArray<readonly [string, string]> = [["/me", "Your page"], ["/watchlist", "Watchlist"], ["/signals", "Signals"], ["/tutor", "Ask the tutor"], ["/costs", "Costs &amp; tax"], ["/kit", "The kit"]];

/**
 * Where the planner's link goes in the header. A page template cannot know who is at the door, so `nav()` leaves this
 * comment and the app's HTML middleware (`plannerLink` in index.ts) replaces it — with the link when the planner is
 * open to the person (the tutor, or anyone when the door is off: `plannerCheck`'s own rule), with nothing otherwise.
 * A page that is never passed through the middleware keeps the bare comment, which carries no link (v1.2.0 review S1, S2).
 */
export const PLANNER_MARK = "<!--planner-->";
export const PLANNER_MARK_CURRENT = "<!--planner:current-->";
export const plannerLinkHtml = (current: boolean): string => `<a href="/plan"${current ? ' aria-current="page"' : ""}>Planner</a>`;

/**
 * The header on every page: Home, then the tools, then the planner's mark. `active` is the path to mark as the
 * current page ("/" for the landing; a path not in the header marks nothing).
 */
export function nav(active: string): string {
  const cur = (href: string) => (href === active || (href !== "/" && active.startsWith(href + "/")) ? ' aria-current="page"' : "");
  return `<nav class="top" aria-label="The course site"><a class="home" href="/"${cur("/")}>Intro to the Stock Market</a>${NAV_LINKS.map(([href, label]) => `<a href="${href}"${cur(href)}>${label}</a>`).join("")}${active === "/plan" || active.startsWith("/plan/") ? PLANNER_MARK_CURRENT : PLANNER_MARK}</nav>`;
}
