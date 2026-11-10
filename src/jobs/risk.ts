/**
 * Week 9: the nightly risk report. D1 only — no provider calls, no ration.
 *
 * After the signal pass and the stop tracker in the 23:00 UTC invocation, for
 * every enrolled student: mark the account to the latest closes, carry the
 * high-water mark forward, compute the drawdown, the risk the open positions
 * carry against the budget, the nearest stop and the flags, and write one row
 * to risk_reports (code, date). The page reads the latest row and the last
 * nights; the same arithmetic (src/lib/risk.ts) serves the page on request,
 * so what a student sees at 23:05 and what the job wrote agree.
 *
 * Every student is on their own (the signal pass's lesson): a fault leaves a
 * `risk_error` receipt and the others are written.
 */
import { buildReport, markToMarket, summarizeReport, type Latest } from "../lib/risk";
import type { PositionRow, SignalFact, Student, TicketRow } from "../lib/tickets";

type Env = { DB: D1Database };

export type RiskSummary = { phase: "risk"; students: number; written: number; flagged: number; errors: number; ms: number };

const RECEIPT_CHARS = 300;
const RECEIPT_SUMMARY_CHARS = 1500;

export async function runRisk(env: Env, runAt: string): Promise<RiskSummary> {
  const started = Date.now();
  const summary: RiskSummary = { phase: "risk", students: 0, written: 0, flagged: 0, errors: 0, ms: 0 };
  const log = async (symbol: string | null, outcome: string, rows: number, detail: string) => {
    try {
      await env.DB.prepare("INSERT INTO fetch_log (run_at, symbol, outcome, rows_written, detail) VALUES (?1, ?2, ?3, ?4, ?5)")
        .bind(runAt, symbol, outcome, rows, detail.slice(0, outcome === "run_summary" ? RECEIPT_SUMMARY_CHARS : RECEIPT_CHARS)).run();
    } catch { /* write limit — nothing left to do */ }
  };

  let students: Student[] = [];
  let nightDate: string | null = null;
  try {
    students = (await env.DB.prepare("SELECT code, name, capital, instruments FROM students ORDER BY code").all<Student>()).results;
    nightDate = (await env.DB.prepare("SELECT MAX(date) AS d FROM signals").first<{ d: string | null }>())?.d ?? null;
  } catch (err) {
    summary.errors++;
    await log(null, "risk_error", 0, `could not read the students: ${String((err as Error).message ?? err).slice(0, 200)}`);
    summary.ms = Date.now() - started;
    await log(null, "run_summary", 0, JSON.stringify(summary));
    return summary;
  }
  summary.students = students.length;
  if (!nightDate) {
    await log(null, "risk_skipped", 0, "no signal rows yet — nothing to mark the accounts to");
    summary.ms = Date.now() - started;
    await log(null, "run_summary", 0, JSON.stringify(summary));
    return summary;
  }

  for (const s of students) {
    try {
      const positions = (await env.DB.prepare("SELECT * FROM positions WHERE code = ?1 ORDER BY id").bind(s.code).all<PositionRow>()).results;
      const tickets = (await env.DB.prepare("SELECT * FROM tickets WHERE code = ?1 ORDER BY id").bind(s.code).all<TicketRow>()).results;
      const latest: Latest = {};
      for (const sym of [...new Set(positions.filter((p) => p.status === "open").map((p) => p.symbol))]) {
        const sig = await env.DB.prepare("SELECT date, close, instrument_risk, state, state_since, days, quarantined FROM signals WHERE symbol = ?1 ORDER BY date DESC LIMIT 1").bind(sym).first<SignalFact>();
        if (sig) latest[sym] = sig;
      }
      const prev = await env.DB.prepare("SELECT hwm FROM risk_reports WHERE code = ?1 ORDER BY date DESC LIMIT 1").bind(s.code).first<{ hwm: number }>();
      const marked = markToMarket(s, positions, tickets, latest);
      // The row is the NIGHT's (review F2): keyed on the latest close the toolkit holds for any instrument, so a
      // student whose only position lags (a small cap between visits, a holiday) still gets tonight's row and
      // yesterday's stands. The reading names a position valued at an older close.
      const report = buildReport(s, marked, prev?.hwm ?? null, nightDate);
      await env.DB.prepare(
        `INSERT OR REPLACE INTO risk_reports (code, date, account_value, cash, market_value, open_pnl, realised_pnl, hwm, drawdown_pct, risk_used_pct, risk_target_pct, instruments, open_positions, nearest_stop_pct, stop_hits, flags, computed_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)`,
      ).bind(report.code, report.date, report.accountValue, report.cash, report.marketValue, report.openPnl, report.realisedPnl, report.hwm, report.drawdownPct, report.riskUsedPct, report.riskTargetPct, report.instruments, report.openPositions, report.nearestStopPct, report.stopHits, JSON.stringify(report.flags), runAt).run();
      summary.written++;
      if (report.flags.length) { summary.flagged++; await log(null, "risk_flag", 1, summarizeReport(report)); }
    } catch (err) {
      summary.errors++;
      await log(null, "risk_error", 0, `${s.code}: ${String((err as Error).message ?? err).slice(0, 200)}`);
    }
  }

  summary.ms = Date.now() - started;
  await log(null, "run_summary", summary.written, JSON.stringify(summary));
  return summary;
}
