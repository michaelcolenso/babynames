import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { computeFlashFloods } from "../packages/shared/src/content/factory-compute";
import { renderFactoryVizPage } from "../packages/shared/src/content/render-factory-viz";
import { renderFactoryPostMarkdown } from "../packages/shared/src/content/render-factory-post";
import { CONTENT_DEFINITIONS } from "../packages/shared/src/content/content-definitions";
import type { ContentDefinition, FlashFloodMember } from "../packages/shared/src/content/factory-types";

const T = new Map(Array.from({ length: 40 }, (_, i) => [1990 + i, 1_000_000] as [number, number]));

function member(name: string, sex: string, peak: number): FlashFloodMember {
  return {
    name,
    sex,
    firstYear: 1995,
    peakYear: 1995,
    peakCount: peak,
    lastYear: 2000,
    lastCount: 5,
    series: { 1995: peak, 1996: Math.round(peak * 0.08), 2000: 5 },
  };
}

const def: ContentDefinition = {
  slug: "flash-floods",
  kind: "both",
  title: "The Flash Floods — Names That Arrived All at Once",
  description: "Names that peaked within two years of debut and vanished.",
  sourceVersion: "ssa-national-2025",
  rolloutState: "draft",
  compute: { family: "flash-floods" },
  claims: {
    count: (m) => m.length,
    topName: (m) => m[0]?.name ?? "none",
    topCount: (m) => m[0]?.peakCount ?? 0,
  },
};

const result = {
  members: [member("Moesha", "F", 426), member("Jkwon", "M", 100)],
  totalNames: 2,
};

test("viz page: one H1, canonical, JSON-LD parses, identity attrs present", () => {
  const html = renderFactoryVizPage(def, result, {
    canonicalBase: "https://nobodynamed.com",
    dataMaxYear: 2025,
  });
  assert.equal((html.match(/<h1>/g) ?? []).length, 1);
  assert.match(html, /<link rel="canonical" href="https:\/\/nobodynamed\.com\/viz\/flash-floods">/);
  assert.match(html, /data-content-type="visualization"/);
  assert.match(html, /data-content-id="visualization:flash-floods"/);

  const ldMatches = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/gs) ?? [];
  assert.ok(ldMatches.length >= 1);
  for (const m of ldMatches) {
    const json = m.replace(/<script type="application\/ld\+json">/, "").replace(/<\/script>/, "");
    JSON.parse(json); // must not throw
  }
});

test("viz page: table rows match members, sparkline SVGs embedded, no undefined/NaN", () => {
  const html = renderFactoryVizPage(def, result, {
    canonicalBase: "https://nobodynamed.com",
    dataMaxYear: 2025,
  });
  // pageShell emits several <tr>-bearing structures (header/footer nav etc.);
  // count only rows inside the data table body.
  const tableBody = html.split("<tbody>")[1] ?? "";
  assert.equal((tableBody.match(/<tr>/g) ?? []).length, 2);
  // pageShell contributes its own SVGs (theme sun/moon icons); count sparklines.
  assert.equal((html.match(/<svg class="sparkline/g) ?? []).length, 2);
  assert.match(html, /Peak births/);
  assert.ok(!html.includes("undefined"));
  assert.ok(!html.includes("NaN"));
  assert.match(html, /\/name\/Moesha\//);
});

test("viz page: classifies flash-flood sparklines via the canonical classify(), not a fixed fallback", () => {
  // Both fixture members' series stop in 2000, 25 years before dataMaxYear
  // (2025) -> classify() calls that extinct. A reconstruction that drops
  // the series/dataMaxYear inputs classify() needs would fall back to
  // "declining" for every member regardless of actual status.
  const html = renderFactoryVizPage(def, result, {
    canonicalBase: "https://nobodynamed.com",
    dataMaxYear: 2025,
  });
  assert.equal((html.match(/sparkline sparkline-extinct/g) ?? []).length, 2);
  assert.equal((html.match(/sparkline sparkline-declining/g) ?? []).length, 0);
});

test("post renderer: frontmatter + interpolated body has no leftover placeholders", () => {
  const template = `Start with {{claim:count}} floods led by {{claim:topName}} at {{claim:topCount}} births.

## Moesha

{{panel:Moesha.F}}

See [Moesha](/name/Moesha/).`;
  const panels = { "Moesha.F": "<div class=\"chart-panel\">x</div>", "Jkwon.M": "<svg>y</svg>" };
  const md = renderFactoryPostMarkdown(
    def,
    { count: 2, topName: "Moesha", topCount: 426 },
    template,
    panels,
    { date: "2026-08-22" },
  );

  assert.match(md, /^---\n/);
  assert.match(md, /title: "The Flash Floods — Names That Arrived All at Once"/);
  assert.match(md, /slug: "flash-floods"/);
  assert.match(md, /led by Moesha at 426 births/);
  // No leftover placeholders anywhere in the markdown.
  assert.ok(!md.includes("{{"));
});

test("every definition's panels allowlist covers its template's {{panel:*}} placeholders", () => {
  const repoRoot = path.resolve(import.meta.dirname ?? __dirname, "..");
  for (const def of CONTENT_DEFINITIONS) {
    if (def.kind !== "post" && def.kind !== "both") continue;
    const templatePath = path.join(repoRoot, "content/blog/templates", `${def.slug}.body.md`);
    const template = readFileSync(templatePath, "utf8");
    const placeholders = [...template.matchAll(/\{\{panel:([^}]+)\}\}/g)].map((m) => m[1]!.trim());
    const wanted = new Set(def.panels ?? []);
    for (const p of placeholders) {
      const lookup = wanted.has(p) ? p : p.replace(".", "|");
      assert.ok(
        wanted.has(lookup),
        `${def.slug}: template references {{panel:${p}}} but def.panels does not include it`,
      );
    }
  }
});

test("post renderer throws on unresolved claim placeholder", () => {
  assert.throws(() =>
    renderFactoryPostMarkdown(def, { count: 2 }, "{{claim:missing}} text", {}, { date: "2026-08-22" }),
  );
});
