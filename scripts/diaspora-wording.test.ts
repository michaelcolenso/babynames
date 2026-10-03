// Wording tests for the diaspora data. `never_adopted` / `neverAdopted` lists the
// states that never passed the breakout test in apps/ingest-worker/src/
// diaspora-compute.ts (a rate clearly above the national rate, on enough births,
// with a significance check). That is NOT "had no births there", not "never took
// it up", and not even "never over-represented" (a state can be above the
// national rate and still miss the evidence thresholds). Names with no
// observable origin (first recorded nationally in 1910 or earlier, before state
// records begin, or no state ever broke out) list all 51 states. Nevaeh in
// California shows the difference: it has more Nevaeh births than any other
// state (9,666 in production D1) and is still on the list. Anything user- or
// agent-facing has to say what the data means.

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { onRequestPost as mcpPost } from "../apps/web/functions/mcp";
import { classify } from "../packages/shared/src/classify";
import { renderFullPage } from "../packages/shared/src/render-name";
import type { DiasporaResponse, NameRecord } from "../packages/shared/src/schema";

function read(rel: string): string {
  return fs.readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

// Phrases that say "took it up" / "had none there" for a state that merely never
// over-indexed. The code identifiers (neverAdopted, never_adopted) contain no
// space, so they do not match.
const MISLEADING = [
  /never adopted/i,
  /never over-represented/i,
  /never reached reporting threshold/i,
  /states adopted it/i,
  // The 1910 cutoff is on a name's first national year, not on how widespread it was.
  /already in use nationwide/i,
  /already national by 1910/i,
  // A null origin means no state passed the breakout test, which is weaker than
  // "never concentrated": a concentrated name can fail the births or significance guards.
  /never concentrated/i,
];

// A Nevaeh-shaped name: a national hit that spread everywhere and over-indexed
// in only a few states, so the biggest states are in neverAdopted.
function nevaehShaped(): { record: NameRecord; diaspora: DiasporaResponse } {
  const series: Record<number, number> = {};
  for (let y = 1999; y <= 2024; y++) series[y] = Math.round(9000 * Math.exp(-(((y - 2010) / 6) ** 2) / 2)) + 20;
  const record: NameRecord = { name: "Nevaeh", sex: "F", ym: 1999, yM: 2024, series };
  const diaspora: DiasporaResponse = {
    name: "Nevaeh",
    sex: "F",
    origin: { state: "UT", year: 2003 },
    peakNationalYear: 2010,
    spread: [
      { state: "UT", year: 2003, count: 40 },
      { state: "ID", year: 2004, count: 31 },
      { state: "NV", year: 2005, count: 28 },
      { state: "OR", year: 2007, count: 45 },
    ],
    neverAdopted: ["CA", "TX", "FL", "NY"],
    totalStates: 4,
    diffusionYears: 4,
  };
  return { record, diaspora };
}

test("the name-page diaspora map says 'no breakout', not adopted/holdout/never over-represented", () => {
  const { record, diaspora } = nevaehShaped();
  const classification = classify({ series: record.series, yM: record.yM });
  assert.ok(classification);
  const html = renderFullPage(record, classification, { canonical: "https://nobodynamed.com/name/Nevaeh/", diaspora });

  const map = html.match(/<section class="diaspora-map"[\s\S]*?<\/section>/)?.[0];
  assert.ok(map, "emergent names with an origin render the diaspora map");

  // The biggest states are not in `spread`, so they must read as no breakout.
  assert.match(map, /California: no breakout/);
  assert.match(map, /Texas: no breakout/);
  assert.match(map, /<span class="dz-never">No breakout<\/span>/);
  assert.match(map, /broke out/i);
  for (const bad of MISLEADING) assert.doesNotMatch(map, bad, `diaspora map matches ${bad}`);
  // "Holdout" reads as resistance; California did not resist Nevaeh.
  assert.doesNotMatch(map, />\s*Holdout\s*</);
});

test("the MCP tool description explains what neverAdopted means", async () => {
  const res = await mcpPost({
    request: new Request("https://example.com/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
    env: {},
    waitUntil() {},
  } as never);
  const body = (await res.json()) as { result: { tools: { name: string; description: string }[] } };
  const tool = body.result.tools.find((t) => t.name === "get_name_diaspora");
  assert.ok(tool, "get_name_diaspora is listed");
  assert.match(tool.description, /neverAdopted/);
  assert.match(tool.description, /never passed the breakout test/);
  assert.match(tool.description, /does not mean the name had no bearers/);
  assert.match(tool.description, /all 51 states/);
  for (const bad of MISLEADING) assert.doesNotMatch(tool.description, bad, `description matches ${bad}`);
});

test("agent docs and the wavefront viz do not call over-index misses 'never adopted'", () => {
  const files = [
    "apps/web/public/.well-known/agent-skills/name-data-api.md",
    "apps/web/public/viz/wavefront.html",
  ];
  for (const rel of files) {
    const text = read(rel);
    for (const bad of MISLEADING) assert.doesNotMatch(text, bad, `${rel} matches ${bad}`);
  }
  const doc = read("apps/web/public/.well-known/agent-skills/name-data-api.md");
  assert.match(doc, /never broke out/);
  assert.match(doc, /all 51 states/);

  const viz = read("apps/web/public/viz/wavefront.html");
  assert.match(viz, /No breakout here/);
  assert.match(viz, /<p class="defn" id="defn"/);
  // A response with no origin lists all 51 states under neverAdopted; the page
  // must say there is no spread to show rather than draw 51 "no breakout" tiles.
  assert.match(viz, /if \(!diaspora\.origin\)/);
  assert.match(viz, /No spread to show for/);
  assert.match(viz, /no state ever passed the breakout test/);
  // The old tooltip claimed these states had never reached SSA's reporting
  // threshold, which is false for a state with thousands of births.
  assert.doesNotMatch(viz, /reporting threshold/);
});
