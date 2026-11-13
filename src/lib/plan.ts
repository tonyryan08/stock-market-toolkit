/**
 * v1.1 (decision 24): the portfolio planner — the watchlist as a starting
 * point, an example portfolio of the names that do best ON THE TESTS, each
 * sized by the Starter System, its stop and its costs, every row the user's
 * to overwrite. Pure: the route loads the rows, this file ranks, sizes and
 * prices; nothing here is a position until the ticket route accepts it.
 *
 * The order (decision 24 b): the watchlist's own bands first — the gate
 * (passes a Graham screen and long), the near misses that are long, the
 * rule's longs that fail both screens, then longs without books — and
 * within a band defensive tests passed, enterprising tests passed, the
 * forecast (the rule's trend strength, from the price series), the lower
 * instrument risk. Never a return: a planner that ranked by what went up
 * would be a tip sheet, and the course has none.
 *
 * The arithmetic is the ticket judge's (sizing.ts, tickets.ts), on the
 * judge's facts — the account's value tonight, its ledger cash, its enrolled
 * instrument count — never on a typed capital (the v1.1.0 review's F1): the
 * rows are sized in rank order, each on the value less the opening costs of
 * the rows above it (F3: a ticket lowers the account by its cost, and the
 * judge sizes the next on the lower figure) and fitted to the cash left (a
 * calm share sizes to the whole account under the cap, so a second cannot
 * fit — the row says so). The euro lines are the broker schedule in
 * costs.ts at a rate the user TYPES — the toolkit has no FX source and will
 * not guess one.
 *
 * The journal is in two parts (F2): the facts, which the planner writes,
 * and the thesis, which only the writer can — a row with no thesis is not
 * raised. Education, not advice: a screen and a calculator. It proposes
 * nothing the rules would not, and the ticket still says no.
 */
import type { GateRow } from "./gate";
import { scoresText } from "./gate";
import { SIZING, sizePosition, targetFor, tradeCost, fmtPct, type Sizing } from "./sizing";
import { JOURNAL_MIN, JOURNAL_MAX, type PositionRow } from "./tickets";
import { BROKER } from "./costs";

export type Band = "gate" | "near" | "long" | "no_books";
export const BAND_ORDER: Band[] = ["gate", "near", "long", "no_books"];
export const BAND_LABEL: Record<Band, string> = {
  gate: "the gate — passes a Graham screen and long",
  near: "a near miss, long — one Graham test short",
  long: "long on the rule, fails both screens",
  no_books: "long on the rule, no accounts cached",
};

export type Candidate = GateRow & {
  /** The band the name ranks in, or null when the ticket would refuse it tonight. */
  band: Band | null;
  eligible: boolean;
  /** Why it cannot be picked — the reason the ticket would give, in short; null when eligible. */
  why: string | null;
  /** 1-based rank among the eligible, by the order above; null when not eligible. */
  rank: number | null;
};

/** What the ticket judge would say tonight before any size is looked at — the same conditions as decideTicket, in short. */
export function ineligibleReason(r: GateRow, positions: PositionRow[]): string | null {
  if (r.quarantined) return `quarantined: ${r.quarantined.replace(/\.$/, "")}`;
  if (r.state === "warming") return `the rule is still warming up (${r.days} of 128 closes)`;
  if (r.state !== "long") return "the rule is FLAT tonight — the rule opens, you don't";
  if (!(typeof r.instrument_risk === "number" && r.instrument_risk > 0)) return "no instrument risk on the latest row — the position cannot be sized";
  const open = positions.find((p) => p.symbol === r.symbol && p.status === "open");
  if (open) return `already held: ${open.units} shares opened ${open.opened_on} — one position per instrument`;
  const lastClosed = positions.filter((p) => p.symbol === r.symbol && p.status === "closed").sort((a, b) => (a.closed_on ?? "").localeCompare(b.closed_on ?? "")).at(-1);
  if (lastClosed?.closed_on && r.state_since && r.state_since < lastClosed.closed_on) return `the rule has been long since ${r.state_since}, before the close on ${lastClosed.closed_on} — wait for a fresh crossover`;
  return null;
}

function bandOf(r: GateRow): Band | null {
  if (r.gate === "open") return "gate";
  if (r.gate === "near") return "near";
  if (r.gate === "closed" && r.state === "long") return "long";
  if (r.gate === "no_books" && r.state === "long") return "no_books";
  return null;
}

/** Rank every row: the eligible by the tests (decision 24 b), the rest after them with the ticket's reason. */
export function rankCandidates(rows: GateRow[], positions: PositionRow[]): Candidate[] {
  const passes = (x: { passes: number } | null) => x?.passes ?? -1;
  const byTests = (a: GateRow, b: GateRow) =>
    passes(b.defensive) - passes(a.defensive) ||
    passes(b.enterprising) - passes(a.enterprising) ||
    (b.forecast ?? -Infinity) - (a.forecast ?? -Infinity) ||
    (a.instrument_risk ?? Infinity) - (b.instrument_risk ?? Infinity) ||
    a.symbol.localeCompare(b.symbol);
  const tagged = rows.map((r) => {
    const why = ineligibleReason(r, positions);
    const band = why ? null : bandOf(r);
    return { ...r, band, eligible: band !== null, why: why ?? (band === null ? "not long on the rule" : null), rank: null as number | null };
  });
  const eligible = tagged.filter((c) => c.eligible).sort((a, b) => BAND_ORDER.indexOf(a.band as Band) - BAND_ORDER.indexOf(b.band as Band) || byTests(a, b));
  eligible.forEach((c, i) => { c.rank = i + 1; });
  const rest = tagged.filter((c) => !c.eligible).sort((a, b) => (a.state === "long" ? 0 : 1) - (b.state === "long" ? 0 : 1) || byTests(a, b));
  return [...eligible, ...rest];
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------
export type PlanInputs = {
  /** US dollars per euro, as typed; null = not given, the euro columns stay blank. */
  eurUsd: number | null;
  /** The spread estimate for the broker lines, percent of the value (week 2's toll; 0.1 for a large cap). */
  spreadPct: number;
};

export const DEFAULT_INPUTS: PlanInputs = { eurUsd: null, spreadPct: 0.1 };

/** One pick as the user left it: the units typed (null = the rule's size), or the text that could not be read; the thesis typed. */
export type PickInput = { symbol: string; units: number | null; unitsText?: string; thesis: string };

export const PLAN_LIMITS = { spreadMax: 10, eurUsdMin: 0.2, eurUsdMax: 5, unitsMax: 1_000_000, picksMax: 50 } as const;

/** A plain decimal, with a currency sign, a percent sign or spaces around it allowed; nothing else (review N6). */
const PLAIN = /^\d+(?:\.\d+)?$/;
function bound(raw: string | undefined, lo: number, hi: number): number | null | "bad" {
  if (raw === undefined || raw.trim() === "") return null;
  const s = raw.replace(/[€$%\s]/g, "");
  if (!PLAIN.test(s)) return "bad";
  const n = Number(s);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : "bad";
}

/**
 * Bound the typed inputs. A field that cannot be read keeps its default and is named in `errors` (review S4: the page
 * keeps the user's picks and says what it could not read, rather than throwing the form away).
 */
export function parseInputs(q: Record<string, string | undefined>): { inputs: PlanInputs; errors: string[] } {
  const errors: string[] = [];
  const eur = bound(q.eurusd, PLAN_LIMITS.eurUsdMin, PLAN_LIMITS.eurUsdMax);
  const spread = bound(q.spread, 0, PLAN_LIMITS.spreadMax);
  if (eur === "bad") errors.push(`The exchange rate must be a plain number from ${PLAN_LIMITS.eurUsdMin} to ${PLAN_LIMITS.eurUsdMax} (US dollars per euro) — it was left blank.`);
  if (spread === "bad") errors.push(`The spread must be a plain number from 0 to ${PLAN_LIMITS.spreadMax} (percent of the value) — ${DEFAULT_INPUTS.spreadPct}% was used.`);
  return { inputs: { eurUsd: eur === "bad" ? null : eur, spreadPct: spread === "bad" || spread === null ? DEFAULT_INPUTS.spreadPct : spread }, errors };
}

/** A units cell: blank → the rule's size; a whole number ≥ 1 → that; anything else → kept as text and refused (review S2). */
export function parseUnits(raw: string | undefined): { units: number | null; unitsText?: string } {
  const s = (raw ?? "").trim();
  if (s === "") return { units: null };
  if (/^\d{1,7}$/.test(s) && Number(s) >= 1 && Number(s) <= PLAN_LIMITS.unitsMax) return { units: Number(s) };
  return { units: null, unitsText: s };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------
export type EuroLines = {
  /** The position's value in euro at the typed rate. */
  value: number;
  commission: number;       // one order
  fx: number;               // one conversion
  spread: number;           // once, at the typed estimate
  /** Two orders, two conversions, the spread once. */
  roundTrip: number;
  roundTripPct: number;
  stopLevel: number;
  /** units × gap, in euro: what the initial stop puts at risk, before costs. */
  stopDistance: number;
};

export type PlanRow = {
  symbol: string; name: string | null; band: Band; rank: number;
  close: number; instrumentRisk: number; forecast: number | null; stateSince: string | null; graham: string;
  /** The value this row was sized on: the account's value less the opening costs of the rows above (F3). */
  sizedOn: number;
  /** The rule's size on that value; the row's units — as typed, or the rule's size fitted to the cash left. */
  ruleUnits: number; units: number; typedUnits: number | null; unitsText: string | null; underSized: boolean; oversized: boolean;
  exposure: number; weightPct: number; achievedRiskPct: number;
  stopGap: number; stopLevel: number; stopDistance: number;
  costs: { open: number; close: number; roundTrip: number; roundTripPct: number | null };
  eur: EuroLines | null;
  /** What the judge would say, in short — the sizing's own checks, the cash, the units cell; the row is not raised while any stands. */
  problems: string[];
  /** The facts the planner writes, and the thesis only the writer can; `journal` is what a raised ticket carries. */
  facts: string; thesis: string; journal: string;
  /** True when the row cannot be raised as it stands (a units cell that could not be read, 0 shares, no thesis). */
  blocked: boolean;
};

export type Account = {
  /** The account marked to market tonight: its value, its ledger cash, its risk used, its open count, its enrolled N. */
  value: number; cash: number; riskUsedPct: number; openCount: number; instruments: number;
};

export type Plan = {
  asOf: string | null;
  inputs: PlanInputs;
  account: Account;
  /** 12% ÷ N, the target each row is sized at — N the enrolled count. */
  targetPct: number;
  rows: PlanRow[];
  totals: {
    exposure: number; weightPct: number; riskPct: number; costOpen: number;
    /** The ledger cash less the rows' exposure and opening costs: what the plan leaves. */
    cashAfter: number;
    /** The open positions' risk tonight plus the plan's. */
    riskWithOpen: number; overBudget: boolean;
    /** Open positions tonight, and how many more the account's N allows. */
    openCount: number; roomFor: number; overCount: boolean;
    eur: null | { exposure: number; costOpen: number; roundTrip: number; stopDistance: number; connectivity: number };
  };
  /** The broker's once-a-year line, named rather than apportioned. */
  connectivity: { perExchangePerYear: number; note: string };
  notes: string[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The facts the planner writes into the journal: the rule, the screens, the size, the stop — nothing a writer decides. */
export function journalFacts(c: Candidate, s: Sizing, units: number, targetPct: number): string {
  const f = c.forecast === null ? "" : ` (forecast ${c.forecast > 0 ? "+" : ""}${c.forecast.toFixed(1)})`;
  return `${c.symbol}: rule LONG since ${c.state_since ?? "—"}${f}; Graham ${scoresText(c)}; ${units} of the rule's ${s.units} shares at the ${fmtPct(targetPct)}% target; stop $${s.stopLevel.toFixed(2)} (gap $${s.stopGap.toFixed(2)}), trailing the high; if it is hit I close on the next close.`;
}

/** The journal a raised ticket carries: the facts, then the thesis. */
export function journalOf(facts: string, thesis: string): string {
  return `${facts} Thesis: ${thesis.trim()}`.slice(0, JOURNAL_MAX);
}

export function euroLines(s: { exposure: number; stopLevel: number; stopGap: number; units: number }, eurUsd: number, spreadPct: number): EuroLines {
  const value = s.exposure / eurUsd;
  const commission = BROKER.usShare;
  const fx = (BROKER.fxPct / 100) * value;
  const spread = (spreadPct / 100) * value;
  const roundTrip = 2 * commission + 2 * fx + spread;
  return {
    value: r2(value), commission: r2(commission), fx: r2(fx), spread: r2(spread), roundTrip: r2(roundTrip),
    roundTripPct: value > 0 ? r2((roundTrip / value) * 100) : Infinity,
    stopLevel: r2(s.stopLevel / eurUsd), stopDistance: r2((s.units * s.stopGap) / eurUsd),
  };
}

/**
 * Build the plan from the ranked candidates and the picks (symbol, units as typed, thesis as typed) on the account's
 * own facts. A pick that is not eligible tonight is dropped with a note. The rows are sized in order, each on the value
 * less the opening costs of the rows above, and fitted to the ledger cash left — the judge's view when they are raised
 * in that order.
 */
export function buildPlan(candidates: Candidate[], picks: PickInput[], inputs: PlanInputs, account: Account, asOf: string | null): Plan {
  const instruments = Math.max(1, Math.min(SIZING.maxInstruments, account.instruments || 1));
  const targetPct = targetFor(instruments);
  const notes: string[] = [];
  const bySymbol = new Map(candidates.map((c) => [c.symbol, c]));
  const rows: PlanRow[] = [];
  const seen = new Set<string>();
  let cash = Math.max(0, account.cash);
  let costsAbove = 0;
  const fits = (units: number, price: number): number => {
    let fit = Math.min(units, Math.floor(cash / price));
    while (fit > 0 && fit * price + tradeCost(fit * price) > cash + 1e-9) fit--;
    return fit;
  };
  for (const p of picks.slice(0, PLAN_LIMITS.picksMax)) {
    const sym = p.symbol.trim().toUpperCase();
    if (seen.has(sym)) continue;
    seen.add(sym);
    const c = bySymbol.get(sym);
    if (!c) { notes.push(`${sym} is not on tonight's rows — dropped.`); continue; }
    if (!c.eligible || c.band === null || c.rank === null) { notes.push(`${sym} dropped: ${c.why}.`); continue; }
    const risk = c.instrument_risk as number;
    const sizedOn = Math.max(0, account.value - costsAbove);
    let s: Sizing;
    try {
      s = sizePosition({ capital: sizedOn, price: c.close, instrumentRiskPct: risk, targetPct });
    } catch (e) {
      notes.push(`${sym} dropped: ${(e as Error).message}.`);
      continue;
    }
    const typed = p.units;
    const fitted = typed === null && s.units > 0 ? fits(s.units, c.close) : null;
    const units = typed === null ? (fitted ?? s.units) : typed;
    const exposure = units * c.close;
    const weightPct = sizedOn > 0 ? (exposure / sizedOn) * 100 : 0;
    const achievedRiskPct = (weightPct / 100) * risk;
    const open1 = units > 0 ? tradeCost(exposure) : 0;   // no shares, no trade, no fee
    const roundTrip = 2 * open1;
    const problems = s.checks.filter((k) => !k.ok && !(k.code === "cost" && !s.checks[0].ok)).map((k) => k.message);
    let blocked = false;
    if (p.unitsText !== undefined) {
      problems.unshift(`Units must be a whole number of shares, at least 1 — "${p.unitsText.slice(0, 20)}" could not be read. The rule's size is shown; the row is not raised until the cell is fixed or cleared.`);
      blocked = true;
    }
    if (units > s.units) problems.unshift(`Oversized: the rule's size is ${s.units} shares; ${units} would carry ${achievedRiskPct.toFixed(1)}% a year against the ${fmtPct(targetPct)}% target. The ticket will refuse it; fewer is allowed.`);
    if (fitted !== null && fitted < s.units) {
      problems.push(fitted > 0
        ? `Fitted to the cash left after the rows above: the rule's size is ${s.units} shares, ${fitted} fit (cost included). Overwrite it if you would rather drop a row above.`
        : `No cash left after the rows above: the rule's size is ${s.units} shares and none fits (cost included). Drop a row above, or overwrite.`);
    } else if (units > 0 && exposure + open1 > cash + 1e-9) {
      const fit = fits(units, c.close);
      problems.push(`Not enough cash after the rows above: ${money(cash)} left; ${units} shares at ${money(c.close)} plus the ${money(open1)} cost is ${money(exposure + open1)}.${fit > 0 ? ` ${fit} share${fit === 1 ? "" : "s"} would fit, cost included.` : ""} The ticket will refuse it.`);
    }
    if (units === 0) blocked = true;
    const facts = journalFacts(c, s, units, targetPct);
    const thesis = p.thesis.trim().slice(0, JOURNAL_MAX);
    if (thesis.length < JOURNAL_MIN) blocked = true;
    cash = Math.max(0, cash - exposure - open1);
    costsAbove += open1;
    rows.push({
      symbol: sym, name: c.name, band: c.band, rank: c.rank,
      close: c.close, instrumentRisk: risk, forecast: c.forecast, stateSince: c.state_since ?? null, graham: scoresText(c),
      sizedOn: r2(sizedOn),
      ruleUnits: s.units, units, typedUnits: typed, unitsText: p.unitsText ?? null, underSized: units < s.units, oversized: units > s.units,
      exposure: r2(exposure), weightPct: r2(weightPct), achievedRiskPct: r2(achievedRiskPct),
      stopGap: s.stopGap, stopLevel: s.stopLevel, stopDistance: r2(units * s.stopGap),
      costs: { open: r2(open1), close: r2(open1), roundTrip: r2(roundTrip), roundTripPct: exposure > 0 ? r2((roundTrip / exposure) * 100) : null },
      eur: inputs.eurUsd && units > 0 ? euroLines({ exposure, stopLevel: s.stopLevel, stopGap: s.stopGap, units }, inputs.eurUsd, inputs.spreadPct) : null,
      problems,
      facts, thesis, journal: journalOf(facts, thesis),
      blocked,
    });
  }
  const exposure = rows.reduce((a, r) => a + r.exposure, 0);
  const riskPct = rows.reduce((a, r) => a + r.achievedRiskPct, 0);
  const costOpen = rows.reduce((a, r) => a + r.costs.open, 0);
  const riskWithOpen = account.riskUsedPct + riskPct;
  const roomFor = Math.max(0, instruments - account.openCount);
  const eur = inputs.eurUsd
    ? {
        exposure: r2(rows.reduce((a, r) => a + (r.eur?.value ?? 0), 0)),
        costOpen: r2(rows.reduce((a, r) => a + (r.eur ? r.eur.commission + r.eur.fx : 0), 0)),
        roundTrip: r2(rows.reduce((a, r) => a + (r.eur?.roundTrip ?? 0), 0)),
        stopDistance: r2(rows.reduce((a, r) => a + (r.eur?.stopDistance ?? 0), 0)),
        connectivity: BROKER.connectivityPerExchangePerYear,
      }
    : null;
  if (rows.length > roomFor) notes.push(`The account runs ${instruments} instrument${instruments === 1 ? "" : "s"} and ${account.openCount} ${account.openCount === 1 ? "is" : "are"} open: there is room for ${roomFor}, and the plan has ${rows.length} — only the first ${roomFor} would be raised; the ticket refuses the rest as concentration.`);
  if (riskWithOpen > SIZING.riskTargetPct + SIZING.budgetTolerancePct + 1e-9) notes.push(`Over the risk budget: the open positions carry ${account.riskUsedPct.toFixed(1)}% tonight and the plan adds ${riskPct.toFixed(1)}% — ${riskWithOpen.toFixed(1)}% against the ${SIZING.riskTargetPct}% target (tolerance ${SIZING.budgetTolerancePct} point). The ticket will refuse the row that crosses it.`);
  if (!inputs.eurUsd) notes.push("No exchange rate typed, so the euro columns are blank: enter today's US-dollars-per-euro rate from your broker's screen to see the broker's lines.");
  return {
    asOf, inputs, account: { ...account, instruments }, targetPct, rows,
    totals: {
      exposure: r2(exposure), weightPct: account.value > 0 ? r2((exposure / account.value) * 100) : 0, riskPct: r2(riskPct), costOpen: r2(costOpen),
      cashAfter: r2(account.cash - exposure - costOpen),
      riskWithOpen: r2(riskWithOpen), overBudget: riskWithOpen > SIZING.riskTargetPct + SIZING.budgetTolerancePct + 1e-9,
      openCount: account.openCount, roomFor, overCount: rows.length > roomFor,
      eur,
    },
    connectivity: { perExchangePerYear: BROKER.connectivityPerExchangePerYear, note: `€${BROKER.connectivityPerExchangePerYear.toFixed(2)} a year per exchange you hold on (NYSE and Nasdaq are two), capped at 0.25% of the account — charged once, not per name.` },
    notes,
  };
}

/** The top names for an empty plan: the eligible candidates in rank order, as many as the account has room for. */
export function topPicks(candidates: Candidate[], roomFor: number): PickInput[] {
  return candidates.filter((c) => c.eligible).slice(0, Math.max(0, roomFor)).map((c) => ({ symbol: c.symbol, units: null, thesis: "" }));
}

/** What is saved per account: the inputs and the picks as the user TYPED them (never the computed figures — they are tonight's). */
export type SavedPlan = { inputs: PlanInputs; picks: PickInput[] };

/** Read a saved plan back, re-applying every bound (review N5): a row from an older shape or a hand edit cannot break the page. */
export function parseSavedPlan(body: string | null | undefined): SavedPlan | null {
  if (!body) return null;
  try {
    const v = JSON.parse(body) as { inputs?: Record<string, unknown>; picks?: unknown };
    const i: Record<string, unknown> = v.inputs && typeof v.inputs === "object" ? v.inputs : {};
    const num = (x: unknown, lo: number, hi: number): number | null => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
    const eurUsd = num(i.eurUsd, PLAN_LIMITS.eurUsdMin, PLAN_LIMITS.eurUsdMax);
    const spreadPct = num(i.spreadPct, 0, PLAN_LIMITS.spreadMax) ?? DEFAULT_INPUTS.spreadPct;
    const picks = Array.isArray(v.picks)
      ? (v.picks as unknown[]).filter((p): p is PickInput => !!p && typeof (p as PickInput).symbol === "string").slice(0, PLAN_LIMITS.picksMax).map((p) => ({
          symbol: String(p.symbol).trim().toUpperCase().slice(0, 12),
          units: Number.isInteger(p.units) && (p.units as number) >= 1 && (p.units as number) <= PLAN_LIMITS.unitsMax ? (p.units as number) : null,
          thesis: typeof p.thesis === "string" ? p.thesis.slice(0, JOURNAL_MAX) : "",
        }))
      : [];
    return { inputs: { eurUsd, spreadPct }, picks };
  } catch { return null; }
}

/** The plan as CSV — the computed table, one row per pick; Excel opens it. Quotes and commas escaped the RFC 4180 way. */
export function planCsv(plan: Plan): string {
  const cell = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
    // a typed cell that begins like a formula (=, +, -, @, a tab) is prefixed with an apostrophe, so a spreadsheet
    // shows it as text rather than running it — the thesis is the one free-text column
    const s = /^[=+\-@\t\r]/.test(String(v)) ? `'${String(v)}` : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["rank", "symbol", "name", "band", "rule_long_since", "forecast", "instrument_risk_pct", "graham", "close_usd", "sized_on_usd", "rule_units", "units", "exposure_usd", "weight_pct", "risk_pct", "stop_gap_usd", "stop_level_usd", "stop_distance_usd", "cost_open_usd", "cost_round_trip_usd", "round_trip_pct", "value_eur", "commission_eur", "fx_eur", "spread_eur", "round_trip_eur", "stop_level_eur", "stop_distance_eur", "problems", "facts", "thesis"];
  const lines = plan.rows.map((r) => [
    r.rank, r.symbol, r.name, r.band, r.stateSince, r.forecast, r.instrumentRisk, r.graham, r.close, r.sizedOn, r.ruleUnits, r.units, r.exposure, r.weightPct, r.achievedRiskPct,
    r.stopGap, r.stopLevel, r.stopDistance, r.costs.open, r.costs.roundTrip, r.costs.roundTripPct,
    r.eur?.value, r.eur?.commission, r.eur?.fx, r.eur?.spread, r.eur?.roundTrip, r.eur?.stopLevel, r.eur?.stopDistance,
    r.problems.join(" | "), r.facts, r.thesis,
  ].map(cell).join(","));
  const t = plan.totals;
  const a = plan.account;
  const total = ["", "TOTAL", "", "", "", "", "", "", "", "", "", "", t.exposure, t.weightPct, t.riskPct, "", "", "", t.costOpen, "", "", t.eur?.exposure, "", "", "", t.eur?.roundTrip, "", t.eur?.stopDistance, plan.notes.join(" | "), `as of ${plan.asOf ?? "—"}; the account's value ${a.value}, cash ${a.cash}, ${a.instruments} instruments at ${fmtPct(plan.targetPct)}% each, ${a.openCount} open; USD per EUR ${plan.inputs.eurUsd ?? "not given"}; spread ${plan.inputs.spreadPct}%. Education, not advice.`, ""].map(cell).join(",");
  return [head.join(","), ...lines, total].join("\r\n") + "\r\n";
}
