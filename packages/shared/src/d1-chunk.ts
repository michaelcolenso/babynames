// Bound-variable limits and batched `IN (...)` queries for D1.
//
// D1 enforces a per-statement bound-variable ceiling on the deployed runtime
// that is far lower than SQLite's native 999 limit (~100). A single
// `... IN (?, ?, ...)` list built with one placeholder per item works in local
// dev (999 limit) but throws `too many SQL variables` in production once the
// list grows. Always route variable-length IN lists through this helper, and
// size multi-row INSERTs with `rowsPerStatement`.

/**
 * The most bound variables one D1 statement may carry. Measured on the deployed
 * Worker, not assumed: its 500-variable diaspora INSERT failed with
 * `D1_ERROR: too many SQL variables at offset 519`, and offset 519 is the 101st
 * placeholder in that statement, so placeholders 1..100 parse and the 101st does
 * not. Local SQLite accepts far more, which is how a statement can pass every
 * local test and still fail on its first write in production.
 */
export const D1_MAX_BOUND_PARAMS = 100;

/**
 * How many rows a multi-row `INSERT ... VALUES (?, ?, ...), (?, ?, ...)` may
 * carry without exceeding D1's bound-variable ceiling. `columns` is the number
 * of `?` each row contributes. Throws when a single row alone is over the limit.
 */
export function rowsPerStatement(columns: number): number {
  if (!Number.isInteger(columns) || columns < 1) {
    throw new RangeError(`rowsPerStatement: columns must be a positive integer, got ${columns}`);
  }
  const rows = Math.floor(D1_MAX_BOUND_PARAMS / columns);
  if (rows < 1) {
    throw new RangeError(
      `rowsPerStatement: a row of ${columns} columns exceeds D1's ${D1_MAX_BOUND_PARAMS}-variable limit`,
    );
  }
  return rows;
}

/**
 * Run a query whose only variable-length part is an `IN (...)` list, batching
 * `items` so each statement stays under D1's bound-variable ceiling. Results
 * from every batch are concatenated in order.
 *
 * @param build  Returns the SQL given the comma-joined `?` placeholders for one batch.
 * @param opts.chunk        Items per statement (default 90 — safely under the ~100 ceiling).
 * @param opts.prefixBinds  Values bound before the batch items in every statement
 *                          (e.g. a leading `WHERE sex = ?`).
 */
export async function chunkedIn<T>(
  db: D1Database,
  items: readonly unknown[],
  build: (placeholders: string) => string,
  opts?: { chunk?: number; prefixBinds?: unknown[] },
): Promise<T[]> {
  const chunk = opts?.chunk ?? 90;
  const prefix = opts?.prefixBinds ?? [];
  const out: T[] = [];
  for (let i = 0; i < items.length; i += chunk) {
    const batch = items.slice(i, i + chunk);
    const placeholders = batch.map(() => "?").join(",");
    const { results } = await db
      .prepare(build(placeholders))
      .bind(...prefix, ...batch)
      .all<T>();
    if (results) out.push(...results);
  }
  return out;
}
