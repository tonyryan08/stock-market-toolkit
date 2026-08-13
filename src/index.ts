/**
 * Intro to the Stock Market — course toolkit
 * Week 1: one page, one API route. That's the point.
 *
 * Deliberately a raw Worker (no router, no dependencies).
 * Hono arrives in week 2; D1 and the nightly cron in week 3.
 */

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/hello") {
      return Response.json({
        message: "Hello from the Intro to the Stock Market toolkit.",
        week: 1,
        of: 12,
        philosophy: "We grade decisions, not outcomes.",
        served_at: new Date().toISOString(),
      });
    }

    if (pathname === "/") {
      return new Response(LANDING_PAGE, {
        headers: { "content-type": "text/html;charset=UTF-8" },
      });
    }

    return Response.json(
      { error: "Not found", hint: "Try / or /api/hello" },
      { status: 404 },
    );
  },
} satisfies ExportedHandler;

const LANDING_PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intro to the Stock Market — a community course</title>
<meta name="description" content="A community-school course in good financial decision-making. Paper portfolios only. Education, not advice.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text:wght@400;700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --paper: #EEF2E9;      /* pale ledger green */
    --ink: #182620;        /* ledger ink */
    --rule: #B7C6D4;       /* ruling-line blue */
    --entry: #3E6B54;      /* bookkeeper's green */
    --stamp: #B4382E;      /* auditor's red */
    --faint: #6B7A72;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--paper);
    color: var(--ink);
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    line-height: 1.55;
    padding: 2.5rem 1.25rem 4rem;
  }
  main { max-width: 42rem; margin: 0 auto; }
  .eyebrow {
    font-family: "IBM Plex Mono", monospace;
    font-size: .75rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--faint);
  }
  h1 {
    font-family: "Libre Caslon Text", serif;
    font-weight: 700;
    font-size: clamp(2rem, 6vw, 3.1rem);
    line-height: 1.08;
    margin: .5rem 0 1rem;
  }
  .strapline {
    font-family: "Libre Caslon Text", serif;
    font-size: 1.2rem;
    font-style: italic;
    color: var(--entry);
    margin-bottom: 2rem;
  }
  .promises { border-top: 2px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 1rem 0; margin-bottom: 2.5rem; }
  .promises p { font-size: .95rem; padding: .2rem 0; }
  .promises strong { font-weight: 600; }

  .ledger h2 {
    font-family: "IBM Plex Mono", monospace;
    font-size: .8rem;
    letter-spacing: .12em;
    text-transform: uppercase;
    color: var(--faint);
    margin-bottom: .75rem;
  }
  .phase { margin-bottom: 1.5rem; }
  .phase-name {
    font-family: "IBM Plex Mono", monospace;
    font-size: .72rem;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--entry);
    padding-bottom: .3rem;
  }
  .row {
    display: grid;
    grid-template-columns: 3.2rem 1fr;
    gap: .75rem;
    padding: .55rem 0;
    border-bottom: 1px solid var(--rule);   /* the ruling lines ARE the ledger */
    position: relative;
  }
  .wk { font-family: "IBM Plex Mono", monospace; font-size: .85rem; color: var(--faint); padding-top: .1rem; }
  .row .lesson { font-weight: 600; font-size: .95rem; }
  .row .feature { font-size: .85rem; color: var(--faint); }
  .row.pending { opacity: .62; }
  .row.shipped .wk, .row.shipped .lesson { color: var(--ink); }
  .stamp {
    position: absolute;
    right: 0; top: .45rem;
    font-family: "IBM Plex Mono", monospace;
    font-size: .68rem;
    font-weight: 500;
    letter-spacing: .14em;
    color: var(--stamp);
    border: 1.5px solid var(--stamp);
    border-radius: 3px;
    padding: .15rem .45rem;
    transform: rotate(-4deg);
    background: transparent;
  }
  .try {
    margin-top: 2.5rem;
    border: 1px solid var(--rule);
    border-radius: 6px;
    padding: 1rem 1.1rem;
    font-size: .9rem;
    background: rgba(255,255,255,.45);
  }
  .try code { font-family: "IBM Plex Mono", monospace; font-size: .85rem; color: var(--entry); }
  .try a { color: var(--entry); }
  footer {
    margin-top: 3rem;
    padding-top: 1rem;
    border-top: 2px solid var(--ink);
    font-size: .8rem;
    color: var(--faint);
  }
  footer .notice { color: var(--stamp); font-weight: 600; }
  a:focus-visible { outline: 2px solid var(--entry); outline-offset: 2px; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">A community-school course &middot; built in the open</p>
  <h1>Intro to the Stock&nbsp;Market</h1>
  <p class="strapline">We grade decisions, not outcomes.</p>

  <div class="promises">
    <p><strong>Paper portfolios only.</strong> Nobody risks a cent in this room.</p>
    <p><strong>No tips, ever.</strong> You leave with a process, not a portfolio.</p>
    <p><strong>Everything is open.</strong> Every tool we use is built in public, one week at a time.</p>
  </div>

  <section class="ledger" aria-label="The twelve-week ledger">
    <h2>The twelve-week ledger</h2>

    <div class="phase">
      <p class="phase-name">Phase 1 &middot; Foundations</p>
      <div class="row shipped">
        <span class="wk">Wk 1</span>
        <span><span class="lesson">What is a market?</span><br><span class="feature">This page, and one API route</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 2</span>
        <span><span class="lesson">Where prices come from</span><br><span class="feature">Live quote lookup</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 3</span>
        <span><span class="lesson">The nightly close</span><br><span class="feature">Price history, refreshed every night</span></span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 2 &middot; Value, the Graham way</p>
      <div class="row pending">
        <span class="wk">Wk 4</span>
        <span><span class="lesson">What is a company worth?</span><br><span class="feature">Company fundamentals &amp; ratios</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 5</span>
        <span><span class="lesson">The Graham checklist</span><br><span class="feature">The value screener</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 6</span>
        <span><span class="lesson">Numbers into narrative</span><br><span class="feature">&ldquo;Explain this stock&rdquo;</span></span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 3 &middot; Rules, the Carver way</p>
      <div class="row pending">
        <span class="wk">Wk 7</span>
        <span><span class="lesson">Why systems beat gut feel</span><br><span class="feature">Trend signals &amp; instrument risk</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 8</span>
        <span><span class="lesson">How much to bet</span><br><span class="feature">Position sizing &amp; paper trade tickets</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 9</span>
        <span><span class="lesson">Your paper portfolio</span><br><span class="feature">Portfolios &amp; the risk report</span></span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 4 &middot; The takeaway</p>
      <div class="row pending">
        <span class="wk">Wk 10</span>
        <span><span class="lesson">Ask the tutor</span><br><span class="feature">A tutor that cites the course notes</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 11</span>
        <span><span class="lesson">The real world: costs &amp; tax</span><br><span class="feature">&ldquo;Explain my portfolio&rdquo;</span></span>
      </div>
      <div class="row pending">
        <span class="wk">Wk 12</span>
        <span><span class="lesson">Demo day</span><br><span class="feature">Student logins &amp; the takeaway kit</span></span>
      </div>
    </div>
  </section>

  <div class="try">
    The whole toolkit today is this page and one API route: <code><a href="/api/hello">GET /api/hello</a></code>.
    A new capability lands every week &mdash; same as the course.
  </div>

  <footer>
    <p class="notice">Education, not advice. Nothing here is a recommendation to buy or sell anything.</p>
    <p>&copy; 2026 Tony Ryan &middot; Source code: GitHub link to follow once the repo is public</p>
  </footer>
</main>
</body>
</html>`;
