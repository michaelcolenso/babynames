import assert from "node:assert/strict";
import test from "node:test";
import { absoluteIndexableUrl, buildIndexableRoutes, canonicalRoutePath } from "../packages/shared/src/indexable-routes";

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
