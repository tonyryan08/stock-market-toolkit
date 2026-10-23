/**
 * Alpha Vantage, the second spine — exercised against the response shapes the
 * verification record captured on Ethan Allen (VC-13d/e, VC-14a–c), with a
 * fake fetch. The figures are ETD's FY2026 10-K (filed 3 Sept 2026).
 */
import { describe, it, expect } from "vitest";
import {
  classifyAvNotice, avNum, fetchAvDailyCompact, fetchAvIncomeAnnual, fetchAvBalanceAnnual, fetchAvDividends,
} from "./providers-av";

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const fake = (body: unknown, status = 200) => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => { calls.push(String(url)); return reply(body, status); }) as typeof fetch;
  return { fetchImpl, calls };
};

describe("the notice classifier (order matters, as it did for FMP)", () => {
  it("daily-limit wording wins over the 'premium' upsell in the same sentence", () => {
    const r = classifyAvNotice({ Information: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly remove all daily rate limits." }, "sekrit");
    expect(r?.kind).toBe("rate_limited");
  });
  it("the 'higher API call volume' message seen live from the Worker (21 Oct 2026) is a throttle, not a paywall", () => {
    expect(classifyAvNotice({ Information: "Thank you for using Alpha Vantage! Please contact premium@alphavantage.co if you are targeting a higher API call volume." })?.kind).toBe("rate_limited");
  });
  it("a per-minute Note is rate_limited; a premium endpoint is premium; an Error Message is not_served; {} is not_served", () => {
    expect(classifyAvNotice({ Note: "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute" })?.kind).toBe("rate_limited");
    expect(classifyAvNotice({ Information: "Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe…" })?.kind).toBe("premium");
    expect(classifyAvNotice({ "Error Message": "Invalid API call. Please retry or visit the documentation for TIME_SERIES_DAILY." })?.kind).toBe("not_served");
    expect(classifyAvNotice({})?.kind).toBe("not_served");
    expect(classifyAvNotice({ "Meta Data": {} })).toBeNull();
  });
  it("never repeats the key in a notice", () => {
    const r = classifyAvNotice({ Information: "key sekrit has exceeded its 25 requests per day" }, "sekrit");
    expect(r && "detail" in r ? r.detail : "").not.toContain("sekrit");
    expect(r && "detail" in r ? r.detail : "").toContain("KEY");
  });
  it("reads AV's number strings, and 'None' as missing", () => {
    expect(avNum("305453000")).toBe(305453000);
    expect(avNum("None")).toBeNull();
    expect(avNum("-")).toBeNull();
    expect(avNum("")).toBeNull();
    expect(avNum(12.5)).toBe(12.5);
  });
});

describe("TIME_SERIES_DAILY compact", () => {
  it("parses the as-traded series oldest-first and asks for outputsize=compact", async () => {
    const body = {
      "Meta Data": { "1. Information": "Daily Prices (open, high, low, close) and Volumes", "2. Symbol": "ETD", "3. Last Refreshed": "2026-10-14", "4. Output Size": "Compact", "5. Time Zone": "US/Eastern" },
      "Time Series (Daily)": {
        "2026-10-14": { "1. open": "20.10", "2. high": "20.30", "3. low": "19.90", "4. close": "20.0600", "5. volume": "123456" },
        "2026-10-13": { "1. open": "20.00", "2. high": "20.20", "3. low": "19.80", "4. close": "20.0000", "5. volume": "100000" },
        "2026-10-12": { "1. open": "None", "2. high": "None", "3. low": "None", "4. close": "19.9000", "5. volume": "None" },
      },
    };
    const { fetchImpl, calls } = fake(body);
    const r = await fetchAvDailyCompact("ETD", "k", { fetchImpl });
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data.map((b) => b.date)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14"]);
    expect(r.data[2].close).toBe(20.06);
    expect(r.data[0].open).toBeNull();
    expect(calls[0]).toContain("function=TIME_SERIES_DAILY");
    expect(calls[0]).toContain("outputsize=compact");
    expect(calls[0]).toContain("symbol=ETD");
  });
  it("the daily-limit answer stops the caller, with no key in the detail", async () => {
    const { fetchImpl } = fake({ Information: "Thank you for using Alpha Vantage! Our standard API rate limit is 25 requests per day. premium plans…" });
    const r = await fetchAvDailyCompact("ETD", "k", { fetchImpl });
    expect(r.kind).toBe("rate_limited");
  });
  it("HTTP failures are transient errors, never 'not served'", async () => {
    const { fetchImpl } = fake({}, 503);
    const r = await fetchAvDailyCompact("ETD", "k", { fetchImpl });
    expect(r.kind).toBe("error");
  });
});

describe("INCOME_STATEMENT / BALANCE_SHEET / DIVIDENDS", () => {
  const income = {
    symbol: "ETD",
    annualReports: [
      { fiscalDateEnding: "2026-06-30", reportedCurrency: "USD", totalRevenue: "579487000", netIncome: "39883000", operatingIncome: "44685000" },
      { fiscalDateEnding: "2025-06-30", reportedCurrency: "USD", totalRevenue: "614649000", netIncome: "51596000" },
    ],
    quarterlyReports: [],
  };
  const balance = {
    symbol: "ETD",
    annualReports: [
      {
        fiscalDateEnding: "2026-06-30", totalAssets: "719673000", totalCurrentAssets: "305453000", totalCurrentLiabilities: "148364000",
        totalLiabilities: "248212000", goodwill: "25388000", intangibleAssets: "45128000", intangibleAssetsExcludingGoodwill: "19740000",
        longTermDebt: "None", totalShareholderEquity: "471461000", commonStockSharesOutstanding: "25500000",
      },
    ],
  };
  const dividends = {
    symbol: "ETD",
    data: [
      { ex_dividend_date: "2026-10-09", declaration_date: "2026-09-25", record_date: "2026-10-09", payment_date: "2026-10-23", amount: "0.39" },
      { ex_dividend_date: "2025-08-07", amount: "0.25" },
      { ex_dividend_date: "2024-08-09", amount: "0.40" },
    ],
  };

  it("income: revenue and net income by fiscalDateEnding, labelled by its year, newest first", async () => {
    const r = await fetchAvIncomeAnnual("ETD", "k", fake(income));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data[0]).toEqual({ fiscalDateEnding: "2026-06-30", fiscalYear: "2026", revenue: 579487000, netIncome: 39883000 });
    expect(r.data[1].fiscalYear).toBe("2025");
  });
  it("balance: the lines the screens read; goodwill + intangibles-excluding-goodwill; 'None' debt is null", async () => {
    const r = await fetchAvBalanceAnnual("ETD", "k", fake(balance));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    const y = r.data[0];
    expect(y.currentAssets).toBe(305453000);
    expect(y.currentLiabilities).toBe(148364000);
    expect(y.equity).toBe(471461000);
    expect(y.goodwillAndIntangibles).toBe(25388000 + 19740000);
    expect(y.longTermDebt).toBe(0);   // "None" on every debt line = the filer reports no debt
    expect(y.notes).toEqual(["no debt line reported → long-term debt 0"]);
    expect(y.sharesOutstanding).toBe(25500000);
  });
  it("balance: a debt line under any name is kept as a figure; intangibles missing everywhere read as 0 and say so", async () => {
    const r = await fetchAvBalanceAnnual("X", "k", fake({ symbol: "X", annualReports: [
      { fiscalDateEnding: "2025-12-31", longTermDebt: "None", longTermDebtNoncurrent: "12000000", goodwill: "None", intangibleAssets: "None", intangibleAssetsExcludingGoodwill: "None", totalShareholderEquity: "50000000" },
      { fiscalDateEnding: "2024-12-31", longTermDebt: "None", longTermDebtNoncurrent: "None", shortLongTermDebtTotal: "3000000", goodwill: "None", intangibleAssets: "7000000", intangibleAssetsExcludingGoodwill: "None", totalShareholderEquity: "48000000" },
    ] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data[0].longTermDebt).toBe(12000000);
    expect(r.data[0].goodwillAndIntangibles).toBe(0);
    expect(r.data[0].notes).toEqual(["no goodwill/intangibles line reported → 0"]);
    expect(r.data[1].longTermDebt).toBeNull();          // a debt total with no lease line: unknown, not 0
    expect(r.data[1].notes).toContain("debt total reported without a lease line → long-term debt unknown");
    expect(r.data[1].goodwillAndIntangibles).toBe(7000000);
  });
  it("leases are not borrowings: ETD's live fields (22 Oct 2026) read as long-term debt 0, and a real borrower keeps the difference", async () => {
    const r = await fetchAvBalanceAnnual("ETD", "k", fake({ symbol: "ETD", annualReports: [
      { fiscalDateEnding: "2026-06-30", longTermDebt: "None", longTermDebtNoncurrent: "None", currentLongTermDebt: "None", shortTermDebt: "26910000", shortLongTermDebtTotal: "120373000", currentDebt: "None", capitalLeaseObligations: "120373000", goodwill: "25388000", intangibleAssetsExcludingGoodwill: "19740000", totalShareholderEquity: "471461000" },
      { fiscalDateEnding: "2025-06-30", longTermDebt: "None", longTermDebtNoncurrent: "None", shortLongTermDebtTotal: "150000000", capitalLeaseObligations: "120000000", totalShareholderEquity: "482269000" },
    ] }));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data[0].longTermDebt).toBe(0);
    expect(r.data[0].notes).toEqual(["debt total 120m is entirely lease obligations → borrowings 0"]);
    expect(r.data[1].longTermDebt).toBe(30000000);
    expect(r.data[1].notes).toContain("debt total 150m less leases 120m → borrowings 30m");
  });
  it("dividends: ex-dates and amounts, specials included, newest first", async () => {
    const r = await fetchAvDividends("ETD", "k", fake(dividends));
    expect(r.kind).toBe("ok");
    if (r.kind !== "ok") return;
    expect(r.data).toEqual([
      { exDate: "2026-10-09", amount: 0.39 }, { exDate: "2025-08-07", amount: 0.25 }, { exDate: "2024-08-09", amount: 0.4 },
    ]);
  });
  it("a symbol AV does not cover answers {} on the statements → not_served", async () => {
    const r = await fetchAvIncomeAnnual("ZZZZ", "k", fake({}));
    expect(r.kind).toBe("not_served");
  });
});
