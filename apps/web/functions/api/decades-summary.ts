// GET /api/decades-summary
// Top names per calendar decade for the homepage tapestry.
// Returns one entry per decade, each containing the top 5 names overall
// (coed) plus decoded spark blobs for rendering trend lines.

import { getMeta, topByDecadeWithSpark, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function parseDecade(raw: string): { label: string; start: number; end: number } | null {
  const m = /^((?:18|19|20)\d{2})s$/.exec(raw);
  if (!m) return null;
  const start = Number(m[1]);
  return { label: `${start}s`, start, end: start + 9 };
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const startDecade = Math.floor(ym / 10) * 10;
  const endDecade = Math.floor(yM / 10) * 10;

  const decades: { label: string; startYear: number; endYear: number; names: Awaited<ReturnType<typeof topByDecadeWithSpark>> }[] = [];

  for (let d = endDecade; d >= startDecade; d -= 10) {
    const label = `${d}s`;
    const names = await topByDecadeWithSpark(ctx.env.DB, d, d + 9, 5);
    if (names.length) {
      decades.push({ label, startYear: d, endYear: d + 9, names });
    }
  }

  return Response.json(
    { ym, yM, decades },
    {
      headers: {
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
