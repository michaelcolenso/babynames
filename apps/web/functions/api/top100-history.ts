// GET /api/top100-history
// Returns compact span data for every name that has ever held a top-100
// position, showing which contiguous year-ranges they held it.
// The underlying window-function query is heavy; result is cached in
// caches.default keyed by dataVersion so it runs at most once per ingest.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface NameSpan {
  name: string;
  sex: "M" | "F";
  spans: [number, number][]; // inclusive [startYear, endYear] pairs
  totalYears: number;
  iron: boolean; // one unbroken span that ends at yM (never left since debut)
}

interface Top100HistoryResponse {
  ym: number;
  yM: number;
  names: NameSpan[];
}

function buildSpans(sortedYears: number[]): [number, number][] {
  if (sortedYears.length === 0) return [];

  const out: [number, number][] = [];
  let start = sortedYears[0]!;
  let prev = sortedYears[0]!;
  for (let i = 1; i < sortedYears.length; i++) {
    const year = sortedYears[i]!;
    if (year > prev + 1) {
      out.push([start, prev]);
      start = year;
    }
    prev = year;
  }
  out.push([start, prev]);
  return out;
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
  const cacheKey = new Request(`https://internal/top100-history/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const result = await ctx.env.DB.prepare(
    `WITH ranked AS (
       SELECT n.name, n.sex, ny.year,
              ROW_NUMBER() OVER (PARTITION BY ny.year, n.sex ORDER BY ny.count DESC) AS rn
         FROM name_years ny
         JOIN names n ON n.id = ny.name_id
     )
     SELECT name, sex, year
       FROM ranked
      WHERE rn <= 100
      ORDER BY sex, name, year`,
  ).all<{ name: string; sex: "M" | "F"; year: number }>();

  const byKey = new Map<string, number[]>();
  for (const r of result.results ?? []) {
    const k = `${r.sex}\x00${r.name}`;
    let arr = byKey.get(k);
    if (!arr) {
      arr = [];
      byKey.set(k, arr);
    }
    arr.push(r.year);
  }

  const names: NameSpan[] = [];
  for (const [k, years] of byKey) {
    const sep = k.indexOf("\x00");
    const sex = k.slice(0, sep) as "M" | "F";
    const name = k.slice(sep + 1);
    const spans = buildSpans(years);
    const firstSpan = spans[0];
    const iron = spans.length === 1 && firstSpan !== undefined && firstSpan[1] >= yM - 1;
    names.push({ name, sex, spans, totalYears: years.length, iron });
  }

  names.sort((a, b) => {
    if (a.iron !== b.iron) return a.iron ? -1 : 1;
    return b.totalYears - a.totalYears;
  });

  const body: Top100HistoryResponse = { ym, yM, names };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
