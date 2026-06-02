import {
  getMeta,
  getNameEnrichmentBundle,
  getNameWithSeries,
  META_KEYS,
  type Sex,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const name = ctx.params.name;
  if (typeof name !== "string" || !name) return new Response("missing name", { status: 400 });

  const reqUrl = new URL(ctx.request.url);
  const requestedSex = (reqUrl.searchParams.get("sex") ?? "").trim().toUpperCase();
  if (requestedSex && requestedSex !== "M" && requestedSex !== "F") {
    return Response.json({ error: "invalid_sex" }, { status: 400 });
  }

  const nameLower = decodeURIComponent(name).toLowerCase();
  const [rows, dataVersion] = await Promise.all([
    getNameWithSeries(ctx.env.DB, nameLower),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
  ]);

  if (!rows.length) {
    return Response.json(
      { error: "not_found" },
      {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      },
    );
  }

  const sex = (requestedSex || dominantSex(rows)) as Sex;
  const selected = rows.find((row) => row.row.sex === sex);
  if (!selected) {
    return Response.json(
      { error: "not_found" },
      {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      },
    );
  }

  const bundle = await getNameEnrichmentBundle(ctx.env.DB, nameLower, sex);

  return Response.json({
    name: selected.row.name,
    nameLower,
    sex,
    profile: bundle.profile,
    catalysts: bundle.catalysts,
    historicalProfiles: bundle.historicalProfiles,
    regionalAnomalies: bundle.regionalAnomalies,
  }, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "X-Cache-Key": `enrich-bundle:${nameLower}:${sex}:${dataVersion ?? "dev"}`,
    },
  });
};

function dominantSex(rows: Awaited<ReturnType<typeof getNameWithSeries>>): Sex {
  const totals = rows.map((row) => ({
    sex: row.row.sex,
    total: row.series.reduce((sum, point) => sum + point.count, 0),
  }));
  totals.sort((a, b) => b.total - a.total);
  return totals[0]?.sex ?? "F";
}
