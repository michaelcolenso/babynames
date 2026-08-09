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

type Part = { text?: string };
type IncomingMessage = {
  contextId?: string;
  parts?: Part[];
  metadata?: { skillId?: string };
};

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
  let msg: JsonRpcMessage;
  try {
    msg = (await ctx.request.json()) as JsonRpcMessage;
  } catch {
    return err(null, -32700, "Parse error");
  }

  const { id, method, params } = msg;

  if (method !== "SendMessage") {
    return err(id, -32601, "Method not found");
  }

  const { message } = (params ?? {}) as { message?: IncomingMessage };
  const text = (message?.parts ?? [])
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("");

  const replyText = await reply(text, message?.metadata?.skillId, ctx.env.DB);
  return ok(id, { message: agentMessage(replyText, message?.contextId) });
};
