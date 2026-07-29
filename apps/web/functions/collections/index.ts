// GET /collections/ — index of every populated editorial collection.
//
// Member counts and sample names come from one grouped query, so the page size
// is independent of how many collections exist.

import {
  allCollections,
  getContentVersion,
  getMeta,
  listCollectionSummaries,
  META_KEYS,
  MIN_PUBLISHABLE_MEMBERS,
  renderCollectionsHub,
  type HubEntry,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const [summaries, ymStr, yMStr, contentVersion] = await Promise.all([
    listCollectionSummaries(ctx.env.DB).catch(() => []),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getContentVersion(ctx.env.DB).catch(() => null),
  ]);

  const bySlug = new Map(summaries.map((s) => [s.slug, s]));
  const entries: HubEntry[] = allCollections()
    .map((def) => {
      const row = bySlug.get(def.slug);
      return {
        def,
        memberCount: row?.member_count ?? 0,
        samples: (row?.sample ?? "").split(",").filter(Boolean).slice(0, 3),
      };
    })
    // A collection with two members is not an entry page. Hiding thin ones here
    // matches the sitemap, so we never advertise a URL we would not index.
    .filter((e) => e.memberCount >= MIN_PUBLISHABLE_MEMBERS)
    .sort((a, b) => b.memberCount - a.memberCount);

  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/collections/`;

  const html = renderCollectionsHub(entries, {
    canonical,
    origin,
    minYear: Number(ymStr ?? 1880),
    maxYear: Number(yMStr ?? new Date().getUTCFullYear() - 1),
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      ETag: `"collections-hub-${contentVersion ?? "0"}"`,
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
};
