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
type IncomingMessage = { contextId?: string; parts?: Part[] };

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

const SINGLE_NAME = /^[a-zA-Z']{1,30}$/;

async function reply(text: string, db: D1Database): Promise<string> {
  const query = text.trim();
  if (!query) {
    return 'Ask me about a US baby name — e.g. "Jennifer" for its trend history, or a prefix like "Jen" to search.';
  }

  if (SINGLE_NAME.test(query)) {
    const rows = await getNameWithSeries(db, query.toLowerCase());
    if (rows.length) {
      const summaries = rows.map(
        ({ row }) =>
          `${row.sex}: ${row.status}, peaked at ${row.peak_count.toLocaleString()} births in ${row.peak_year}, ${row.latest_count.toLocaleString()} in the most recent year on record.`,
      );
      return `${rows[0]!.row.name} — ${summaries.join(" ")}`;
    }
  }

  const hits = query.length >= 2 ? await searchByPrefix(db, query, 10) : [];
  if (!hits.length) {
    return `No names found matching "${query}".`;
  }
  return `Matches for "${query}": ${hits.map((r) => `${r.name} (${r.sex})`).join(", ")}.`;
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
  const text = message?.parts?.find((p) => typeof p.text === "string")?.text ?? "";

  const replyText = await reply(text, ctx.env.DB);
  return ok(id, { message: agentMessage(replyText, message?.contextId) });
};
