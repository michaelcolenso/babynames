// GET /api/top100-history
// Returns compact span data for every name that has ever held a top-100
// position, showing which contiguous year-ranges they held it.
// Reads the pre-computed name_rankings_by_year table (top 100 is inside its
// 200-rank cap), falling back to per-year ranking when that table isn't
// published. Result is also cached in caches.default keyed by dataVersion so it
// runs at most once per ingest.

import { getMeta, META_KEYS, rankedNameYears } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface NameSpan {
  name: string;
  sex: "M" | "F";
  spans: [number, number][]; // inclusive [startYear, endYear] pairs
  totalYears: number;
  longestStreak: number;
  firstTop100: number;
  lastTop100: number;
  spanCount: number;
  gapYears: number;
  active: boolean;
  continuousSinceDebut: boolean;
  continuousFullRecord: boolean;
  returned: boolean;
  /** @deprecated Compatibility alias for continuousSinceDebut. */
  iron: boolean;
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

function streakLength([start, end]: [number, number]): number {
  return end - start + 1;
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
  const cacheKey = new Request(`https://internal/top100-history/v2/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const rows = await rankedNameYears(ctx.env.DB, 100);

  const byKey = new Map<string, number[]>();
  for (const r of rows) {
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
    const lastSpan = spans[spans.length - 1];
    if (!firstSpan || !lastSpan) continue;

    const firstTop100 = firstSpan[0];
    const lastTop100 = lastSpan[1];
    const longestStreak = Math.max(...spans.map(streakLength));
    const active = lastTop100 >= yM - 1;
    const continuousSinceDebut = spans.length === 1 && active;
    const continuousFullRecord = continuousSinceDebut && firstTop100 <= ym;
    const returned = spans.length > 1 && active;
    const gapYears = Math.max(0, lastTop100 - firstTop100 + 1 - years.length);

    names.push({
      name,
      sex,
      spans,
      totalYears: years.length,
      longestStreak,
      firstTop100,
      lastTop100,
      spanCount: spans.length,
      gapYears,
      active,
      continuousSinceDebut,
      continuousFullRecord,
      returned,
      iron: continuousSinceDebut,
    });
  }

  names.sort((a, b) => {
    if (a.continuousFullRecord !== b.continuousFullRecord) {
      return a.continuousFullRecord ? -1 : 1;
    }
    if (b.longestStreak !== a.longestStreak) return b.longestStreak - a.longestStreak;
    if (b.totalYears !== a.totalYears) return b.totalYears - a.totalYears;
    return a.name.localeCompare(b.name);
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
