#!/usr/bin/env tsx
// Reads the existing viz/name-vitals/data/ JSON shards and emits a series
// of SQL files into migrations/seed/ suitable for:
//
//   wrangler d1 execute name-vitals --file=migrations/seed/0001_names.sql --remote
//
// Run once before the first wrangler deploy to pre-populate D1 without
// needing to pull the SSA zip. After the first live ingest, this script
// is obsolete.
//
// Usage:
//   npm run seed                          # write to migrations/seed/
//   tsx scripts/seed-from-shards.ts       # same
//   tsx scripts/seed-from-shards.ts --dry # print row counts only

import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { classify, encodeSpark, landingFlags } from "../packages/shared/src/classify";
import { SPARK_BUCKETS } from "../packages/shared/src/spark-blob";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const DATA_DIR = path.join(REPO, "viz/name-vitals/data");
const NAMES_DIR = path.join(DATA_DIR, "names");
const OUT_DIR = path.join(REPO, "migrations/seed");
const DRY = process.argv.includes("--dry");

interface ShardEntry {
  ym: number;
  yM: number;
  n: Record<string, number[]>;
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, "utf8")) as T;
}

function buf2hex(u8: Uint8Array): string {
  return "X'" + Buffer.from(u8).toString("hex") + "'";
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  // Collect all (name, sex, series) entries from the per-letter shards.
  const letters = await fs.readdir(NAMES_DIR);
  const metaPath = path.join(DATA_DIR, "meta.json");
  const meta = await readJson<{ ym: number; yM: number; totalsByYear: Record<string, { M: number; F: number }>; top10PerYear: Record<string, [string, string, number][]> }>(metaPath);

  const { ym: globalYm, yM: globalYM } = meta;

  type NameEntry = { name: string; sex: "M" | "F"; series: Record<number, number> };
  const entries: NameEntry[] = [];

  for (const letter of letters) {
    if (!letter.endsWith(".json")) continue;
    const shard = await readJson<ShardEntry>(path.join(NAMES_DIR, letter));
    for (const [key, arr] of Object.entries(shard.n)) {
      const [name, sex] = key.split("|") as [string, "M" | "F"];
      const firstYear = arr[0]!;
      const series: Record<number, number> = {};
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (v > 0) series[firstYear + i - 1] = v;
      }
      entries.push({ name, sex, series });
    }
  }

  console.error(`loaded ${entries.length} (name,sex) pairs from shards`);
  if (DRY) {
    console.error("--dry mode, no files written");
    return;
  }

  // Write names rows (one file, chunked at 500 rows to stay under wrangler upload limits).
  const NAMES_PER_FILE = 500;
  let fileIdx = 1;
  for (let i = 0; i < entries.length; i += NAMES_PER_FILE) {
    const slice = entries.slice(i, i + NAMES_PER_FILE);
    const lines: string[] = ["BEGIN;"];
    for (const e of slice) {
      const c = classify({ series: e.series, yM: globalYM });
      if (!c) continue;
      const spark = encodeSpark(e.series, globalYm, globalYM);
      const name = e.name.replace(/'/g, "''");
      const nameLower = name.toLowerCase();
      lines.push(
        `INSERT INTO names(name,name_lower,sex,first_year,last_year,peak_year,peak_count,total_count,status,decline_pct,latest_count,prev_decade,curr_decade,growth_x,spark_blob) ` +
          `VALUES('${name}','${nameLower}','${e.sex}',${c.firstYear},${c.lastYear},${c.peakYear},${c.peakCount},${c.totalCount},'${c.status}',${c.declinePct ?? "NULL"},${c.latestCount},${c.prevDecadeTotal ?? "NULL"},${c.currDecadeTotal ?? "NULL"},${c.growthX ?? "NULL"},${buf2hex(spark)}) ` +
          `ON CONFLICT(name,sex) DO NOTHING;`,
      );
    }
    lines.push("COMMIT;");
    const outFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_names.sql`);
    await fs.writeFile(outFile, lines.join("\n") + "\n");
    fileIdx++;
  }
  console.error(`wrote ${fileIdx - 1} names SQL file(s)`);

  // Write name_years rows — split by letter to keep files manageable.
  for (const letter of letters) {
    if (!letter.endsWith(".json")) continue;
    const shard = await readJson<ShardEntry>(path.join(NAMES_DIR, letter));
    const lines: string[] = ["BEGIN;"];
    for (const [key, arr] of Object.entries(shard.n)) {
      const [name, sex] = key.split("|") as [string, "M" | "F"];
      const firstYear = arr[0]!;
      const safeName = name.replace(/'/g, "''");
      for (let i = 1; i < arr.length; i++) {
        const v = arr[i]!;
        if (!v) continue;
        const y = firstYear + i - 1;
        lines.push(
          `INSERT OR IGNORE INTO name_years(name_id,year,count) ` +
            `SELECT id,${y},${v} FROM names WHERE name='${safeName}' AND sex='${sex}';`,
        );
      }
    }
    lines.push("COMMIT;");
    const lName = letter.replace(".json", "");
    const outFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_years_${lName}.sql`);
    await fs.writeFile(outFile, lines.join("\n") + "\n");
    fileIdx++;
  }
  console.error(`wrote year SQL files through index ${fileIdx - 1}`);

  // Write year_totals.
  const totalLines: string[] = ["BEGIN;"];
  for (const [yearStr, tots] of Object.entries(meta.totalsByYear)) {
    const y = Number(yearStr);
    totalLines.push(`INSERT INTO year_totals(year,sex,total) VALUES(${y},'M',${tots.M}) ON CONFLICT(year,sex) DO UPDATE SET total=excluded.total;`);
    totalLines.push(`INSERT INTO year_totals(year,sex,total) VALUES(${y},'F',${tots.F}) ON CONFLICT(year,sex) DO UPDATE SET total=excluded.total;`);
  }
  totalLines.push("COMMIT;");
  const totalsFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_year_totals.sql`);
  await fs.writeFile(totalsFile, totalLines.join("\n") + "\n");
  fileIdx++;

  // Write meta key/values.
  const metaLines = [
    "BEGIN;",
    `INSERT INTO meta(key,value) VALUES('min_year','${globalYm}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('max_year','${globalYM}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('total_names','${entries.length}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('schema_version','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('data_version','${crypto.randomUUID()}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    "COMMIT;",
  ];
  const metaFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_meta.sql`);
  await fs.writeFile(metaFile, metaLines.join("\n") + "\n");

  console.error(`done — seed files written to ${path.relative(process.cwd(), OUT_DIR)}/`);
  console.error("Apply with:");
  console.error("  ls migrations/seed/*.sql | sort | xargs -I{} wrangler d1 execute name-vitals --file={} --remote");
}

main().catch((err) => { console.error(err); process.exit(1); });
