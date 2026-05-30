// GET /api/terminal-letters
// Annual birth counts grouped by the final letter of the name, per sex.
// Reveals the -N wave for boys (Jason, Kevin, Ryan, Aiden), the -A dominance
// for girls (Emma, Olivia, Isabella, Sophia), and how sonic fashion shifts era by era.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface TerminalLettersResponse {
  ym: number;
  yM: number;
  years: number[];
  letters: string[]; // 26 uppercase letters, sorted A–Z
  // F[year_index][letter_index] = share of female births ending in that letter (0–1)
  F: number[][];
  // M[year_index][letter_index] = share of male births ending in that letter (0–1)
  M: number[][];
  // Raw counts for tooltips
  Fraw: number[][];
  Mraw: number[][];
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
  const cacheKey = new Request(`https://internal/terminal-letters/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const rows = await ctx.env.DB.prepare(
    `SELECT ny.year, n.sex,
            UPPER(SUBSTR(n.name, -1)) AS letter,
            SUM(ny.count) AS count
       FROM name_years ny
       JOIN names n ON n.id = ny.name_id
      GROUP BY ny.year, n.sex, letter
      ORDER BY ny.year, n.sex, letter`,
  ).all<{ year: number; sex: "M" | "F"; letter: string; count: number }>();

  const all = rows.results ?? [];

  // Collect unique years and letters
  const yearSet = new Set<number>();
  const letterSet = new Set<string>();
  for (const r of all) {
    yearSet.add(r.year);
    if (/^[A-Z]$/.test(r.letter)) letterSet.add(r.letter);
  }
  const years = [...yearSet].sort((a, b) => a - b);
  const letters = [...letterSet].sort();

  const yearIdx = new Map(years.map((y, i) => [y, i]));
  const letterIdx = new Map(letters.map((l, i) => [l, i]));
  const nY = years.length;
  const nL = letters.length;

  // Raw counts
  const Fraw: number[][] = Array.from({ length: nY }, () => new Array(nL).fill(0));
  const Mraw: number[][] = Array.from({ length: nY }, () => new Array(nL).fill(0));

  for (const r of all) {
    if (!/^[A-Z]$/.test(r.letter)) continue;
    const yi = yearIdx.get(r.year)!;
    const li = letterIdx.get(r.letter)!;
    if (r.sex === "F") Fraw[yi][li] = r.count;
    else Mraw[yi][li] = r.count;
  }

  // Normalize to shares within each year
  const F: number[][] = Fraw.map((row) => {
    const total = row.reduce((s, v) => s + v, 0);
    return total === 0 ? row : row.map((v) => Math.round((v / total) * 10000) / 10000);
  });
  const M: number[][] = Mraw.map((row) => {
    const total = row.reduce((s, v) => s + v, 0);
    return total === 0 ? row : row.map((v) => Math.round((v / total) * 10000) / 10000);
  });

  const body: TerminalLettersResponse = { ym, yM, years, letters, F, M, Fraw, Mraw };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
