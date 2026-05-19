#!/usr/bin/env tsx
// Downloads the SSA names.zip and generates SQL files for a full D1 rebuild.
//
// Usage:
//   npx tsx scripts/ingest-ssa.ts                      # fetch from ssa.gov
//   npx tsx scripts/ingest-ssa.ts --zip=./names.zip    # use local zip
//   npx tsx scripts/ingest-ssa.ts --dry                # count names only
//
// Then apply with:
//   ls migrations/ssa-ingest/*.sql | sort | xargs -I{} wrangler d1 execute name-vitals --file={} --remote

import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { classify } from "../packages/shared/src/classify";
import { encodeSpark } from "../packages/shared/src/spark-blob";

const SSA_URL = "https://www.ssa.gov/oact/babynames/names.zip";
const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const OUT_DIR = path.join(REPO, "migrations/ssa-ingest");

const DRY = process.argv.includes("--dry");
const zipArg = process.argv.find((a) => a.startsWith("--zip="))?.slice(6);

type Sex = "M" | "F";

interface ParsedRow {
  year: number;
  name: string;
  sex: Sex;
  count: number;
}

function buf2hex(u8: Uint8Array): string {
  return "X'" + Buffer.from(u8).toString("hex") + "'";
}

function q(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

function* parseYob(year: number, text: string): Generator<ParsedRow> {
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length !== 3) continue;
    const name = parts[0]!.trim();
    const sex = parts[1]!.trim() as Sex;
    const count = Number(parts[2]!.trim());
    if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
    yield { year, name, sex, count };
  }
}

async function fetchZip(): Promise<Uint8Array> {
  if (zipArg) {
    console.error(`Reading zip from ${zipArg}`);
    return new Uint8Array(await fs.readFile(zipArg));
  }
  console.error(`Fetching ${SSA_URL} …`);
  const res = await fetch(SSA_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; name-vitals-ingest/1.0; +https://github.com/michaelcolenso/babynames)",
      "Accept": "application/zip, application/octet-stream, */*",
    },
  });
  if (!res.ok) throw new Error(`SSA fetch failed: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function main() {
  const zipBytes = await fetchZip();

  // Unpack all yob<year>.txt files.
  const YOB_RE = /^yob(\d{4})\.txt$/i;
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");

  interface YobFile { year: number; text: string }
  const yobs: YobFile[] = [];
  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = YOB_RE.exec(base);
    if (!m) continue;
    yobs.push({ year: Number(m[1]), text: dec.decode(data) });
  }
  yobs.sort((a, b) => a.year - b.year);

  if (!yobs.length) throw new Error("No yob*.txt files found in zip");
  const ym = yobs[0]!.year;
  const yM = yobs[yobs.length - 1]!.year;
  console.error(`Years: ${ym}–${yM} (${yobs.length} files)`);

  // Build full series per (name, sex).
  type Series = Record<number, number>;
  const seriesMap = new Map<string, Series>();
  const yearTotals = new Map<string, number>(); // "year:sex" -> total

  for (const yob of yobs) {
    for (const row of parseYob(yob.year, yob.text)) {
      const key = row.name + "|" + row.sex;
      let s = seriesMap.get(key);
      if (!s) { s = {}; seriesMap.set(key, s); }
      s[row.year] = row.count;

      const tk = `${row.year}:${row.sex}`;
      yearTotals.set(tk, (yearTotals.get(tk) ?? 0) + row.count);
    }
  }

  console.error(`Loaded ${seriesMap.size} (name, sex) pairs`);
  if (DRY) { console.error("--dry mode, exiting"); return; }

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Collect entries sorted by name for deterministic output.
  interface Entry { name: string; sex: Sex; series: Series }
  const entries: Entry[] = [];
  for (const [key, series] of seriesMap) {
    const pipe = key.indexOf("|");
    entries.push({ name: key.slice(0, pipe), sex: key.slice(pipe + 1) as Sex, series });
  }
  entries.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.sex < b.sex ? -1 : 1);

  let fileIdx = 1;

  // --- names rows (500 per file, ON CONFLICT DO UPDATE so existing rows are refreshed) ---
  const NAMES_PER_FILE = 500;
  for (let i = 0; i < entries.length; i += NAMES_PER_FILE) {
    const slice = entries.slice(i, i + NAMES_PER_FILE);
    const lines: string[] = [];
    for (const e of slice) {
      const c = classify({ series: e.series, yM });
      if (!c) continue;
      const spark = encodeSpark(e.series, ym, yM);
      lines.push(
        `INSERT INTO names(name,name_lower,sex,first_year,last_year,peak_year,peak_count,total_count,status,decline_pct,latest_count,prev_decade,curr_decade,growth_x,spark_blob) ` +
        `VALUES(${q(e.name)},${q(e.name.toLowerCase())},${q(e.sex)},${c.firstYear},${c.lastYear},` +
        `${c.peakYear},${c.peakCount},${c.totalCount},${q(c.status)},` +
        `${c.declinePct ?? "NULL"},${c.latestCount},${c.prevDecadeTotal ?? "NULL"},` +
        `${c.currDecadeTotal ?? "NULL"},${c.growthX ?? "NULL"},${buf2hex(spark)}) ` +
        `ON CONFLICT(name,sex) DO UPDATE SET ` +
        `name_lower=excluded.name_lower,first_year=excluded.first_year,last_year=excluded.last_year,` +
        `peak_year=excluded.peak_year,peak_count=excluded.peak_count,total_count=excluded.total_count,` +
        `status=excluded.status,decline_pct=excluded.decline_pct,latest_count=excluded.latest_count,` +
        `prev_decade=excluded.prev_decade,curr_decade=excluded.curr_decade,` +
        `growth_x=excluded.growth_x,spark_blob=excluded.spark_blob;`,
      );
    }
    const outFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_names.sql`);
    await fs.writeFile(outFile, lines.join("\n") + "\n");
    fileIdx++;
  }
  console.error(`Wrote names SQL (${fileIdx - 1} file(s))`);

  // --- name_years rows (grouped by first letter for manageable file sizes) ---
  const byLetter = new Map<string, Entry[]>();
  for (const e of entries) {
    const letter = (e.name[0] ?? "#").toUpperCase();
    let arr = byLetter.get(letter);
    if (!arr) { arr = []; byLetter.set(letter, arr); }
    arr.push(e);
  }

  for (const [letter, group] of [...byLetter.entries()].sort()) {
    const lines: string[] = [];
    for (const e of group) {
      const safeName = q(e.name);
      const safeSex = q(e.sex);
      for (const [yearStr, count] of Object.entries(e.series)) {
        lines.push(
          `INSERT OR REPLACE INTO name_years(name_id,year,count) ` +
          `SELECT id,${yearStr},${count} FROM names WHERE name=${safeName} AND sex=${safeSex};`,
        );
      }
    }
    const outFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_years_${letter}.sql`);
    await fs.writeFile(outFile, lines.join("\n") + "\n");
    fileIdx++;
  }
  console.error(`Wrote name_years SQL through file index ${fileIdx - 1}`);

  // --- year_totals ---
  const totalLines: string[] = [];
  for (const [tk, total] of yearTotals) {
    const [yearStr, sex] = tk.split(":");
    totalLines.push(
      `INSERT INTO year_totals(year,sex,total) VALUES(${yearStr},${q(sex!)},${total}) ` +
      `ON CONFLICT(year,sex) DO UPDATE SET total=excluded.total;`,
    );
  }
  const totalsFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_year_totals.sql`);
  await fs.writeFile(totalsFile, totalLines.join("\n") + "\n");
  fileIdx++;

  // --- meta ---
  const dataVersion = crypto.randomUUID();
  const metaLines = [
    `INSERT INTO meta(key,value) VALUES('min_year','${ym}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('max_year','${yM}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('total_names','${entries.length}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('total_rows','${[...seriesMap.values()].reduce((s, v) => s + Object.keys(v).length, 0)}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('schema_version','1') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('data_version','${dataVersion}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    `INSERT INTO meta(key,value) VALUES('last_ingest_at','${new Date().toISOString()}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
  ];
  const metaFile = path.join(OUT_DIR, `${String(fileIdx).padStart(4, "0")}_meta.sql`);
  await fs.writeFile(metaFile, metaLines.join("\n") + "\n");

  const relDir = path.relative(process.cwd(), OUT_DIR);
  console.error(`\nDone — ${fileIdx} SQL file(s) written to ${relDir}/`);
  console.error(`Years ingested: ${ym}–${yM}`);
  console.error(`\nApply to remote D1:`);
  console.error(`  ls ${relDir}/*.sql | sort | xargs -I{} wrangler d1 execute name-vitals --file={} --remote`);
}

main().catch((err) => { console.error(err); process.exit(1); });
