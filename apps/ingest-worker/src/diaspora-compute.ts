// Diaspora compute: turn raw per-(name, sex, year, state) rows in name_states
// into one summary row per (name, sex) in name_diaspora.
//
// Origin = earliest year any state crosses ORIGIN_THRESHOLD births; among the
// states active that year, highest count wins (ties → alphabetical, for
// determinism). Diffusion = the order states subsequently cross THRESHOLD.
// Holdouts = the 51 states (50 + DC) that never do.
//
// Runs as a self-re-enqueuing `diaspora-finalize` chain: each message
// processes a bounded number of (name, sex) pages then re-enqueues with a
// cursor, keeping every invocation well under the Worker subrequest cap.
// Writes land in name_diaspora_staging; the terminal message swaps it onto
// live in a single transaction.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { ALL_STATES, type Sex } from "@nv/shared";

export const THRESHOLD = 5; // min births for a state to count as "adopted"
export const ORIGIN_THRESHOLD = 5; // min births to count as the origin
const NAMES_PAGE = 200; // (name, sex) pairs aggregated per DB round
export const DIASPORA_MAX_PAGES = 40; // pages processed per queue message

export interface StateCountRow {
  year: number;
  state: string;
  count: number;
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
// directly against hand-built sample rows.
export function computeDiasporaForName(rows: StateCountRow[]): DiasporaComputeResult {
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

  // Origin: first year with any state >= ORIGIN_THRESHOLD; pick the highest
  // count that year, tie broken alphabetically.
  let originYear: number | null = null;
  let originState: string | null = null;
  for (const year of years) {
    const states = byYear.get(year)!;
    let best: { state: string; count: number } | null = null;
    for (const [state, count] of states) {
      if (count < ORIGIN_THRESHOLD) continue;
      if (!best || count > best.count || (count === best.count && state < best.state)) {
        best = { state, count };
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
  // year crossing THRESHOLD.
  const adopted = new Map<string, { year: number; count: number }>();
  for (const year of years) {
    if (year < originYear) continue;
    const states = byYear.get(year)!;
    for (const [state, count] of states) {
      if (count < THRESHOLD) continue;
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

// Process up to maxPages of (name, sex) pairs from `cursor`. Returns the next
// cursor, or null when there is no more work.
export async function computeDiasporaChunk(
  db: D1Database,
  cursor: { name: string; sex: Sex } | null,
  maxPages: number,
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
    const stmts = buildDiasporaStatements(db, page, peakYears);
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
): D1PreparedStatement[] {
  const ROWS_PER_STMT = 50;
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < page.length; i += ROWS_PER_STMT) {
    const slice = page.slice(i, i + ROWS_PER_STMT);
    const values: string[] = [];
    const binds: (string | number | null)[] = [];
    for (const agg of slice) {
      const d = computeDiasporaForName(agg.rows);
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
