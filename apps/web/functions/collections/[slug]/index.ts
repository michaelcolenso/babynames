// GET /collections/:slug/ — server-rendered editorial collection page.
//
// One route serves every cluster: the seven base collections plus the generated
// per-decade and per-state pages. The registry in packages/shared/src/collections.ts
// is the authority, so an unknown slug 404s without touching D1.

import {
  countCollectionMembers,
  getCollection,
  getMeta,
  listCollectionMembers,
  META_KEYS,
  pageShell,
  renderCollectionPage,
  COLLECTION_PAGE_SIZE,
  type CollectionDef,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const slug = String(ctx.params.slug ?? "");
  const def = getCollection(slug);
  if (!def) return notFoundPage();

  const url = new URL(ctx.request.url);
  const page = clampPage(url.searchParams.get("page"));
  const offset = (page - 1) * COLLECTION_PAGE_SIZE;

  const [rows, total, ymStr, yMStr, factsVersion, dataVersion] = await Promise.all([
    listCollectionMembers(ctx.env.DB, slug, COLLECTION_PAGE_SIZE, offset),
    countCollectionMembers(ctx.env.DB, slug),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.factsVersion).catch(() => null),
    getMeta(ctx.env.DB, META_KEYS.dataVersion).catch(() => null),
  ]);

  // A page past the end is a dead end, not an empty table.
  if (page > 1 && !rows.length) return notFoundPage();

  const origin = url.origin;
  const canonical = `${origin}/collections/${slug}/${page > 1 ? `?page=${page}` : ""}`;
  const related = def.related
    .map((s) => getCollection(s))
    .filter((d): d is CollectionDef => Boolean(d));

  const html = renderCollectionPage(def, rows, {
    canonical,
    origin,
    total,
    page,
    minYear: Number(ymStr ?? 1880),
    maxYear: Number(yMStr ?? new Date().getUTCFullYear() - 1),
    related,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      // Keyed on facts_version, not data_version: collection content only
      // changes when name_facts is rebuilt, so an annual national ingest should
      // not invalidate caches whose contents are identical.
      ETag: `"coll-${slug}-${page}-${factsVersion ?? dataVersion ?? "0"}"`,
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "slug"> = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
};

function clampPage(raw: string | null): number {
  const n = Number(raw ?? 1);
  return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), 1000) : 1;
}

function notFoundPage(): Response {
  return new Response(
    pageShell({
      title: "Collection not found | NobodyNamed",
      description: "That collection does not exist. Browse the full list of name collections instead.",
      canonical: "https://nobodynamed.com/collections/",
      currentPath: "/collections/",
      body: `<div class="report">
  <div class="section-label">404</div>
  <h1>No such collection</h1>
  <p class="lede">That collection does not exist. Every grouping we publish is listed on the collections index.</p>
  <p><a href="/collections/">Browse all collections</a>.</p>
</div>`,
      footerVariant: "full",
    }),
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}
