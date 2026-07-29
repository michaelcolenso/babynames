// GET /sitemap-collections.xml — editorial collection pages.
//
// Only collections that actually have members are listed. Advertising a URL
// that renders an empty table trains a crawler to distrust the namespace, and
// the /collections/ hub applies the same threshold, so the two never disagree.
// Paginated URLs are excluded: page 2+ is noindex,follow.

import {
  absoluteUrl,
  getCollection,
  getMeta,
  listCollectionSummaries,
  META_KEYS,
  MIN_PUBLISHABLE_MEMBERS,
  renderUrlset,
  withoutBody,
  xmlResponse,
  type SitemapUrl,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const [summaries, factsVersion, dataVersion, yMStr] = await Promise.all([
    listCollectionSummaries(ctx.env.DB).catch(() => []),
    getMeta(ctx.env.DB, META_KEYS.factsVersion).catch(() => null),
    getMeta(ctx.env.DB, META_KEYS.dataVersion),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const lastmod = `${Number(yMStr ?? 2024)}-05-15`;
  const urls: SitemapUrl[] = summaries
    .filter((s) => s.member_count >= MIN_PUBLISHABLE_MEMBERS && getCollection(s.slug))
    .sort((a, b) => b.member_count - a.member_count)
    .map((s) => ({
      loc: absoluteUrl(url.origin, `/collections/${s.slug}/`),
      lastmod,
      priority: 0.6,
    }));

  return xmlResponse(
    renderUrlset(urls),
    factsVersion || dataVersion ? `sitemap-collections-${factsVersion ?? dataVersion}` : null,
  );
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
