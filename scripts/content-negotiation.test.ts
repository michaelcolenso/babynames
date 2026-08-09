import assert from "node:assert/strict";
import test from "node:test";

import { prefersMarkdown } from "../apps/web/functions/_accept";

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
