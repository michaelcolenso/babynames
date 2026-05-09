import { META_KEYS, getMeta, enrichName } from "@nv/shared";
import type { D1Database, PagesFunction } from "@cloudflare/workers-types";

interface EnrichWorkerBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  DB: D1Database;
  ENRICH_WORKER?: EnrichWorkerBinding;
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const name = ctx.params.name;
  if (typeof name !== "string" || !name) return new Response("missing name", { status: 400 });

  const reqUrl = new URL(ctx.request.url);
  const sex = (reqUrl.searchParams.get("sex") ?? "").trim().toUpperCase();
  const dataVersion = (await getMeta(ctx.env.DB, META_KEYS.dataVersion)) ?? "dev";

  // Try the ingest worker service binding first (production).
  // In local dev the binding may be unavailable, so fall back to computing
  // enrichment directly in this Pages Function.
  if (ctx.env.ENRICH_WORKER) {
    try {
      const upstream = new URL("https://enrich.internal/enrich");
      upstream.searchParams.set("name", decodeURIComponent(name));
      if (sex === "M" || sex === "F") upstream.searchParams.set("sex", sex);

      const r = await ctx.env.ENRICH_WORKER.fetch(upstream.toString(), {
        headers: { "X-Data-Version": dataVersion },
      });

      if (r.ok) {
        return new Response(await r.text(), {
          status: r.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
            "X-Cache-Key": `enrich:${decodeURIComponent(name).toLowerCase()}:${sex || "*"}:${dataVersion}`,
          },
        });
      }
      // Non-OK from worker: fall through to local compute.
    } catch {
      // Binding failure (e.g. 503 in local dev): fall through to local compute.
    }
  }

  // Local fallback — compute enrichment directly from D1.
  const result = await enrichName(
    ctx.env.DB,
    name,
    sex === "M" || sex === "F" ? sex : undefined,
  );
  const body = JSON.stringify(result);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "X-Cache-Key": `enrich:${decodeURIComponent(name).toLowerCase()}:${sex || "*"}:${dataVersion}`,
    },
  });
};
