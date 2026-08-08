// nobodynamed — WebMCP tool registration.
//
// Exposes the site's core actions (search, data retrieval, navigation) to
// in-browser AI agents via the WebMCP API (navigator.modelContext), so an
// agent visiting the page can call these tools directly instead of having
// to parse the DOM. No-ops entirely in browsers that don't implement the
// API yet. See https://webmachinelearning.github.io/webmcp/.

(function () {
  if (!navigator.modelContext || typeof navigator.modelContext.registerTool !== "function") {
    return;
  }

  const controller = new AbortController();
  const { signal } = controller;

  function textResult(data) {
    return { content: [{ type: "text", text: JSON.stringify(data) }] };
  }

  async function fetchJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Request failed: ${res.status}`);
    return res.json();
  }

  const tools = [
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
      annotations: { readOnlyHint: true },
      async execute({ q }) {
        return textResult(await fetchJson(`/api/search?q=${encodeURIComponent(q ?? "")}`));
      },
    },
    {
      name: "get_name_data",
      description:
        "Returns full yearly birth count timeseries (1880-present) for a given name for both sexes, including trend classification (rising/stable/declining/endangered/extinct), peak year, and peak count.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The baby name to look up (case-insensitive)" },
        },
        required: ["name"],
      },
      annotations: { readOnlyHint: true },
      async execute({ name }) {
        return textResult(await fetchJson(`/api/name/${encodeURIComponent(name ?? "")}`));
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
      annotations: { readOnlyHint: true },
      async execute({ kind }) {
        return textResult(await fetchJson(`/api/landing/${encodeURIComponent(kind ?? "")}`));
      },
    },
    {
      name: "get_year_names",
      description: "Returns the top baby names for a given birth year (1880-present).",
      inputSchema: {
        type: "object",
        properties: {
          year: { type: "integer", minimum: 1880, maximum: 2025, description: "Birth year" },
        },
        required: ["year"],
      },
      annotations: { readOnlyHint: true },
      async execute({ year }) {
        return textResult(await fetchJson(`/api/year/${Number(year)}`));
      },
    },
    {
      name: "get_site_metadata",
      description:
        "Returns top-10 names per year, total birth counts per year, and the full year range covered by the dataset.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true },
      async execute() {
        return textResult(await fetchJson("/api/meta"));
      },
    },
    {
      name: "open_name_page",
      description:
        "Navigates the current browser tab to a name's vitals page (/name/:name/), where its full history, chart and status are displayed.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The baby name to open (case-insensitive)" },
          sex: { type: "string", enum: ["M", "F"], description: "Optional sex filter" },
        },
        required: ["name"],
      },
      annotations: { readOnlyHint: false },
      async execute({ name, sex }) {
        const target = String(name ?? "").trim();
        if (!target) throw new Error("name is required");
        const tail = sex ? `?sex=${encodeURIComponent(sex)}` : "";
        location.href = `/name/${encodeURIComponent(target)}/${tail}`;
        return textResult({ navigated: true, name: target });
      },
    },
  ];

  for (const tool of tools) {
    navigator.modelContext.registerTool(tool, { signal });
  }

  window.addEventListener("pagehide", () => controller.abort(), { once: true });
})();
