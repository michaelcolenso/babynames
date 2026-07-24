#!/usr/bin/env tsx
// Offline builder for name_shadow_matches — replaces the live ORDER BY
// ABS(count - target) query behind /shadow/:name/:year/ (see
// migrations/0019_name_shadow_matches.sql for why).
//
// Every /name/:name/ page links to /shadow/:name/<max_year>/ — the dataset's
// current max year is the only birth year that route is ever actually
// linked with, so that's the only year this precomputes. Re-run this (and
// seed-shadow-matches) after every SSA data refresh, same as
// build-enrichment/seed-enrichment.
//
// Usage:
//   npx tsx scripts/build-shadow-matches.ts             # reads remote D1
//   npx tsx scripts/build-shadow-matches.ts --local      # reads local D1
// Then: npm run seed-shadow-matches (or :local)

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");
const OUT_FILE = path.join(REPO, "data/dist/shadow-matches.sql");

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

function dbName(): string {
  const toml = readFileSync(CONFIG, "utf-8");
  const m = toml.match(/database_name\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`Could not find database_name in ${CONFIG}`);
  return m[1]!;
}

function query<T = Record<string, unknown>>(sql: string): T[] {
  const res = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", dbName(), "--config", CONFIG, "--command", sql, target, "--json"],
    { encoding: "utf-8", cwd: REPO, maxBuffer: 1024 * 1024 * 256 },
  );
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    throw new Error(`query failed: ${sql}`);
  }
  const start = res.stdout.indexOf("[");
  const parsed = JSON.parse(res.stdout.slice(start));
  return (parsed[0]?.results ?? []) as T[];
}

type Sex = "M" | "F";

interface YearRow {
  name: string;
  name_lower: string;
  sex: Sex;
  count: number;
  total_count: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function q(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

// Nearest-count match within one sex bucket (pre-sorted ascending by count),
// excluding excludeNameLower, tie-broken by higher total_count — matches the
// original query's `ORDER BY diff ASC, n.total_count DESC LIMIT 1`.
function findNearest(
  sorted: YearRow[],
  targetCount: number,
  excludeNameLower: string,
): { row: YearRow; diff: number } | null {
  if (!sorted.length) return null;

  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]!.count < targetCount) lo = mid + 1;
    else hi = mid;
  }

  let left = lo - 1;
  let right = lo;
  let best: { row: YearRow; diff: number } | null = null;

  const consider = (row: YearRow) => {
    if (row.name_lower === excludeNameLower) return;
    const diff = Math.abs(row.count - targetCount);
    if (!best || diff < best.diff || (diff === best.diff && row.total_count > best.row.total_count)) {
      best = { row, diff };
    }
  };

  while (left >= 0 || right < sorted.length) {
    const leftDiff = left >= 0 ? Math.abs(sorted[left]!.count - targetCount) : Infinity;
    const rightDiff = right < sorted.length ? Math.abs(sorted[right]!.count - targetCount) : Infinity;
    if (best && Math.min(leftDiff, rightDiff) > best.diff) break;
    if (leftDiff <= rightDiff) {
      if (left >= 0) consider(sorted[left]!);
      left--;
    } else {
      if (right < sorted.length) consider(sorted[right]!);
      right++;
    }
  }

  return best;
}

async function main() {
  const ymRow = query<{ value: string }>("SELECT value FROM meta WHERE key='min_year'")[0];
  const yMRow = query<{ value: string }>("SELECT value FROM meta WHERE key='max_year'")[0];
  const ym = Number(ymRow?.value ?? 1880);
  const yM = Number(yMRow?.value ?? 2024);
  const birthYear = yM;
  const shadowYear = yM - 50;

  console.error(`Building shadow matches for birthYear=${birthYear} shadowYear=${shadowYear} (data spans ${ym}-${yM})`);
  if (shadowYear < ym) {
    throw new Error(`shadowYear ${shadowYear} predates the earliest data (${ym}) — nothing to build.`);
  }

  const inputRows = query<YearRow & { total_count?: number }>(
    `SELECT n.name, n.name_lower, n.sex, ny.count, n.total_count
       FROM names n JOIN name_years ny ON ny.name_id = n.id
      WHERE ny.year = ${birthYear}`,
  );
  const shadowRows = query<YearRow>(
    `SELECT n.name, n.name_lower, n.sex, ny.count, n.total_count
       FROM names n JOIN name_years ny ON ny.name_id = n.id
      WHERE ny.year = ${shadowYear}`,
  );
  console.error(`  ${inputRows.length} names in ${birthYear}, ${shadowRows.length} names in ${shadowYear}`);

  const shadowBySex: Record<Sex, YearRow[]> = { M: [], F: [] };
  for (const row of shadowRows) shadowBySex[row.sex].push(row);
  shadowBySex.M.sort((a, b) => a.count - b.count);
  shadowBySex.F.sort((a, b) => a.count - b.count);

  interface MatchRow {
    name: string;
    nameLower: string;
    sex: Sex;
    inputCount: number;
    shadowName: string;
    shadowNameLower: string;
    shadowSex: Sex;
    shadowCount: number;
    diff: number;
  }

  const matches: MatchRow[] = [];
  for (const input of inputRows) {
    const nearest = findNearest(shadowBySex[input.sex], input.count, input.name_lower);
    if (!nearest) continue;
    matches.push({
      name: input.name,
      nameLower: input.name_lower,
      sex: input.sex,
      inputCount: input.count,
      shadowName: nearest.row.name,
      shadowNameLower: nearest.row.name_lower,
      shadowSex: nearest.row.sex,
      shadowCount: nearest.row.count,
      diff: nearest.diff,
    });
  }
  console.error(`  matched ${matches.length}/${inputRows.length} names`);

  const out: string[] = [
    "-- Generated by scripts/build-shadow-matches.ts — do not edit by hand.",
    `-- birthYear=${birthYear} shadowYear=${shadowYear}`,
    "DELETE FROM name_shadow_matches_staging;",
  ];

  for (const grp of chunk(matches, 50)) {
    const values = grp
      .map(
        (m) =>
          `(${q(m.name)},${q(m.nameLower)},${q(m.sex)},${birthYear},${m.inputCount},` +
          `${q(m.shadowName)},${q(m.shadowNameLower)},${q(m.shadowSex)},${m.shadowCount},${m.diff})`,
      )
      .join(",\n  ");
    out.push(
      "INSERT INTO name_shadow_matches_staging(name,name_lower,sex,year,input_count,shadow_name,shadow_name_lower,shadow_sex,shadow_count,diff) VALUES\n  " +
        values +
        ";",
    );
  }

  // Single-transaction swap, same pattern as name_diaspora's compute chain.
  out.push(
    "DROP TABLE IF EXISTS name_shadow_matches_old;",
    "ALTER TABLE name_shadow_matches RENAME TO name_shadow_matches_old;",
    "ALTER TABLE name_shadow_matches_staging RENAME TO name_shadow_matches;",
    `CREATE TABLE name_shadow_matches_staging (
  name              TEXT NOT NULL,
  name_lower        TEXT NOT NULL,
  sex               TEXT NOT NULL CHECK (sex IN ('M','F')),
  year              INTEGER NOT NULL,
  input_count       INTEGER NOT NULL,
  shadow_name       TEXT NOT NULL,
  shadow_name_lower TEXT NOT NULL,
  shadow_sex        TEXT NOT NULL CHECK (shadow_sex IN ('M','F')),
  shadow_count      INTEGER NOT NULL,
  diff              INTEGER NOT NULL,
  PRIMARY KEY (name_lower, sex)
);`,
    "DROP TABLE name_shadow_matches_old;",
  );

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, out.join("\n") + "\n");
  const rel = path.relative(process.cwd(), OUT_FILE);
  console.error(`\nWrote ${rel}`);
  console.error(`\nApply with: npm run seed-shadow-matches   (remote)  or  npm run seed-shadow-matches:local`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
