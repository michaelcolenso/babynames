// Search signals from the 2026-11 audit: the pages.dev alias redirect and
// ingest-dated sitemap lastmod.

import { test } from "node:test";
import assert from "node:assert/strict";

import { productionAliasRedirect } from "../apps/web/functions/_middleware";
import { buildIndexableRoutes } from "../packages/shared/src/indexable-routes";

test("the production pages.dev alias redirects page loads to the apex domain", () => {
  const go = (u: string, method = "GET") => productionAliasRedirect(new URL(u), method);
  assert.equal(go("https://name-vitals.pages.dev/name/Olivia/"), "https://nobodynamed.com/name/Olivia/");
  assert.equal(go("https://name-vitals.pages.dev/state/texas/?year=2020"), "https://nobodynamed.com/state/texas/?year=2020");
  assert.equal(go("https://name-vitals.pages.dev/"), "https://nobodynamed.com/");
  assert.equal(go("https://name-vitals.pages.dev/sitemap.xml", "HEAD"), "https://nobodynamed.com/sitemap.xml");
  // One hop even when the path also needs canonicalizing.
  assert.equal(go("https://name-vitals.pages.dev/year/2020"), "https://nobodynamed.com/year/2020/");
});

test("the alias redirect leaves machine endpoints, writes, previews and the apex alone", () => {
  const go = (u: string, method = "GET") => productionAliasRedirect(new URL(u), method);
  for (const path of ["/api/search?q=ol", "/api/blog/admin", "/mcp", "/a2a", "/.well-known/oauth-protected-resource"]) {
    assert.equal(go(`https://name-vitals.pages.dev${path}`), null, path);
  }
  assert.equal(go("https://name-vitals.pages.dev/name/Olivia/", "POST"), null);
  assert.equal(go("https://43a2855e.name-vitals.pages.dev/name/Olivia/"), null);
  assert.equal(go("https://nobodynamed.com/name/Olivia/"), null);
  assert.equal(go("http://localhost:8788/name/Olivia/"), null);
});


test("sitemap lastmod follows the last ingest, not the data year", () => {
  const routes = buildIndexableRoutes({ minYear: 1880, maxYear: 2025, names: [{ name: "Olivia" }], dataUpdatedAt: "2026-05-19T04:12:00.000Z" });
  const lastmod = (path: string) => routes.find((r) => r.path === path)?.lastmod;
  assert.equal(lastmod("/name/Olivia/"), "2026-05-19");
  assert.equal(lastmod("/year/2025/"), "2026-05-19");
  assert.equal(lastmod("/names/2020s/"), "2026-05-19");
  assert.equal(lastmod("/names/a/"), "2026-05-19");
  // Finished years keep their own date, and pre-1970 years still omit it.
  assert.equal(lastmod("/year/2024/"), "2024-05-15");
  assert.equal(lastmod("/year/1950/"), undefined);

  const fallback = buildIndexableRoutes({ minYear: 1880, maxYear: 2025, names: [{ name: "Olivia" }], dataUpdatedAt: "not-a-date" });
  assert.equal(fallback.find((r) => r.path === "/name/Olivia/")?.lastmod, "2025-05-15");
});
