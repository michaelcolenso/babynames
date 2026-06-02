// Batched `IN (...)` query helper for D1.
//
// D1 enforces a per-statement bound-variable ceiling on the deployed runtime
// that is far lower than SQLite's native 999 limit (~100). A single
// `... IN (?, ?, ...)` list built with one placeholder per item works in local
// dev (999 limit) but throws `too many SQL variables` in production once the
// list grows. Always route variable-length IN lists through this helper.

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
