// A D1 stand-in for tests: a real SQLite database behind the slice of the D1
// API the ingest code uses, enforcing the per-statement limits Cloudflare
// documents (https://developers.cloudflare.com/d1/platform/limits/, read
// 2026-10-11):
//
//   - 100 bound parameters per query            (D1_MAX_BOUND_PARAMS)
//   - 100,000 bytes of SQL per statement        (D1_MAX_SQL_BYTES)
//   - 2,000,000 bytes per string or BLOB value  (D1_MAX_VALUE_BYTES)
//
// The docs state the per-query limits "apply to each individual statement
// contained within a batch statement". Local SQLite accepts far more of each, so
// code that only ever ran locally can pass every test and still fail on its
// first production write: the state-ingest chain's 500-variable INSERT did, with
// "D1_ERROR: too many SQL variables at offset 519" (see ingest-d1-limits.test.ts).
//
// Not modelled: the per-invocation query count, the 30 s query duration, and any
// D1-specific SQL restrictions (production blocks some functions, e.g.
// sqlite_version()).

import { readFileSync } from "node:fs";
import path from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { D1_MAX_BOUND_PARAMS } from "../../packages/shared/src/d1-chunk";

export const D1_MAX_SQL_BYTES = 100_000;
export const D1_MAX_VALUE_BYTES = 2_000_000;

// node:sqlite ships in Node 22+ (CI runs 22). Resolve it lazily and skip rather
// than failing the whole `npm test` run on an older Node.
type SqliteStatement = {
  all(...p: never[]): unknown[];
  get(...p: never[]): unknown;
  run(...p: never[]): unknown;
};
export type SqliteDb = { exec(sql: string): void; prepare(sql: string): SqliteStatement };
let DatabaseSync: (new (p: string) => SqliteDb) | null = null;
try {
  ({ DatabaseSync } = require("node:sqlite"));
} catch {
  DatabaseSync = null;
}
export const skip = DatabaseSync ? false : "requires node:sqlite (Node 22+)";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
export const migration = (file: string): string => readFileSync(path.join(REPO, "migrations", file), "utf-8");

/** An in-memory database with the given migrations applied, in order. */
export function openSqlite(migrations: string[]): SqliteDb {
  const sqlite = new DatabaseSync!(":memory:");
  for (const file of migrations) sqlite.exec(migration(file));
  return sqlite;
}

// SQLite numbers variables as it parses: a bare `?` takes one more than the
// highest number so far, `?N` takes N. Returns the highest number (the
// statement's variable count) and the 0-based offset of the first variable
// above `limit` (-1 when there is none), which is the offset D1 reports.
export function scanVariables(sql: string, limit: number): { count: number; offsetOverLimit: number } {
  let next = 0;
  let max = 0;
  let over = -1;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]!;
    if (ch === "'" || ch === '"') {
      // Skip quoted text; a doubled quote is an escaped quote.
      i++;
      while (i < sql.length && !(sql[i] === ch && sql[i + 1] !== ch)) i += sql[i] === ch ? 2 : 1;
      continue;
    }
    if (ch !== "?") continue;
    let j = i + 1;
    while (j < sql.length && sql[j]! >= "0" && sql[j]! <= "9") j++;
    const num = j > i + 1 ? Number(sql.slice(i + 1, j)) : next + 1;
    if (num > next) next = num;
    if (num > max) max = num;
    if (num > limit && over < 0) over = i;
    i = j - 1;
  }
  return { count: max, offsetOverLimit: over };
}

export interface Executed {
  sql: string;
  binds: unknown[];
}

interface Stmt extends Executed {
  bind(...args: unknown[]): Stmt;
  all(): Promise<{ results: unknown[]; success: boolean }>;
  first(column?: string): Promise<unknown>;
  run(): Promise<{ success: boolean }>;
}

export interface D1StandInOptions {
  /** Apply the D1 limits (default true). Off, it behaves like plain local SQLite. */
  enforce?: boolean;
  /** Called with each statement just before it runs; throw to inject a failure. */
  beforeRun?: (e: Executed) => void;
}

const valueBytes = (v: unknown): number =>
  typeof v === "string" ? Buffer.byteLength(v, "utf8") : v instanceof Uint8Array ? v.byteLength : 0;

/**
 * Just enough of the D1 surface for the ingest code: prepare/bind, all, first,
 * run, exec and an atomic batch(). Like the deployed runtime it rejects a
 * statement over the limits above (a batch is rejected before anything in it
 * runs) and a statement whose bound values do not match its placeholders.
 */
export function makeD1(sqlite: SqliteDb, executed: Executed[] = [], opts: D1StandInOptions = {}): D1Database {
  const enforce = opts.enforce ?? true;
  const check = (sql: string, binds: unknown[]): void => {
    if (!enforce) return;
    const { count, offsetOverLimit } = scanVariables(sql, D1_MAX_BOUND_PARAMS);
    if (offsetOverLimit >= 0) {
      throw new Error(`D1_ERROR: too many SQL variables at offset ${offsetOverLimit}: SQLITE_ERROR`);
    }
    if (binds.length !== count) {
      throw new Error(`D1_ERROR: statement has ${count} variables but ${binds.length} values were bound`);
    }
    const sqlBytes = Buffer.byteLength(sql, "utf8");
    if (sqlBytes > D1_MAX_SQL_BYTES) {
      throw new Error(`D1_ERROR: statement too long (${sqlBytes} bytes, limit ${D1_MAX_SQL_BYTES}): SQLITE_TOOBIG`);
    }
    for (const v of binds) {
      const bytes = valueBytes(v);
      if (bytes > D1_MAX_VALUE_BYTES) {
        throw new Error(`D1_ERROR: string or blob too big (${bytes} bytes, limit ${D1_MAX_VALUE_BYTES}): SQLITE_TOOBIG`);
      }
    }
  };
  const run = (sql: string, binds: unknown[]): unknown[] => {
    const e = { sql, binds };
    opts.beforeRun?.(e);
    executed.push(e);
    return sqlite.prepare(sql).all(...(binds as never[]));
  };
  const stmt = (sql: string, binds: unknown[]): Stmt => ({
    sql,
    binds,
    bind: (...args: unknown[]) => stmt(sql, args),
    all: async () => {
      check(sql, binds);
      return { results: run(sql, binds), success: true };
    },
    first: async (column?: string) => {
      check(sql, binds);
      const row = (run(sql, binds)[0] ?? null) as Record<string, unknown> | null;
      return column && row ? row[column] : row;
    },
    run: async () => {
      check(sql, binds);
      run(sql, binds);
      return { success: true };
    },
  });
  const db = {
    prepare: (sql: string) => stmt(sql, []),
    exec: async (sql: string) => {
      check(sql, []);
      opts.beforeRun?.({ sql, binds: [] });
      executed.push({ sql, binds: [] });
      sqlite.exec(sql);
      return { count: 1, duration: 0 };
    },
    batch: async (stmts: Stmt[]) => {
      for (const s of stmts) check(s.sql, s.binds);
      sqlite.exec("BEGIN");
      try {
        const out = [];
        for (const s of stmts) out.push({ results: run(s.sql, s.binds), success: true });
        sqlite.exec("COMMIT");
        return out;
      } catch (err) {
        sqlite.exec("ROLLBACK");
        throw err;
      }
    },
  };
  return db as unknown as D1Database;
}

// Loops rather than Math.max(...spread): a full pipeline run binds hundreds of
// thousands of values, more arguments than a call can take.
export function maxVariables(executed: Executed[]): number {
  let max = 0;
  for (const e of executed) max = Math.max(max, scanVariables(e.sql, D1_MAX_BOUND_PARAMS).count);
  return max;
}

export function maxSqlBytes(executed: Executed[]): number {
  let max = 0;
  for (const e of executed) max = Math.max(max, Buffer.byteLength(e.sql, "utf8"));
  return max;
}

export function maxValueBytes(executed: Executed[]): number {
  let max = 0;
  for (const e of executed) for (const v of e.binds) max = Math.max(max, valueBytes(v));
  return max;
}
