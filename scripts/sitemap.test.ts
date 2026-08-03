import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet as indexGet } from "../apps/web/functions/sitemap.xml";
import { onRequestGet as coreGet } from "../apps/web/functions/sitemap-core.xml";
import { onRequestGet as namesGet } from "../apps/web/functions/sitemap-names.xml";
import { onRequestGet as collectionsGet } from "../apps/web/functions/sitemap-collections.xml";
import { MAX_SITEMAP_URLS } from "../packages/shared/src/sitemap-util";
import { MIN_PUBLISHABLE_MEMBERS } from "../packages/shared/src/collections";

interface DbOptions {
  names?: { name: string }[];
  summaries?: { slug: string; member_count: number; sample: string | null }[];
  blog?: { slug: string; publishedAt: string | null }[];
  version?: { dataVersion?: string; factsBuild?: string; blogVersion?: string };
  failSummaries?: boolean;
}

function fakeDb({ names = [], summaries = [], blog = [], version = {}, failSummaries = false }: DbOptions = {}) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first<T>(): Promise<T | null> {
          if (sql.includes("AS dataVersion")) {
            const [count, updatedAt] = (version.blogVersion ?? "0@").split("@");
            return {
              dataVersion: version.dataVersion ?? null,
              factsBuild: version.factsBuild ?? null,
              blogCount: Number(count),
              blogUpdatedAt: updatedAt || null,
            } as T;
          }
          if (sql.includes("FROM meta")) return { value: "1880" } as T;
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("GROUP BY slug")) {
            if (failSummaries) throw new Error("D1 unavailable");
            return { results: summaries as unknown as T[] };
          }
          if (sql.includes("blog_posts")) return { results: blog as unknown as T[] };
          if (sql.includes("quality_score")) return { results: names as unknown as T[] };
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

function ctx(url: string, db: ReturnType<typeof fakeDb>) {
  return { request: new Request(url), env: { DB: db }, params: {} } as never;
}

const ORIGIN = "https://nobodynamed.com";

function locs(xml: string): string[] {
  return [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]!);
}

// A blog publish through scripts/blog-publish.ts writes only to blog_posts, so
// an ETag built from data_version alone stayed byte-identical while this
// sitemap's body gained a URL. With the week-long TTL these responses carry,
// that hid a new post from crawlers for up to seven days.
test("the core sitemap's ETag moves when a post is published", async () => {
  const etag = async (v: DbOptions["version"], blog: DbOptions["blog"]) =>
    ((await coreGet(ctx(`${ORIGIN}/sitemap-core.xml`, fakeDb({ version: v, blog })))) as Response).headers.get(
      "ETag",
    );

  const base = { dataVersion: "dv1", factsBuild: "fb1", blogVersion: "12@2026-01-01" };
  const before = await etag(base, [{ slug: "a-post", publishedAt: "2026-01-02T00:00:00Z" }]);
  const after = await etag({ ...base, blogVersion: "13@2026-02-01" }, [
    { slug: "a-post", publishedAt: "2026-01-02T00:00:00Z" },
    { slug: "b-post", publishedAt: "2026-02-01T00:00:00Z" },
  ]);
  assert.ok(before, "the core sitemap should carry an ETag");
  assert.notEqual(before, after, "publishing a post left the validator unchanged");
  // An edit that changes no post count still moves it, and an unrelated request
  // does not.
  assert.equal(before, await etag(base, [{ slug: "a-post", publishedAt: "2026-01-02T00:00:00Z" }]));
});

test("/sitemap.xml is an index listing exactly the three children", async () => {
  const res = (await indexGet(ctx(`${ORIGIN}/sitemap.xml`, fakeDb()))) as Response;
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Content-Type") ?? "", /application\/xml/);

  const xml = await res.text();
  assert.match(xml, /<sitemapindex/);
  assert.ok(!xml.includes("<urlset"), "the index must not also be a urlset");
  assert.deepEqual(locs(xml), [
    `${ORIGIN}/sitemap-core.xml`,
    `${ORIGIN}/sitemap-names.xml`,
    `${ORIGIN}/sitemap-collections.xml`,
  ]);
});

test("the names sitemap is no longer squeezed by the other URL classes", async () => {
  const many = Array.from({ length: MAX_SITEMAP_URLS + 500 }, (_, i) => ({ name: `Name${i}` }));
  const res = (await namesGet(ctx(`${ORIGIN}/sitemap-names.xml`, fakeDb({ names: many })))) as Response;
  const found = locs(await res.text());
  assert.equal(found.length, MAX_SITEMAP_URLS, "must fill, and not exceed, the per-file cap");
  assert.ok(found.every((l) => l.startsWith(`${ORIGIN}/name/`)));
});

test("name URLs are encoded", async () => {
  const res = (await namesGet(
    ctx(`${ORIGIN}/sitemap-names.xml`, fakeDb({ names: [{ name: "Mary Ann" }] })),
  )) as Response;
  assert.match(await res.text(), /\/name\/Mary%20Ann\//);
});

test("the core sitemap carries the hubs and the collections index, but no name pages", async () => {
  const res = (await coreGet(
    ctx(`${ORIGIN}/sitemap-core.xml`, fakeDb({ blog: [{ slug: "a-post", publishedAt: "2026-01-02T00:00:00Z" }] })),
  )) as Response;
  const found = locs(await res.text());

  assert.ok(found.includes(`${ORIGIN}/`));
  assert.ok(found.includes(`${ORIGIN}/extinct`));
  assert.ok(found.includes(`${ORIGIN}/collections/`), "the collections hub must be discoverable");
  assert.ok(found.includes(`${ORIGIN}/blog/a-post/`));
  assert.ok(found.some((l) => /\/year\/1880\//.test(l)));
  assert.ok(found.some((l) => /\/names\/ending\/a\//.test(l)));
  assert.ok(!found.some((l) => l.startsWith(`${ORIGIN}/name/`)), "name pages belong in their own file");
});

test("the collections sitemap lists only populated collections", async () => {
  const db = fakeDb({
    summaries: [
      { slug: "one-year-wonders", member_count: 200, sample: null },
      { slug: "only-in-vermont", member_count: MIN_PUBLISHABLE_MEMBERS, sample: null },
      { slug: "only-in-alaska", member_count: MIN_PUBLISHABLE_MEMBERS - 1, sample: null },
      { slug: "a-retired-slug", member_count: 500, sample: null },
    ],
  });
  const found = locs(await ((await collectionsGet(ctx(`${ORIGIN}/sitemap-collections.xml`, db))) as Response).text());

  assert.ok(found.includes(`${ORIGIN}/collections/one-year-wonders/`));
  assert.ok(found.includes(`${ORIGIN}/collections/only-in-vermont/`));
  assert.ok(!found.includes(`${ORIGIN}/collections/only-in-alaska/`), "thin collections must not be advertised");
  assert.ok(
    !found.some((l) => l.includes("a-retired-slug")),
    "a slug no longer in the registry must not be advertised",
  );
  assert.ok(!found.some((l) => l.includes("page=")), "paginated URLs are noindex and must not be listed");
});

test("the collections sitemap survives an unseeded database", async () => {
  const res = (await collectionsGet(ctx(`${ORIGIN}/sitemap-collections.xml`, fakeDb()))) as Response;
  assert.equal(res.status, 200);
  const xml = await res.text();
  assert.match(xml, /<urlset/);
  assert.equal(locs(xml).length, 0);
});

test("each sitemap carries a distinct ETag so one cannot mask another", async () => {
  const db = fakeDb();
  const tags = await Promise.all(
    [
      indexGet(ctx(`${ORIGIN}/sitemap.xml`, db)),
      coreGet(ctx(`${ORIGIN}/sitemap-core.xml`, db)),
      namesGet(ctx(`${ORIGIN}/sitemap-names.xml`, db)),
      collectionsGet(ctx(`${ORIGIN}/sitemap-collections.xml`, db)),
    ].map(async (p) => ((await p) as Response).headers.get("ETag")),
  );
  const present = tags.filter(Boolean);
  assert.equal(new Set(present).size, present.length, "duplicate ETags across sitemaps");
});

test("every emitted XML document is well-formed enough to parse", async () => {
  const db = fakeDb({ names: [{ name: "O'Neal & Sons" }], summaries: [{ slug: "one-year-wonders", member_count: 9, sample: null }] });
  for (const handler of [indexGet, coreGet, namesGet, collectionsGet]) {
    const xml = await ((await handler(ctx(`${ORIGIN}/sitemap.xml`, db))) as Response).text();
    assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    // Raw ampersands and apostrophes must be escaped, or the file fails to parse.
    const inner = xml.replace(/&(amp|lt|gt|quot|apos);/g, "");
    assert.ok(!inner.includes("&"), "unescaped ampersand in sitemap output");
  }
});

// An empty sitemap is a valid document, which is what makes this dangerous: a
// caught D1 failure would publish "this site has no collection pages" with a
// week-long TTL, and the middleware would keep serving it long after D1
// recovered. An unseeded table returns [] without throwing, so the legitimate
// empty case still works.
test("the collections sitemap errors rather than publishing an empty urlset", async () => {
  await assert.rejects(
    () => collectionsGet(ctx(`${ORIGIN}/sitemap-collections.xml`, fakeDb({ failSummaries: true }))),
    /D1 unavailable/,
  );
});

// A crawler decides whether to refetch a child from the index's lastmod. When
// all three carried the SSA release date, a facts rebuild or a blog publish was
// invisible here and the crawler skipped the one child that had changed.
test("each child sitemap is stamped with the date of what it is built from", async () => {
  const lastmods = async (version: DbOptions["version"]) => {
    const xml = await ((await indexGet(ctx(`${ORIGIN}/sitemap.xml`, fakeDb({ version })))) as Response).text();
    const blocks = [...xml.matchAll(/<sitemap>([\s\S]*?)<\/sitemap>/g)].map((m) => m[1]!);
    return Object.fromEntries(
      blocks.map((b) => [
        /<loc>(.*?)<\/loc>/.exec(b)![1]!.replace(`${ORIGIN}/`, ""),
        /<lastmod>(.*?)<\/lastmod>/.exec(b)?.[1] ?? null,
      ]),
    );
  };

  const base = { dataVersion: "dv1", factsBuild: "2026-06-01T00:00:00Z", blogVersion: "12@2026-07-04T00:00:00Z" };
  const stamps = await lastmods(base);
  // maxYear is 1880 in the fake, so the SSA date is the oldest of the three and
  // each child has to reach past it for its own signal.
  assert.equal(stamps["sitemap-names.xml"], "1880-05-15", "the name cohort only moves on ingest");
  assert.equal(stamps["sitemap-collections.xml"], "2026-06-01", "collections follow the facts build");
  assert.equal(stamps["sitemap-core.xml"], "2026-07-04", "core follows the newest blog post");

  // A facts rebuild moves the collections child and nothing else.
  const after = await lastmods({ ...base, factsBuild: "2026-08-02T00:00:00Z" });
  assert.equal(after["sitemap-collections.xml"], "2026-08-02");
  assert.equal(after["sitemap-core.xml"], stamps["sitemap-core.xml"]);
  assert.equal(after["sitemap-names.xml"], stamps["sitemap-names.xml"]);
});
