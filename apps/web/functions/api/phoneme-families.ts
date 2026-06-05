// GET /api/phoneme-families
// Groups names by their terminal phonemes (last 3 and 4 chars) to reveal
// "naming dynasties" — the Aiden/Jayden/Hayden cluster, the Emma/Ella/Anna family.
// Returns nodes + implicit family groupings for a force-directed network visualization.

import { getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface PhonemeNode {
  name: string;
  sex: "M" | "F";
  peakYear: number;
  peakCount: number;
  firstYear: number;
  status: string;
  end3: string; // last 3 chars uppercase
  end4: string; // last 4 chars uppercase
}

interface PhonemeFamily {
  key: string;   // the shared ending
  names: string[]; // name keys in this family
  totalPeak: number;
  peakDecade: number; // when did this family collectively peak?
}

interface PhonomeFamiliesResponse {
  ym: number;
  yM: number;
  nodes: PhonemeNode[];
  families: PhonemeFamily[];
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
  const cacheKey = new Request(`https://internal/phoneme-families/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const rows = await ctx.env.DB.prepare(
    `SELECT name, sex, first_year, peak_year, peak_count, status
       FROM names
      WHERE peak_count >= 300
      ORDER BY peak_count DESC`,
  ).all<{ name: string; sex: "M" | "F"; first_year: number; peak_year: number; peak_count: number; status: string }>();

  const nodes: PhonemeNode[] = (rows.results ?? []).map((r) => ({
    name: r.name,
    sex: r.sex,
    peakYear: r.peak_year,
    peakCount: r.peak_count,
    firstYear: r.first_year,
    status: r.status,
    end3: r.name.slice(-3).toUpperCase(),
    end4: r.name.length >= 4 ? r.name.slice(-4).toUpperCase() : r.name.toUpperCase(),
  }));

  // Build families: group by end3, require >= 3 members with combined peak >= 2000
  const familyMap = new Map<string, PhonemeNode[]>();
  for (const n of nodes) {
    const key = n.end3;
    let arr = familyMap.get(key);
    if (!arr) { arr = []; familyMap.set(key, arr); }
    arr.push(n);
  }

  const families: PhonemeFamily[] = [];
  for (const [key, members] of familyMap) {
    if (members.length < 3) continue;
    const totalPeak = members.reduce((s, m) => s + m.peakCount, 0);
    if (totalPeak < 2000) continue;
    // Weighted average peak decade
    const peakDecade = Math.round(
      members.reduce((s, m) => s + m.peakYear * m.peakCount, 0) / totalPeak / 10,
    ) * 10;
    families.push({
      key,
      names: members.map((m) => m.name),
      totalPeak,
      peakDecade,
    });
  }

  families.sort((a, b) => b.totalPeak - a.totalPeak);

  const body: PhonomeFamiliesResponse = { ym, yM, nodes, families };
  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
