-- Blog posts for the NobodyNamed site.
-- Content is stored as HTML; the admin endpoint handles create/update.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS blog_posts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT    NOT NULL UNIQUE,
  title        TEXT    NOT NULL,
  description  TEXT    NOT NULL DEFAULT '',
  body_html    TEXT    NOT NULL DEFAULT '',
  published_at TEXT,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  status       TEXT    NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  author       TEXT    NOT NULL DEFAULT '',
  og_image     TEXT
);

CREATE INDEX IF NOT EXISTS blog_posts_slug       ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS blog_posts_published  ON blog_posts(published_at DESC) WHERE status = 'published';
