import assert from "node:assert/strict";
import test from "node:test";

import { pageShell, siteHeader } from "../packages/shared/src/index";

test("renders the shared wordmark with explicit alternative text", () => {
  const header = siteHeader("/");

  assert.match(
    header,
    /<a class="brand" href="\/" aria-label="NobodyNamed home"><img class="brand-logo brand-logo-light" src="\/assets\/brand\/wordmark\.svg" alt="NobodyNamed" loading="lazy"><img class="brand-logo brand-logo-dark" src="\/assets\/brand\/wordmark-dark\.svg" alt="NobodyNamed" loading="lazy"><\/a>/,
  );
  assert.doesNotMatch(header, /class="brand-logo[^"]*"[^>]*alt=""/);
});

test("includes the corrected wordmark in full page-shell output", () => {
  const html = pageShell({
    title: "Test page",
    description: "A deterministic shell test.",
    canonical: "https://nobodynamed.com/test/",
    body: "<h1>Test page</h1>",
    currentPath: "/test/",
  });

  const wordmarkMatches = html.match(/class="brand-logo[^"]*"[^>]*alt="NobodyNamed"/g);
  assert.equal(wordmarkMatches?.length, 2, "expects both the light and dark wordmark variants");
  assert.doesNotMatch(html, /<img\b[^>]*class="brand-logo[^"]*"[^>]*alt=""/);
});
