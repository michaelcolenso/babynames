import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { absoluteIndexableUrl, buildIndexableRoutes, canonicalRoutePath } from "../packages/shared/src/indexable-routes";
import { DECADE_HUB_DEFINITIONS } from "../packages/shared/src/content/decade-hub-definitions";
import { renderYearPage } from "../packages/shared/src/render-year";

test("registry normalizes and deduplicates canonical routes", () => {
  const routes = buildIndexableRoutes({
    minYear: 2023,
    maxYear: 2024,
    names: [{ name: "Ava Rose" }, { name: "Ava Rose" }],
    blogPosts: [{ slug: "a story", publishedAt: "2026-07-01T12:00:00Z" }],
  });
  assert.equal(routes.filter((route) => route.path === "/name/Ava%20Rose/").length, 1);
  assert.ok(routes.some((route) => route.path === "/year/2024/" && route.family === "year"));
  assert.ok(routes.some((route) => route.path === "/blog/a%20story/" && route.lastmod === "2026-07-01"));
});

test("canonical URLs enforce HTTPS outside local development", () => {
  assert.equal(canonicalRoutePath("/name/Ada"), "/name/Ada/");
  assert.equal(absoluteIndexableUrl("http://nobodynamed.com", "/name/Ada"), "https://nobodynamed.com/name/Ada/");
  assert.equal(absoluteIndexableUrl("http://localhost:8788", "/name/Ada"), "http://localhost:8788/name/Ada/");
});

test("route limit reserves space for structural routes before names", () => {
  const baseline = buildIndexableRoutes({ minYear: 2024, maxYear: 2024 });
  const routes = buildIndexableRoutes({ minYear: 2024, maxYear: 2024, names: [{ name: "Ada" }], maxRoutes: baseline.length });
  assert.equal(routes.length, baseline.length);
  assert.ok(!routes.some((route) => route.family === "name"));
});

test("decade routes and production-seeded children derive from the registry exactly once", () => {
  const routes = buildIndexableRoutes({ minYear: 1880, maxYear: 2025 });
  const paths = routes.map((route) => route.path);
  const seeded = DECADE_HUB_DEFINITIONS.filter((definition) => definition.rolloutState === "seeded");

  for (const definition of DECADE_HUB_DEFINITIONS) {
    assert.equal(paths.filter((path) => path === `/names/${definition.slug}/`).length, 1, `${definition.slug} main route`);
    for (const child of ["methodology", "classroom", "spelling-families"]) {
      const path = `/names/${definition.slug}/${child}/`;
      assert.equal(
        paths.filter((candidate) => candidate === path).length,
        definition.rolloutState === "seeded" ? 1 : 0,
        path,
      );
    }
  }
  assert.equal(routes.filter((route) => route.family === "decade-child").length, seeded.length * 3);
  assert.ok(routes.length < 50_000);
  const decadePaths = routes.filter((route) => route.family === "decade" || route.family === "decade-child").map((route) => route.path);
  assert.ok(decadePaths.every((path) => path.endsWith("/")));
  assert.equal(new Set(decadePaths).size, decadePaths.length);

  const source = readFileSync(new URL("../packages/shared/src/indexable-routes.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /FEATURED_DECADES/);
  assert.match(source, /DECADE_HUB_DEFINITIONS/);
});

test("year pages link back to their canonical decade route", () => {
  const rows = [
    { name: "Jessica", sex: "F", count: 10, rank: 1 },
    { name: "Michael", sex: "M", count: 12, rank: 1 },
  ];
  const html = renderYearPage(1984, rows, {
    canonical: "https://example.com/year/1984/",
    origin: "https://example.com",
    prevYear: 1983,
    nextYear: 1985,
  });
  assert.match(html, /href="\/names\/1980s\/"[^>]*>Explore the 1980s decade<\/a>/);
});

test("ending pages derive the decade navigation link from live minimum-year metadata", async () => {
  const { onRequestGet } = await import("../apps/web/functions/names/ending/[letter]/index");
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (/FROM meta/.test(sql)) {
                const key = String(values[0]);
                const value = key === "min_year" ? "1880" : key === "max_year" ? "2025" : "test-version";
                return { value } as T;
              }
              return null as T;
            },
            async all<T>() {
              return { results: [
                { name: "Ashley", sex: "F", total_count: 100, peak_year: 1987 },
                { name: "Jessica", sex: "F", total_count: 90, peak_year: 1987 },
                { name: "Jeremy", sex: "M", total_count: 80, peak_year: 1977 },
                { name: "Timothy", sex: "M", total_count: 70, peak_year: 1960 },
              ] } as T;
            },
          };
        },
      };
    },
  };
  const response = await onRequestGet({
    params: { letter: "y" },
    request: new Request("https://example.com/names/ending/y/"),
    env: { DB: db },
  } as never);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<a href="\/names\/1880s\/">By decade<\/a>/);
  assert.doesNotMatch(html, /href="\/names\/1980s\/">By decade/);
});
