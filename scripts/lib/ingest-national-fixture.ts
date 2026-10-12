// A small national dataset in the shape the SSA yob files produce: sparse yearly
// counts per (name, sex), 1880-2025. Deterministic (integer arithmetic, no
// randomness) so test failures reproduce.
//
// 459 pairs, so finalize's 200-pair pages split it three ways:
//  - Alpha000..049   rising names that start in 2005;
//  - Heavy000..199   a count in every one of the 146 years, 29,200 year rows
//                    between them - several full statements' worth on their own;
//  - Mixed000..199   seven life-cycle shapes (rising, extinct, endangered,
//                    one-year, stable, declining, newcomer), so every status
//                    and the NULL growth_x case occur;
//  - nine names that stress JSON and UTF-8 handling: an apostrophe, a double
//    quote, a backslash, a non-ASCII letter, an emoji, a 60-character name and
//    one name used for both sexes.

import type { ChunkRow, YearTotalRow } from "../../apps/ingest-worker/src/chunks";

export const YM = 1880;
export const YMAX = 2025;

export type Sex = "M" | "F";

export interface NameSeries {
  name: string;
  sex: Sex;
  series: Record<number, number>;
}

const range = (lo: number, hi: number): number[] => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const pad = (i: number): string => String(i).padStart(3, "0");

function alpha(i: number): Record<number, number> {
  const s: Record<number, number> = {};
  for (const y of range(2005, 2025)) s[y] = 50 + (y - 2005) * 40 + i;
  return s;
}

function heavy(i: number): Record<number, number> {
  const s: Record<number, number> = {};
  for (const y of range(YM, YMAX)) s[y] = 5 + ((i * 7 + y) % 300);
  return s;
}

function mixed(i: number): Record<number, number> {
  const s: Record<number, number> = {};
  switch (i % 7) {
    case 0: // rising
      range(2010, 2025).forEach((y, k) => {
        s[y] = 30 + Math.round(30 * 1.25 ** k) + (i % 11);
      });
      break;
    case 1: // extinct: a bell around 1940, nothing after 1990
      for (const y of range(1900, 1990)) s[y] = Math.max(5, 600 - Math.abs(y - 1940) * 11 + (i % 13));
      break;
    case 2: // endangered: 1,000 at the 1960 peak, 80 now
      for (const y of range(1950, 2025)) {
        s[y] = y <= 1960 ? 400 + (y - 1950) * 60 : Math.max(80, Math.round(1000 * 0.93 ** (y - 1960)));
      }
      break;
    case 3: // one-year name
      s[1999] = 5 + (i % 5);
      break;
    case 4: // stable
      for (const y of range(1990, 2025)) s[y] = 100 + ((i + y) % 40);
      break;
    case 5: // declining, but nowhere near endangered
      for (const y of range(2000, 2025)) s[y] = Math.round(500 * 0.95 ** (y - 2000)) + (i % 7);
      break;
    default: // newcomer: nothing before 2018, so no previous-decade total
      for (const y of range(2018, 2025)) s[y] = 20 + (y - 2018) * 15 + (i % 9);
      break;
  }
  return s;
}

function special(): NameSeries[] {
  const years = [1950, 1975, 1990, 2005, 2020, 2025];
  const series = (base: number): Record<number, number> =>
    Object.fromEntries(years.map((y, k) => [y, base + k * 7]));
  const rows: [string, Sex, number][] = [
    ["O'Brien", "F", 50],
    ["Zoë", "F", 60],
    ['Quote"Name', "M", 70],
    ["Back\\slash", "F", 80],
    ["Mary-Ann", "F", 90],
    ["Z\u{1F600}", "M", 100],
    ["Jordan", "F", 110],
    ["Jordan", "M", 120],
    ["L".padEnd(60, "x"), "F", 130],
  ];
  return rows.map(([name, sex, base]) => ({ name, sex, series: series(base) }));
}

export function buildNationalSeries(): NameSeries[] {
  const out: NameSeries[] = [];
  for (let i = 0; i < 50; i++) out.push({ name: `Alpha${pad(i)}`, sex: "F", series: alpha(i) });
  for (let i = 0; i < 200; i++) out.push({ name: `Heavy${pad(i)}`, sex: i % 2 ? "M" : "F", series: heavy(i) });
  for (let i = 0; i < 200; i++) out.push({ name: `Mixed${pad(i)}`, sex: i % 2 ? "M" : "F", series: mixed(i) });
  out.push(...special());
  return out;
}

/** The rows of each yob file, the way runIngest slices them into queue messages. */
export function rowsByYear(all: NameSeries[]): Map<number, ChunkRow[]> {
  const byYear = new Map<number, ChunkRow[]>();
  for (const { name, sex, series } of all) {
    for (const [year, count] of Object.entries(series)) {
      const rows = byYear.get(Number(year)) ?? [];
      rows.push({ name, sex, count });
      byYear.set(Number(year), rows);
    }
  }
  return byYear;
}

export function yearTotalsOf(all: NameSeries[]): YearTotalRow[] {
  const totals = new Map<string, YearTotalRow>();
  for (const { sex, series } of all) {
    for (const [year, count] of Object.entries(series)) {
      const key = `${year}:${sex}`;
      const t = totals.get(key);
      if (t) t.total += count;
      else totals.set(key, { year: Number(year), sex, total: count });
    }
  }
  return [...totals.values()];
}
