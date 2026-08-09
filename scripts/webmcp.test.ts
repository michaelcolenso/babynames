import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const scriptUrl = new URL("../apps/web/public/assets/webmcp.js", import.meta.url);

type RegisteredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<{ content: Array<{ type: string; text: string }> }>;
};

async function loadWebMcp() {
  const source = await readFile(scriptUrl, "utf8");
  const registrations: Array<{ tool: RegisteredTool; signal: AbortSignal }> = [];
  const listeners = new Map<string, (event: { persisted: boolean }) => void>();
  const requests: Array<{ url: string; signal?: AbortSignal }> = [];

  const context = vm.createContext({
    AbortController,
    encodeURIComponent,
    navigator: {
      modelContext: {
        registerTool(tool: RegisteredTool, options: { signal: AbortSignal }) {
          registrations.push({ tool, signal: options.signal });
        },
      },
    },
    fetch: async (url: string, options?: { signal?: AbortSignal }) => {
      requests.push({ url, signal: options?.signal });
      return { ok: true, json: async () => ({ url }) };
    },
    location: { href: "https://nobodynamed.com/" },
    window: {
      addEventListener(type: string, listener: (event: { persisted: boolean }) => void) {
        listeners.set(type, listener);
      },
    },
  });

  vm.runInContext(source, context);
  return { context, listeners, registrations, requests };
}

test("registers discoverable search, retrieval, and navigation tools on load", async () => {
  const { registrations } = await loadWebMcp();

  assert.deepEqual(
    registrations.map(({ tool }) => tool.name),
    [
      "search_names",
      "get_name_data",
      "get_names_by_status",
      "get_year_names",
      "get_site_metadata",
      "open_name_page",
    ],
  );

  for (const { tool, signal } of registrations) {
    assert.ok(tool.description);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(typeof tool.execute, "function");
    assert.equal(signal.aborted, false);
  }
});

test("tool calls use site APIs and the shared lifecycle signal", async () => {
  const { registrations, requests } = await loadWebMcp();
  const search = registrations.find(({ tool }) => tool.name === "search_names")!;

  const result = await search.tool.execute({ q: "Mary Jane" });

  assert.equal(requests[0].url, "/api/search?q=Mary%20Jane");
  assert.equal(requests[0].signal, search.signal);
  assert.deepEqual(JSON.parse(result.content[0].text), { url: "/api/search?q=Mary%20Jane" });
});

test("unregisters tools on unload but preserves them for the back-forward cache", async () => {
  const { listeners, registrations } = await loadWebMcp();
  const pagehide = listeners.get("pagehide")!;

  pagehide({ persisted: true });
  assert.equal(registrations[0].signal.aborted, false);

  pagehide({ persisted: false });
  assert.ok(registrations.every(({ signal }) => signal.aborted));
});
