// GET /api/landing/comeback
// Names that peaked pre-1975 at 5,000+ births and are now growing or stable
// with meaningful current usage — the "flatlined and came back" cohort.
// Same LandingRow shape as the "rising" kind so the client can reuse rendering.

import {
  decodeSpark,
  getMeta,
  listComeback,
  META_KEYS,
  type LandingResponse,
  type LandingRow,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [rows, yMStr] = await Promise.all([
    listComeback(ctx.env.DB, 200),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);
  const yM = Number(yMStr ?? 0);

  const shaped: LandingRow[] = rows.map((r) => {
    const spark = r.spark_blob ? decodeSpark(r.spark_blob) : [];
    return {
      name: r.name,
      sex: r.sex,
      peakYear: r.peak_year,
      peakCount: r.peak_count,
      latestCount: r.latest_count,
      prevDecadeTotal: r.prev_decade ?? 0,
      currDecadeTotal: r.curr_decade ?? 0,
      growthX: r.growth_x ?? null,
      spark,
    };
  });

  const body: LandingResponse = { yM, rows: shaped };
  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
