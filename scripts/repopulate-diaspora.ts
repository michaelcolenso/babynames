// One-off backfill: recompute name_diaspora with the per-capita breakout logic
// by running the SAME validated pure function the worker uses
// (computeDiasporaForName), but driving it over the D1 HTTP API instead of the
// Worker runtime.
//
// Mirrors the worker's pipeline exactly: load the location-quotient
// denominators once, page through (name, sex) pairs, compute, write to
// name_diaspora_staging, then swap staging onto live in one transaction.
//
// Run: D1_TOKEN=<cf-api-token> npx tsx scripts/repopulate-diaspora.ts
//   add --dry-run to compute + report a sample without writing/swapping.

import {
  computeDiasporaForName,
  STATE_DATA_START_YEAR,
  type StateCountRow,
  type StateYearTotals,
} from "../apps/ingest-worker/src/diaspora-compute";

const TOKEN = process.env.D1_TOKEN;
const ACCT = process.env.CF_ACCOUNT_ID ?? "4e921a01da1f55b0ddb32bb38a5524ce";
const DB = process.env.D1_DATABASE_ID ?? "fc4741db-1f6d-457c-b4e4-675a4ea3ebc2";
const DRY_RUN = process.argv.includes("--dry-run");
const NAMES_PAGE = 300;
const NATIONAL_KEY = "";

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

// Location-quotient denominators: total births per (state, year), plus the
// national total per year under the "" sentinel key. Same result as the
// worker's loadStateYearTotals, but paged by year — the worker does it in one
// GROUP BY (fine on the D1 binding), which times out over the D1 HTTP API.
async function loadTotals(): Promise<StateYearTotals> {
  // Page by year: a single GROUP BY over all of name_states trips D1's
  // storage-operation timeout (error 7429). One bounded query per year.
  const years = await q<{ year: number }>(
    "SELECT DISTINCT year FROM year_totals ORDER BY year",
  );
  const totals: StateYearTotals = new Map();
  const national = new Map<number, number>();
  for (const { year } of years) {
    const rows = await q<{ state: string; births: number }>(
      "SELECT state, SUM(count) AS births FROM name_states WHERE year = ?1 GROUP BY state",
      [year],
    );
    for (const row of rows) {
      let byYear = totals.get(row.state);
      if (!byYear) {
        byYear = new Map();
        totals.set(row.state, byYear);
      }
      byYear.set(year, row.births);
      national.set(year, (national.get(year) ?? 0) + row.births);
    }
  }
  totals.set(NATIONAL_KEY, national);
  return totals;
}

interface NameAgg {
  name: string;
  sex: "M" | "F";
  rows: StateCountRow[];
}

interface NameMeta {
  peakYear: number | null;
  firstYear: number;
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

// National peak + first year per (name, sex). first_year gates the emergence
// rule; peak_year is stored for the UI.
async function nameMeta(page: NameAgg[]): Promise<Map<string, NameMeta>> {
  const map = new Map<string, NameMeta>();
  if (!page.length) return map;
  const lo = page[0]!.name;
  const hi = page[page.length - 1]!.name;
  const rows = await q<{ name: string; sex: string; peak_year: number; first_year: number }>(
    "SELECT name, sex, peak_year, first_year FROM names WHERE name >= ?1 AND name <= ?2",
    [lo, hi],
  );
  for (const r of rows) map.set(r.name + "|" + r.sex, { peakYear: r.peak_year, firstYear: r.first_year });
  return map;
}

async function insertBatch(aggs: NameAgg[], meta: Map<string, NameMeta>, totals: StateYearTotals) {
  // The D1 HTTP API caps bound variables at 100 per request; at 10 columns per
  // row that allows 10 rows, so 9 keeps a safe margin. (The Worker binding used
  // by the production compute chain allows far more — this limit is HTTP-only.)
  const ROWS = 9;
  for (let i = 0; i < aggs.length; i += ROWS) {
    const slice = aggs.slice(i, i + ROWS);
    const values: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const agg of slice) {
      const m = meta.get(agg.name + "|" + agg.sex);
      const firstYear = m?.firstYear ?? STATE_DATA_START_YEAR;
      const d = computeDiasporaForName(agg.rows, totals, firstYear);
      values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      binds.push(
        agg.name,
        agg.name.toLowerCase(),
        agg.sex,
        d.originState,
        d.originYear,
        m?.peakYear ?? null,
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
  const totals = await loadTotals();
  if (!DRY_RUN) await q("DELETE FROM name_diaspora_staging");

  let cursor: { name: string; sex: string } | null = null;
  let done = 0;
  const sample: Record<string, unknown>[] = [];
  for (;;) {
    const page = await fetchPage(cursor);
    if (!page.length) break;
    const meta = await nameMeta(page);
    if (DRY_RUN) {
      for (const agg of page) {
        if (["Aiden", "Madison", "Harper", "Liam", "Mary", "Kehlani"].includes(agg.name)) {
          const m = meta.get(agg.name + "|" + agg.sex);
          const d = computeDiasporaForName(agg.rows, totals, m?.firstYear ?? STATE_DATA_START_YEAR);
          sample.push({ name: agg.name, sex: agg.sex, firstYear: m?.firstYear, origin: d.originState, year: d.originYear, states: d.totalStates });
        }
      }
    } else {
      await insertBatch(page, meta, totals);
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

  // Bump data_version so the edge cache stops serving stale diaspora JSON
  // (the /api/diaspora response is cached for 7 days). Mirrors what the
  // worker's /compute-diaspora route does after its swap.
  await q(
    `UPDATE meta SET value='${crypto.randomUUID()}' WHERE key='data_version'`,
  );
  console.log("Swap complete; data_version bumped.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
