// GET /api/landing/:kind  (extinct | endangered | rising)
// Returns the same row shape the legacy data/landing/<kind>.json used,
// with sparkline encoded as a 60-byte array (decoded client-side).

import {
  decodeSpark,
  getMeta,
  listLandingWithSparks,
  META_KEYS,
  type LandingKind,
  type LandingResponse,
  type LandingRow,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const VALID = new Set<LandingKind>(["extinct", "endangered", "rising"]);

export const onRequestGet: PagesFunction<Env, "kind"> = async (ctx) => {
  const kind = ctx.params.kind as LandingKind;
  if (!VALID.has(kind)) return new Response("unknown landing kind", { status: 404 });

  const [rows, yMStr] = await Promise.all([
    listLandingWithSparks(ctx.env.DB, kind, 500),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);
  const yM = Number(yMStr ?? 0);

  const shaped: LandingRow[] = rows.map((r) => {
    const spark = r.spark_blob ? decodeSpark(r.spark_blob) : [];
    const base = { name: r.name, sex: r.sex, peakYear: r.peak_year, peakCount: r.peak_count, spark };
    if (kind === "extinct") {
      return { ...base, lastYearSeen: r.last_year };
    }
    if (kind === "endangered") {
      return {
        ...base,
        latestCount: r.latest_count,
        declinePct: r.decline_pct ?? 0,
      };
    }
    return {
      ...base,
      latestCount: r.latest_count,
      prevDecadeTotal: r.prev_decade ?? 0,
      currDecadeTotal: r.curr_decade ?? 0,
      growthX: r.growth_x ?? null,
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
