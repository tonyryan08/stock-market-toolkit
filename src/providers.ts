/**
 * Week 2: the two data providers. Week 3 adds the FMP adjusted-history
 * fetcher that feeds the nightly cron, and the error classifier built
 * from the verification record's captured message shapes (M-1…M-6).
 */

export type PriceQuote = {
  symbol: string;
  price: number | null;
  change: number | null;
  changePercent: string | null;
  previousClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  latestTradingDay: string | null;
};

export type CompanyProfile = {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  currency: string | null;
  marketCap: number | null;
  website: string | null;
  description: string | null;
};

export type ProviderResult<T> = { data: T | null; warning: string | null };

export type DailyBar = {
  date: string;
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number;
  volume: number | null;
};

export type HistoryResult =
  | { kind: "ok"; bars: DailyBar[] }
  | { kind: "blocked"; detail: string }
  | { kind: "rate_limited"; detail: string }
  | { kind: "auth_failed"; detail: string }
  | { kind: "error"; detail: string };

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function fetchAlphaVantageQuote(
  symbol: string,
  apiKey: string,
): Promise<ProviderResult<PriceQuote>> {
  const url =
    `https://www.alphavantage.co/query?function=GLOBAL_QUOTE` +
    `&symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

  let json: Record<string, unknown>;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { data: null, warning: `Alpha Vantage responded HTTP ${res.status}.` };
    }
    json = (await res.json()) as Record<string, unknown>;
  } catch (err) {
    return { data: null, warning: `Alpha Vantage unreachable: ${(err as Error).message}` };
  }

  const notice = json["Note"] ?? json["Information"] ?? json["Error Message"];
  if (typeof notice === "string") {
    const scrubbed = notice.replaceAll(apiKey, "[key hidden]");
    return { data: null, warning: `Alpha Vantage notice: ${scrubbed.slice(0, 180)}` };
  }

  const q = json["Global Quote"] as Record<string, string> | undefined;
  if (!q || Object.keys(q).length === 0) {
    return {
      data: null,
      warning: `Alpha Vantage has no quote for "${symbol}" — the symbol may be wrong, or spelt differently there (e.g. TSCO.LON for London listings).`,
    };
  }

  return {
    data: {
      symbol: q["01. symbol"] ?? symbol,
      price: num(q["05. price"]),
      change: num(q["09. change"]),
      changePercent: q["10. change percent"] ?? null,
      previousClose: num(q["08. previous close"]),
      open: num(q["02. open"]),
      high: num(q["03. high"]),
      low: num(q["04. low"]),
      volume: num(q["06. volume"]),
      latestTradingDay: q["07. latest trading day"] ?? null,
    },
    warning: null,
  };
}

export async function fetchFmpProfile(
  symbol: string,
  apiKey: string,
): Promise<ProviderResult<CompanyProfile>> {
  const url =
    `https://financialmodelingprep.com/stable/profile` +
    `?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { data: null, warning: `FMP unreachable: ${(err as Error).message}` };
  }

  if (res.status === 401 || res.status === 403) {
    return {
      data: null,
      warning: "FMP rejected the request (401/403) — check FMP_API_KEY, or this symbol/endpoint may sit outside the free plan.",
    };
  }
  if (res.status === 402) {
    return { data: null, warning: "FMP responded HTTP 402 — this symbol sits outside the free plan (shape M-5)." };
  }
  if (res.status === 429) {
    return { data: null, warning: "FMP rate limit reached (free plan: ~250 requests/day)." };
  }
  if (!res.ok) {
    return { data: null, warning: `FMP responded HTTP ${res.status}.` };
  }

  const json = (await res.json()) as unknown;
  const p = Array.isArray(json) ? (json[0] as Record<string, unknown> | undefined) : undefined;
  if (!p) {
    return {
      data: null,
      warning: `FMP has no profile for "${symbol}" — free-plan coverage is strongest for US listings; record gaps in the verification sheet.`,
    };
  }

  return {
    data: {
      symbol: (p.symbol as string) ?? symbol,
      name: (p.companyName as string) ?? null,
      exchange: (p.exchange as string) ?? (p.exchangeShortName as string) ?? null,
      sector: (p.sector as string) ?? null,
      industry: (p.industry as string) ?? null,
      currency: (p.currency as string) ?? null,
      marketCap: num(p.marketCap ?? p.mktCap),
      website: (p.website as string) ?? null,
      description:
        typeof p.description === "string" ? p.description.slice(0, 300) : null,
    },
    warning: null,
  };
}

export async function fetchFmpDailyAdjusted(
  symbol: string,
  apiKey: string,
  fromDate?: string,
): Promise<HistoryResult> {
  const url =
    `https://financialmodelingprep.com/stable/historical-price-eod/dividend-adjusted` +
    `?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}` +
    (fromDate ? `&from=${fromDate}` : "");

  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { kind: "error", detail: `unreachable: ${(err as Error).message}` };
  }

  if (res.status === 401 || res.status === 403) {
    return { kind: "auth_failed", detail: `HTTP ${res.status}` };
  }
  if (res.status === 402) {
    return { kind: "blocked", detail: "HTTP 402 (shape M-5: outside the free plan)" };
  }
  if (res.status === 429) {
    return { kind: "rate_limited", detail: "HTTP 429" };
  }
  if (!res.ok) {
    return { kind: "error", detail: `HTTP ${res.status}` };
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", detail: "unparseable JSON" };
  }

  if (json && typeof json === "object" && !Array.isArray(json)) {
    const text = JSON.stringify(json).slice(0, 200);
    // Order matters (review, 12 Oct 2026): a limit message can contain upsell
    // wording too, so test for "limit" FIRST, and only the specific paywall
    // phrases mean "blocked".
    if (/limit/i.test(text)) {
      return { kind: "rate_limited", detail: text };
    }
    if (/premium query parameter|special endpoint/i.test(text)) {
      return { kind: "blocked", detail: `M-6: ${text}` };
    }
    const nested = (json as Record<string, unknown>)["historical"];
    if (Array.isArray(nested)) json = nested;
    else return { kind: "error", detail: `unexpected shape: ${text}` };
  }

  if (!Array.isArray(json)) {
    return { kind: "error", detail: "expected an array" };
  }

  const bars: DailyBar[] = [];
  for (const row of json as Record<string, unknown>[]) {
    const date = typeof row.date === "string" ? row.date.slice(0, 10) : null;
    const adjClose = num(row.adjClose ?? row.close);
    if (!date || adjClose === null) continue;
    bars.push({
      date,
      adjOpen: num(row.adjOpen ?? row.open),
      adjHigh: num(row.adjHigh ?? row.high),
      adjLow: num(row.adjLow ?? row.low),
      adjClose,
      volume: num(row.volume),
    });
  }

  return { kind: "ok", bars };
}

// ---------------------------------------------------------------------------
// Week 4: fundamentals — three more /stable endpoints through one classifier.
// VC-07 fixed income-statement at 5 annual periods on the free plan; the
// balance-sheet and dividends endpoints get their own VC-12 check (shipment
// notes) and, in code, the same M-shape handling either way.
// ---------------------------------------------------------------------------

export type FmpRowsResult =
  | { kind: "ok"; rows: Record<string, unknown>[] }
  | { kind: "blocked"; detail: string }
  | { kind: "rate_limited"; detail: string }
  | { kind: "auth_failed"; detail: string }
  | { kind: "error"; detail: string };

async function fetchFmpRows(
  path: string,
  symbol: string,
  apiKey: string,
): Promise<FmpRowsResult> {
  const url = `https://financialmodelingprep.com/stable/${path}?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    return { kind: "error", detail: `unreachable: ${(err as Error).message}` };
  }
  if (res.status === 401 || res.status === 403) return { kind: "auth_failed", detail: `HTTP ${res.status}` };
  if (res.status === 402) return { kind: "blocked", detail: "HTTP 402 (M-5)" };
  if (res.status === 429) return { kind: "rate_limited", detail: "HTTP 429" };
  if (!res.ok) return { kind: "error", detail: `HTTP ${res.status}` };

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    return { kind: "error", detail: "unparseable JSON" };
  }
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const text = JSON.stringify(json).slice(0, 200);
    if (/limit/i.test(text)) return { kind: "rate_limited", detail: text };   // "limit" first — see fetchFmpDailyAdjusted
    if (/premium query parameter|special endpoint/i.test(text))
      return { kind: "blocked", detail: `M-6: ${text}` };
    return { kind: "error", detail: `unexpected shape: ${text}` };
  }
  if (!Array.isArray(json)) return { kind: "error", detail: "expected an array" };
  return { kind: "ok", rows: json as Record<string, unknown>[] };
}

/** Providers rename fields across versions; take the first usable candidate. */
const pick = (row: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const k of keys) {
    const v = row[k];
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    if (Number.isFinite(n)) return n;
  }
  return null;
};
const pickStr = (row: Record<string, unknown>, ...keys: string[]): string | null => {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return null;
};

export type IncomeYear = {
  fiscalYear: string;
  periodEnd: string | null;
  revenue: number | null;
  netIncome: number | null;
  epsDiluted: number | null;
  sharesDiluted: number | null;
};

export async function fetchFmpIncomeAnnual(symbol: string, apiKey: string) {
  const r = await fetchFmpRows("income-statement", symbol, apiKey);
  if (r.kind !== "ok") return r;
  const years: IncomeYear[] = r.rows.map((row) => {
    const periodEnd = pickStr(row, "date", "fillingDate");
    return {
      fiscalYear: pickStr(row, "fiscalYear", "calendarYear") ?? (periodEnd ? periodEnd.slice(0, 4) : "unknown"),
      periodEnd,
      revenue: pick(row, "revenue"),
      netIncome: pick(row, "netIncome"),
      epsDiluted: pick(row, "epsDiluted", "epsdiluted", "eps"),
      sharesDiluted: pick(row, "weightedAverageShsOutDil", "weightedAverageShsOut"),
    };
  });
  return { kind: "ok" as const, years };
}

export type BalanceYear = {
  fiscalYear: string;
  currentAssets: number | null;
  currentLiabilities: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  longTermDebt: number | null;
  equity: number | null;
  /** Goodwill + intangible assets; equity minus this is Graham's "net tangible assets" (ch. 15). */
  goodwillAndIntangibles: number | null;
};

export async function fetchFmpBalanceAnnual(symbol: string, apiKey: string) {
  const r = await fetchFmpRows("balance-sheet-statement", symbol, apiKey);
  if (r.kind !== "ok") return r;
  const years: BalanceYear[] = r.rows.map((row) => {
    const periodEnd = pickStr(row, "date", "fillingDate");
    return {
      fiscalYear: pickStr(row, "fiscalYear", "calendarYear") ?? (periodEnd ? periodEnd.slice(0, 4) : "unknown"),
      currentAssets: pick(row, "totalCurrentAssets"),
      currentLiabilities: pick(row, "totalCurrentLiabilities"),
      totalAssets: pick(row, "totalAssets"),
      totalLiabilities: pick(row, "totalLiabilities"),
      longTermDebt: pick(row, "longTermDebt"),
      equity: pick(row, "totalStockholdersEquity", "totalEquity", "stockholdersEquity"),
      goodwillAndIntangibles: goodwillPlusIntangibles(row),
    };
  });
  return { kind: "ok" as const, years };
}

/** FMP reports a combined line; fall back to goodwill + intangibleAssets when only the parts are present. */
function goodwillPlusIntangibles(row: Record<string, unknown>): number | null {
  const combined = pick(row, "goodwillAndIntangibleAssets");
  if (combined !== null) return combined;
  const g = pick(row, "goodwill");
  const i = pick(row, "intangibleAssets");
  if (g === null && i === null) return null;
  return (g ?? 0) + (i ?? 0);
}

export type DividendRow = { exDate: string; amount: number | null };

export async function fetchFmpDividends(symbol: string, apiKey: string) {
  const r = await fetchFmpRows("dividends", symbol, apiKey);
  if (r.kind !== "ok") return r;
  const rows: DividendRow[] = [];
  for (const row of r.rows) {
    const exDate = pickStr(row, "date", "exDividendDate", "recordDate");
    if (!exDate) continue;
    rows.push({ exDate: exDate.slice(0, 10), amount: pick(row, "adjDividend", "dividend", "amount") });
  }
  return { kind: "ok" as const, rows };
}
