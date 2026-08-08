-- Usage logging for the /mcp server: one row per client handshake and per
-- tool invocation, so actual MCP usage is visible without relying solely on
-- Cloudflare's raw request counts.
CREATE TABLE IF NOT EXISTS mcp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL, -- 'initialize' | 'tools_call'
  tool_name TEXT, -- set for tools_call
  client_name TEXT, -- from clientInfo on initialize
  client_version TEXT,
  is_error INTEGER NOT NULL DEFAULT 0,
  session_id TEXT,
  user_agent TEXT,
  occurred_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mcp_events_type_time ON mcp_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_mcp_events_tool_time ON mcp_events(tool_name, occurred_at);
CREATE INDEX IF NOT EXISTS idx_mcp_events_session ON mcp_events(session_id, occurred_at);
