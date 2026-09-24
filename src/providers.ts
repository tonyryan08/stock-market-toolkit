/**
 * Week 2: the two data providers, called live on every request.
 *
 * Deliberately throwaway plumbing — week 3 replaces live calls with the
 * nightly cron → D1 cache, and this file's job becomes feeding that cache.
 * Making it obsolete on schedule is itself part of the curriculum.
 *
 * Provider terms as verified Aug 2026 (re-verify via docs/data-provider-checks.md):
 *   Alpha Vantage free tier — ~25 requests/day, 5/minute. Rate limiting arrives
 *     as HTTP 200 with a prose "Note"/"Information" field, not an error status.
 *   FMP free plan — ~250 requests/day via the /stable endpoints.
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

/** Parse a number defensively — providers send numbers as strings, or not at all. */
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

  // The famous gotcha: rate limits and key problems come back as HTTP 200
  // with a chatty field. Treat prose as a warning, not data.
  const notice = json["Note"] ?? json["Information"] ?? json["Error Message"];
  if (typeof notice === "string") {
    return { data: null, warning: `Alpha Vantage notice: ${notice.slice(0, 180)}` };
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
