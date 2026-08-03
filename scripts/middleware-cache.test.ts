import assert from "node:assert/strict";
import test from "node:test";

import { onRequest, __resetContentVersionCache } from "../apps/web/functions/_middleware";

// The middleware reads `caches.default` at request time, so the global has to
// exist before the module is imported. This fake is a plain URL-keyed map,
// which is the whole point of the tests below: the Cache API keys on the
// request URL and nothing else, so anything that must invalidate an entry has
// to appear in that URL.
class FakeCache {
  entries = new Map<string, Response>();
  puts: string[] = [];

  async match(req: Request): Promise<Response | undefined> {
    const hit = this.entries.get(req.url);
    return hit ? hit.clone() : undefined;
  }

  async put(req: Request, res: Response): Promise<void> {
    this.puts.push(req.url);
    this.entries.set(req.url, res);
  }
}

let cache = new FakeCache();
(globalThis as { caches?: unknown }).caches = { default: cache as unknown };

interface Meta {
  data_version?: string;
  facts_build?: string;
  /** Stands in for both blog_posts subqueries: "<count>@<max updated_at>". */
  blog_version?: string;
}

function fakeDb(meta: Meta, onQuery?: () => void) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first() {
          if (sql.includes("AS dataVersion")) {
            onQuery?.();
            const [count, updatedAt] = (meta.blog_version ?? "0@").split("@");
            return {
              dataVersion: meta.data_version ?? null,
              factsBuild: meta.facts_build ?? null,
              blogCount: Number(count),
              blogUpdatedAt: updatedAt || null,
            };
          }
          return null;
        },
        async all() {
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

function run(url: string, opts: { meta?: Meta; onQuery?: () => void; hits?: { n: number } } = {}) {
  const hits = opts.hits;
  const ctx = {
    request: new Request(url),
    env: { DB: fakeDb(opts.meta ?? {}, opts.onQuery) },
    params: {},
    waitUntil: (p: Promise<unknown>) => void p,
    next: async () => {
      if (hits) hits.n += 1;
      return new Response("<html>body</html>", {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "public, s-maxage=86400",
        },
      });
    },
  };
  return (onRequest as (c: unknown) => Promise<Response>)(ctx);
}

function reset() {
  cache = new FakeCache();
  (globalThis as { caches?: unknown }).caches = { default: cache as unknown };
  __resetContentVersionCache();
}

const FACTS_ROUTES = [
  "https://x.test/collections/",
  "https://x.test/collections/one-year-wonders/",
  "https://x.test/sitemap-names.xml",
  "https://x.test/sitemap-collections.xml",
  "https://x.test/sitemap-core.xml",
  "https://x.test/name/Marvel/",
];

// The regression this file exists for: these routes previously returned
// ctx.next() directly, skipping the Cache API entirely. A Pages Function
// response is NOT placed in Cloudflare's edge cache just because it carries
// Cache-Control, so that bypass meant every request reran the handler — for
// /sitemap-names.xml, a ~50k-row D1 query on every hit.
test("facts-backed routes populate the cache instead of bypassing it", async () => {
  for (const url of FACTS_ROUTES) {
    reset();
    const hits = { n: 0 };
    await run(url, { meta: { data_version: "dv1", facts_build: "fb1" }, hits });
    assert.equal(cache.puts.length, 1, `${url} was not cached`);
    await run(url, { meta: { data_version: "dv1", facts_build: "fb1" }, hits });
    assert.equal(hits.n, 1, `${url} reran its handler on a cache hit`);
  }
});

test("a facts rebuild lands on a different cache key", async () => {
  // The name sitemap is deliberately absent: it has a data-only scope, covered
  // by its own test below.
  for (const url of FACTS_ROUTES.filter((u) => !u.endsWith("/sitemap-names.xml"))) {
    reset();
    const hits = { n: 0 };
    await run(url, { meta: { data_version: "dv1", facts_build: "fb1" }, hits });
    __resetContentVersionCache(); // the memo TTL lapsing, not the cache clearing
    await run(url, { meta: { data_version: "dv1", facts_build: "fb2" }, hits });
    assert.equal(hits.n, 2, `${url} served a pre-rebuild response after the rebuild`);
    assert.equal(new Set(cache.puts).size, 2);
  }
});

test("a new SSA ingest also lands on a different cache key", async () => {
  reset();
  const hits = { n: 0 };
  const url = "https://x.test/collections/one-year-wonders/";
  await run(url, { meta: { data_version: "dv1", facts_build: "fb1" }, hits });
  __resetContentVersionCache();
  await run(url, { meta: { data_version: "dv2", facts_build: "fb1" }, hits });
  assert.equal(hits.n, 2);
});

// A blog publish touches only blog_posts — neither meta key moves — so without
// the blog half of the version /sitemap-core.xml would omit a new post for the
// full week-long TTL it advertises.
test("a blog publish lands on a different cache key", async () => {
  reset();
  const hits = { n: 0 };
  const url = "https://x.test/sitemap-core.xml";
  await run(url, { meta: { data_version: "dv1", facts_build: "fb1", blog_version: "12@2026-01-01" }, hits });
  __resetContentVersionCache();
  await run(url, { meta: { data_version: "dv1", facts_build: "fb1", blog_version: "13@2026-02-01" }, hits });
  assert.equal(hits.n, 2, "the core sitemap served a pre-publish response");
});

// The other half of that: a blog publish must NOT evict name and collection
// pages. They never read blog_posts, so re-running their D1-heavy handlers —
// tens of thousands of name pages — would buy a body that cannot have changed.
test("a blog publish leaves facts-backed keys alone", async () => {
  for (const url of ["https://x.test/name/Marvel/", "https://x.test/collections/one-year-wonders/", "https://x.test/sitemap-collections.xml"]) {
    reset();
    const hits = { n: 0 };
    await run(url, { meta: { data_version: "dv1", facts_build: "fb1", blog_version: "12@2026-01-01" }, hits });
    __resetContentVersionCache();
    await run(url, { meta: { data_version: "dv1", facts_build: "fb1", blog_version: "13@2026-02-01" }, hits });
    assert.equal(hits.n, 1, `${url} was evicted by an unrelated blog publish`);
  }
});

// /sitemap-names.xml is a list of /name/ URLs drawn from `names`. A facts
// rebuild cannot change a byte of it, so putting the facts component in its key
// would re-run listIndexableNames — a ~50k-row scan — at every cold edge to
// reproduce an identical document.
test("a facts rebuild does not evict the name sitemap", async () => {
  reset();
  const hits = { n: 0 };
  const url = "https://x.test/sitemap-names.xml";
  await run(url, { meta: { data_version: "dv1", facts_build: "fb1" }, hits });
  __resetContentVersionCache();
  await run(url, { meta: { data_version: "dv1", facts_build: "fb2" }, hits });
  assert.equal(hits.n, 1, "a facts-only rebuild re-ran the 50k-row names query");

  // An ingest does change it, and must still land on a fresh key.
  __resetContentVersionCache();
  await run(url, { meta: { data_version: "dv2", facts_build: "fb2" }, hits });
  assert.equal(hits.n, 2, "a new ingest did not refresh the name sitemap");
});

test("the version is memoized, so the common path costs no extra D1 read", async () => {
  reset();
  let queries = 0;
  const meta = { data_version: "dv1", facts_build: "fb1" };
  await run("https://x.test/collections/a/", { meta, onQuery: () => (queries += 1) });
  await run("https://x.test/collections/b/", { meta, onQuery: () => (queries += 1) });
  await run("https://x.test/name/Marvel/", { meta, onQuery: () => (queries += 1) });
  assert.equal(queries, 1);
});

test("routes with no facts dependency carry no version in their key", async () => {
  reset();
  await run("https://x.test/extinct", { meta: { data_version: "dv1", facts_build: "fb1" } });
  assert.equal(cache.puts.length, 1);
  assert.ok(!cache.puts[0]!.includes("__nv_ver"), cache.puts[0]);
});

test("a meta lookup failure degrades to an unversioned key, never an error", async () => {
  reset();
  const ctx = {
    request: new Request("https://x.test/collections/one-year-wonders/"),
    env: {
      DB: {
        prepare() {
          throw new Error("D1 unavailable");
        },
      },
    },
    params: {},
    waitUntil: (p: Promise<unknown>) => void p,
    next: async () =>
      new Response("ok", { headers: { "Cache-Control": "public, s-maxage=86400" } }),
  };
  const res = await (onRequest as (c: unknown) => Promise<Response>)(ctx);
  assert.equal(res.status, 200);
  assert.equal(cache.puts.length, 1);
  assert.ok(!cache.puts[0]!.includes("__nv_ver"));
});

// The sitemap index is three static child URLs and has never been cached here.
test("the sitemap index keeps its long-standing bypass", async () => {
  reset();
  await run("https://x.test/sitemap.xml", { meta: { data_version: "dv1" } });
  assert.equal(cache.puts.length, 0);
});

// _routes.json routes /collections and /collections/<slug> to the same handlers
// as their trailing-slash forms, so without a canonical redirect each slashless
// URL returned a cacheable 200 whose <link rel=canonical> pointed somewhere
// else — a duplicate indexable URL and a second edge-cache entry per collection.
test("slashless collection URLs redirect to their canonical form", async () => {
  for (const [from, to] of [
    ["https://x.test/collections", "https://x.test/collections/"],
    ["https://x.test/collections/one-year-wonders", "https://x.test/collections/one-year-wonders/"],
    ["https://x.test/collections/only-in-vermont", "https://x.test/collections/only-in-vermont/"],
  ]) {
    reset();
    const res = await run(from);
    assert.equal(res.status, 301, `${from} did not redirect`);
    assert.equal(res.headers.get("Location"), to);
    assert.equal(cache.puts.length, 0, "a redirect must not populate the cache");
  }
});

test("already-canonical collection URLs are served, not redirected", async () => {
  for (const url of ["https://x.test/collections/", "https://x.test/collections/one-year-wonders/"]) {
    reset();
    assert.equal((await run(url)).status, 200, url);
  }
});
