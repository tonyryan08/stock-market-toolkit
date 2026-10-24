/**
 * A tiny in-memory stand-in for the D1 binding, for job tests (review S12).
 * It is NOT SQLite: each test registers the handlers it needs, keyed by a
 * fragment of the SQL, and records every statement that ran. Enough to pin
 * a job's decisions (what it read, what it wrote, in what order) without a
 * database — the SQL itself is exercised against the real local D1 in the
 * sandbox runs recorded in BUILD-LOG.
 */
export type FakeRow = Record<string, unknown>;
export type Handler = (binds: unknown[]) => { results?: FakeRow[]; error?: string } | void;

export class FakeD1 {
  public log: { sql: string; binds: unknown[] }[] = [];
  private handlers: { match: string; fn: Handler }[] = [];

  /** Register what a statement containing `match` answers. Later registrations win. */
  on(match: string, fn: Handler): this { this.handlers.unshift({ match, fn }); return this; }

  ran(match: string): { sql: string; binds: unknown[] }[] { return this.log.filter((l) => l.sql.includes(match)); }

  private exec(sql: string, binds: unknown[]) {
    this.log.push({ sql, binds });
    const h = this.handlers.find((x) => sql.includes(x.match));
    const out = h ? h.fn(binds) : undefined;
    if (out && out.error) throw new Error(out.error);
    return out?.results ?? [];
  }

  prepare(sql: string): D1PreparedStatement {
    const self = this;
    const make = (binds: unknown[]): D1PreparedStatement => ({
      bind: (...b: unknown[]) => make(b),
      first: async <T,>(col?: string) => { const r = self.exec(sql, binds); return (r.length ? (col ? (r[0] as FakeRow)[col] : r[0]) : null) as T; },
      all: async <T,>() => ({ results: self.exec(sql, binds) as T[], success: true, meta: {} }) as unknown as D1Result<T>,
      run: async <T,>() => { self.exec(sql, binds); return { results: [] as T[], success: true, meta: { changes: 1 } } as unknown as D1Result<T>; },
      raw: async () => [] as never,
      // the job passes bound statements to batch(); carry the SQL and binds along
      __sql: sql, __binds: binds,
    }) as unknown as D1PreparedStatement;
    return make([]);
  }

  async batch<T = unknown>(stmts: D1PreparedStatement[]): Promise<D1Result<T>[]> {
    return stmts.map((s) => {
      const x = s as unknown as { __sql: string; __binds: unknown[] };
      this.exec(x.__sql, x.__binds);
      return { results: [] as T[], success: true, meta: {} } as unknown as D1Result<T>;
    });
  }

  dump(): never { throw new Error("not supported"); }
  exec_(): never { throw new Error("not supported"); }
}

export const fakeD1 = () => new FakeD1();
export const asD1 = (f: FakeD1): D1Database => f as unknown as D1Database;
