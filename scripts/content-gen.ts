#!/usr/bin/env tsx
// Content Factory CLI.
//
//   npm run content:gen -- --check                 validate registry + run asserts on live data
//   npm run content:gen -- --item <slug> [--out <dir>]
//   npm run content:gen -- --all    [--out <dir>]
//
// Reads the local QA SQLite snapshot (full 1880–2025 name_years) or falls back
// to the SSA CSV (1880–2008). Writes viz HTML + blog markdown. No network, no
// D1 writes.

import { readFileSync, mkdirSync, writeFileSync, existsSync, openSync, readSync, closeSync } from "node:fs";
import path from "node:path";

import {
  DATA_MAX_YEAR,
  computeFlashFloods,
  computeGlaciers,
  csvToNameYearRows,
  chartPanelHtml,
  evaluateClaims,
  groupSeries,
  interpolateBody,
  parseSsaCsv,
  parseTotalsCsv,
  verifyAsserts,
  type NameYearRow,
} from "../packages/shared/src/content/factory-compute";
import { CONTENT_DEFINITIONS } from "../packages/shared/src/content/content-definitions";
import { renderFactoryVizPage } from "../packages/shared/src/content/render-factory-viz";
import { renderFactoryPostMarkdown } from "../packages/shared/src/content/render-factory-post";
import type {
  FactoryResult,
  FlashFloodsResult,
  GlaciersResult,
} from "../packages/shared/src/content/factory-types";
import { compileBlogPost } from "./blog-publish";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const SQLITE = path.join(REPO, ".hermes", "name-vitals-2025.sqlite");
const CSV = path.join(REPO, "extra", "baby-names.csv");
const TOTALS_CSV = path.join(REPO, "extra", "totals.csv");

interface LoadResult {
  series: Map<string, Record<number, number>>;
  display: Map<string, string>;
  source: string;
}

/**
 * Export the name_years join from SQLite to CSV using the sqlite3 CLI
 * (zero npm deps). 2.1M rows ≈ 38 MB — exported once, cached.
 */
function exportNameYearsCsv(): string {
  const tmp = path.join(REPO, ".hermes", "name-years-export.csv");
  if (!existsSync(tmp)) {
    // execSync with shell redirect is intentional: sqlite3 CLI has no -o output
    // file flag, and all path inputs are repo-constant (no user input).
    const { execSync } = require("node:child_process") as { execSync: (cmd: string) => unknown };
    execSync(
      `sqlite3 -readonly -csv "${SQLITE}" "SELECT n.name, n.sex, ny.year, ny.count FROM name_years ny JOIN names n ON n.id=ny.name_id" > "${tmp}"`,
    );
  }
  return tmp;
}

function parseNameYearsCsv(text: string): NameYearRow[] {
  const rows: NameYearRow[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const year = Number(parts[2]);
    const count = Number(parts[3]);
    if (!Number.isFinite(year) || !Number.isFinite(count)) continue;
    rows.push({ name: parts[0]!, sex: parts[1]!, year, count });
  }
  return rows;
}

function loadFromSqlite(): LoadResult {
  const rows = parseNameYearsCsv(readFileSync(exportNameYearsCsv(), "utf8"));
  const display = new Map<string, string>();
  for (const r of rows) {
    const key = `${r.name.toLowerCase()}|${r.sex}`;
    if (!display.has(key)) display.set(key, r.name);
  }
  return { series: groupSeries(rows), display, source: path.basename(SQLITE) };
}

function loadFromCsv(): LoadResult {
  const rows = parseSsaCsv(readFileSync(CSV, "utf8"));
  const totals = parseTotalsCsv(readFileSync(TOTALS_CSV, "utf8"));
  const nyRows = csvToNameYearRows(rows, totals);
  const display = new Map<string, string>();
  for (const r of nyRows) {
    const key = `${r.name.toLowerCase()}|${r.sex}`;
    if (!display.has(key)) display.set(key, r.name);
  }
  return { series: groupSeries(nyRows), display, source: path.basename(CSV) };
}

function loadData(): LoadResult {
  if (existsSync(SQLITE)) return loadFromSqlite();
  if (existsSync(CSV)) return loadFromCsv();
  console.error("No data source found: expected .hermes/name-vitals-2025.sqlite or extra/baby-names.csv");
  process.exit(1);
}

function runCompute(def: ContentDefinitionT, data: LoadResult): FactoryResult {
  if (def.compute.family === "flash-floods") {
    return computeFlashFloods(data.series, data.display, {
      minPeak: def.compute.minPeak ?? undefined,
    });
  }
  return computeGlaciers(data.series, data.display, {
    minPeak: def.compute.minPeak ?? undefined,
    minRiseYears: def.compute.minRiseYears ?? undefined,
    minFallYears: def.compute.minFallYears ?? undefined,
    thresholdShare: def.compute.thresholdShare ?? undefined,
  });
}

// Local alias so the import list above stays readable.
type ContentDefinitionT = (typeof CONTENT_DEFINITIONS)[number];

function buildPanels(def: ContentDefinitionT, result: FactoryResult): Record<string, string> {
  const wanted = new Set(def.panels ?? []);
  const panels: Record<string, string> = {};
  for (const m of result.members) {
    const key = `${m.name}|${m.sex}`;
    if (!wanted.has(key)) continue;
    panels[key] = chartPanelHtml({
      member:
        "riseStartYear" in m
          ? {
              name: m.name,
              firstYear: m.riseStartYear,
              peakYear: m.peakYear,
              peakCount: m.peakCount,
              series: m.series,
            }
          : m,
      dataMaxYear: DATA_MAX_YEAR,
    });
  }
  return panels;
}

function generate(defIndex: number, outDir?: string): void {
  const def = CONTENT_DEFINITIONS[defIndex]!;
  const data = loadData();
  console.log(`Data source: ${data.source}`);

  const result = runCompute(def, data);
  const familyLabel = def.compute.family;
  console.log(
    `${familyLabel}: ${result.members.length} members detected across ${result.totalNames.toLocaleString("en-US")} names`,
  );

  const claims = evaluateClaims(def, result);
  const violations = verifyAsserts(def, claims);
  if (violations.length > 0) {
    console.error("ASSERTION FAILURES — copy no longer matches data:");
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(`All ${def.asserts?.length ?? 0} editorial assertions verified.`);

  const targetViz = outDir ? path.join(outDir, `${def.slug}.html`) : path.join(REPO, "apps/web/public/viz", `${def.slug}.html`);
  const targetPost = outDir ? path.join(outDir, `${def.slug}.md`) : path.join(REPO, "content/blog", `${def.slug}.md`);

  if (def.kind === "viz" || def.kind === "both") {
    const html = renderFactoryVizPage(def, result, {
      canonicalBase: "https://nobodynamed.com",
      dataMaxYear: DATA_MAX_YEAR,
    });
    mkdirSync(path.dirname(targetViz), { recursive: true });
    writeFileSync(targetViz, html, "utf8");
    console.log(`Wrote ${path.relative(REPO, targetViz)} (${(html.length / 1024).toFixed(0)} KB)`);
  }

  if (def.kind === "post" || def.kind === "both") {
    const templatePath = path.join(REPO, "content/blog/templates", `${def.slug}.body.md`);
    if (!existsSync(templatePath)) {
      console.error(`Missing body template: ${templatePath}`);
      process.exit(1);
    }
    const template = readFileSync(templatePath, "utf8");
    const md = renderFactoryPostMarkdown(
      def,
      claims,
      template,
      buildPanels(def, result),
      { date: new Date().toISOString().slice(0, 10), status: "published" },
    );
    // Round-trip guard: generated post must compile cleanly through the publisher.
    const compiled = compileBlogPost(md, `${def.slug}.md`);
    if (compiled.slug !== def.slug || compiled.title !== def.title) {
      console.error("Round-trip mismatch between definition and compiled post");
      process.exit(1);
    }
    if (compiled.bodyHtml.includes("{{")) {
      console.error("Compiled post contains unresolved placeholders");
      process.exit(1);
    }
    mkdirSync(path.dirname(targetPost), { recursive: true });
    writeFileSync(targetPost, md, "utf8");
    console.log(`Wrote ${path.relative(REPO, targetPost)}`);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes("--check")) {
    let failures = 0;
    CONTENT_DEFINITIONS.forEach((def) => {
      const data = loadData();
      const result = runCompute(def, data);
      const claims = evaluateClaims(def, result);
      const violations = verifyAsserts(def, claims);
      if (violations.length > 0) {
        failures += violations.length;
        console.error(`${def.slug}:`);
        for (const v of violations) console.error(`  - ${v}`);
      } else {
        console.log(`${def.slug}: OK (${result.members.length} members, ${Object.keys(claims).length} claims)`);
      }
    });
    process.exit(failures > 0 ? 1 : 0);
  }

  const outIdx = args.indexOf("--out");
  const outDir = outIdx !== -1 ? args[outIdx + 1] : undefined;
  if (args.includes("--all")) {
    CONTENT_DEFINITIONS.forEach((_, i) => generate(i, outDir));
    return;
  }
  const itemIdx = args.indexOf("--item");
  if (itemIdx !== -1) {
    const slug = args[itemIdx + 1];
    const index = CONTENT_DEFINITIONS.findIndex((d) => d.slug === slug);
    if (index === -1) {
      console.error(`Unknown item "${slug}". Available: ${CONTENT_DEFINITIONS.map((d) => d.slug).join(", ")}`);
      process.exit(1);
    }
    generate(index, outDir);
    return;
  }
  console.error("Usage: npm run content:gen -- --item <slug> | --all | --check [--out <dir>]");
  process.exit(1);
}

main();
