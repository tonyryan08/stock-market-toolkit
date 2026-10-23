/**
 * SEC EDGAR's XBRL "company concept" API — the audit trail for the small-cap
 * tier and the source of its EPS (decision 14; VC-13 b/c/f, VC-14 e/f).
 *
 *   GET https://data.sec.gov/api/xbrl/companyconcept/CIK##########/us-gaap/<Tag>.json
 *   → { cik, entityName, units: { "USD/shares": [ {start, end, val, accn, fy, fp, form, filed, frame?}, … ] } }
 *
 * Free, no key, no daily cap — but the fair-access policy requires a
 * User-Agent naming the project and a contact address, and under 10
 * requests a second. Browsers add one; the Worker sends EDGAR_USER_AGENT.
 *
 * What the record taught us about reading it (VC-13, 15 Oct 2026):
 *   - `fy` is the FILING's fiscal year, so a 10-K carries two comparative
 *     years all labelled with the newest fy. Select by `start`/`end`, never
 *     by `fy`.
 *   - the same period appears in up to three 10-Ks (the year, then two
 *     comparatives); the most recently FILED copy wins (restated if restated).
 *   - proxy forms (PREC14A, DEFC14A) leak facts with `fy: null`; only annual
 *     reports count: 10-K, 10-K/A, 10-KT, 20-F, 40-F.
 *   - dimensioned facts (per class of stock, per segment) are omitted by this
 *     API, so a tag can be present and empty (Ford's EPS): hence the
 *     net income ÷ diluted shares fallback, and null when even that fails.
 *   - tags drift within one filer (ProfitLoss vs NetIncomeLoss): the net
 *     income lookup tries the usual names in order, one call each.
 */

export type EdgarFact = {
  start?: string;
  end: string;
  val: number;
  accn?: string;
  fy?: number | null;
  fp?: string | null;
  form?: string;
  filed?: string;
  frame?: string;
};

export type EdgarConceptResult =
  | { kind: "ok"; entityName: string | null; units: Record<string, EdgarFact[]> }
  | { kind: "not_found" }                      // 404: the filer never used this tag
  | { kind: "forbidden"; detail: string }      // 403: User-Agent refused — a configuration fault, not coverage
  | { kind: "error"; detail: string };

export const EDGAR_API_URL = "https://data.sec.gov/api/xbrl/companyconcept";
export const ANNUAL_FORMS = new Set(["10-K", "10-K/A", "10-KT", "10-KT/A", "20-F", "20-F/A", "40-F", "40-F/A"]);

export type EdgarOptions = { apiUrl?: string; fetchImpl?: typeof fetch };

export const padCik = (cik: string | number): string => String(cik).replace(/\D/g, "").padStart(10, "0");

export async function fetchEdgarConcept(
  cik: string,
  tag: string,
  userAgent: string,
  opts: EdgarOptions = {},
): Promise<EdgarConceptResult> {
  const base = opts.apiUrl ?? EDGAR_API_URL;
  const url = `${base}/CIK${padCik(cik)}/us-gaap/${encodeURIComponent(tag)}.json`;
  const f = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(url, { headers: { "user-agent": userAgent, accept: "application/json" } });
  } catch (err) {
    return { kind: "error", detail: `unreachable: ${String((err as Error).message ?? err)}`.slice(0, 200) };
  }
  if (res.status === 404) return { kind: "not_found" };
  if (res.status === 403) return { kind: "forbidden", detail: "HTTP 403 — EDGAR refused the request; check EDGAR_USER_AGENT (project name + contact)" };
  if (!res.ok) return { kind: "error", detail: `HTTP ${res.status}` };
  let json: { entityName?: string; units?: Record<string, EdgarFact[]> };
  try {
    json = (await res.json()) as typeof json;
  } catch {
    return { kind: "error", detail: "unparseable JSON" };
  }
  if (!json || typeof json !== "object" || !json.units || typeof json.units !== "object") {
    return { kind: "error", detail: "unexpected shape (no units)" };
  }
  return { kind: "ok", entityName: typeof json.entityName === "string" ? json.entityName : null, units: json.units };
}

const dayMs = 86_400_000;
const days = (iso: string) => Math.round(Date.parse(iso) / dayMs);

export type AnnualFact = { end: string; start: string | null; val: number; form: string; filed: string; accn: string | null };

/**
 * Annual-report facts, one per period end, most recently filed copy wins.
 * `duration`: facts must span about a year (340–380 days — 52/53-week years
 * included); `instant`: facts with no start (a balance-sheet date).
 */
export function selectAnnualFacts(facts: EdgarFact[], mode: "duration" | "instant" = "duration"): AnnualFact[] {
  const byEnd = new Map<string, AnnualFact>();
  for (const f of facts) {
    if (!f || typeof f.end !== "string" || typeof f.val !== "number" || !Number.isFinite(f.val)) continue;
    if (!f.form || !ANNUAL_FORMS.has(f.form)) continue;
    if (mode === "duration") {
      if (typeof f.start !== "string") continue;
      const span = days(f.end) - days(f.start);
      if (!(span >= 340 && span <= 380)) continue;
    } else if (typeof f.start === "string") {
      continue;
    }
    const filed = typeof f.filed === "string" ? f.filed : "";
    const prev = byEnd.get(f.end);
    if (!prev || filed > prev.filed) {
      byEnd.set(f.end, { end: f.end, start: mode === "duration" ? f.start! : null, val: f.val, form: f.form, filed, accn: f.accn ?? null });
    }
  }
  return [...byEnd.values()].sort((a, b) => b.end.localeCompare(a.end));
}

/** The fact whose period end is `end`, or within `tolDays` of it (fiscal calendars wobble by a few days). */
export function factForEnd(facts: AnnualFact[], end: string, tolDays = 7): AnnualFact | null {
  const target = days(end);
  let best: AnnualFact | null = null;
  let bestGap = Infinity;
  for (const f of facts) {
    const gap = Math.abs(days(f.end) - target);
    if (gap <= tolDays && gap < bestGap) { best = f; bestGap = gap; }
  }
  return best;
}

export const provenance = (tag: string, f: AnnualFact): string =>
  `edgar:${tag} ${f.form} filed ${f.filed || "?"}${f.accn ? " accn " + f.accn : ""}`;

export type EdgarEpsYear = {
  end: string;
  eps: number | null;
  epsSource: string | null;        // provenance string, or null when EDGAR had nothing usable
  netIncome: number | null;        // EDGAR's own net income for the period — the cross-check against Alpha Vantage
  netIncomeTag: string | null;
  sharesDiluted: number | null;    // weighted-average diluted shares
};

export type EdgarEpsResult = {
  calls: number;
  entityName: string | null;
  years: EdgarEpsYear[];           // one per requested period end
  notes: string[];                 // what was tried and what came back, for the fetch_log receipt
  fatal: string | null;            // a forbidden/unreachable answer — the whole EDGAR step is void tonight
};

const EPS_TAGS = ["EarningsPerShareDiluted", "EarningsPerShareBasicAndDiluted"];
const NET_INCOME_TAGS = ["NetIncomeLoss", "ProfitLoss", "NetIncomeLossAvailableToCommonStockholdersBasic"];
const SHARES_TAG = "WeightedAverageNumberOfDilutedSharesOutstanding";

/**
 * EPS for each period end (the small-cap tier's fiscalDateEnding dates), with
 * provenance, plus net income and diluted shares for the fallback and the
 * cross-check. Up to 5 calls (EPS tag(s), net income tag(s), shares); stops
 * early when the first tag covers every period.
 */
export async function edgarEpsForPeriods(
  cik: string,
  periodEnds: string[],
  userAgent: string,
  opts: EdgarOptions = {},
): Promise<EdgarEpsResult> {
  const out: EdgarEpsResult = { calls: 0, entityName: null, years: periodEnds.map((end) => ({ end, eps: null, epsSource: null, netIncome: null, netIncomeTag: null, sharesDiluted: null })), notes: [], fatal: null };
  const want = new Set(periodEnds);

  const pull = async (tag: string, unitKey: string): Promise<AnnualFact[] | null> => {
    out.calls++;
    const r = await fetchEdgarConcept(cik, tag, userAgent, opts);
    if (r.kind === "ok") {
      out.entityName = out.entityName ?? r.entityName;
      const facts = selectAnnualFacts(r.units[unitKey] ?? [], "duration");
      out.notes.push(`${tag}: ${facts.length} annual periods`);
      return facts;
    }
    if (r.kind === "not_found") { out.notes.push(`${tag}: not used by this filer`); return null; }
    out.fatal = `${tag}: ${r.kind === "forbidden" ? r.detail : r.detail}`;
    return null;
  };

  // 1) EPS tags, in order, until every period is covered.
  for (const tag of EPS_TAGS) {
    const facts = await pull(tag, "USD/shares");
    if (out.fatal) return out;
    if (!facts) continue;
    for (const y of out.years) {
      if (y.eps !== null) continue;
      const f = factForEnd(facts, y.end);
      if (f) { y.eps = f.val; y.epsSource = provenance(tag, f); }
    }
    if (out.years.every((y) => y.eps !== null)) break;
  }

  // 2) Net income — the cross-check against the provider's figure is the
  //    point of having a second source. Tags drift within a filer, so each
  //    tag is tried for the periods the earlier ones left uncovered (review
  //    S5, 23 Oct 2026: stopping at the first tag with any hit left 2 of 5
  //    years empty live). NetIncomeLoss comes first because ProfitLoss
  //    includes non-controlling interests.
  for (const tag of NET_INCOME_TAGS) {
    if (out.years.every((y) => y.netIncome !== null)) break;
    const facts = await pull(tag, "USD");
    if (out.fatal) return out;
    if (!facts) continue;
    for (const y of out.years) {
      if (y.netIncome !== null) continue;
      const f = factForEnd(facts, y.end);
      if (f) { y.netIncome = f.val; y.netIncomeTag = tag; }
    }
  }

  // 3) Diluted shares — needed for the fallback EPS and useful on its own (book value per share).
  const missingEps = out.years.some((y) => y.eps === null && want.has(y.end));
  const shares = await pull(SHARES_TAG, "shares");
  if (out.fatal) return out;
  if (shares) {
    for (const y of out.years) {
      const f = factForEnd(shares, y.end);
      if (f) y.sharesDiluted = f.val;
      if (y.eps === null && missingEps && y.netIncome !== null && f && f.val > 0) {
        y.eps = Math.round((y.netIncome / f.val) * 100) / 100;
        y.epsSource = `edgar:${y.netIncomeTag}/${SHARES_TAG} ${f.form} filed ${f.filed || "?"}${f.accn ? " accn " + f.accn : ""} (net income ÷ diluted shares)`;
      }
    }
  }
  return out;
}
