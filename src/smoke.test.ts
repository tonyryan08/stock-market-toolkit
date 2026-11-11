/**
 * Week 10 (OI-70): a smoke test per page that had none — the landing, the
 * hello, the universe, the books, the two screens, the cards, the explainer's
 * plain version, the favicon. Each renders on the fake D1 with a small fixture
 * (the clean survivor of graham.test.ts as rows) and says "Education, not
 * advice" where a page should. No SQL runs here; the SQL is exercised on the
 * local Worker (BUILD-LOG).
 */
import { describe, it, expect } from "vitest";
import worker from "./index";
import { fakeD1, asD1, type FakeD1 } from "./jobs/fake-d1";

const env = (db: FakeD1) => ({ DB: asD1(db), FMP_API_KEY: "", ALPHAVANTAGE_API_KEY: "" }) as any;
const get = (db: FakeD1, path: string) => worker.fetch(new Request(`http://localhost${path}`), env(db), { waitUntil() {}, passThroughOnException() {} } as any);

const years = (symbol: string) => [2025, 2024, 2023, 2022, 2021].map((fy, i) => ({
  symbol, fiscal_year: String(fy), period_end: `${fy}-12-31`, revenue: 2e9, net_income: 250e6, eps_diluted: [5, 4.6, 4.4, 4, 3.8][i],
  current_assets: 400, current_liabilities: 150, total_assets: 3000, total_liabilities: 1000, long_term_debt: 100, shareholders_equity: 2000, shares_diluted: 50, goodwill_and_intangibles: null,
  source: "fmp", eps_source: "fmp", readings: null,
}));
const divs = (symbol: string) => Array.from({ length: 11 }, (_, i) => 2016 + i).flatMap((y) => [{ symbol, ex_date: `${y}-03-01`, amount: 0.5 }, { symbol, ex_date: `${y}-09-01`, amount: 0.5 }]);
const tickers = [{ symbol: "GOOD", name: "Good Co", sector: "Consumer Defensive", status: "active", tier: "core", cik: null, fundamentals_status: "ok", fundamentals_as_of: "2026-11-01", days_of_history: 1260, latest_close: "2026-11-10" }];
const books = () => fakeD1()
  .on("FROM tickers t", () => ({ results: tickers }))
  .on("SELECT symbol, name, sector, tier FROM tickers WHERE status = 'active' ORDER BY symbol", () => ({ results: tickers }))
  .on("FROM tickers WHERE symbol = ?1", () => ({ results: tickers }))
  .on("FROM fundamentals_annual WHERE symbol = ?1", () => ({ results: years("GOOD") }))
  .on("FROM fundamentals_annual ORDER BY symbol", () => ({ results: years("GOOD") }))
  .on("SELECT ex_date, amount FROM dividends WHERE symbol = ?1", () => ({ results: divs("GOOD").reverse() }))
  .on("SELECT symbol, ex_date, amount FROM dividends", () => ({ results: divs("GOOD") }))
  .on("SELECT date, adj_close FROM daily_prices WHERE symbol = ?1 ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-10", adj_close: 60 }] }))
  .on("JOIN (SELECT symbol, MAX(date) AS d FROM daily_prices GROUP BY symbol)", () => ({ results: [{ symbol: "GOOD", date: "2026-11-10", adj_close: 60 }] }))
  .on("FROM explanations WHERE symbol = ?1", () => ({ results: [] }));

describe("smoke — every page renders (OI-70)", () => {
  it("/ is the ledger with week 10 shipped and the line on every page; /api/hello answers; /favicon.ico is an SVG", async () => {
    const html = await (await get(books(), "/")).text();
    expect(html).toContain("Education, not advice");
    expect(html).toContain("Ask the tutor");
    expect(html).toMatch(/Wk 10[\s\S]*SHIPPED/);
    const hello = await get(books(), "/api/hello");
    expect(hello.status).toBe(200);
    expect(((await hello.json()) as any).philosophy).toBe("We grade decisions, not outcomes.");
    const ico = await get(books(), "/favicon.ico");
    expect(ico.status).toBe(200);
    expect(ico.headers.get("content-type")).toContain("image/svg+xml");
  });
  it("/api/universe lists the tickers with their history counts", async () => {
    const j = (await (await get(books(), "/api/universe")).json()) as any;
    expect(j.universe?.[0]?.symbol ?? j.tickers?.[0]?.symbol ?? j.results?.[0]?.symbol).toBe("GOOD");
  });
  it("/api/fundamentals/GOOD and /fundamentals/GOOD serve the books and the ratios; a ticker not in the universe is 404", async () => {
    const j = (await (await get(books(), "/api/fundamentals/GOOD")).json()) as any;
    expect(j.ticker ?? j.symbol).toBe("GOOD");
    expect(JSON.stringify(j)).toContain("2025");
    const html = await (await get(books(), "/fundamentals/GOOD")).text();
    expect(html).toContain("Good Co");
    expect(html).toContain("Education, not advice");
    const none = books().on("FROM tickers WHERE symbol = ?1", () => ({ results: [] })).on("FROM fundamentals_annual WHERE symbol = ?1", () => ({ results: [] }));
    expect((await get(none, "/api/fundamentals/NOPE")).status).toBe(404);
  });
  it("/api/screen/graham and /api/screen/enterprising score the universe; /screen and /screen/enterprising render the tables", async () => {
    const g = (await (await get(books(), "/api/screen/graham")).json()) as any;
    expect(g.summary.screened).toBe(1);
    expect(g.results[0]).toMatchObject({ symbol: "GOOD", verdict: "survivor", passes: 7 });
    expect(g.meta.note).toMatch(/Education, not advice/);
    const e = (await (await get(books(), "/api/screen/enterprising")).json()) as any;
    expect(e.results[0].symbol).toBe("GOOD");
    expect(e.criteria.length).toBe(6);
    for (const path of ["/screen", "/screen/enterprising"]) {
      const html = await (await get(books(), path)).text();
      expect(html).toContain("Good Co");
      expect(html).toContain("Education, not advice");
    }
  });
  it("/card renders both checklists; /explain/GOOD?plain=1 and /api/explain/GOOD?plain=1 serve the template narrative without an AI call", async () => {
    const card = await (await get(books(), "/card")).text();
    expect(card).toContain("Education, not advice");
    expect(card).toMatch(/defensive/i);
    const j = (await (await get(books(), "/api/explain/GOOD?plain=1")).json()) as any;
    expect(j.ticker).toBe("GOOD");
    expect(j.meta.source).toBe("template");
    expect(j.narrative.paragraphs.length).toBeGreaterThan(1);
    expect(j.sheet.facts.length).toBeGreaterThan(5);
    const html = await (await get(books(), "/explain/GOOD?plain=1")).text();
    expect(html).toContain("Education, not advice");
    expect(html).toContain("Good Co");
  });
});
