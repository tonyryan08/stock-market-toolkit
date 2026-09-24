/**
 * Intro to the Stock Market — course toolkit
 * Week 2: Hono routing + the live quote route.
 *
 * The router earns its keep the moment there's more than one real route;
 * that moment is now. Week 1's raw fetch handler is preserved in git
 * history — the before/after is teaching material.
 */

import { Hono } from "hono";
import { LANDING_PAGE } from "./landing";
import { fetchAlphaVantageQuote, fetchFmpProfile } from "./providers";

type Env = {
  ALPHAVANTAGE_API_KEY: string;
  FMP_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();



app.get("/", (c) => c.html(LANDING_PAGE));

// The browser asks every site for a tab icon; give it one instead of log noise.
const FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📒</text></svg>`;

app.get("/favicon.ico", (c) =>
  c.body(FAVICON_SVG, 200, {
    "content-type": "image/svg+xml",
    "cache-control": "public, max-age=604800",
  }),
);



// Week 1's artifact, preserved as shipped.
app.get("/api/hello", (c) =>
  c.json({
    message: "Hello from the Intro to the Stock Market toolkit.",
    week: 1,
    of: 12,
    philosophy: "We grade decisions, not outcomes.",
    served_at: new Date().toISOString(),
  }),
);

/** Letters/digits, optional . or - — covers AAPL, BRK-B, TSCO.LON. */
const TICKER = /^[A-Z0-9][A-Z0-9.\-]{0,11}$/;

app.get("/api/quote/:ticker", async (c) => {
  const ticker = c.req.param("ticker").trim().toUpperCase();

  if (!TICKER.test(ticker)) {
    return c.json(
      {
        error: "That doesn't look like a ticker symbol.",
        hint: "Letters and digits, optionally with . or - : AAPL, BRK-B, TSCO.LON.",
      },
      400,
    );
  }

  const avKey = c.env.ALPHAVANTAGE_API_KEY;
  const fmpKey = c.env.FMP_API_KEY;
  if (!avKey || !fmpKey) {
    return c.json(
      {
        error: "API keys are not configured on this instance.",
        hint:
          "Local: copy .dev.vars.example to .dev.vars and add your keys. " +
          "Production: `npx wrangler secret put ALPHAVANTAGE_API_KEY` and again for FMP_API_KEY, then `npm run deploy`.",
      },
      503,
    );
  }

  // Two providers in parallel; either may fail without sinking the other.
  const [av, fmp] = await Promise.all([
    fetchAlphaVantageQuote(ticker, avKey),
    fetchFmpProfile(ticker, fmpKey),
  ]);

  const warnings = [av.warning, fmp.warning].filter((w): w is string => w !== null);

  if (!av.data && !fmp.data) {
    return c.json(
      { ticker, error: "Neither data provider returned anything usable.", warnings },
      502,
    );
  }

  return c.json(
    {
      ticker,
      asOf: new Date().toISOString(),
      price: av.data,     // Alpha Vantage
      company: fmp.data,  // Financial Modeling Prep
      meta: {
        delayed: true, // free-tier data is delayed; saying so is a feature
        sources: {
          price: "Alpha Vantage (free tier: ~25 requests/day, 5/min)",
          company: "Financial Modeling Prep (free plan: ~250 requests/day)",
        },
        warnings,
        note: "Education, not advice.",
      },
    },
    200,
    { "cache-control": "no-store" },
  );
});

app.notFound((c) =>
  c.json({ error: "Not found", hint: "Try /, /api/hello, or /api/quote/AAPL" }, 404),
);

export default app;
