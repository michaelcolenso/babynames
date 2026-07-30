// GET /api/name-survival
// Kaplan-Meier-style survival analysis for naming cohorts.
//
// The aggregate behind this endpoint touches every row of name_years, so it is
// pre-computed at ingest into viz_payloads and read here as a single row. See
// packages/shared/src/viz-payloads.ts — getVizPayload falls back to computing
// live if no payload has been published for the current data_version.

import { getMeta, getVizPayload, META_KEYS, type NameSurvivalResponse } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [yMStr, ymStr, dataVersion] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);

  const cache = caches.default;
  const cacheKey = new Request(`https://internal/name-survival/${dataVersion ?? "v0"}`);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const body = await getVizPayload<NameSurvivalResponse>(ctx.env.DB, "name-survival", dataVersion ?? "", ym, yM);

  const response = Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
