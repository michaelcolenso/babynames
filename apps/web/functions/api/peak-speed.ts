// GET /api/peak-speed
// For each name with peak_year > first_year, how many years did it take to reach its peak?
// Grouped by debut decade — reveals the acceleration of the naming fashion cycle.
// A name that debuted in 1900 took ~30 years to peak; one debuting in 2000 took ~5.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface PeakSpeedName {
  name: string;
  sex: "M" | "F";
  firstYear: number;
  peakYear: number;
  peakCount: number;
  totalCount: number;
  yearsToPeak: number;
  debutDecade: number;
}

interface PeakSpeedResponse {
  ym: number;
  yM: number;
  names: PeakSpeedName[];
  // Aggregate stats per decade for trend line
  decades: {
    decade: number;
    medianYearsToPeak: number;
    meanYearsToPeak: number;
    count: number;
    sex: "M" | "F";
  }[];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2 : (sorted[mid] ?? 0);
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const rows = await ctx.env.DB.prepare(
    `SELECT name, sex, first_year, peak_year, peak_count, total_count,
            (peak_year - first_year) AS years_to_peak,
            (first_year / 10 * 10) AS debut_decade
       FROM names
      WHERE peak_year > first_year
        AND peak_count >= 200
        AND first_year >= 1880
        AND first_year <= ?1 - 5
      ORDER BY debut_decade, years_to_peak`,
  )
    .bind(yM)
    .all<{
      name: string;
      sex: "M" | "F";
      first_year: number;
      peak_year: number;
      peak_count: number;
      total_count: number;
      years_to_peak: number;
      debut_decade: number;
    }>();

  const all = rows.results ?? [];

  const names: PeakSpeedName[] = all.map((r) => ({
    name: r.name,
    sex: r.sex,
    firstYear: r.first_year,
    peakYear: r.peak_year,
    peakCount: r.peak_count,
    totalCount: r.total_count,
    yearsToPeak: r.years_to_peak,
    debutDecade: r.debut_decade,
  }));

  // Compute decade aggregates per sex
  type DecadeKey = `${number}-${"M" | "F"}`;
  const decadeMap = new Map<DecadeKey, number[]>();
  for (const n of names) {
    const k: DecadeKey = `${n.debutDecade}-${n.sex}`;
    let arr = decadeMap.get(k);
    if (!arr) { arr = []; decadeMap.set(k, arr); }
    arr.push(n.yearsToPeak);
  }

  const decades = [...decadeMap.entries()].map(([k, arr]) => {
    const [decade, sex] = k.split("-") as [string, "M" | "F"];
    return {
      decade: Number(decade),
      medianYearsToPeak: Math.round(median(arr) * 10) / 10,
      meanYearsToPeak: Math.round(arr.reduce((s, v) => s + v, 0) / arr.length * 10) / 10,
      count: arr.length,
      sex,
    };
  }).sort((a, b) => a.decade - b.decade || a.sex.localeCompare(b.sex));

  const body: PeakSpeedResponse = { ym, yM, names, decades };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
