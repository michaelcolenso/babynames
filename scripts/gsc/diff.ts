/**
 * gsc/diff.ts — Compare two historical quickwins CSVs to surface movers.
 *
 * Usage:
 *   npm run gsc:diff
 *   npm run gsc:diff -- scripts/gsc-data/quickwins-2026-05-01.csv scripts/gsc-data/quickwins-2026-06-01.csv
 */

import { readFileSync, readdirSync } from "node:fs";
import { csvEscape } from "./lib.js";

interface Row {
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  score: number;
  page: string;
}

function parseCsv(path: string): Row[] {
  const text = readFileSync(path, "utf8").trim();
  const lines = text.split("\n");
  if (lines.length === 0) return [];
  const header = lines[0]!.split(",").map((h) => h.trim());
  const ki = header.indexOf("keyword");
  const pi = header.indexOf("position");
  const ii = header.indexOf("impressions");
  const ci = header.indexOf("clicks");
  const si = header.indexOf("score");
  const pai = header.indexOf("page");

  return lines.slice(1).map((line) => {
    const vals = parseLine(line);
    return {
      keyword: vals[ki] ?? "",
      position: Number(vals[pi] ?? 0),
      impressions: Number(vals[ii] ?? 0),
      clicks: Number(vals[ci] ?? 0),
      score: Number(vals[si] ?? 0),
      page: vals[pai] ?? "",
    };
  });
}

function parseLine(line: string): string[] {
  const vals: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"' && !inQuotes) {
      inQuotes = true;
    } else if (ch === '"' && inQuotes) {
      inQuotes = false;
    } else if (ch === "," && !inQuotes) {
      vals.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  vals.push(cur);
  return vals;
}

function findLatestCsv(dir: string): string | undefined {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("quickwins-") && f.endsWith(".csv") && f !== "quickwins-latest.csv")
    .sort();
  return files.length >= 2 ? files.at(-2) : undefined;
}

function findLatestCsvPath(dir: string): string | undefined {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("quickwins-") && f.endsWith(".csv") && f !== "quickwins-latest.csv")
    .sort();
  return files.length ? `${dir}/${files.at(-1)}` : undefined;
}

// ─── CLI ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const dir = process.env.GSC_OUTPUT_DIR ?? "scripts/gsc-data";

let oldPath: string | undefined;
let newPath: string | undefined;

if (args.length >= 2) {
  oldPath = args[0];
  newPath = args[1];
} else if (args.length === 1) {
  oldPath = args[0];
  newPath = findLatestCsvPath(dir);
} else {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith("quickwins-") && f.endsWith(".csv") && f !== "quickwins-latest.csv")
    .sort();
  if (files.length < 2) {
    console.error(`Need at least 2 dated CSVs in ${dir}. Found ${files.length}.`);
    process.exit(1);
  }
  oldPath = `${dir}/${files.at(-2)}`;
  newPath = `${dir}/${files.at(-1)}`;
}

if (!oldPath || !newPath) {
  console.error("Could not resolve CSV paths.");
  process.exit(1);
}

console.log(`\nComparing\n  OLD: ${oldPath}\n  NEW: ${newPath}\n`);

const oldRows = parseCsv(oldPath);
const newRows = parseCsv(newPath);

const oldMap = new Map(oldRows.map((r) => [r.keyword, r]));
const newMap = new Map(newRows.map((r) => [r.keyword, r]));

// ─── Compute deltas ──────────────────────────────────────────────────────

interface Mover {
  keyword: string;
  page: string;
  oldPos: number;
  newPos: number;
  posDelta: number;
  oldImpr: number;
  newImpr: number;
  imprDelta: number;
  oldScore: number;
  newScore: number;
  scoreDelta: number;
  direction: "gained" | "lost" | "dropped" | "entered" | "stable";
}

const movers: Mover[] = [];

for (const [kw, nr] of newMap) {
  const or = oldMap.get(kw);
  if (!or) {
    movers.push({
      keyword: kw,
      page: nr.page,
      oldPos: 0,
      newPos: nr.position,
      posDelta: 0,
      oldImpr: 0,
      newImpr: nr.impressions,
      imprDelta: nr.impressions,
      oldScore: 0,
      newScore: nr.score,
      scoreDelta: nr.score,
      direction: "entered",
    });
    continue;
  }

  const posDelta = or.position - nr.position; // positive = improved
  const imprDelta = nr.impressions - or.impressions;
  const scoreDelta = nr.score - or.score;

  let direction: Mover["direction"] = "stable";
  if (posDelta >= 2) direction = "gained";
  else if (posDelta <= -2) direction = "lost";

  movers.push({
    keyword: kw,
    page: nr.page,
    oldPos: or.position,
    newPos: nr.position,
    posDelta,
    oldImpr: or.impressions,
    newImpr: nr.impressions,
    imprDelta,
    oldScore: or.score,
    newScore: nr.score,
    scoreDelta,
    direction,
  });
}

// Keywords that dropped out of striking distance
for (const [kw, or] of oldMap) {
  if (!newMap.has(kw)) {
    movers.push({
      keyword: kw,
      page: or.page,
      oldPos: or.position,
      newPos: 0,
      posDelta: 0,
      oldImpr: or.impressions,
      newImpr: 0,
      imprDelta: -or.impressions,
      oldScore: or.score,
      newScore: 0,
      scoreDelta: -or.score,
      direction: "dropped",
    });
  }
}

// ─── Output ──────────────────────────────────────────────────────────────

function printTable(title: string, rows: Mover[]) {
  if (rows.length === 0) return;
  console.log(`\n${title} (${rows.length}):\n`);
  console.log(["direction", "Δpos", "Δimpr", "Δscore", "keyword", "page"].join("\t"));
  for (const m of rows.slice(0, 25)) {
    console.log(
      [
        m.direction,
        m.posDelta === 0 && m.direction !== "stable" ? "—" : m.posDelta.toFixed(1),
        m.imprDelta,
        m.scoreDelta,
        m.keyword,
        m.page,
      ].join("\t"),
    );
  }
}

printTable(
  "Biggest gainers (improved position)",
  movers.filter((m) => m.direction === "gained").sort((a, b) => b.posDelta - a.posDelta),
);

printTable(
  "Biggest losers (dropped position)",
  movers.filter((m) => m.direction === "lost").sort((a, b) => a.posDelta - b.posDelta),
);

printTable(
  "New entries (in striking distance now)",
  movers.filter((m) => m.direction === "entered").sort((a, b) => b.newScore - a.newScore),
);

printTable(
  "Dropped out (left striking distance)",
  movers.filter((m) => m.direction === "dropped").sort((a, b) => b.oldScore - a.oldScore),
);

printTable(
  "Biggest impression movers",
  movers
    .filter((m) => m.direction !== "stable")
    .sort((a, b) => Math.abs(b.imprDelta) - Math.abs(a.imprDelta)),
);
