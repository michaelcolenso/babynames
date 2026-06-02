import assert from "node:assert/strict";
import test from "node:test";

import {
  compileBlogPost,
  defaultMigrationName,
  renderBlogPostSql,
} from "./blog-publish";

test("compiles markdown frontmatter into a blog post row", () => {
  const post = compileBlogPost(
    `---
title: "Why Mavis Came Back"
date: "2026-05-24"
author: "NobodyNamed"
status: "published"
description: "A tight summary for cards."
---

# Why Mavis Came Back

The name Mavis tells a bigger story about vintage names.

## The data

- Mavis peaked early
- Mavis is rising again

See [Mavis](/name/Mavis/).`,
    "content/blog/why-mavis-came-back.md",
  );

  assert.equal(post.slug, "why-mavis-came-back");
  assert.equal(post.title, "Why Mavis Came Back");
  assert.equal(post.description, "A tight summary for cards.");
  assert.equal(post.author, "NobodyNamed");
  assert.equal(post.status, "published");
  assert.equal(post.publishedAt, "2026-05-24T09:00:00.000Z");
  assert.match(post.bodyHtml, /<p>The name Mavis tells/);
  assert.match(post.bodyHtml, /<h2>The data<\/h2>/);
  assert.match(post.bodyHtml, /<ul>\n<li>Mavis peaked early<\/li>/);
  assert.match(post.bodyHtml, /<a href="\/name\/Mavis\/">Mavis<\/a>/);
  assert.doesNotMatch(post.bodyHtml, /<h1>Why Mavis Came Back<\/h1>/);
});

test("derives description from the first prose paragraph when omitted", () => {
  const post = compileBlogPost(
    `---
title: "Bethzy Mystery"
date: "2026-05-24T15:30:00Z"
---

# Bethzy Mystery

## A heading first

The first real paragraph becomes the fallback description.`,
    "content/blog/bethzy-mystery.md",
  );

  assert.equal(post.description, "The first real paragraph becomes the fallback description.");
  assert.equal(post.author, "NobodyNamed");
  assert.equal(post.ogImage, "/api/og/default");
  assert.equal(post.publishedAt, "2026-05-24T15:30:00.000Z");
});

test("renders SQL with escaped values and an idempotent upsert", () => {
  const post = compileBlogPost(
    `---
title: "Names That Aren't Done"
date: "2026-05-24"
---

That's the whole point.`,
    "content/blog/not-done.md",
  );

  const sql = renderBlogPostSql(post);

  assert.match(sql, /INSERT INTO blog_posts/);
  assert.match(sql, /ON CONFLICT\(slug\) DO UPDATE SET/);
  assert.match(sql, /Names That Aren''t Done/);
  assert.match(sql, /That''s the whole point\./);
});

test("builds timestamped migration names that avoid existing numeric collisions", () => {
  assert.equal(
    defaultMigrationName("why-mavis-came-back", new Date("2026-05-24T18:42:30Z")),
    "20260524T184230_publish_why_mavis_came_back.sql",
  );
});
