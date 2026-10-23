/**
 * The small-cap visit plan — the ration arithmetic, checked on paper:
 * 20 Alpha Vantage calls a night; a visit costs 1 (prices) or 4 (prices +
 * dividends + income + balance); never-visited companies first.
 */
import { describe, it, expect } from "vitest";
import { planNight, AV_CALLS_PER_NIGHT, ACCOUNTS_REFRESH_DAYS, type SmallTicker } from "./smallcaps";

const now = new Date("2026-10-20T23:10:00Z");
const t = (symbol: string, over: Partial<SmallTicker> = {}): SmallTicker =>
  ({ symbol, cik: "0000896156", last_price_fetch: null, fundamentals_as_of: null, fundamentals_status: null, ...over });

describe("planNight", () => {
  it("a fresh tier: 20 calls buy 5 full visits, alphabetical among the never-visited", () => {
    const tier = ["ZEUS", "ETD", "HOFT", "BSET", "FLXS", "LZB", "HVT"].map((s) => t(s));
    const p = planNight(tier, AV_CALLS_PER_NIGHT, now);
    expect(p.visits.map((v) => v.symbol)).toEqual(["BSET", "ETD", "FLXS", "HOFT", "HVT"]);
    expect(p.visits.every((v) => v.accounts && v.cost === 4)).toBe(true);
    expect(p.avCalls).toBe(20);
  });
  it("steady state: accounts fresh → 20 price-only visits, stalest first", () => {
    const tier = Array.from({ length: 30 }, (_, i) =>
      t(`S${String(i).padStart(2, "0")}`, { last_price_fetch: `2026-10-${String(1 + (i % 15)).padStart(2, "0")}T23:10:00Z`, fundamentals_as_of: "2026-10-01T23:10:00Z", fundamentals_status: "ok" }));
    const p = planNight(tier, 20, now);
    expect(p.visits).toHaveLength(20);
    expect(p.visits.every((v) => !v.accounts && v.cost === 1)).toBe(true);
    expect(p.visits[0].symbol).toBe("S00"); // fetched 1 Oct — the stalest
    expect(p.visits[1].symbol).toBe("S15"); // also 1 Oct; ties by symbol
  });
  it("accounts are due again after a year, or when the last attempt was partial/error", () => {
    const old = new Date(now.getTime() - (ACCOUNTS_REFRESH_DAYS + 1) * 86_400_000).toISOString();
    const tier = [
      t("A", { last_price_fetch: "2026-10-18T23:10:00Z", fundamentals_as_of: old, fundamentals_status: "ok" }),
      t("B", { last_price_fetch: "2026-10-18T23:10:00Z", fundamentals_as_of: "2026-10-18T23:10:00Z", fundamentals_status: "partial" }),
      t("C", { last_price_fetch: "2026-10-18T23:10:00Z", fundamentals_as_of: "2026-10-18T23:10:00Z", fundamentals_status: "ok" }),
    ];
    const p = planNight(tier, 20, now);
    expect(p.visits.find((v) => v.symbol === "A")?.accounts).toBe(true);
    expect(p.visits.find((v) => v.symbol === "B")?.accounts).toBe(true);
    expect(p.visits.find((v) => v.symbol === "C")?.accounts).toBe(false);
  });
  it("a company visited within the last six hours is skipped (a doorbell rung twice)", () => {
    const tier = [t("A", { last_price_fetch: "2026-10-20T22:00:00Z" }), t("B")];
    const p = planNight(tier, 20, now);
    expect(p.visits.map((v) => v.symbol)).toEqual(["B"]);
    expect(p.skippedFresh).toBe(1);
  });
  it("a full visit that no longer fits is passed over for a cheaper one; the budget is never exceeded", () => {
    const tier = [t("A"), t("B"), t("C", { fundamentals_as_of: "2026-10-01T00:00:00Z", fundamentals_status: "ok", last_price_fetch: "2026-10-10T00:00:00Z" })];
    const p = planNight(tier, 5, now);
    expect(p.visits.map((v) => [v.symbol, v.cost])).toEqual([["A", 4], ["C", 1]]);
    expect(p.avCalls).toBe(5);
  });
  it("a company whose statements Alpha Vantage does not serve is left alone until its status is reset", () => {
    const tier = [t("A", { last_price_fetch: "2026-10-01T00:00:00Z", fundamentals_as_of: "2026-10-01T00:00:00Z", fundamentals_status: "blocked" }), t("B")];
    const p = planNight(tier, 20, now);
    expect(p.visits.map((v) => v.symbol)).toEqual(["B"]);
    expect(p.skippedBlocked).toBe(1);
  });
  it("a zero budget plans nothing", () => {
    expect(planNight([t("A")], 0, now).visits).toEqual([]);
  });
});
