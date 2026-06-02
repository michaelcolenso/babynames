// GET /api/gender-crossings
// Names used significantly in BOTH sexes, with year-by-year M vs F counts.
// Pre-computes the crossing year where dominant sex flipped (e.g. Riley going F, Shirley going F).

import { chunkedIn, getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface CrossingName {
  name: string;
  crossingYear: number | null;
  direction: "M→F" | "F→M" | "contested" | null;
  years: number[];
  m: number[];
  f: number[];
  mTotal: number;
  fTotal: number;
}

interface GenderCrossingsResponse {
  ym: number;
  yM: number;
  names: CrossingName[];
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr, dataVersion] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const cache = caches.default;
  const cacheKey = new Request(`https://internal/gender-crossings/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  // Find names with substantial usage in both sexes
  const candidates = await ctx.env.DB.prepare(
    `SELECT name,
       MAX(CASE WHEN sex='M' THEN id END) AS m_id,
       MAX(CASE WHEN sex='F' THEN id END) AS f_id,
       SUM(CASE WHEN sex='M' THEN total_count ELSE 0 END) AS m_total,
       SUM(CASE WHEN sex='F' THEN total_count ELSE 0 END) AS f_total
     FROM names
     GROUP BY name
     HAVING COUNT(DISTINCT sex) = 2
     ORDER BY (m_total + f_total) DESC`,
  ).all<{ name: string; m_id: number; f_id: number; m_total: number; f_total: number }>();

  const rows = (candidates.results ?? []).filter((r) => r.m_total >= 500 && r.f_total >= 500).slice(0, 80);

  if (rows.length === 0) {
    const body: GenderCrossingsResponse = { ym, yM, names: [] };
    return Response.json(body);
  }

  // Collect the M and F name_ids for every candidate name. Filter out any NULL
  // ids so they are never bound as SQL variables (NULL never matches an IN list
  // and still counts toward the bound-variable ceiling).
  const allIds = rows.flatMap((r) => [r.m_id, r.f_id]).filter((id): id is number => id != null);

  // D1 enforces a per-statement bound-variable ceiling that is lower than
  // SQLite's native 999 limit, so a single `IN (?, ?, ...)` with ~160 ids that
  // works in local dev throws `too many SQL variables` on deployed D1. chunkedIn
  // batches the ids to stay safely under the ceiling and merges the results.
  const yearRows = await chunkedIn<{ name_id: number; year: number; count: number }>(
    ctx.env.DB,
    allIds,
    (ph) => `SELECT name_id, year, count FROM name_years WHERE name_id IN (${ph})`,
  );

  const byId = new Map<number, { year: number; count: number }[]>();
  for (const r of yearRows) {
    let arr = byId.get(r.name_id);
    if (!arr) {
      arr = [];
      byId.set(r.name_id, arr);
    }
    arr.push({ year: r.year, count: r.count });
  }

  const names: CrossingName[] = [];
  for (const row of rows) {
    const mSeries = byId.get(row.m_id) ?? [];
    const fSeries = byId.get(row.f_id) ?? [];

    const mByYear = new Map(mSeries.map((r) => [r.year, r.count]));
    const fByYear = new Map(fSeries.map((r) => [r.year, r.count]));
    const allYears = Array.from(new Set([...mByYear.keys(), ...fByYear.keys()])).sort((a, b) => a - b);

    const years: number[] = [];
    const m: number[] = [];
    const f: number[] = [];
    for (const y of allYears) {
      const mv = mByYear.get(y) ?? 0;
      const fv = fByYear.get(y) ?? 0;
      if (mv > 0 || fv > 0) {
        years.push(y);
        m.push(mv);
        f.push(fv);
      }
    }

    // Find crossing year: where dominant sex flips
    let crossingYear: number | null = null;
    let direction: CrossingName["direction"] = null;
    let prevDominant: "M" | "F" | null = null;
    for (let i = 0; i < years.length; i++) {
      const dominant = m[i] >= f[i] ? "M" : "F";
      if (prevDominant && dominant !== prevDominant) {
        crossingYear = years[i];
        direction = prevDominant === "M" ? "M→F" : "F→M";
        break;
      }
      prevDominant = dominant;
    }

    // Contested: neither sex ever had > 3x the other at peak
    if (!crossingYear) {
      const maxM = Math.max(...m);
      const maxF = Math.max(...f);
      if (maxM > 0 && maxF > 0 && Math.max(maxM, maxF) / Math.min(maxM, maxF) < 3) {
        direction = "contested";
      }
    }

    names.push({ name: row.name, crossingYear, direction, years, m, f, mTotal: row.m_total, fTotal: row.f_total });
  }

  // Sort: M→F crossings first, then F→M, then contested
  names.sort((a, b) => {
    const order: Record<string, number> = { "M→F": 0, "F→M": 1, contested: 2 };
    const ao = order[a.direction ?? "contested"] ?? 3;
    const bo = order[b.direction ?? "contested"] ?? 3;
    if (ao !== bo) return ao - bo;
    return b.mTotal + b.fTotal - (a.mTotal + a.fTotal);
  });

  const body: GenderCrossingsResponse = { ym, yM, names };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
