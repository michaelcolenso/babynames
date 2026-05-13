// GET /api/river
// Returns full year-series for every name that has ever ranked top-30 in
// some (year, sex). Used by the homepage streamgraph. Lives behind the same
// 7-day edge cache as /api/meta and is invalidated implicitly by the ingest
// pipeline updating `data_version`.

import {
  getMeta,
  riverNames,
  META_KEYS,
  type RiverNameRow,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

interface RiverResponse {
  dataVersion: string;
  names: RiverNameRow[];
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [dataVersion, names] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    riverNames(ctx.env.DB, 30),
  ]);

  const body: RiverResponse = {
    dataVersion: dataVersion ?? "",
    names,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
