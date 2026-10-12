/**
 * Classifier tests with a stubbed network. These exist because of the
 * 12 Oct 2026 incident: a limit-style response was recorded as a paywall
 * and ten companies were wrongly marked "blocked". Each case is a response
 * shape the nightly job must tell apart.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchFmpDailyAdjusted, fetchFmpIncomeAnnual } from "./providers";

const respond = (status: number, body: unknown) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));

afterEach(() => vi.unstubAllGlobals());

describe("FMP response classification", () => {
  it("a limit message is rate_limited even when it also says 'upgrade your plan'", async () => {
    respond(200, { "Error Message": "Limit Reach . Please upgrade your plan or visit our documentation" });
    expect((await fetchFmpDailyAdjusted("AAPL", "k")).kind).toBe("rate_limited");
    expect((await fetchFmpIncomeAnnual("AAPL", "k")).kind).toBe("rate_limited");
  });

  it("the genuine paywall wording (shape M-6) is blocked", async () => {
    respond(200, { "Error Message": "Premium Query Parameter: 'Special Endpoint : This value set for symbol is not available under your current subscription" });
    expect((await fetchFmpDailyAdjusted("RYAAY", "k")).kind).toBe("blocked");
    expect((await fetchFmpIncomeAnnual("RYAAY", "k")).kind).toBe("blocked");
  });

  it("HTTP 402 is blocked (shape M-5); 429 is rate_limited; 503 is a transient error", async () => {
    respond(402, {}); expect((await fetchFmpIncomeAnnual("X", "k")).kind).toBe("blocked");
    respond(429, {}); expect((await fetchFmpIncomeAnnual("X", "k")).kind).toBe("rate_limited");
    respond(503, {}); expect((await fetchFmpIncomeAnnual("X", "k")).kind).toBe("error");
  });

  it("a thrown fetch (the Workers subrequest cap, a dropped connection) is an error, never blocked", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Too many subrequests."); }));
    const r = await fetchFmpIncomeAnnual("COST", "k");
    expect(r.kind).toBe("error");
    expect("detail" in r && r.detail).toMatch(/Too many subrequests/);
    expect((await fetchFmpDailyAdjusted("COST", "k")).kind).toBe("error");
  });

  it("a real statement array parses", async () => {
    respond(200, [{ fiscalYear: "2025", date: "2025-09-27", revenue: 416e9, netIncome: 112e9, epsDiluted: 7.45, weightedAverageShsOutDil: 15.1e9 }]);
    const r = await fetchFmpIncomeAnnual("AAPL", "k");
    expect(r.kind).toBe("ok");
    expect("years" in r && r.years[0].epsDiluted).toBe(7.45);
  });
});
