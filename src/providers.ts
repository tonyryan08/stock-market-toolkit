/**
 * Week 2: the two data providers. Week 3 adds the FMP adjusted-history
 * fetcher that feeds the nightly cron, and the error classifier built
 * from the verification record's captured message shapes (M-1…M-6).
 *
 * Provider terms as verified 30 Sep 2026 (docs/data-provider-checks.md):
 *   Alpha Vantage free — 25 req/day, 5/min; limits arrive as HTTP 200 + prose;
 *     daily-adjusted history is PREMIUM (M-4), so AV is quote-demo only — it
 *     is not in the cron at all (decision #7).
 *   FMP free — ~250 req/day on /stable; dividend-adjusted EOD history ≈5y
 *     for whitelisted US symbols; non-whitelisted symbols answer HTTP 402
 *     (M-5) or "Premium Query Parameter…" prose (M-6) — permanent per
 *     symbol, never retried (VC-10: the whitelist is discovered, not deduced).
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
  date: string; // YYYY-MM-DD
  adjOpen: number | null;
  adjHigh: number | null;
  adjLow: number | null;
  adjClose: number;
  volume: number | null;
};

/** Outcome classification for the nightly job — mirrors the M-shape map. */
export type HistoryResult =
  | { kind: "ok"; bars: DailyBar[] }
  | { kind: "blocked"; detail: string } // M-5 / M-6: permanent for this symbol — do not retry
  | { kind: "rate_limited"; detail: string } // back off, resume next night
  | { kind: "auth_failed"; detail: string } // key problem — abort the whole run
  | { kind: "error"; detail: string }; // transient — retry next night

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
    // Security (found by the week-2 verification run, shape M-1b): AV
    // sometimes echoes the API key inside its own notices. Scrub before
    // this text goes anywhere near a public response.
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

/**
 * Week 3: FMP dividend-adjusted daily history — the price spine (decision #7).
 * VC-09 evidence: ~5 years of {date, adjOpen, adjHigh, adjLow, adjClose, volume}.
 * `from` narrows the window for the nightly incremental; on a first fetch the
 * full ~5y arrives in one call. Upserts are idempotent, so an over-wide reply
 * costs payload, never correctness.
 */
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

  // Shape M-6 arrives as HTTP 200 with a prose complaint.
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const text = JSON.stringify(json).slice(0, 200);
    if (/premium query parameter|special endpoint|upgrade your plan/i.test(text)) {
      return { kind: "blocked", detail: `M-6: ${text}` };
    }
    if (/limit/i.test(text)) {
      return { kind: "rate_limited", detail: text };
    }
    // Some wrappers nest the array — accept the common spellings.
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
