import { META_KEYS, getMeta } from "@nv/shared";
import type { D1Database, PagesFunction } from "@cloudflare/workers-types";

interface EnrichWorkerBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

interface Env {
  DB: D1Database;
  ENRICH_WORKER: EnrichWorkerBinding;
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const name = ctx.params.name;
  if (typeof name !== "string" || !name) return new Response("missing name", { status: 400 });

  const reqUrl = new URL(ctx.request.url);
  const sex = (reqUrl.searchParams.get("sex") ?? "").trim().toUpperCase();
  const dataVersion = (await getMeta(ctx.env.DB, META_KEYS.dataVersion)) ?? "dev";

  const upstream = new URL("https://enrich.internal/enrich");
  upstream.searchParams.set("name", decodeURIComponent(name));
  if (sex === "M" || sex === "F") upstream.searchParams.set("sex", sex);

  const r = await ctx.env.ENRICH_WORKER.fetch(upstream.toString(), {
    headers: { "X-Data-Version": dataVersion },
  });

  return new Response(await r.text(), {
    status: r.status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400",
      "X-Cache-Key": `enrich:${decodeURIComponent(name).toLowerCase()}:${sex || "*"}:${dataVersion}`,
    },
  });
};
