import assert from "node:assert/strict";
import test from "node:test";

import { shouldServeMarkdown } from "../apps/web/functions/_request-format";

test("serves HTML for browser document navigations", () => {
  const request = new Request("https://nobodynamed.com/", {
    headers: {
      Accept: "text/html;q=0.8, text/markdown;q=1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
    },
  });

  assert.equal(shouldServeMarkdown(request), false);
});

test("serves HTML to browsers when Fetch Metadata is missing", () => {
  const request = new Request("https://nobodynamed.com/", {
    headers: {
      Accept: "text/markdown",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    },
  });

  assert.equal(shouldServeMarkdown(request), false);
});

test("serves Markdown to explicit non-navigation clients", () => {
  const request = new Request("https://nobodynamed.com/", {
    headers: { Accept: "text/markdown", "User-Agent": "curl/8.0" },
  });

  assert.equal(shouldServeMarkdown(request), true);
});
