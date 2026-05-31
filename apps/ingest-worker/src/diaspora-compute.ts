// Diaspora compute: turn raw per-(name, sex, year, state) rows in name_states
// into one summary row per (name, sex) in name_diaspora.
//
// This computes a name's BREAKOUT geography, not its first paperwork. A state
// "adopts" a name the first year it is over-represented there — its share of
// that state's births is at least LQ_TRIGGER times the name's national share
// that year (a location quotient). Origin = the first state to break out;
// among states breaking out in that year the highest location quotient wins
// (ties → alphabetical, for determinism). Diffusion = the order states
// subsequently break out. Holdouts = the 51 states (50 + DC) that never do.
//
// Two guards keep the location quotient meaningful:
//   * NATIONAL_FLOOR — the name's national rate that year must clear a floor
//     before any breakout is recorded. Without it, a name's earliest sparse
//     years (a handful of births against a near-zero national rate) trivially
//     clear any LQ multiple, and the origin collapses onto whichever large
//     state happened to file the paperwork first. The floor requires the name
//     to be nationally non-trivial before we ask *where* it concentrated.
//   * THRESHOLD — a state needs at least this many births that year, matching
//     SSA's own censoring floor, so denominator noise can't trip the trigger.
//
// Why this and not raw count or first-appearance: ranking by raw count (or by
// first appearance, which is nearly the same thing) made origin a proxy for
// state population — California always "originated" every popular name because
// it has the most births and logged each name first. The location quotient
// asks where a name was disproportionately popular, which is what the /name
// map's "ground zero" / "born in" copy actually describes. The trade-off is
// that only names that ever broke out somewhere get an origin; a name that
// stayed nationally diffuse returns a null origin (the UI renders this as
// "never established a geographic foothold"). In practice every one of the 500
// most common names resolves to a real breakout origin.
//
// Runs as a self-re-enqueuing `diaspora-finalize` chain: each message
// processes a bounded number of (name, sex) pages then re-enqueues with a
// cursor, keeping every invocation well under the Worker subrequest cap.
// Writes land in name_diaspora_staging; the terminal message swaps it onto
// live in a single transaction.

import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import { ALL_STATES, type Sex } from "@nv/shared";

export const THRESHOLD = 5; // min state births that year (matches SSA censoring)
// A state breaks out when its per-capita rate is at least this multiple of the
// name's national per-capita rate that year (a location quotient).
export const LQ_TRIGGER = 1.5;
// The name's national rate (per 100k births) must clear this before any state
// can break out — keeps sparse early years from manufacturing a false origin.
export const NATIONAL_FLOOR = 20;
const NAMES_PAGE = 200; // (name, sex) pairs aggregated per DB round
export const DIASPORA_MAX_PAGES = 40; // pages processed per queue message

export interface StateCountRow {
  year: number;
  state: string;
  count: number;
}

// state -> (year -> total births that state-year). Denominators for the
// location quotient, built once from SUM(count) over name_states. A sentinel
// "" key holds the national totals (sum across all states) per year.
export type StateYearTotals = Map<string, Map<number, number>>;

const NATIONAL_KEY = "";

function denomFor(totals: StateYearTotals, state: string, year: number): number {
  return totals.get(state)?.get(year) ?? 0;
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
// directly against hand-built sample rows. `totals` supplies the location-
// quotient denominators (per-state and national births per year).
export function computeDiasporaForName(
  rows: StateCountRow[],
  totals: StateYearTotals,
): DiasporaComputeResult {
  // Group counts by year → (state → count), and track the per-year national
  // total for this name (sum across states), used as the LQ denominator.
  const byYear = new Map<number, Map<string, number>>();
  const nameNationalByYear = new Map<number, number>();
  for (const r of rows) {
    let y = byYear.get(r.year);
    if (!y) {
      y = new Map();
      byYear.set(r.year, y);
    }
    // Defensive: collapse any duplicate (year, state) by summing.
    y.set(r.state, (y.get(r.state) ?? 0) + r.count);
    nameNationalByYear.set(r.year, (nameNationalByYear.get(r.year) ?? 0) + r.count);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);

  // Location quotient for (state, year): the name's share of that state's
  // births divided by its national share that year. >1 means over-represented
  // there. Returns 0 when a denominator is missing so it can never win.
  const lq = (state: string, year: number, count: number): number => {
    const stateDenom = denomFor(totals, state, year);
    const nationalDenom = denomFor(totals, NATIONAL_KEY, year);
    const nameNational = nameNationalByYear.get(year) ?? 0;
    if (stateDenom <= 0 || nationalDenom <= 0 || nameNational <= 0) return 0;
    const stateShare = count / stateDenom;
    const nationalShare = nameNational / nationalDenom;
    return nationalShare > 0 ? stateShare / nationalShare : 0;
  };

  // A (state, year) breaks out when the name is nationally non-trivial that
  // year (national rate clears NATIONAL_FLOOR per 100k), the state reports at
  // least THRESHOLD births, and the location quotient clears LQ_TRIGGER.
  const breaksOut = (state: string, year: number, count: number): boolean => {
    if (count < THRESHOLD) return false;
    const nationalDenom = denomFor(totals, NATIONAL_KEY, year);
    const nameNational = nameNationalByYear.get(year) ?? 0;
    if (nationalDenom <= 0) return false;
    const nationalRate = (nameNational / nationalDenom) * 100_000;
    if (nationalRate < NATIONAL_FLOOR) return false;
    return lq(state, year, count) >= LQ_TRIGGER;
  };

  // Origin: first year any state breaks out. Among states breaking out that
  // year, the highest location quotient wins (ties → alphabetical).
  let originYear: number | null = null;
  let originState: string | null = null;
  for (const year of years) {
    const states = byYear.get(year)!;
    let best: { state: string; lq: number } | null = null;
    for (const [state, count] of states) {
      if (!breaksOut(state, year, count)) continue;
      const q = lq(state, year, count);
      if (!best || q > best.lq || (q === best.lq && state < best.state)) {
        best = { state, lq: q };
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
  // year breaking out.
  const adopted = new Map<string, { year: number; count: number }>();
  for (const year of years) {
    if (year < originYear) continue;
    const states = byYear.get(year)!;
    for (const [state, count] of states) {
      if (!breaksOut(state, year, count)) continue;
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

// Load the location-quotient denominators: total births per (state, year)
// across all names, plus the national total per year under the "" sentinel key
// (the LQ's national-share denominator). One scan; ~5.9k rows (51 states ×
// ~115 years), trivially small to hold in memory and reuse across the chain.
export async function loadStateYearTotals(db: D1Database): Promise<StateYearTotals> {
  const r = await db
    .prepare("SELECT state, year, SUM(count) AS births FROM name_states GROUP BY state, year")
    .all<{ state: string; year: number; births: number }>();
  const totals: StateYearTotals = new Map();
  const national = new Map<number, number>();
  for (const row of r.results ?? []) {
    let byYear = totals.get(row.state);
    if (!byYear) {
      byYear = new Map();
      totals.set(row.state, byYear);
    }
    byYear.set(row.year, row.births);
    national.set(row.year, (national.get(row.year) ?? 0) + row.births);
  }
  totals.set(NATIONAL_KEY, national);
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
