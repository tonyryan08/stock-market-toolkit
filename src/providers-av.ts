/**
 * The second data spine — Alpha Vantage, for the small-cap tier (decision 14).
 *
 * Verified on Ethan Allen (ETD), the first name on the tier (VC-13, VC-14,
 * 15–16 Oct 2026):
 *   TIME_SERIES_DAILY   outputsize=compact → ~100 trading days, AS TRADED
 *                       (full history is premium; adjusted series are premium)
 *   INCOME_STATEMENT    annualReports: totalRevenue, netIncome … no EPS
 *   BALANCE_SHEET       annualReports: current assets/liabilities, debt,
 *                       goodwill, intangibles, equity, shares outstanding
 *   DIVIDENDS           data[]: ex_dividend_date, amount — the specials are in it
 *   EARNINGS            NOT used: reportedEPS is adjusted and quarter-summed,
 *                       not GAAP diluted (VC-14d). EPS comes from EDGAR.
 *
 * Rations: 25 calls a day AND 5 a minute, one key for the whole project. The
 * job spaces calls (smallcaps.ts) and stops at the daily message.
 *
 * Message shapes, each a finding on the record (VC-13d/14a):
 *   {"Note": "… 5 calls per minute …"}                 → rate_limited (minute)
 *   {"Information": "… 25 requests per day …"}         → rate_limited (day)
 *   {"Information": "… premium endpoint …"}            → premium (paywall)
 *   {"Error Message": "Invalid API call …"}            → not_served
 *   {}                                                  → not_served (empty)
 * Order matters, exactly as it did for FMP (review, 12 Oct): the daily-limit
 * message ALSO says "subscribe to … premium plans", so test for the limit
 * wording FIRST and only then for the paywall.
 */

export type AvResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "rate_limited"; detail: string }   // today or this minute — stop the run
  | { kind: "premium"; detail: string }        // a paywall on the endpoint itself — stop the run
  | { kind: "not_served"; detail: string }     // this symbol: AV has nothing for it
  | { kind: "auth_failed"; detail: string }
  | { kind: "error"; detail: string };         // transient: network, 5xx, odd shape — retry tomorrow

export const AV_API_URL = "https://www.alphavantage.co/query";

/** AV prints "None" (and sometimes "-") for a missing figure; strings for everything else. */
export const avNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t || t === "None" || t === "-" || t.toLowerCase() === "null") return null;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : null;
};

/** Classify a 200-OK body that is not the data we asked for. Returns null when it IS data. */
export function classifyAvNotice(json: Record<string, unknown>, apiKey = ""): AvResult<never> | null {
  const scrub = (s: string) => (apiKey ? s.replaceAll(apiKey, "KEY") : s).slice(0, 200);
  const note = json["Note"];
  if (typeof note === "string") return { kind: "rate_limited", detail: `Note: ${scrub(note)}` };
  const info = json["Information"];
  if (typeof info === "string") {
    // Seen live from the Worker (21 Oct 2026): "Please contact premium@… if you
    // are targeting a higher API call volume" — a throttle, not a paywall.
    if (/per day|per minute|rate limit|call frequency|call volume|requests/i.test(info)) return { kind: "rate_limited", detail: `Information: ${scrub(info)}` };
    if (/premium/i.test(info)) return { kind: "premium", detail: `Information: ${scrub(info)}` };
    return { kind: "error", detail: `Information: ${scrub(info)}` };
  }
  const err = json["Error Message"];
  if (typeof err === "string") return { kind: "not_served", detail: `Error Message: ${scrub(err)}` };
  if (Object.keys(json).length === 0) return { kind: "not_served", detail: "empty object — Alpha Vantage has nothing for this symbol/function" };
  return null;
}

async function avGet(
  fn: string,
  symbol: string,
  apiKey: string,
  extra: Record<string, string>,
  opts: { apiUrl?: string; fetchImpl?: typeof fetch },
): Promise<AvResult<Record<string, unknown>>> {
  const base = opts.apiUrl ?? AV_API_URL;
  const q = new URLSearchParams({ function: fn, symbol, ...extra, apikey: apiKey });
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${base}?${q.toString()}`);
  } catch (err) {
    return { kind: "error", detail: `unreachable: ${String((err as Error).message ?? err)}`.slice(0, 200) };
  }
  if (res.status === 401 || res.status === 403) return { kind: "auth_failed", detail: `HTTP ${res.status}` };
  if (res.status === 429) return { kind: "rate_limited", detail: "HTTP 429" };
  if (!res.ok) return { kind: "error", detail: `HTTP ${res.status}` };
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", detail: "unparseable JSON" };
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) return { kind: "error", detail: "unexpected shape (not an object)" };
  const notice = classifyAvNotice(json as Record<string, unknown>, apiKey);
  if (notice) return notice;
  return { kind: "ok", data: json as Record<string, unknown> };
}

export type AvOptions = { apiUrl?: string; fetchImpl?: typeof fetch };

export type RawBar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;        // as traded
  volume: number | null;
};

/** TIME_SERIES_DAILY, compact: the last ~100 trading days, oldest first. */
export async function fetchAvDailyCompact(symbol: string, apiKey: string, opts: AvOptions = {}): Promise<AvResult<RawBar[]>> {
  const r = await avGet("TIME_SERIES_DAILY", symbol, apiKey, { outputsize: "compact" }, opts);
  if (r.kind !== "ok") return r;
  const series = r.data["Time Series (Daily)"];
  if (!series || typeof series !== "object") return { kind: "error", detail: "no 'Time Series (Daily)' in the answer" };
  const bars: RawBar[] = [];
  for (const [date, row] of Object.entries(series as Record<string, Record<string, unknown>>)) {
    const close = avNum(row["4. close"]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || close === null || close <= 0) continue;
    bars.push({
      date,
      open: avNum(row["1. open"]),
      high: avNum(row["2. high"]),
      low: avNum(row["3. low"]),
      close,
      volume: avNum(row["5. volume"]),
    });
  }
  bars.sort((a, b) => a.date.localeCompare(b.date));
  if (bars.length === 0) return { kind: "error", detail: "empty daily series" };
  return { kind: "ok", data: bars };
}

export type AvIncomeYear = {
  fiscalDateEnding: string;     // YYYY-MM-DD
  fiscalYear: string;           // the year of fiscalDateEnding — the label the books use
  revenue: number | null;
  netIncome: number | null;
};

const annualReports = (data: Record<string, unknown>): Record<string, unknown>[] | null => {
  const a = data["annualReports"];
  return Array.isArray(a) ? (a as Record<string, unknown>[]) : null;
};
const fde = (row: Record<string, unknown>): string | null =>
  typeof row.fiscalDateEnding === "string" && /^\d{4}-\d{2}-\d{2}/.test(row.fiscalDateEnding) ? row.fiscalDateEnding.slice(0, 10) : null;

export async function fetchAvIncomeAnnual(symbol: string, apiKey: string, opts: AvOptions = {}): Promise<AvResult<AvIncomeYear[]>> {
  const r = await avGet("INCOME_STATEMENT", symbol, apiKey, {}, opts);
  if (r.kind !== "ok") return r;
  const rows = annualReports(r.data);
  if (!rows) return { kind: "not_served", detail: "no annualReports in the answer" };
  const years: AvIncomeYear[] = [];
  for (const row of rows) {
    const end = fde(row);
    if (!end) continue;
    years.push({
      fiscalDateEnding: end,
      fiscalYear: end.slice(0, 4),
      revenue: avNum(row.totalRevenue),
      netIncome: avNum(row.netIncome),
    });
  }
  years.sort((a, b) => b.fiscalDateEnding.localeCompare(a.fiscalDateEnding)); // newest first, like FMP
  return { kind: "ok", data: years };
}

export type AvBalanceYear = {
  fiscalDateEnding: string;
  fiscalYear: string;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  longTermDebt: number | null;
  equity: number | null;
  goodwillAndIntangibles: number | null;
  sharesOutstanding: number | null;   // period-end count — the BVPS fallback when EDGAR's weighted diluted count is missing
  /** Readings the toolkit made of AV's "None" (see fetchAvBalanceAnnual) — printed in the fetch_log receipt. */
  notes: string[];
};

export async function fetchAvBalanceAnnual(symbol: string, apiKey: string, opts: AvOptions = {}): Promise<AvResult<AvBalanceYear[]>> {
  const r = await avGet("BALANCE_SHEET", symbol, apiKey, {}, opts);
  if (r.kind !== "ok") return r;
  const rows = annualReports(r.data);
  if (!rows) return { kind: "not_served", detail: "no annualReports in the answer" };
  const years: AvBalanceYear[] = [];
  for (const row of rows) {
    const end = fde(row);
    if (!end) continue;
    const notes: string[] = [];
    const goodwill = avNum(row.goodwill);
    // AV carries both an "intangibleAssets" line (often goodwill-inclusive) and
    // "intangibleAssetsExcludingGoodwill". Goodwill + excluding-goodwill is the
    // clean sum; fall back to the inclusive line alone when that is all there is.
    const intangExcl = avNum(row.intangibleAssetsExcludingGoodwill);
    const intangIncl = avNum(row.intangibleAssets);
    let gi: number | null = null;
    if (goodwill !== null || intangExcl !== null) gi = (goodwill ?? 0) + (intangExcl ?? 0);
    else if (intangIncl !== null) gi = intangIncl;
    else { gi = 0; notes.push("no goodwill/intangibles line reported → 0"); }
    // "longTermDebt" is the total; "longTermDebtNoncurrent" excludes the current
    // portion. AV prints "None" where the filer reports no such line at all —
    // Ethan Allen, debt-free, shows "None" on every debt field (VC-14b: expected
    // "None or 0"). When every debt line is "None", the toolkit reads 0 and says
    // so; a 'null' would make Graham's debt test unanswerable for exactly the
    // companies that pass it best.
    //
    // Leases (v0.8.1, 22 Oct 2026 — ETD's live balance sheet): since 2019 US
    // accounting (ASC 842) books leased shops as liabilities, and AV folds them
    // into its debt total — ETD shows longTermDebt "None" but
    // shortLongTermDebtTotal 120,373,000 = capitalLeaseObligations 120,373,000.
    // Graham's long-term debt is borrowed money, so: borrowings = debt total −
    // lease obligations. A debt total with no lease line to subtract stays
    // unknown, not 0 — the test then shows "?" rather than a guess.
    let ltd = avNum(row.longTermDebt) ?? avNum(row.longTermDebtNoncurrent);
    if (ltd === null) {
      const total = avNum(row.shortLongTermDebtTotal);
      const leases = avNum(row.capitalLeaseObligations);
      const current = avNum(row.currentDebt);
      if (total === null && current === null) {
        ltd = 0;
        notes.push("no debt line reported → long-term debt 0");
      } else if (total !== null && leases !== null) {
        const borrowings = Math.max(0, total - leases);
        ltd = borrowings;
        notes.push(borrowings === 0
          ? `debt total ${Math.round(total / 1e6)}m is entirely lease obligations → borrowings 0`
          : `debt total ${Math.round(total / 1e6)}m less leases ${Math.round(leases / 1e6)}m → borrowings ${Math.round(borrowings / 1e6)}m`);
      } else {
        notes.push("debt total reported without a lease line → long-term debt unknown");
      }
    }
    years.push({
      fiscalDateEnding: end,
      fiscalYear: end.slice(0, 4),
      currentAssets: avNum(row.totalCurrentAssets),
      currentLiabilities: avNum(row.totalCurrentLiabilities),
      totalAssets: avNum(row.totalAssets),
      totalLiabilities: avNum(row.totalLiabilities),
      longTermDebt: ltd,
      equity: avNum(row.totalShareholderEquity),
      goodwillAndIntangibles: gi,
      sharesOutstanding: avNum(row.commonStockSharesOutstanding),
      notes,
    });
  }
  years.sort((a, b) => b.fiscalDateEnding.localeCompare(a.fiscalDateEnding));
  return { kind: "ok", data: years };
}

export type AvDividend = { exDate: string; amount: number | null };

export async function fetchAvDividends(symbol: string, apiKey: string, opts: AvOptions = {}): Promise<AvResult<AvDividend[]>> {
  const r = await avGet("DIVIDENDS", symbol, apiKey, {}, opts);
  if (r.kind !== "ok") return r;
  const data = r.data["data"];
  if (!Array.isArray(data)) return { kind: "not_served", detail: "no 'data' array in the answer" };
  const rows: AvDividend[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const ex = typeof row.ex_dividend_date === "string" ? row.ex_dividend_date.slice(0, 10) : null;
    if (!ex || !/^\d{4}-\d{2}-\d{2}$/.test(ex)) continue;
    rows.push({ exDate: ex, amount: avNum(row.amount) });
  }
  rows.sort((a, b) => b.exDate.localeCompare(a.exDate)); // newest first
  return { kind: "ok", data: rows };
}
