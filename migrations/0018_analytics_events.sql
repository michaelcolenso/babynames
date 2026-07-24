-- Typed analytics event pipeline (Phase 1: measurement foundation).
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  content_id TEXT,
  content_type TEXT,
  target_content_id TEXT,
  target_content_type TEXT,
  source_placement TEXT,
  franchise_id TEXT,
  session_id TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name_time ON analytics_events(name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_content ON analytics_events(content_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_session ON analytics_events(session_id, occurred_at);
