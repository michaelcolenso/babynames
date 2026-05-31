// One-off backfill: recompute name_diaspora with the per-capita logic by
// running the SAME validated pure function the worker uses
// (computeDiasporaForName), but driving it over the D1 HTTP API instead of the
// Worker runtime. This exists because the live table holds rows computed under
// the old raw-count logic and there is no deploy/secret access in this
// environment to trigger the worker's /compute-diaspora route.
//
// Mirrors the worker's pipeline exactly: load state-year denominators once,
// page through (name, sex) pairs, compute, write to name_diaspora_staging,
// then swap staging onto live in one transaction.
//
// Run: D1_TOKEN=<cf-api-token> npx tsx scripts/repopulate-diaspora.ts
//   add --dry-run to compute + report a sample without writing/swapping.

import {
  computeDiasporaForName,
  type StateCountRow,
  type StateYearTotals,
} from "../apps/ingest-worker/src/diaspora-compute";

const TOKEN = process.env.D1_TOKEN;
const ACCT = process.env.CF_ACCOUNT_ID ?? "4e921a01da1f55b0ddb32bb38a5524ce";
const DB = process.env.D1_DATABASE_ID ?? "fc4741db-1f6d-457c-b4e4-675a4ea3ebc2";
const DRY_RUN = process.argv.includes("--dry-run");
const NAMES_PAGE = 300;

if (!TOKEN) {
  console.error("Set D1_TOKEN to a Cloudflare API token with D1 edit access.");
  process.exit(1);
}

interface QueryResult<T> {
  results: T[];
}

async function q<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = [],
): Promise<T[]> {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCT}/d1/database/${DB}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ sql, params }),
    },
  );
  const body = (await res.json()) as {
    success: boolean;
    errors?: unknown;
    result?: QueryResult<T>[];
  };
  if (!body.success) throw new Error(`D1 query failed: ${JSON.stringify(body.errors)}`);
  return body.result?.[0]?.results ?? [];
}

async function loadStateYearTotals(): Promise<StateYearTotals> {
  const rows = await q<{ state: string; year: number; births: number }>(
    "SELECT state, year, SUM(count) AS births FROM name_states GROUP BY state, year",
  );
  const totals: StateYearTotals = new Map();
  const national = new Map<number, number>();
  for (const r of rows) {
    let byYear = totals.get(r.state);
    if (!byYear) {
      byYear = new Map();
      totals.set(r.state, byYear);
    }
    byYear.set(r.year, r.births);
    national.set(r.year, (national.get(r.year) ?? 0) + r.births);
  }
  // National totals under the "" sentinel key — the LQ national denominator.
  totals.set("", national);
  return totals;
}

interface NameAgg {
  name: string;
  sex: "M" | "F";
  rows: StateCountRow[];
}

// One page of (name, sex) pairs with all their state rows — mirrors the
// worker's fetchStatePage windowing.
async function fetchPage(
  cursor: { name: string; sex: string } | null,
): Promise<NameAgg[]> {
  const filter = cursor ? "WHERE name > ?1 OR (name = ?1 AND sex > ?2)" : "";
  const sql = `
    WITH ordered AS (
      SELECT name, sex FROM name_states
      ${filter}
      GROUP BY name, sex ORDER BY name, sex LIMIT ${NAMES_PAGE}
    )
    SELECT s.name, s.sex, s.year, s.state, s.count
    FROM name_states s JOIN ordered o ON o.name=s.name AND o.sex=s.sex
    ORDER BY s.name, s.sex, s.year, s.state`;
  const rows = await q<{ name: string; sex: "M" | "F"; year: number; state: string; count: number }>(
    sql,
    cursor ? [cursor.name, cursor.sex] : [],
  );
  const grouped = new Map<string, NameAgg>();
  for (const r of rows) {
    const key = r.name + "|" + r.sex;
    let g = grouped.get(key);
    if (!g) {
      g = { name: r.name, sex: r.sex, rows: [] };
      grouped.set(key, g);
    }
    g.rows.push({ year: r.year, state: r.state, count: r.count });
  }
  return [...grouped.values()];
}

async function peakYears(page: NameAgg[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!page.length) return map;
  const lo = page[0]!.name;
  const hi = page[page.length - 1]!.name;
  const rows = await q<{ name: string; sex: string; peak_year: number }>(
    "SELECT name, sex, peak_year FROM names WHERE name >= ?1 AND name <= ?2",
    [lo, hi],
  );
  for (const r of rows) map.set(r.name + "|" + r.sex, r.peak_year);
  return map;
}

async function insertBatch(aggs: NameAgg[], totals: StateYearTotals, peaks: Map<string, number>) {
  const ROWS = 40;
  for (let i = 0; i < aggs.length; i += ROWS) {
    const slice = aggs.slice(i, i + ROWS);
    const values: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const agg of slice) {
      const d = computeDiasporaForName(agg.rows, totals);
      values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      binds.push(
        agg.name,
        agg.name.toLowerCase(),
        agg.sex,
        d.originState,
        d.originYear,
        peaks.get(agg.name + "|" + agg.sex) ?? null,
        JSON.stringify(d.spread),
        JSON.stringify(d.neverAdopted),
        d.totalStates,
        d.diffusionYears,
      );
    }
    await q(
      `INSERT OR REPLACE INTO name_diaspora_staging
        (name, name_lower, sex, origin_state, origin_year, peak_national_year,
         spread_json, never_adopted, total_states, diffusion_years)
       VALUES ${values.join(",")}`,
      binds,
    );
  }
}

async function main() {
  console.log(`Loading state-year denominators...`);
  const totals = await loadStateYearTotals();
  console.log(`  ${totals.size} states.`);

  if (!DRY_RUN) await q("DELETE FROM name_diaspora_staging");

  let cursor: { name: string; sex: string } | null = null;
  let done = 0;
  const sample: Record<string, unknown>[] = [];
  for (;;) {
    const page = await fetchPage(cursor);
    if (!page.length) break;
    const peaks = await peakYears(page);
    if (DRY_RUN) {
      for (const agg of page) {
        if (["Aiden", "Madison", "Harper", "Liam"].includes(agg.name)) {
          const d = computeDiasporaForName(agg.rows, totals);
          sample.push({ name: agg.name, sex: agg.sex, origin: d.originState, year: d.originYear });
        }
      }
    } else {
      await insertBatch(page, totals, peaks);
    }
    done += page.length;
    const last = page[page.length - 1]!;
    cursor = { name: last.name, sex: last.sex };
    if (done % 3000 < NAMES_PAGE) console.log(`  ${done} names...`);
    if (page.length < NAMES_PAGE) break;
  }
  console.log(`Computed ${done} (name, sex) pairs.`);

  if (DRY_RUN) {
    console.log("DRY RUN sample:", JSON.stringify(sample, null, 2));
    return;
  }

  const [{ c: stagingCount }] = await q<{ c: number }>(
    "SELECT COUNT(*) c FROM name_diaspora_staging",
  );
  console.log(`Staging has ${stagingCount} rows. Swapping onto live...`);

  // Same single-transaction swap the worker performs (swapDiasporaStaging).
  await q(`DROP TABLE IF EXISTS name_diaspora_old`);
  await q(`ALTER TABLE name_diaspora RENAME TO name_diaspora_old`);
  await q(`ALTER TABLE name_diaspora_staging RENAME TO name_diaspora`);
  await q(`CREATE TABLE name_diaspora_staging (
    name TEXT NOT NULL, name_lower TEXT NOT NULL,
    sex TEXT NOT NULL CHECK (sex IN ('M','F')),
    origin_state TEXT, origin_year INTEGER, peak_national_year INTEGER,
    spread_json TEXT NOT NULL, never_adopted TEXT NOT NULL,
    total_states INTEGER NOT NULL, diffusion_years INTEGER NOT NULL,
    PRIMARY KEY (name_lower, sex))`);
  await q(`DROP TABLE name_diaspora_old`);
  console.log("Swap complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
