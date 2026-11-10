import { describe, it, expect } from "vitest";
import { fakeD1, asD1 } from "./fake-d1";
import { runStops, splitMultiplier, ratioName } from "./stops";

const RUN = "2026-11-03T23:00:00.000Z";
const position = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 1, code: "ABCD-2345", symbol: "AAPL", opened_on: "2026-10-29", entry_price: 348.91, units: 18, stop_gap: 31.72,
  high_since: 348.91, stop_level: 317.19, stop_hit_on: null, realign_date: null, tracked_on: null, ...over,
});

describe("runStops — the trailing stop against the nightly closes", () => {
  it("trails the stop up with the high since entry and stamps nothing while the close stays above it", async () => {
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position()] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-03", adj_close: 355.0 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 362.5 }] }));
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s).toMatchObject({ positions: 1, tracked: 1, hits: 0, realigned: 0, errors: 0 });
    const upd = db.ran("UPDATE positions SET")[0].binds;
    expect(upd).toEqual([1, 348.91, 31.72, 362.5, 330.78, null, null, "2026-11-03", 18, 6280.38]);   // stop = 362.5 − 31.72; units unchanged; exposure = 18 × 348.91
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["run_summary"]);
  });
  it("a close at or below the stop stamps stop_hit_on once, with a receipt that says what to do; later nights keep the stamp", async () => {
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ high_since: 362.5, stop_level: 330.78 })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-04", adj_close: 330.78 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 362.5 }] }));
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s.hits).toBe(1);
    expect(db.ran("UPDATE positions SET")[0].binds[5]).toBe("2026-11-04");
    const hit = db.ran("INSERT INTO fetch_log").find((r) => r.binds[2] === "stop_hit")!;
    expect(hit.binds[1]).toBe("AAPL");
    expect(String(hit.binds[4])).toMatch(/close 330.78 on 2026-11-04 is at or below the stop 330.78/);
    expect(String(hit.binds[4])).toMatch(/the rule says close; the student's ticket does it/);
    // the next night: already stamped, the close bounced — the stamp stays
    const db2 = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ high_since: 362.5, stop_level: 330.78, stop_hit_on: "2026-11-04", tracked_on: "2026-11-04" })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-05", adj_close: 340 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 362.5 }] }));
    const s2 = await runStops({ DB: asD1(db2) }, RUN);
    expect(s2.hits).toBe(0);
    expect(db2.ran("UPDATE positions SET")[0].binds[5]).toBe("2026-11-04");
    // and a LATER close through the stop does not re-stamp: the stamp keeps its first date (Phase 3 review F3)
    const db3 = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ high_since: 362.5, stop_level: 330.78, stop_hit_on: "2026-11-04", tracked_on: "2026-11-05" })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-06", adj_close: 320 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 362.5 }] }));
    const s3 = await runStops({ DB: asD1(db3) }, RUN);
    expect(s3.hits).toBe(0);
    expect(db3.ran("UPDATE positions SET")[0].binds[5]).toBe("2026-11-04");
    expect(db3.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["run_summary"]);
  });
  it("re-alignment: when the stored close on the entry date has moved, entry and gap scale by the same factor and realign_date is stamped", async () => {
    // a dividend went ex: the whole earlier series was scaled by 0.99 by the adjuster
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position()] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-10", adj_close: 350 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 345.4209 }] }))   // 348.91 × 0.99
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 358.875 }] }));                    // 362.5 × 0.99
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s.realigned).toBe(1);
    const upd = db.ran("UPDATE positions SET")[0].binds;
    expect(upd[1]).toBeCloseTo(345.42, 2);   // entry
    expect(upd[2]).toBeCloseTo(31.4, 2);     // gap × 0.99 = 31.4028
    expect(upd[3]).toBeCloseTo(358.88, 2);   // high
    expect(upd[4]).toBeCloseTo(327.48, 2);   // stop = 358.88 − 31.40
    expect(upd[6]).toBe("2026-11-10");       // realign_date
    expect(upd[8]).toBe(18);                 // a dividend: the share count stays
    expect(upd[9]).toBeCloseTo(6217.56, 2);  // exposure = 18 × 345.42 — the dividend reaches the ledger as cash (Phase 3 review F1)
    expect(db.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["realigned", "run_summary"]);
    // the next night (review F5): the stored entry is 345.42 to the cent, the series still reads 345.4209 — no re-alignment
    const db2 = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ entry_price: 345.42, stop_gap: 31.4, high_since: 358.88, stop_level: 327.48, realign_date: "2026-11-10", tracked_on: "2026-11-10" })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-11", adj_close: 351 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 345.4209 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 358.875 }] }));
    const s2 = await runStops({ DB: asD1(db2) }, RUN);
    expect(s2.realigned).toBe(0);
    expect(db2.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["run_summary"]);
    expect(db2.ran("UPDATE positions SET")[0].binds[6]).toBe("2026-11-10");   // realign_date untouched
    expect(db2.ran("UPDATE positions SET")[0].binds[9]).toBeCloseTo(6217.56, 2);   // and exposure = units × entry, unchanged
  });
  it("a split after entry multiplies the share count (review F6): 2-for-1 from the splits table, and a round ratio for the core tier", async () => {
    const split = (known: boolean) => fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position()] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-10", adj_close: 176 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 174.455 }] }))        // 348.91 ÷ 2
      .on("FROM splits WHERE symbol", () => ({ results: known ? [{ date: "2026-11-05", factor: 2 }] : [] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 181.25 }] }));                         // 362.5 ÷ 2
    for (const known of [true, false]) {
      const db = split(known);
      const s = await runStops({ DB: asD1(db) }, RUN);
      expect(s).toMatchObject({ realigned: 1, splits: 1, hits: 0 });
      const upd = db.ran("UPDATE positions SET")[0].binds;
      expect(upd[1]).toBeCloseTo(174.46, 2);   // entry
      expect(upd[2]).toBeCloseTo(15.86, 2);    // gap ÷ 2
      expect(upd[8]).toBe(36);                 // 18 shares → 36
      expect(upd[9]).toBeCloseTo(6280.56, 2);  // exposure = 36 × 174.46 — a split leaves units × entry where it was (18 × 348.91 = 6,280.38, to the rounding)
      expect(upd[4]).toBeCloseTo(165.39, 2);   // stop = 181.25 − 15.86
      const receipts = db.ran("INSERT INTO fetch_log").map((r) => r.binds[2]);
      expect(receipts).toEqual(["split_realigned", "realigned", "run_summary"]);
      expect(String(db.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(known ? /the splits table: 2 on 2026-11-05/ : /a ratio in the provider/);
      expect(String(db.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/18 shares → 36/);
    }
    // a 1% dividend is not a split; a reverse 1-for-4 (×4.0) is
    expect(splitMultiplier(0.99, [])).toBeNull();
    expect(splitMultiplier(0.5, [])).toBe(2);
    expect(splitMultiplier(0.3334, [])).toBe(3);
    expect(splitMultiplier(4.01, [])).toBe(0.25);
    // Phase 3 review F2: p-for-q ratios are splits too; a move the tracker cannot name is "unknown", never a silent re-alignment
    expect(splitMultiplier(2 / 3, [])).toBe(1.5);                // 3-for-2
    expect(splitMultiplier(0.75, [])).toBeCloseTo(4 / 3, 9);     // 4-for-3
    expect(splitMultiplier(0.8, [])).toBe(1.25);                 // 5-for-4
    expect(splitMultiplier(1.5, [])).toBeCloseTo(2 / 3, 9);      // 2-for-3 reverse
    expect(splitMultiplier(0.7, [])).toBe("unknown");
    expect(splitMultiplier(0.55, [])).toBe("unknown");
    expect(splitMultiplier(0.7, [{ date: "2026-11-05", factor: 1 }])).toBe(1);   // factor 1: "news, not a split" — re-align, keep the shares
  });
  it("a 3-for-2 in the core tier multiplies the shares by 3/2; an unexplained ×0.7 leaves the position untouched with a split_unknown receipt, and a table row clears it (Phase 3 review F2)", async () => {
    const night = (entryNow: number, known: { date: string; factor: number }[]) => fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position()] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-10", adj_close: entryNow * 1.01 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: entryNow }] }))
      .on("FROM splits WHERE symbol", () => ({ results: known }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: entryNow * 1.04 }] }));
    const three = night(348.91 * 2 / 3, []);
    const s = await runStops({ DB: asD1(three) }, RUN);
    expect(s).toMatchObject({ realigned: 1, splits: 1, unknown: 0, tracked: 1 });
    expect(three.ran("UPDATE positions SET")[0].binds[8]).toBe(27);                                    // 18 × 3/2
    expect(String(three.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/a 3-for-2 split after entry .*: 18 shares → 27, entry/);
    // 11 shares in a 3-for-2 are 16½: whole shares only — 16, and the half share's value is cash in lieu (the exposure is 16 × the new entry)
    const eleven = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ units: 11 })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-10", adj_close: 235 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 * 2 / 3 }] }))
      .on("FROM splits WHERE symbol", () => ({ results: [] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 240 }] }));
    await runStops({ DB: asD1(eleven) }, RUN);
    const u = eleven.ran("UPDATE positions SET")[0].binds;
    expect(u[8]).toBe(16);
    expect(u[9]).toBeCloseTo(16 * 232.61, 2);                                                         // 3,721.76: the ½ share's 116.31 is in cash
    expect(String(eleven.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/11 shares → 16 \(the 0\.5 of a share is cash in lieu\)/);
    expect([ratioName(2), ratioName(0.25), ratioName(1.5), ratioName(2 / 3), ratioName(1.25)]).toEqual(["2-for-1", "1-for-4", "3-for-2", "2-for-3", "5-for-4"]);
    const odd = night(348.91 * 0.7, []);
    const s2 = await runStops({ DB: asD1(odd) }, RUN);
    expect(s2).toMatchObject({ realigned: 0, splits: 0, unknown: 1, tracked: 0 });
    expect(odd.ran("UPDATE positions SET")).toHaveLength(0);                                           // untouched tonight
    expect(odd.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["split_unknown", "run_summary"]);
    expect(String(odd.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/moved ×0\.700000 — not a dividend-sized move and not a ratio the tracker knows .* Add a splits row: the share multiplier for a split, or factor 1 for a cash event/);
    const settled = night(348.91 * 0.7, [{ date: "2026-11-05", factor: 1 }]);                        // the tutor's row: news, not a split
    const s3 = await runStops({ DB: asD1(settled) }, RUN);
    expect(s3).toMatchObject({ realigned: 1, splits: 0, unknown: 0, tracked: 1 });
    expect(settled.ran("UPDATE positions SET")[0].binds[8]).toBe(18);                                  // shares unchanged, entry re-aligned
    expect(settled.ran("INSERT INTO fetch_log").map((r) => r.binds[2])).toEqual(["realigned", "run_summary"]);   // no split receipt for a factor-1 row
    expect(String(settled.ran("INSERT INTO fetch_log")[0].binds[4])).toMatch(/re-aligned \(×0\.700000, settled by the splits table — factor 1 on 2026-11-05: a cash event, the shares stay\)/);
  });
  it("a catch-up night with two closes walks them in order and stamps the FIRST at or below the stop (review N6)", async () => {
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ high_since: 362.5, stop_level: 330.78, tracked_on: "2026-11-03" })] }))
      .on("ORDER BY date DESC LIMIT 1", () => ({ results: [{ date: "2026-11-05", adj_close: 345 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("date > ?2 ORDER BY date ASC", () => ({ results: [{ date: "2026-11-04", adj_close: 329 }, { date: "2026-11-05", adj_close: 345 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 362.5 }] }));
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s.hits).toBe(1);
    const upd = db.ran("UPDATE positions SET")[0].binds;
    expect(upd[5]).toBe("2026-11-04");       // the first close through the stop, not the newest
    expect(upd[7]).toBe("2026-11-05");       // tracked to the newest
    expect(upd[3]).toBe(362.5);              // the high is unchanged by the dip
  });
  it("nothing new since last night → counted as tracked, no write; no close stored → skipped with a receipt", async () => {
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ tracked_on: "2026-11-03" }), position({ id: 2, symbol: "ZZZ" })] }))
      .on("ORDER BY date DESC LIMIT 1", (b) => ({ results: b[0] === "AAPL" ? [{ date: "2026-11-03", adj_close: 355 }] : [] }));
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s).toMatchObject({ positions: 2, tracked: 1, hits: 0 });
    expect(db.ran("UPDATE positions SET").length).toBe(0);
    expect(db.ran("INSERT INTO fetch_log").map((r) => [r.binds[1], r.binds[2]])).toEqual([["ZZZ", "stops_skipped"], [null, "run_summary"]]);
  });
  it("every position is on its own: a throwing read leaves a stops_error receipt and the others are tracked", async () => {
    const db = fakeD1()
      .on("FROM positions WHERE status = 'open'", () => ({ results: [position({ id: 1, symbol: "BAD" }), position({ id: 2, symbol: "AAPL" })] }))
      .on("ORDER BY date DESC LIMIT 1", (b) => (b[0] === "BAD" ? { error: "D1_ERROR: boom" } : { results: [{ date: "2026-11-03", adj_close: 355 }] }))
      .on("WHERE symbol = ?1 AND date = ?2", () => ({ results: [{ adj_close: 348.91 }] }))
      .on("SELECT MAX(adj_close)", () => ({ results: [{ high: 355 }] }));
    const s = await runStops({ DB: asD1(db) }, RUN);
    expect(s).toMatchObject({ positions: 2, tracked: 1, errors: 1 });
    expect(db.ran("INSERT INTO fetch_log").map((r) => [r.binds[1], r.binds[2]])).toEqual([["BAD", "stops_error"], [null, "run_summary"]]);
    const summary = JSON.parse(String(db.ran("INSERT INTO fetch_log").at(-1)!.binds[4]));
    expect(summary).toMatchObject({ phase: "stops", positions: 2, tracked: 1, errors: 1 });
  });
});
