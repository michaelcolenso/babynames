// GET /api/enrich/:name  →  (existing, snippet-based — see api/enrich/[name].ts)
// GET /api/enrichment/:name?sex=M|F  →  structured precomputed dossier bundle.
//
// When ?sex is omitted we pick the dominant sex by total volume, mirroring
// /api/name/:name. All values are precomputed offline; this only reads D1.

import { getNameEnrichmentBundle, getNameWithSeries, type Sex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const name = ctx.params.name;
  if (typeof name !== "string" || !name) {
    return new Response("missing name", { status: 400 });
  }

  const lower = decodeURIComponent(name).toLowerCase();
  const reqSex = (new URL(ctx.request.url).searchParams.get("sex") ?? "").trim().toUpperCase();

  let sex: Sex;
  if (reqSex === "M" || reqSex === "F") {
    sex = reqSex;
  } else {
    // Resolve dominant sex by total series volume (same logic as /api/name).
    const rows = await getNameWithSeries(ctx.env.DB, lower);
    if (!rows.length) {
      return Response.json(
        { error: "not_found" },
        {
          status: 404,
          headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
        },
      );
    }
    let best: { sex: Sex; total: number } | null = null;
    for (const r of rows) {
      const total = r.series.reduce((acc, p) => acc + p.count, 0);
      if (!best || total > best.total) best = { sex: r.row.sex, total };
    }
    sex = best!.sex;
  }

  const bundle = await getNameEnrichmentBundle(ctx.env.DB, lower, sex);
  if (!bundle.profile) {
    return Response.json(
      { error: "not_computed", name: decodeURIComponent(name), sex },
      {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
      },
    );
  }

  return Response.json(
    {
      name: decodeURIComponent(name),
      nameLower: lower,
      sex,
      profile: bundle.profile,
      catalysts: bundle.catalysts,
      historicalProfiles: bundle.historicalProfiles,
      regionalAnomalies: bundle.regionalAnomalies,
    },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
        "X-Cache-Key": `enrichment:${lower}:${sex}`,
      },
    },
  );
};
