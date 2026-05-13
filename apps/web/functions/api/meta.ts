// GET /api/meta
// Returns the data needed by the home-page "popular right now" grid plus
// year totals for any client-side normalization. Heavy query (top-N per
// year) lives behind a 7-day edge cache.

import {
  getMeta,
  listYearTotals,
  topByYear,
  META_KEYS,
  type MetaResponse,
  type Sex,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [ymStr, yMStr, totalNamesStr, totalRowsStr, dataVersion, totals, top] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.totalNames),
    getMeta(ctx.env.DB, META_KEYS.totalRows),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    listYearTotals(ctx.env.DB),
    topByYear(ctx.env.DB, 10),
  ]);

  const totalsByYear: Record<string, { M: number; F: number }> = {};
  for (const t of totals) {
    const k = String(t.year);
    if (!totalsByYear[k]) totalsByYear[k] = { M: 0, F: 0 };
    totalsByYear[k][t.sex] = t.total;
  }

  const top10PerYear: Record<string, [string, Sex, number][]> = {};
  for (const r of top) {
    const k = String(r.year);
    (top10PerYear[k] ??= []).push([r.name, r.sex, r.count]);
  }

  const body: MetaResponse = {
    ym: Number(ymStr ?? 0),
    yM: Number(yMStr ?? 0),
    totalNames: Number(totalNamesStr ?? 0),
    totalRows: Number(totalRowsStr ?? 0),
    totalsByYear,
    top10PerYear,
    dataVersion: dataVersion ?? "",
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
