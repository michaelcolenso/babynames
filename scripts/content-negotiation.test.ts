import assert from "node:assert/strict";
import test from "node:test";

import { prefersMarkdown, shouldServeMarkdown } from "../apps/web/functions/_accept";

test("serves HTML for ordinary browser Accept headers", () => {
  assert.equal(
    prefersMarkdown("text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,*/*;q=0.8"),
    false,
  );
  assert.equal(prefersMarkdown(null), false);
});

test("serves Markdown when it is the only or preferred representation", () => {
  assert.equal(prefersMarkdown("text/markdown"), true);
  assert.equal(prefersMarkdown("text/html;q=0.8, text/markdown;q=1"), true);
});

test("keeps the visual HTML page when Markdown is only an equal capability", () => {
  assert.equal(prefersMarkdown("text/markdown, text/html"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0.9, text/html;q=0.9"), false);
  assert.equal(prefersMarkdown("text/markdown;q=0, text/html"), false);
});

test("always serves HTML for browser document navigations", () => {
  const request = new Request("https://nobodynamed.com/", {
    headers: {
      Accept: "text/html;q=0.8, text/markdown;q=1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
    },
  });

  assert.equal(shouldServeMarkdown(request), false);
});

test("still serves Markdown to explicit non-navigation clients", () => {
  const request = new Request("https://nobodynamed.com/", {
    headers: { Accept: "text/markdown" },
  });

  assert.equal(shouldServeMarkdown(request), true);
});

test("keeps agent-discovery documents out of the unpurgeable variant cache", async () => {
  const { usesVariantCache } = await import("../apps/web/functions/_middleware");

  // Entries in the variant cache are keyed by a synthetic `__nv_variant` URL
  // that Cloudflare's purge API cannot address, so a deleted `.well-known`
  // file would keep being served for its whole stale-while-revalidate window.
  assert.equal(usesVariantCache("/.well-known/oauth-protected-resource"), false);
  assert.equal(usesVariantCache("/.well-known/api-catalog"), false);
  assert.equal(usesVariantCache("/.well-known/mcp/server-card.json"), false);

  // Ordinary content-negotiated routes still use it.
  assert.equal(usesVariantCache("/"), true);
  assert.equal(usesVariantCache("/name/Hazel/"), true);
});

test("leaves self-caching routes out of the variant cache", async () => {
  const { cachesOwnResponse, usesVariantCache } = await import("../apps/web/functions/_middleware");

  // The sitemap caches itself in sitemap.xml.ts under a data_version key. If the
  // middleware also cached it, the synthetic `__nv_variant` copy (which
  // purge-by-URL cannot address) would shadow the handler's entry for the whole
  // s-maxage window and hold a stale 1.9 MB document there.
  assert.equal(cachesOwnResponse("/sitemap.xml"), true);
  assert.equal(usesVariantCache("/sitemap.xml"), true);

  assert.equal(cachesOwnResponse("/"), false);
  assert.equal(cachesOwnResponse("/name/Hazel/"), false);
  assert.equal(cachesOwnResponse("/api/name/emma"), false);
});

test("canonicalizes function-served hubs to a single trailing-slash form", async () => {
  const { canonicalizePath } = await import("../apps/web/functions/_middleware");

  // Hubs whose canonical URL has no trailing slash must 301 away from it, the
  // same way /rising/ already does.
  assert.equal(canonicalizePath("/emerging/"), "/emerging");
  assert.equal(canonicalizePath("/fading/"), "/fading");
  assert.equal(canonicalizePath("/newsletter/"), "/newsletter");
  assert.equal(canonicalizePath("/stories/american-name-atlas/"), "/stories/american-name-atlas");

  // ...and the canonical (no-slash) form is left alone.
  assert.equal(canonicalizePath("/emerging"), null);
  assert.equal(canonicalizePath("/newsletter"), null);
});

test("never appends a slash to a path that names a file", async () => {
  const { canonicalizePath } = await import("../apps/web/functions/_middleware");

  // Regression: `/blog/<slug>.html` was rewritten to `/blog/<slug>.html/`, a 404.
  assert.equal(canonicalizePath("/blog/two-americas.html"), null);
  assert.equal(canonicalizePath("/blog/the-kehlani-effect.html"), null);

  // Real slugs still get the trailing slash.
  assert.equal(canonicalizePath("/blog/the-kehlani-effect"), "/blog/the-kehlani-effect/");
});

test("leaves /viz to Pages, which normalizes it before Functions run", async () => {
  const { canonicalizePath } = await import("../apps/web/functions/_middleware");
  // `/viz` is not in _routes.json's include list, so no rule here can ever fire.
  assert.equal(canonicalizePath("/viz"), null);
});

test("sends the deleted two-americas post to its replacement", async () => {
  const { canonicalizePath } = await import("../apps/web/functions/_middleware");
  // Without this the middleware appended a slash and the handler 404'd.
  assert.equal(canonicalizePath("/blog/two-americas"), "/blog/mateo-and-maverick/");
  assert.equal(canonicalizePath("/blog/two-americas/"), "/blog/mateo-and-maverick/");
  // A live post is untouched.
  assert.equal(canonicalizePath("/blog/mateo-and-maverick/"), null);
});
