// GET /sitemap-collections.xml — editorial collection pages.
//
// Only collections that actually have members are listed. Advertising a URL
// that renders an empty table trains a crawler to distrust the namespace, and
// the /collections/ hub applies the same threshold, so the two never disagree.
// Paginated URLs are excluded: page 2+ is noindex,follow.

import {
  absoluteUrl,
  getCollection,
  getContentVersions,
  contentVersionString,
  getMeta,
  isoDate,
  newestDate,
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
  const [summaries, versions, yMStr] = await Promise.all([
    // Deliberately not caught. This query IS the body of the sitemap, so
    // swallowing a D1 failure would publish an empty urlset — and the
    // middleware caches any successful s-maxage response, so that empty set
    // would then outlive the outage by up to a week under an unchanged content
    // version. Letting it throw reaches the middleware's uncached 503 instead.
    // An initialized but unseeded table returns [] without throwing, so the
    // not-yet-seeded case is unaffected.
    listCollectionSummaries(ctx.env.DB),
    getContentVersions(ctx.env.DB).catch(() => null),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  // A facts-only rebuild changes membership, ordering and the metric copy on
  // every collection page while the SSA release date stands still. The index
  // signalling that this child moved is not enough — a crawler reading this
  // file decides per URL, and every entry would look untouched.
  const ssaDate = `${Number(yMStr ?? 2024)}-05-15`;
  const lastmod = newestDate(ssaDate, isoDate(versions?.facts)) ?? ssaDate;
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
    versions ? `sitemap-collections-${contentVersionString(versions, "facts")}` : null,
  );
};

export const onRequestHead: PagesFunction<Env> = async (ctx) => withoutBody(await onRequestGet(ctx));
