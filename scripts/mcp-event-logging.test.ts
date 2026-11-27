import assert from "node:assert/strict";
import test from "node:test";
import { openSqlite, skip, type SqliteDb } from "./lib/d1-limit-standin";
import { MCP_INITIALIZE_INSERT_SQL, MCP_TOOL_CALL_INSERT_SQL } from "../apps/web/functions/mcp";

// node:sqlite ships in Node 22+; the shared stand-in skips on older runtimes
// instead of failing the whole `npm test` chain at import time.
async function freshDb(): Promise<SqliteDb> {
  return openSqlite(["20260808T210000_mcp_event_logging.sql"]);
}

const handshake = (client: string | null, ua: string | null, version: string | null = "1.0") =>
  ["initialize", null, client, version, 0, null, ua] as const;

test("repeat handshakes from one client log one row per day", { skip }, async () => {
  const db = await freshDb();
  const insert = db.prepare(MCP_INITIALIZE_INSERT_SQL);
  for (let i = 0; i < 5; i++) insert.run(...handshake("mcpbeat", "mcpbeat/0.1"));
  insert.run(...handshake("mcpbeat", "mcpbeat/0.1", "0.2")); // new version counts as a new client
  insert.run(...handshake("glama", "node"));
  insert.run(...handshake(null, null));
  insert.run(...handshake(null, null)); // anonymous handshakes dedupe too (IS, not =)
  const rows = db.prepare("SELECT client_name, client_version FROM mcp_events ORDER BY id").all();
  assert.deepEqual(
    rows.map((r) => `${r.client_name}@${r.client_version}`),
    ["mcpbeat@1.0", "mcpbeat@0.2", "glama@1.0", "null@1.0"],
  );
});

test("a handshake from an earlier day does not suppress today's", { skip }, async () => {
  const db = await freshDb();
  db.prepare(
    `INSERT INTO mcp_events(event_type, client_name, client_version, user_agent, occurred_at)
     VALUES('initialize', 'mcpbeat', '1.0', 'mcpbeat/0.1', datetime('now', 'start of day', '-1 second'))`,
  ).run();
  db.prepare(MCP_INITIALIZE_INSERT_SQL).run(...handshake("mcpbeat", "mcpbeat/0.1"));
  assert.equal((db.prepare("SELECT COUNT(*) n FROM mcp_events").get() as { n: number }).n, 2);
});

test("tool calls are never deduplicated", { skip }, async () => {
  const db = await freshDb();
  const insert = db.prepare(MCP_TOOL_CALL_INSERT_SQL);
  for (let i = 0; i < 3; i++) insert.run("tools_call", "get_name_data", null, null, 0, "s1", "node");
  assert.equal((db.prepare("SELECT COUNT(*) n FROM mcp_events").get() as { n: number }).n, 3);
});
