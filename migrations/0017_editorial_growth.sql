-- Editorial growth foundation: content attribution and newsletter consent storage.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  franchise_id TEXT,
  status TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  metadata_json TEXT,
  UNIQUE(type, slug)
);

CREATE TABLE IF NOT EXISTS content_entities (
  content_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_key TEXT NOT NULL,
  relationship TEXT NOT NULL,
  weight REAL,
  PRIMARY KEY (content_id, entity_type, entity_key, relationship),
  FOREIGN KEY (content_id) REFERENCES content_items(id)
);

CREATE INDEX IF NOT EXISTS idx_content_entities_lookup ON content_entities(entity_type, entity_key);

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  source_content_id TEXT,
  source_placement TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  unsubscribed_at TEXT,
  provider_subscriber_id TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS newsletter_issues (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'archived')),
  html TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  provider_campaign_id TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
