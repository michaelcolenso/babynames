// POST /a2a — minimal A2A (https://a2a-protocol.org) JSON-RPC 2.0 binding.
//
// Implements SendMessage only — no Task lifecycle, streaming, or push
// notifications. This is a small stateless lookup agent, not a full task
// runner, so a synchronous `message` reply (rather than a `task`) is a
// valid SendMessage response per the spec. The .well-known/agent-card.json
// supportedInterfaces entry points here; this exists so that entry is a
// real, working endpoint rather than an advertised URL nothing answers.
//
// Mirrors functions/mcp.ts's JSON-RPC envelope, and queries D1 directly
// (classify() results are already stored on the `names` row — see
// CLAUDE.md) rather than round-tripping through the site's own REST API.

import { getNameWithSeries, searchByPrefix } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

type JsonRpcMessage = {
  jsonrpc: string;
  id?: unknown;
  method: string;
  params?: unknown;
};

type Part = { text: string };
type IncomingMessage = {
  contextId?: string;
  parts?: Part[];
  metadata?: { skillId?: string };
};

// message.parts comes straight from untrusted request JSON — a truthy
// non-array (e.g. `{}`) or an array containing `null` would otherwise throw
// inside .map(), which the outer middleware turns into a generic 503
// instead of a JSON-RPC error response. The Agent Card advertises only
// text/plain input, so a part without a string `text` isn't a part this
// endpoint supports — accepting it silently (as empty text) would answer
// with the generic help prompt instead of rejecting the request.
function isValidParts(parts: unknown): parts is Part[] {
  return (
    Array.isArray(parts) &&
    parts.every((p) => p !== null && typeof p === "object" && typeof (p as Part).text === "string")
  );
}

function isValidId(id: unknown): id is string | number | null {
  return id === null || typeof id === "string" || typeof id === "number";
}

function ok(id: unknown, result: unknown) {
  return Response.json(
    { jsonrpc: "2.0", id, result },
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

function err(id: unknown, code: number, message: string) {
  return Response.json(
    { jsonrpc: "2.0", id, error: { code, message } },
    { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}

function agentMessage(text: string, contextId?: string) {
  return {
    messageId: crypto.randomUUID(),
    contextId,
    role: "ROLE_AGENT",
    parts: [{ text }],
  };
}

// Which skill runs is selected explicitly via `message.metadata.skillId`
// ("name-lookup" or "name-search") rather than inferred from the text —
// inferring from "is this an exact name match" breaks the moment a search
// prefix (e.g. "Jen", "Mich") also happens to be a real, if obscure, name
// on file, silently making the search skill unreachable for that input.
async function lookupName(query: string, db: D1Database): Promise<string> {
  const rows = await getNameWithSeries(db, query.toLowerCase());
  if (!rows.length) {
    return `No name on file matching "${query}".`;
  }
  const summaries = rows.map(
    ({ row }) =>
      `${row.sex}: ${row.status}, peaked at ${row.peak_count.toLocaleString()} births in ${row.peak_year}, ${row.latest_count.toLocaleString()} in the most recent year on record.`,
  );
  return `${rows[0]!.row.name} — ${summaries.join(" ")}`;
}

async function searchNames(query: string, db: D1Database): Promise<string> {
  const hits = query.length >= 2 ? await searchByPrefix(db, query, 10) : [];
  if (!hits.length) {
    return `No names found matching "${query}".`;
  }
  return `Matches for "${query}": ${hits.map((r) => `${r.name} (${r.sex})`).join(", ")}.`;
}

async function reply(text: string, skillId: string | undefined, db: D1Database): Promise<string> {
  const query = text.trim();
  if (!query) {
    return 'Ask me about a US baby name. Set message.metadata.skillId to "name-lookup" for trend ' +
      'history on an exact name (e.g. "Jennifer"), or "name-search" (the default) for prefix matches (e.g. "Jen").';
  }

  return skillId === "name-lookup" ? lookupName(query, db) : searchNames(query, db);
}

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  let parsed: unknown;
  try {
    parsed = await ctx.request.json();
  } catch {
    return err(null, -32700, "Parse error");
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return err(null, -32600, "Invalid Request");
  }
  const msg = parsed as JsonRpcMessage;
  const hasId = Object.prototype.hasOwnProperty.call(msg, "id");
  const { id, method, params } = msg;

  if (msg.jsonrpc !== "2.0" || typeof method !== "string" || (hasId && !isValidId(id))) {
    return err(hasId && isValidId(id) ? id : null, -32600, "Invalid Request");
  }

  // A request with no `id` is a JSON-RPC notification — the caller has
  // declared it doesn't want a response, so none is sent (not even an error).
  if (!hasId) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  if (method !== "SendMessage") {
    return err(id, -32601, "Method not found");
  }

  const { message } = (params ?? {}) as { message?: IncomingMessage };
  if (message?.parts !== undefined && !isValidParts(message.parts)) {
    return err(id, -32602, "Invalid params: message.parts must be an array of text parts");
  }
  const text = (message?.parts ?? []).map((p) => p.text).join("");

  const replyText = await reply(text, message?.metadata?.skillId, ctx.env.DB);
  return ok(id, { message: agentMessage(replyText, message?.contextId) });
};
