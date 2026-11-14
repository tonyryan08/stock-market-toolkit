/**
 * The course landing page.
 * Weeks 1–12: the "twelve-week ledger" — one row a week, stamped SHIPPED as each feature arrived.
 * v1.2 (decision 25 a): the front door — the things a visitor does, as cards at the top, in plain words; the three
 * promises; the company look-up; and the ledger below as "How it was built". The placeholders are filled per
 * request by index.ts: <!--nav--> the header (the planner's link is filled by the app's HTML middleware), <!--who--> the
 * signed-in line, <!--door--> the sentence about the door, <!--tutor--> the planner's card (the tutor; anyone when the
 * door is off). v1.2.0 review: the cards carry headings; a "start here" line; a six-line key to the course's words;
 * the ledger folded under one line, since it is the builder's log and not the course. fix1: the look-up box directly
 * under the cards, its four reference tools as buttons (the Graham screen, the cards, a company explained, the calculator).
 */

import { PAGE_CSS, FONTS_HTML } from "./page";

export const LANDING_PAGE = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Intro to the Stock Market — a community course</title>
<meta name="description" content="A community-school course in good financial decision-making. Paper portfolios only. Education, not advice.">
${FONTS_HTML}
<style>
${PAGE_CSS}
  main { max-width: 46rem; margin: 0 auto; }
  h1 { font-family: "Libre Caslon Text", serif; font-weight: 700; font-size: clamp(2rem, 6vw, 3.1rem); line-height: 1.08; margin: .5rem 0 .6rem; }
  .strapline { font-family: "Libre Caslon Text", serif; font-size: 1.2rem; font-style: italic; color: var(--entry); margin-bottom: .8rem; }
  .intro { font-size: 1.02rem; max-width: 40rem; margin-bottom: 1.6rem; }
  .who { font-size: .9rem; color: var(--faint); margin-bottom: 1.2rem; }
  .who a { color: var(--entry); }

  /* the cards: what you do here (decision 25 a) */
  .doors { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: .8rem; margin: 0 0 2rem; }
  .door { display: block; text-decoration: none; color: var(--ink); background: rgba(255,255,255,.6); border: 1px solid var(--rule); border-radius: 8px; padding: 1rem 1.1rem 1.05rem; transition: border-color .15s, background .15s; }
  .door:hover, .door:focus-visible { border-color: var(--entry); background: #fff; outline: none; }
  .door h2 { font-family: "Libre Caslon Text", serif; font-size: 1.25rem; font-weight: 700; color: var(--entry); margin: 0 0 .3rem; }
  .start { font-size: .98rem; margin: 0 0 1rem; padding: .7rem .9rem; border-left: 3px solid var(--entry); background: rgba(255,255,255,.5); }
  .key { margin: 0 0 2rem; padding: 0; list-style: none; border-top: 1px solid var(--rule); }
  .key li { padding: .45rem 0; border-bottom: 1px solid var(--rule); font-size: .95rem; }
  .key b { font-weight: 600; }
  .key-head { font-family: "Libre Caslon Text", serif; font-size: 1.3rem; margin: 0 0 .5rem; }
  .door span { display: block; font-size: .92rem; line-height: 1.45; }
  .door.first { border-color: var(--entry); border-width: 2px; }

  .promises { border-top: 2px solid var(--ink); border-bottom: 1px solid var(--rule); padding: 1rem 0; margin-bottom: 2rem; }
  .promises p { font-size: .98rem; padding: .2rem 0; }
  .promises strong { font-weight: 600; }

  .try { border: 1px solid var(--rule); border-radius: 8px; padding: 1rem 1.1rem; font-size: .95rem; background: rgba(255,255,255,.45); margin: 0 0 2rem; }
  .try h2 { font-family: "Libre Caslon Text", serif; font-size: 1.25rem; font-weight: 700; margin: 0 0 .3rem; }
  .try p { margin: 0 0 .4rem; }
  .shelf-head { margin-top: .9rem !important; font-weight: 600; }
  .try .actions { margin: .3rem 0 .6rem; }
  .try .fineprint:empty { display: none; }
  .try code { font-family: "IBM Plex Mono", monospace; font-size: .85rem; color: var(--entry); }
  .lookup { display: flex; gap: .5rem; margin: .8rem 0 .6rem; flex-wrap: wrap; }
  .lookup input[name="t"] { flex: 1; min-width: 8rem; font-family: "IBM Plex Mono", monospace; font-size: 1rem; padding: .5rem .6rem; border: 1px solid var(--rule); border-radius: 4px; background: #fff; color: var(--ink); text-transform: uppercase; }
  .lookup input:focus-visible { outline: 2px solid var(--entry); outline-offset: 1px; }
  .lookup button { font-family: "IBM Plex Sans", sans-serif; font-weight: 600; font-size: .95rem; padding: .5rem 1rem; border: 1.5px solid var(--entry); border-radius: 4px; background: var(--entry); color: var(--paper); cursor: pointer; }
  .lookup button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
  .fineprint { font-size: .85rem; color: var(--faint); }

  /* the ledger of the build, below the tools */
  .ledger summary { font-family: "Libre Caslon Text", serif; font-size: 1.3rem; cursor: pointer; margin-bottom: .2rem; }
  .ledger summary small { font-family: "IBM Plex Sans", sans-serif; font-size: .85rem; color: var(--faint); margin-left: .5rem; }
  .ledger .lede { color: var(--faint); font-size: .92rem; margin: .6rem 0 1rem; }
  .phase { margin-bottom: 1.5rem; }
  .phase-name { font-family: "IBM Plex Mono", monospace; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--entry); padding-bottom: .3rem; }
  .row { display: grid; grid-template-columns: 3.2rem 1fr; gap: .75rem; padding: .55rem 0; border-bottom: 1px solid var(--rule); position: relative; }
  .wk { font-family: "IBM Plex Mono", monospace; font-size: .85rem; color: var(--faint); padding-top: .1rem; }
  .row .lesson { font-weight: 600; font-size: .95rem; padding-right: 5.2rem; }   /* room for the stamp, so a long title wraps under it */
  .row .feature { font-size: .85rem; color: var(--faint); }
  .row .feature a { color: var(--entry); }
  .stamp { position: absolute; right: 0; top: .45rem; font-family: "IBM Plex Mono", monospace; font-size: .68rem; font-weight: 500; letter-spacing: .14em; color: var(--stamp); border: 1.5px solid var(--stamp); border-radius: 3px; padding: .15rem .45rem; transform: rotate(-4deg); }

  footer { margin-top: 3rem; padding-top: 1rem; border-top: 2px solid var(--ink); font-size: .8rem; color: var(--faint); }
  footer .notice { color: var(--stamp); font-weight: 600; }
  footer a { color: var(--entry); }
</style>
</head>
<body>
<main>
<!--nav-->
  <p class="eyebrow">A community-school course &middot; built in the open</p>
  <h1>Intro to the Stock&nbsp;Market</h1>
  <p class="strapline">We grade decisions, not outcomes.</p>
  <p class="intro">Twelve evenings for people who have never bought a share. You get a paper account — pretend dollars (the companies are American), real prices, a real record — and a set of rules that says when to buy, how much, and when to sell. The course teaches the rules, the arithmetic and the habits; it never tells you what to buy, and you are marked on how you decided, never on whether the price went your way. The twelve evenings have run; the site stays open for the class.</p>
<!--who-->
  <p class="start"><strong>New here?</strong> Open <a href="/me">Your page</a> first — it is your paper account, found by the email you signed in with (or by the code the tutor gave you). Then <a href="/watchlist">the watchlist</a>, the page everyone liked. Stuck on a word? <a href="/tutor">Ask the tutor</a>, or read the key below the cards.</p>

  <nav class="doors" aria-label="What you do here">
    <a class="door first" href="/me"><h2>Your page</h2><span>Your paper account: tonight's report, the stop line (the price at which the rules say sell), your tickets (the form that buys or sells on paper) and your journal.</span></a>
    <a class="door" href="/watchlist"><h2>The watchlist</h2><span>The few companies that pass Benjamin Graham's checklist (a sound business at a fair price) <em>and</em> whose price trend is up. Usually none — and that is the lesson.</span></a>
    <a class="door" href="/signals"><h2>The signals</h2><span>What the trend rule says tonight for every company the course follows: LONG (the rule would be in the share) or FLAT (it would be out), and how strong the trend is.</span></a>
    <a class="door" href="/tutor"><h2>Ask the tutor</h2><span>A tutor that has read the course notes and nothing else. It shows its sources and never gives a tip (a "buy this").</span></a>
    <a class="door" href="/costs"><h2>What a trade really costs</h2><span>Price a trade in euro on a real broker's published charges (a broker is the firm that holds your account and places your orders), and see the same gain taxed three ways.</span></a>
    <a class="door" href="/kit"><h2>The kit</h2><span>The seven documents you take home: the quickstart, the journal, the rules card, the reading list, the costs and tax walkthrough, how to spot a scam, and demo day's questions.</span></a>
<!--tutor-->
  </nav>

  <div class="try">
    <h2>Look up a company</h2>
    <p>Type a ticker &mdash; the short code a company trades under, such as AAPL for Apple &mdash; to see five years of its accounts with Graham's tests, or its price chart with the two moving averages.</p>
    <form class="lookup" onsubmit="event.preventDefault();var t=this.t.value.trim().toUpperCase();if(t)location.href='/'+(this.books.checked?'fundamentals':'prices')+'/'+encodeURIComponent(t)">
      <input name="t" placeholder="AAPL" aria-label="Ticker symbol" autocapitalize="characters" autocomplete="off" spellcheck="false">
      <label style="display:flex;align-items:center;gap:.3rem;font-size:.85rem;color:var(--faint)"><input type="checkbox" name="books" checked> the accounts (untick for the price chart)</label>
      <button type="submit">Open</button>
    </form>
    <p class="shelf-head">The reference shelf &mdash; the tools you consult while you work:</p>
    <p class="actions"><a class="btn alt" href="/screen">The Graham screen &mdash; seven tests, run tonight</a><a class="btn alt" href="/card">The checklist cards</a><a class="btn alt" href="/explain/NVDA">A company explained, with its receipts</a><a class="btn alt" href="/size">The calculator &mdash; how many shares, where the stop goes</a></p>
    <p class="fineprint"><!--door--></p>
  </div>

  <div class="promises">
    <p><strong>Paper portfolios only.</strong> Nobody risks a cent in this room.</p>
    <p><strong>No tips, ever.</strong> You leave with a process, not a portfolio.</p>
    <p><strong>Everything is open.</strong> Every tool here is built in public, one week at a time &mdash; the mistakes too.</p>
  </div>

  <h2 class="key-head">The course's words, in one line each</h2>
  <ul class="key" aria-label="The course's words">
    <li><b>A paper account</b> &mdash; pretend dollars, real prices, a real record. Every student has one; nobody's money is in it.</li>
    <li><b>The rules</b> &mdash; one set, written down, the same for everyone: when to buy (the trend rule says LONG), how much (12% a year of risk, shared between the companies you hold), when to sell (the stop). Robert Carver's Starter System, read with Benjamin Graham's checklists.</li>
    <li><b>LONG &middot; FLAT</b> &mdash; what the trend rule says about a price tonight: LONG, it would be in the share; FLAT, it would be out. A statement, not an instruction.</li>
    <li><b>The stop</b> &mdash; the price at which the rules say sell: a fixed distance below the highest price since you bought. It only ever moves up.</li>
    <li><b>A ticket</b> &mdash; the form on your page that buys or sells on paper. The judge (the rules) checks it and refuses, with a reason, anything that breaks them.</li>
    <li><b>The watchlist</b> &mdash; the companies that pass Graham's checklist <em>and</em> are LONG on the rule tonight. Short on purpose.</li>
  </ul>


  <details class="ledger">
    <summary>How it was built <small>&mdash; the builder's log, week by week; the course is the pages above</small></summary>
    <p class="lede">One lesson and one feature a week, for twelve weeks, every step in the open repository &mdash; the decisions, the tests, the independent reviews, the live checks, and the list of what is not finished. The rows below are written for the record, in its own words.</p>

    <div class="phase">
      <p class="phase-name">Phase 1 &middot; Foundations</p>
      <div class="row shipped">
        <span class="wk">Wk 1</span>
        <span><span class="lesson">What is a market?</span><br><span class="feature">This page, and one API route</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 2</span>
        <span><span class="lesson">Where prices come from</span><br><span class="feature">Live quote lookup &mdash; rationed by design</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 3</span>
        <span><span class="lesson">The nightly close</span><br><span class="feature">Price history, refreshed every night &mdash; <a href="/prices/AAPL">see a chart</a> or <a href="/api/universe">the whole universe</a></span></span>
        <span class="stamp">SHIPPED</span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 2 &middot; Value, the Graham way</p>
      <div class="row shipped">
        <span class="wk">Wk 4</span>
        <span><span class="lesson">What is a company worth?</span><br><span class="feature">The books, opened &mdash; <a href="/fundamentals/AAPL">five years of accounts &amp; Graham's ratios</a></span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 5</span>
        <span><span class="lesson">The Graham checklist</span><br><span class="feature">The value screener &mdash; <a href="/screen">seven tests, run tonight</a>, <a href="/screen/enterprising">the enterprising investor's six</a> &amp; <a href="/card">the checklist cards</a></span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 6</span>
        <span><span class="lesson">Numbers into narrative</span><br><span class="feature">&ldquo;Explain this stock&rdquo; &mdash; <a href="/explain/NVDA">a story with its receipts</a>, written from the fact sheet and checked against it</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 3 &middot; Rules, the Carver way</p>
      <div class="row shipped">
        <span class="wk">Wk 7</span>
        <span><span class="lesson">Why systems beat gut feel</span><br><span class="feature">Carver's rule, run nightly &mdash; <a href="/signals">trend signals &amp; instrument risk</a> for every company, and <a href="/prices/AAPL">the two averages on every chart</a></span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 8</span>
        <span><span class="lesson">How much to bet</span><br><span class="feature">Carver's sizing and stop &mdash; <a href="/size">the position-size calculator</a>, paper tickets with a decision journal, the stop tracked nightly</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 9</span>
        <span><span class="lesson">Your paper portfolio</span><br><span class="feature">The account marked to market every night &mdash; cash, open P&amp;L, the high-water mark and the drawdown, the risk the positions carry against the 12% budget &mdash; on each student's page, with the pre-trade checks (size, concentration, budget) that refuse a ticket in a sentence</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
    </div>

    <div class="phase">
      <p class="phase-name">Phase 4 &middot; The takeaway</p>
      <div class="row shipped">
        <span class="wk">Wk 10</span>
        <span><span class="lesson">Ask the tutor</span><br><span class="feature"><a href="/tutor">A tutor that answers from the course notes</a> and cites the passage on every paragraph &mdash; checked, like week 6's story; and <a href="/watchlist">the watchlist</a>: Graham and Carver read side by side as a gate</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 11</span>
        <span><span class="lesson">The real world: costs &amp; tax</span><br><span class="feature">&ldquo;Explain my portfolio&rdquo; &mdash; your tickets read against your rules by an audit and a reading that cannot see the result (on your page); and <a href="/costs">the costs-and-tax worksheet</a>: the same trade priced in euro, the gain taxed three ways</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">Wk 12</span>
        <span><span class="lesson">Demo day</span><br><span class="feature">The real student logins &mdash; the site behind Cloudflare Access, an email code at the door, <a href="/me">your page found by your email</a>; <a href="/kit">the takeaway kit</a> assembled; the course tagged v1.0</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
      <div class="row shipped">
        <span class="wk">After</span>
        <span><span class="lesson">The planner, and the front door</span><br><span class="feature">v1.1: the tutor's workbook &mdash; tonight's companies ranked by the tests, sized and stopped, the tickets raised through the judge. v1.2: this page, the header on every page, and every page's words for the room rather than the builder</span></span>
        <span class="stamp">SHIPPED</span>
      </div>
    </div>
  </details>

  <footer>
    <p class="notice">Education, not advice. Nothing here is a recommendation to buy or sell anything.</p>
    <p>&copy; 2026 Tony Ryan &middot; <a href="https://github.com/tonyryan08/stock-market-toolkit">Source code on GitHub</a> &middot; week 1's <code><a href="/api/hello">/api/hello</a></code> lives on.</p>
  </footer>
</main>
</body>
</html>`;
