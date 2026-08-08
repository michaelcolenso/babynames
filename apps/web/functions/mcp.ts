import type { D1Database, PagesFunction } from "@cloudflare/workers-types";

const PROTOCOL_VERSION = "2025-03-26";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id",
};

const TOOLS = [
  {
    name: "search_names",
    description:
      "Autocomplete search for US baby names. Returns up to 10 suggestions matching the given prefix.",
    inputSchema: {
      type: "object",
      properties: {
        q: { type: "string", description: 'Name prefix to search for (e.g. "Jen", "The")' },
      },
      required: ["q"],
    },
  },
  {
    name: "get_name_data",
    description:
      "Returns full yearly birth count timeseries (1880–2025) for a given name for both sexes, including trend classification (rising/stable/declining/endangered/extinct), peak year, and peak count.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The baby name to look up (case-insensitive)" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_names_by_status",
    description: "Returns a curated list of names filtered by trend status.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["extinct", "endangered", "rising", "comeback"],
          description:
            "extinct=zero recent births; endangered=near-zero; rising=gaining share; comeback=previously dormant now recovering",
        },
      },
      required: ["kind"],
    },
  },
  {
    name: "get_year_names",
    description: "Returns the top baby names for a given birth year (1880–2025).",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1880, maximum: 2025, description: "Birth year" },
      },
      required: ["year"],
    },
  },
  {
    name: "get_site_metadata",
    description:
      "Returns top-10 names per year, total birth counts per year, and the full year range covered by the dataset.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "compare_names",
    description:
      "Side-by-side comparison of 2-3 names: full yearly series for each so trends can be plotted or contrasted directly.",
    inputSchema: {
      type: "object",
      properties: {
        names: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 3,
          description: 'Names to compare, e.g. ["Michael", "James", "David"]',
        },
      },
      required: ["names"],
    },
  },
  {
    name: "get_name_twin",
    description:
      "Finds the names whose popularity trajectory over time is most similar to the given name (cosine similarity on the yearly series), i.e. names that rose and fell together.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The baby name to find trajectory twins for" },
        sex: { type: "string", enum: ["M", "F"], description: "Restrict to this sex (defaults to the name's most common sex)" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_decade_names",
    description: "Returns the top baby names aggregated across an entire calendar decade.",
    inputSchema: {
      type: "object",
      properties: {
        decade: { type: "string", description: 'Decade label, e.g. "1980s"' },
      },
      required: ["decade"],
    },
  },
  {
    name: "get_year_movers",
    description:
      "Year-over-year rank changes for the top 100 names of each sex vs. the prior year: biggest gainers, biggest losers, and new entrants.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1881, description: "Birth year to compare against the prior year" },
      },
      required: ["year"],
    },
  },
  {
    name: "get_name_enrichment",
    description:
      "Returns a precomputed profile for a name: estimated living population and median age, its popularity wave shape, cultural catalysts (events/media tied to spikes), historical demographic profiles by era (top occupations, region, urban vs. rural), and regional anomalies (states where it over-indexes).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The baby name to look up" },
        sex: { type: "string", enum: ["M", "F"], description: "Restrict to this sex (defaults to the name's most common sex)" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_name_diaspora",
    description:
      "Returns the geographic spread of a name over time: where it originated, when it peaked nationally, which states adopted it and when, and how many states never adopted it.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "The baby name to look up" },
        sex: { type: "string", enum: ["M", "F"], description: "Restrict to this sex (defaults to the name's most common sex)" },
      },
      required: ["name"],
    },
  },
  {
    name: "get_name_debuts",
    description:
      "Returns every name that appeared in SSA records for the first time in the given year — genuine linguistic novelties, celebrity imports, invented spellings, or names newly crossing the 5-birth reporting threshold.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "integer", minimum: 1880, description: "Birth year to find debut names for" },
      },
      required: ["year"],
    },
  },
];

// Fetches a REST endpoint and throws when it responds with a non-2xx status,
// so tools/call surfaces the failure via isError instead of returning a 404
// error body as if it were a successful result.
async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return body;
}

async function callTool(
  name: string,
  args: Record<string, unknown>,
  origin: string,
): Promise<unknown> {
  switch (name) {
    case "search_names":
      return fetchJson(`${origin}/api/search?q=${encodeURIComponent(String(args.q ?? ""))}`);
    case "get_name_data":
      return fetchJson(`${origin}/api/name/${encodeURIComponent(String(args.name ?? ""))}`);
    case "get_names_by_status":
      return fetchJson(`${origin}/api/landing/${encodeURIComponent(String(args.kind ?? ""))}`);
    case "get_year_names":
      return fetchJson(`${origin}/api/year/${Number(args.year)}`);
    case "get_site_metadata":
      return fetchJson(`${origin}/api/meta`);
    case "compare_names": {
      const names = Array.isArray(args.names) ? args.names.map(String) : [];
      return fetchJson(`${origin}/api/compare?names=${encodeURIComponent(names.join(","))}`);
    }
    case "get_name_twin": {
      const sex = args.sex ? `?sex=${encodeURIComponent(String(args.sex))}` : "";
      return fetchJson(`${origin}/api/twin/${encodeURIComponent(String(args.name ?? ""))}${sex}`);
    }
    case "get_decade_names":
      return fetchJson(`${origin}/api/decade/${encodeURIComponent(String(args.decade ?? ""))}`);
    case "get_year_movers":
      return fetchJson(`${origin}/api/movers/${Number(args.year)}`);
    case "get_name_enrichment": {
      const sex = args.sex ? `?sex=${encodeURIComponent(String(args.sex))}` : "";
      return fetchJson(`${origin}/api/enrichment/${encodeURIComponent(String(args.name ?? ""))}${sex}`);
    }
    case "get_name_diaspora": {
      const sex = args.sex ? `?sex=${encodeURIComponent(String(args.sex))}` : "";
      return fetchJson(`${origin}/api/diaspora/${encodeURIComponent(String(args.name ?? ""))}${sex}`);
    }
    case "get_name_debuts":
      return fetchJson(`${origin}/api/debuts/${Number(args.year)}`);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

type JsonRpcMessage = {
  jsonrpc: string;
  id?: unknown;
  method: string;
  params?: unknown;
};

// Coerces arbitrary JSON-RPC input to a short bindable string, or null.
// Request bodies are untrusted — a field the schema calls a string can
// arrive as a number, object, or array — and D1's .bind() throws
// synchronously on anything it can't bind, so values must be sanitized
// before they ever reach it.
function asBindableString(v: unknown, maxLen = 300): string | null {
  if (typeof v !== "string" || !v) return null;
  return v.slice(0, maxLen);
}

// Best-effort usage logging — fired via ctx.waitUntil so a slow insert never
// delays the actual MCP response, and wrapped in try/catch so a failure to
// even construct the query (e.g. a bind error) can't break it either.
function logMcpEvent(
  db: D1Database,
  waitUntil: (promise: Promise<unknown>) => void,
  fields: {
    eventType: "initialize" | "tools_call";
    toolName?: unknown;
    clientName?: unknown;
    clientVersion?: unknown;
    isError?: boolean;
    sessionId?: unknown;
    userAgent?: unknown;
  },
): void {
  try {
    const promise = db
      .prepare(
        `INSERT INTO mcp_events(event_type, tool_name, client_name, client_version, is_error, session_id, user_agent)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      )
      .bind(
        fields.eventType,
        asBindableString(fields.toolName),
        asBindableString(fields.clientName),
        asBindableString(fields.clientVersion),
        fields.isError ? 1 : 0,
        asBindableString(fields.sessionId, 200),
        asBindableString(fields.userAgent),
      )
      .run();
    waitUntil(promise.catch(() => {}));
  } catch {
    // Logging must never break the actual MCP response.
  }
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

export const onRequestOptions: PagesFunction = async () =>
  new Response(null, { status: 204, headers: CORS_HEADERS });

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const origin = new URL(ctx.request.url).origin;

  let msg: JsonRpcMessage;
  try {
    msg = (await ctx.request.json()) as JsonRpcMessage;
  } catch {
    return err(null, -32700, "Parse error");
  }

  const { id, method, params } = msg;
  const sessionId = ctx.request.headers.get("Mcp-Session-Id");
  const userAgent = ctx.request.headers.get("User-Agent");

  if (method === "notifications/initialized") {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  if (method === "initialize") {
    const clientInfo = (params as { clientInfo?: { name?: string; version?: string } } | undefined)
      ?.clientInfo;
    logMcpEvent(ctx.env.DB, ctx.waitUntil.bind(ctx), {
      eventType: "initialize",
      clientName: clientInfo?.name,
      clientVersion: clientInfo?.version,
      sessionId,
      userAgent,
    });
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: "nobodynamed", version: "1.0.0" },
      capabilities: { tools: {} },
      instructions:
        "Query US baby name popularity data from SSA records spanning 1880–2025. " +
        "Use search_names to autocomplete, get_name_data for full history and classification, " +
        "get_names_by_status for curated lists (extinct/endangered/rising/comeback), " +
        "get_year_names for birth year rosters, get_decade_names for decade rosters, " +
        "get_year_movers for year-over-year gainers/losers/new entrants, " +
        "compare_names for side-by-side trajectories, get_name_twin for names with a similar " +
        "popularity arc, get_name_enrichment for demographic/cultural profile data, " +
        "get_name_diaspora for geographic spread, get_name_debuts for first-appearance names " +
        "in a given year, and get_site_metadata for dataset overview.",
    });
  }

  if (method === "tools/list") {
    return ok(id, { tools: TOOLS });
  }

  if (method === "tools/call") {
    const { name, arguments: args = {} } = (params ?? {}) as {
      name: string;
      arguments?: Record<string, unknown>;
    };
    try {
      const data = await callTool(name, args, origin);
      logMcpEvent(ctx.env.DB, ctx.waitUntil.bind(ctx), {
        eventType: "tools_call",
        toolName: name,
        sessionId,
        userAgent,
      });
      return ok(id, { content: [{ type: "text", text: JSON.stringify(data) }] });
    } catch (e) {
      logMcpEvent(ctx.env.DB, ctx.waitUntil.bind(ctx), {
        eventType: "tools_call",
        toolName: name,
        isError: true,
        sessionId,
        userAgent,
      });
      return ok(id, {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      });
    }
  }

  return err(id, -32601, "Method not found");
};
