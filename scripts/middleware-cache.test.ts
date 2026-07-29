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
}

function fakeDb(meta: Meta, onQuery?: () => void) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first() {
          return null;
        },
        async all() {
          if (sql.includes("FROM meta")) {
            onQuery?.();
            return {
              results: Object.entries(meta).map(([key, value]) => ({ key, value })),
            };
          }
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
  "https://x.test/collections",
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
  for (const url of FACTS_ROUTES) {
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
