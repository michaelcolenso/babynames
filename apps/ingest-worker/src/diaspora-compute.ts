// Diaspora compute: turn raw per-(name, sex, year, state) rows in name_states
// into one summary row per (name, sex) in name_diaspora.
//
// Adoption is measured PER CAPITA, not by raw count. A state "adopts" a name
// the first year its share of that state's births crosses RATE_THRESHOLD (per
// 100k same-year births in the state), subject to a small raw-count floor so a
// single censored row can't register. Origin = earliest adopting state; among
// states adopting in that year the highest per-capita rate wins (ties →
// alphabetical, for determinism). Diffusion = the order states subsequently
// adopt. Holdouts = the 51 states (50 + DC) that never do.
//
// Why per capita: ranking by raw count made origin/adoption order a proxy for
// state population — California, Texas, and New York always "originated" every
// name and adopted first simply because they have the most births. Normalizing
// by each state's annual births surfaces where a name was genuinely
// concentrated, which is what a diffusion map is supposed to show.
//
// Runs as a self-re-enqueuing `diaspora-finalize` chain: each message
// processes a bounded number of (name, sex) pages then re-enqueues with a
// cursor, keeping every invocation well under the Worker subrequest cap.
// Writes land in name_diaspora_staging; the terminal message swaps it onto
// live in a single transaction.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { ALL_STATES, type Sex } from "@nv/shared";

// Per-capita adoption threshold, expressed per 100k of the state's same-year
// births. 100/100k = 0.1% of a state's babies. This sits near the censoring
// floor for the smallest states (a reported count of 5 against ~5k annual
// births is ~100/100k), so small states register as soon as they report a
// name at all, while large states must show proportional uptake — the whole
// point of the normalization.
export const RATE_THRESHOLD = 100;
// Raw-count floor: ignore a state-year below this so a single near-censored
// row can't trip the rate threshold in a tiny state. SSA already censors
// counts below 5, so this mainly guards against denominator noise.
export const MIN_BIRTHS = 5;
const NAMES_PAGE = 200; // (name, sex) pairs aggregated per DB round
export const DIASPORA_MAX_PAGES = 40; // pages processed per queue message

export interface StateCountRow {
  year: number;
  state: string;
  count: number;
}

// state -> (year -> total births that state-year). Denominators for the
// per-capita rate, built once from SUM(count) over name_states.
export type StateYearTotals = Map<string, Map<number, number>>;

// Per-capita rate in units of "per 100k state births", or null when the
// denominator is missing/zero or the raw count is below the floor.
function rate(
  totals: StateYearTotals,
  state: string,
  year: number,
  count: number,
): number | null {
  if (count < MIN_BIRTHS) return null;
  const denom = totals.get(state)?.get(year);
  if (!denom || denom <= 0) return null;
  return (count / denom) * 100_000;
}

export interface DiasporaComputeResult {
  originState: string | null;
  originYear: number | null;
  spread: { state: string; year: number; count: number }[];
  neverAdopted: string[];
  totalStates: number;
  diffusionYears: number;
}

// Pure core — no D1. Exported so the diffusion rules can be unit-tested
// directly against hand-built sample rows. `totals` supplies the per-capita
// denominators (state-year total births); adoption and origin are ranked by
// rate, not raw count.
export function computeDiasporaForName(
  rows: StateCountRow[],
  totals: StateYearTotals,
): DiasporaComputeResult {
  // Group counts by year → (state → count), and track the earliest qualifying year.
  const byYear = new Map<number, Map<string, number>>();
  for (const r of rows) {
    let y = byYear.get(r.year);
    if (!y) {
      y = new Map();
      byYear.set(r.year, y);
    }
    // Defensive: collapse any duplicate (year, state) by summing.
    y.set(r.state, (y.get(r.state) ?? 0) + r.count);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);

  // Origin: first year with any state crossing RATE_THRESHOLD per capita; pick
  // the highest rate that year, tie broken alphabetically.
  let originYear: number | null = null;
  let originState: string | null = null;
  for (const year of years) {
    const states = byYear.get(year)!;
    let best: { state: string; rate: number } | null = null;
    for (const [state, count] of states) {
      const r = rate(totals, state, year, count);
      if (r === null || r < RATE_THRESHOLD) continue;
      if (!best || r > best.rate || (r === best.rate && state < best.state)) {
        best = { state, rate: r };
      }
    }
    if (best) {
      originYear = year;
      originState = best.state;
      break;
    }
  }

  if (originState === null || originYear === null) {
    return {
      originState: null,
      originYear: null,
      spread: [],
      neverAdopted: [...ALL_STATES],
      totalStates: 0,
      diffusionYears: 0,
    };
  }

  // Diffusion: walk years from origin onward, recording each state's first
  // year crossing RATE_THRESHOLD per capita.
  const adopted = new Map<string, { year: number; count: number }>();
  for (const year of years) {
    if (year < originYear) continue;
    const states = byYear.get(year)!;
    for (const [state, count] of states) {
      const r = rate(totals, state, year, count);
      if (r === null || r < RATE_THRESHOLD) continue;
      if (adopted.has(state)) continue;
      adopted.set(state, { year, count });
    }
  }

  const spread = [...adopted.entries()]
    .map(([state, v]) => ({ state, year: v.year, count: v.count }))
    .sort((a, b) => a.year - b.year || a.state.localeCompare(b.state));

  const adoptedStates = new Set(adopted.keys());
  const neverAdopted = ALL_STATES.filter((s) => !adoptedStates.has(s));
  const lastYear = spread.length ? spread[spread.length - 1]!.year : originYear;

  return {
    originState,
    originYear,
    spread,
    neverAdopted,
    totalStates: adopted.size,
    diffusionYears: lastYear - originYear,
  };
}

interface NameAgg {
  name: string;
  sex: Sex;
  rows: StateCountRow[];
}

export async function clearDiasporaStaging(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM name_diaspora_staging").run();
}

// Load the per-capita denominators: total births per (state, year) across all
// names. One scan; ~5.9k rows (51 states × ~115 years), trivially small to
// hold in memory and reuse across every page of the compute chain.
export async function loadStateYearTotals(db: D1Database): Promise<StateYearTotals> {
  const r = await db
    .prepare("SELECT state, year, SUM(count) AS births FROM name_states GROUP BY state, year")
    .all<{ state: string; year: number; births: number }>();
  const totals: StateYearTotals = new Map();
  for (const row of r.results ?? []) {
    let byYear = totals.get(row.state);
    if (!byYear) {
      byYear = new Map();
      totals.set(row.state, byYear);
    }
    byYear.set(row.year, row.births);
  }
  return totals;
}

// Process up to maxPages of (name, sex) pairs from `cursor`. Returns the next
// cursor, or null when there is no more work. `totals` is loaded once by the
// caller and reused across the whole chain.
export async function computeDiasporaChunk(
  db: D1Database,
  cursor: { name: string; sex: Sex } | null,
  maxPages: number,
  totals: StateYearTotals,
): Promise<{ nextCursor: { name: string; sex: Sex } | null; namesDone: number }> {
  let cur = cursor;
  let namesDone = 0;

  for (let p = 0; p < maxPages; p++) {
    const page = await fetchStatePage(db, cur, NAMES_PAGE);
    if (!page.length) {
      cur = null;
      break;
    }
    const peakYears = await fetchPeakYears(db, page);
    const stmts = buildDiasporaStatements(db, page, peakYears, totals);
    if (stmts.length) await db.batch(stmts);
    namesDone += page.length;
    const last = page[page.length - 1]!;
    cur = { name: last.name, sex: last.sex };
    if (page.length < NAMES_PAGE) {
      cur = null; // last (partial) page
      break;
    }
  }

  return { nextCursor: cur, namesDone };
}

async function fetchStatePage(
  db: D1Database,
  cursor: { name: string; sex: Sex } | null,
  limit: number,
): Promise<NameAgg[]> {
  const filter = cursor ? `WHERE name > ?1 OR (name = ?1 AND sex > ?2)` : "";
  const sql = `
    WITH ordered AS (
      SELECT name, sex
        FROM name_states
        ${filter}
       GROUP BY name, sex
       ORDER BY name, sex
       LIMIT ${limit}
    )
    SELECT s.name, s.sex, s.year, s.state, s.count
      FROM name_states s
      JOIN ordered o ON o.name = s.name AND o.sex = s.sex
     ORDER BY s.name, s.sex, s.year, s.state
  `;
  const stmt = cursor ? db.prepare(sql).bind(cursor.name, cursor.sex) : db.prepare(sql);
  const r = await stmt.all<{ name: string; sex: Sex; year: number; state: string; count: number }>();

  const grouped = new Map<string, NameAgg>();
  for (const row of r.results ?? []) {
    const key = row.name + "|" + row.sex;
    let g = grouped.get(key);
    if (!g) {
      g = { name: row.name, sex: row.sex, rows: [] };
      grouped.set(key, g);
    }
    g.rows.push({ year: row.year, state: row.state, count: row.count });
  }
  return [...grouped.values()];
}

// Pull national peak years for the page in one range scan keyed on name.
async function fetchPeakYears(db: D1Database, page: NameAgg[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!page.length) return map;
  const names = page.map((p) => p.name);
  const lo = names[0]!;
  const hi = names[names.length - 1]!;
  const r = await db
    .prepare(`SELECT name, sex, peak_year FROM names WHERE name >= ?1 AND name <= ?2`)
    .bind(lo, hi)
    .all<{ name: string; sex: Sex; peak_year: number }>();
  for (const row of r.results ?? []) {
    map.set(row.name + "|" + row.sex, row.peak_year);
  }
  return map;
}

function buildDiasporaStatements(
  db: D1Database,
  page: NameAgg[],
  peakYears: Map<string, number>,
  totals: StateYearTotals,
): D1PreparedStatement[] {
  const ROWS_PER_STMT = 50;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < page.length; i += ROWS_PER_STMT) {
    const slice = page.slice(i, i + ROWS_PER_STMT);
    const values: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const agg of slice) {
      const d = computeDiasporaForName(agg.rows, totals);
      const peak = peakYears.get(agg.name + "|" + agg.sex) ?? null;
      values.push("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
      binds.push(
        agg.name,
        agg.name.toLowerCase(),
        agg.sex,
        d.originState,
        d.originYear,
        peak,
        JSON.stringify(d.spread),
        JSON.stringify(d.neverAdopted),
        d.totalStates,
        d.diffusionYears,
      );
    }
    if (!values.length) continue;
    const sql =
      `INSERT OR REPLACE INTO name_diaspora_staging
         (name, name_lower, sex, origin_state, origin_year, peak_national_year,
          spread_json, never_adopted, total_states, diffusion_years)
       VALUES ${values.join(",")}`;
    stmts.push(db.prepare(sql).bind(...binds));
  }
  return stmts;
}

// Single-transaction swap of staging onto live, mirroring the national swap.
export async function swapDiasporaStaging(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare("DROP TABLE IF EXISTS name_diaspora_old"),
    db.prepare("ALTER TABLE name_diaspora RENAME TO name_diaspora_old"),
    db.prepare("ALTER TABLE name_diaspora_staging RENAME TO name_diaspora"),
    db.prepare(`CREATE TABLE name_diaspora_staging (
      name TEXT NOT NULL, name_lower TEXT NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('M','F')),
      origin_state TEXT, origin_year INTEGER, peak_national_year INTEGER,
      spread_json TEXT NOT NULL, never_adopted TEXT NOT NULL,
      total_states INTEGER NOT NULL, diffusion_years INTEGER NOT NULL,
      PRIMARY KEY (name_lower, sex))`),
    db.prepare("DROP TABLE name_diaspora_old"),
  ]);
}
