# Blog Publishing

Author posts as Markdown with frontmatter, then generate a D1 migration. The
site still serves posts from the `blog_posts` table; this folder is the source
format for new editorial work.

## New Post

```bash
npm run blog:publish -- content/blog/my-post.md
```

That writes a timestamped SQL migration under `migrations/`. Review the SQL,
then apply that file:

```bash
npm run blog:apply:local -- migrations/<generated-file>.sql
npm run blog:apply:remote -- migrations/<generated-file>.sql
```

The blog apply commands execute one reviewed file. Use `npm run
migrations:apply:local` and `npm run migrations:apply` for schema migrations
that should apply every pending file in the migration directory.

## Preview SQL Without Writing

```bash
npm run blog:preview -- content/blog/my-post.md
```

## Check The Publisher

```bash
npm run blog:test
```

## Frontmatter

```yaml
---
title: "Post title"
date: "2026-05-24"
slug: "custom-slug"
description: "Short description for cards and meta tags."
author: "NobodyNamed"
status: "published"
og_image: "/api/og/default"
---
```

Only `title` is required. `slug` defaults to the filename, `author` defaults to
`NobodyNamed`, `status` defaults to `published`, and `description` defaults to
the first prose paragraph. A date written as `YYYY-MM-DD` publishes at
`09:00:00.000Z`.

The first `# Title` heading is stripped when it matches the frontmatter title,
because the blog renderer already prints the page title.

Markdown supports paragraphs, headings, links, lists, blockquotes, simple
tables, and horizontal rules. Raw HTML blocks are preserved for existing blog
visual components.
