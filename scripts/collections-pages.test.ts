import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as collectionGet } from "../apps/web/functions/collections/[slug]/index";
import { onRequestGet as hubGet } from "../apps/web/functions/collections/index";
import { getCollection, MIN_PUBLISHABLE_MEMBERS } from "../packages/shared/src/collections";
import type { CollectionMemberRow } from "../packages/shared/src/schema";

const SLUG = "one-year-wonders";

function sparkBlob(seed: number): ArrayBuffer {
  return Uint8Array.from({ length: 60 }, (_, i) => ((i + seed) % 59) + 1).buffer;
}

function member(name: string, i: number): CollectionMemberRow {
  return {
    name,
    sex: "F",
    rank_in: i + 1,
    metric_label: `${40 - i} births, 19${48 + i}`,
    metric_value: 40 - i,
    peak_year: 1948 + i,
    peak_count: 40 - i,
    total_count: 40 - i,
    latest_count: 0,
    first_year: 1948 + i,
    last_year: 1948 + i,
    status: "extinct",
    spark_blob: sparkBlob(i),
  };
}

const MEMBERS = ["Bethzy", "Elzada", "Marvel", "Ottilie", "Zetta"].map(member);

interface DbOptions {
  members?: CollectionMemberRow[];
  total?: number;
  failMembers?: boolean;
  summaries?: { slug: string; member_count: number; sample: string | null }[];
  meta?: Record<string, string>;
  failSummaries?: boolean;
}

const POPULATED = getCollection(SLUG)!.related.map((slug) => ({
  slug,
  member_count: 50,
  sample: null as string | null,
}));

function fakeDb({ members = MEMBERS, total = members.length, failMembers = false, summaries = POPULATED, meta = {}, failSummaries = false }: DbOptions = {}) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first<T>(): Promise<T | null> {
          if (sql.includes("COUNT(*) AS n FROM name_collections")) return { n: total } as T;
          if (sql.includes("AS dataVersion")) {
            const [count, updatedAt] = (meta.blog_version ?? "0@").split("@");
            return {
              dataVersion: meta.data_version ?? null,
              factsBuild: meta.facts_build ?? null,
              blogCount: Number(count),
              blogUpdatedAt: updatedAt || null,
            } as T;
          }
          if (sql.includes("FROM meta")) {
            const key = sql.includes("?1") ? "" : "";
            void key;
            return { value: "1880" } as T;
          }
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("FROM name_collections c")) {
            if (failMembers) throw new Error("D1 unavailable");
            return { results: members as unknown as T[] };
          }
          if (sql.includes("GROUP BY slug")) {
            if (failSummaries) throw new Error("D1 unavailable");
            return { results: summaries as unknown as T[] };
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

function ctx(url: string, db: ReturnType<typeof fakeDb>, params: Record<string, string> = {}) {
  return {
    request: new Request(url),
    env: { DB: db },
    params,
  } as never;
}

async function get(url: string, db = fakeDb(), slug = SLUG): Promise<Response> {
  return (await collectionGet(ctx(url, db, { slug }))) as Response;
}

test("a known slug renders 200 with crawlable name links in the initial HTML", async () => {
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") ?? "", /text\/html/);

  const html = await res.text();
  for (const row of MEMBERS) {
    assert.ok(
      html.includes(`href="/name/${row.name}/"`),
      `${row.name} is missing a crawlable /name/ link`,
    );
  }
  assert.ok(html.includes(getCollection(SLUG)!.seoTitle));
  assert.ok(html.includes("<h1>Names That Appeared Once and Vanished</h1>"));
});

test("an unknown slug 404s and points at the index", async () => {
  const res = await get("https://nobodynamed.com/collections/not-a-thing/", fakeDb(), "not-a-thing");
  assert.equal(res.status, 404);
  assert.match(await res.text(), /\/collections\//);
});

test("structured data carries a CollectionPage, an ItemList, and breadcrumbs", async () => {
  const html = await (await get(`https://nobodynamed.com/collections/${SLUG}/`)).text();
  const block = /<script type="application\/ld\+json">(.+?)<\/script>/s.exec(html);
  assert.ok(block, "no JSON-LD emitted");
  const data = JSON.parse(block[1]!.replace(/\\u003c/g, "<"));
  assert.ok(Array.isArray(data));

  const collectionPage = data.find((d: { "@type": string }) => d["@type"] === "CollectionPage");
  assert.ok(collectionPage, "missing CollectionPage");
  assert.equal(collectionPage.mainEntity["@type"], "ItemList");
  assert.equal(collectionPage.mainEntity.numberOfItems, MEMBERS.length);
  assert.equal(collectionPage.mainEntity.itemListElement.length, MEMBERS.length);
  assert.match(collectionPage.mainEntity.itemListElement[0].url, /\/name\/Bethzy\//);

  const crumbs = data.find((d: { "@type": string }) => d["@type"] === "BreadcrumbList");
  assert.ok(crumbs, "missing BreadcrumbList");
  assert.equal(crumbs.itemListElement.length, 2);
});

test("page one is indexable; later pages are noindex,follow", async () => {
  const first = await (await get(`https://nobodynamed.com/collections/${SLUG}/`)).text();
  assert.ok(!first.includes('name="robots"'), "page 1 must not be noindexed");

  const many = Array.from({ length: 100 }, (_, i) => member(`N${i}`, i));
  const second = await get(`https://nobodynamed.com/collections/${SLUG}/?page=2`, fakeDb({ members: many, total: 250 }));
  const html = await second.text();
  assert.match(html, /<meta name="robots" content="noindex,follow">/);
  assert.match(html, /<link rel="prev"/);
  assert.match(html, /<link rel="next"/);
});

test("the canonical of a paginated page points at itself, not at page one", async () => {
  const many = Array.from({ length: 100 }, (_, i) => member(`N${i}`, i));
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/?page=2`, fakeDb({ members: many, total: 250 }));
  assert.match(res.headers.get("Link") ?? "", /\?page=2>; rel="canonical"/);
  assert.match(await res.text(), /<link rel="canonical" href="[^"]*\?page=2">/);
});

test("a page past the end 404s rather than rendering an empty table", async () => {
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/?page=9`, fakeDb({ members: [], total: 5 }));
  assert.equal(res.status, 404);
});

test("an empty collection still renders, with an explanation", async () => {
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb({ members: [], total: 0 }));
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /No names currently qualify/);
  assert.ok(!html.includes("<tbody></tbody>"), "should not emit an empty table shell");
});

test("cache headers are keyed so an ingest does not needlessly bust collections", async () => {
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/`);
  assert.match(res.headers.get("Cache-Control") ?? "", /s-maxage=86400/);
  assert.match(res.headers.get("ETag") ?? "", new RegExp(`coll-${SLUG}-1-`));
});

// The ETag has to move whenever the body does, and the body is rebuilt by both
// a facts rebuild and an ingest — the latter because the member sparklines come
// from names.spark_blob. facts_version would miss the first case entirely: it
// names the source corpus, so a rebuild from that same corpus (a changed
// threshold, a new variant algorithm) leaves it identical.
test("the ETag tracks both a facts rebuild and an ingest", async () => {
  const etag = async (meta: Record<string, string>) =>
    (await get(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb({ meta }))).headers.get("ETag");

  const base = await etag({ data_version: "dv1", facts_build: "fb1" });
  assert.notEqual(base, await etag({ data_version: "dv1", facts_build: "fb2" }), "facts rebuild");
  assert.notEqual(base, await etag({ data_version: "dv2", facts_build: "fb1" }), "new ingest");
  assert.equal(base, await etag({ data_version: "dv1", facts_build: "fb1" }), "unchanged data");
  // It must also match the version the middleware puts in its cache key, so the
  // validator and the edge entry it revalidates through never disagree.
  assert.ok(base?.includes("dv1:fb1"), base ?? "");
});

test("related collections are rendered as links and all resolve", async () => {
  const html = await (await get(`https://nobodynamed.com/collections/${SLUG}/`)).text();
  for (const slug of getCollection(SLUG)!.related) {
    assert.ok(html.includes(`href="/collections/${slug}/"`), `missing related link to ${slug}`);
  }
});

test("related links point only at collections that are actually populated", async () => {
  // The hub and the sitemap both hide collections below the publish threshold.
  // A cross-link to one of those is an internal link to a page we deliberately
  // do not index — the case that had /rising linking famous-name-effects, which
  // the catalyst data can never fill.
  const [thin, ...healthy] = getCollection(SLUG)!.related;
  const db = fakeDb({
    summaries: [
      { slug: thin!, member_count: MIN_PUBLISHABLE_MEMBERS - 1, sample: null },
      ...healthy.map((slug) => ({ slug, member_count: 40, sample: null })),
    ],
  });
  const html = await (await get(`https://nobodynamed.com/collections/${SLUG}/`, db)).text();
  assert.ok(
    !html.includes(`href="/collections/${thin}/"`),
    `linked ${thin}, which the hub and sitemap both hide`,
  );
  for (const slug of healthy) assert.ok(html.includes(`href="/collections/${slug}/"`));
});

test("a D1 failure surfaces rather than rendering a silently empty page", async () => {
  await assert.rejects(() => get(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb({ failMembers: true })));
});

test("HEAD returns the GET headers with no body", async () => {
  const { onRequestHead } = await import("../apps/web/functions/collections/[slug]/index");
  const res = (await onRequestHead(
    ctx(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb(), { slug: SLUG }),
  )) as Response;
  assert.equal(res.status, 200);
  assert.equal(await res.text(), "");
  assert.match(res.headers.get("ETag") ?? "", /coll-/);
});

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

test("the hub lists only collections that clear the publish threshold", async () => {
  const db = fakeDb({
    summaries: [
      { slug: "one-year-wonders", member_count: 200, sample: "Bethzy,Elzada,Marvel" },
      { slug: "only-in-vermont", member_count: 12, sample: "Elzada" },
      { slug: "only-in-alaska", member_count: MIN_PUBLISHABLE_MEMBERS - 1, sample: "Tiny" },
    ],
  });
  const res = (await hubGet(ctx("https://nobodynamed.com/collections/", db))) as Response;
  assert.equal(res.status, 200);

  const html = await res.text();
  assert.ok(html.includes('href="/collections/one-year-wonders/"'));
  assert.ok(html.includes('href="/collections/only-in-vermont/"'));
  assert.ok(
    !html.includes('href="/collections/only-in-alaska/"'),
    "a collection below the threshold must not be advertised",
  );
  assert.ok(html.includes("Bethzy"), "sample names should appear on the card");
});

test("the hub degrades to an explanation when facts have not been seeded", async () => {
  const res = (await hubGet(ctx("https://nobodynamed.com/collections/", fakeDb({ summaries: [] })))) as Response;
  assert.equal(res.status, 200);
  assert.match(await res.text(), /build-name-facts/);
});

// A caught D1 failure that still returns 200 with an s-maxage header is worse
// than an error: the middleware caches any successful cacheable response, so
// the degraded body outlives the outage under a content version that never
// moved. These three routes make different trades, and each has to be right.

test("the hub fails loudly rather than caching an empty index", async () => {
  await assert.rejects(
    () => hubGet(ctx("https://nobodynamed.com/collections/", fakeDb({ failSummaries: true }))),
    /D1 unavailable/,
    "the hub must not render 'nothing published yet' from a query failure",
  );
});

test("a collection page survives losing only its related links, uncached", async () => {
  const res = await get(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb({ failSummaries: true }));
  assert.equal(res.status, 200, "a secondary query must not take the page down");
  assert.match(res.headers.get("Cache-Control") ?? "", /no-store/);
  // The members themselves are unaffected, so the table still renders.
  assert.match(await res.text(), /Bethzy/);
});

// numberOfItems declares the whole collection, so an ItemList position has to
// be the member's rank in that collection. Restarting at 1 on ?page=2 claimed
// two different names both held position 1 and misdescribed the curated order.
test("ItemList positions continue across pages instead of restarting", async () => {
  const jsonLd = async (url: string, db: ReturnType<typeof fakeDb>) => {
    const html = await (await get(url, db)).text();
    const block = /<script type="application\/ld\+json">(.+?)<\/script>/s.exec(html)!;
    const data = JSON.parse(block[1]!.replace(/\\u003c/g, "<"));
    return data.find((d: { "@type": string }) => d["@type"] === "CollectionPage").mainEntity;
  };

  // rank_in is the stored curated rank; page two of a 250-member collection
  // holds ranks 101 onward.
  const pageTwo = Array.from({ length: 100 }, (_, i) => ({ ...member(`N${i}`, i), rank_in: 101 + i }));
  const list = await jsonLd(
    `https://nobodynamed.com/collections/${SLUG}/?page=2`,
    fakeDb({ members: pageTwo, total: 250 }),
  );

  assert.equal(list.numberOfItems, 250, "numberOfItems stays the whole collection");
  assert.equal(list.itemListElement[0].position, 101, "page two must not restart at 1");
  assert.deepEqual(
    list.itemListElement.map((it: { position: number }) => it.position),
    Array.from({ length: list.itemListElement.length }, (_, i) => 101 + i),
  );

  // Page one is unchanged.
  const first = await jsonLd(`https://nobodynamed.com/collections/${SLUG}/`, fakeDb());
  assert.equal(first.itemListElement[0].position, 1);
});
