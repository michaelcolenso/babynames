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
