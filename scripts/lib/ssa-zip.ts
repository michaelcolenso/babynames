// Shared readers for the two SSA distributions.
//
// Extracted from scripts/build-enrichment.ts so build-name-facts.ts does not
// become a third copy of the same parsing. The formats differ:
//   national  yob<YYYY>.txt  ->  name,sex,count
//   state     <ST>.TXT       ->  state,sex,year,name,count

import fs from "node:fs/promises";
import { unzipSync } from "fflate";

import type { Sex } from "../../packages/shared/src/schema";

export const NATIONAL_URL = "https://www.ssa.gov/oact/babynames/names.zip";
export const STATE_URL = "https://www.ssa.gov/oact/babynames/state/namesbystate.zip";

const UA =
  "Mozilla/5.0 (compatible; name-vitals-facts/1.0; +https://github.com/michaelcolenso/babynames)";

export async function fetchZip(
  url: string,
  localPath: string | undefined,
  label: string,
): Promise<Uint8Array> {
  if (localPath) {
    console.error(`Reading ${label} zip from ${localPath}`);
    return new Uint8Array(await fs.readFile(localPath));
  }
  console.error(`Fetching ${label}: ${url} …`);
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/zip, application/octet-stream, */*" },
  });
  if (!res.ok) throw new Error(`${label} fetch failed: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

export interface NationalCorpus {
  /** "Name|S" -> (year -> count) */
  series: Map<string, Map<number, number>>;
  ym: number;
  yM: number;
}

const YOB_RE = /^yob(\d{4})\.txt$/i;
const STATE_FILE_RE = /^([A-Z]{2})\.txt$/i;

export function parseNational(zipBytes: Uint8Array): NationalCorpus {
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");
  const series = new Map<string, Map<number, number>>();
  let yM = 0;
  let ym = Infinity;

  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = YOB_RE.exec(base);
    if (!m) continue;
    const year = Number(m[1]);
    if (year > yM) yM = year;
    if (year < ym) ym = year;
    for (const rawLine of dec.decode(data).split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length !== 3) continue;
      const name = parts[0]!.trim();
      const sex = parts[1]!.trim() as Sex;
      const count = Number(parts[2]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
      const key = `${name}|${sex}`;
      let s = series.get(key);
      if (!s) {
        s = new Map();
        series.set(key, s);
      }
      s.set(year, count);
    }
  }
  if (!yM) throw new Error("no yob*.txt files in national zip");
  return { series, ym, yM };
}

/**
 * Streams the per-state corpus one state at a time, invoking `onRow` for every
 * record. The full decompressed corpus is ~330 MB, so callers must accumulate
 * rather than materialize — nothing here retains the rows.
 */
export function forEachStateRow(
  zipBytes: Uint8Array,
  onRow: (state: string, sex: Sex, year: number, name: string, count: number) => void,
): void {
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");
  let seenFiles = 0;

  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = STATE_FILE_RE.exec(base);
    if (!m) continue;
    seenFiles++;
    const state = m[1]!.toUpperCase();
    for (const rawLine of dec.decode(data).split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const p = line.split(",");
      if (p.length !== 5) continue;
      const sex = p[1]!.trim() as Sex;
      const year = Number(p[2]!.trim());
      const name = p[3]!.trim();
      const count = Number(p[4]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
      onRow(state, sex, year, name, count);
    }
  }
  if (!seenFiles) throw new Error("no <ST>.TXT files in state zip");
}

// ---------------------------------------------------------------------------
// SQL literal helpers, shared by the seed-file emitters.
// ---------------------------------------------------------------------------

export function q(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}

export function nOrNull(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "NULL" : String(v);
}

export function sOrNull(s: string | null | undefined): string {
  return s === null || s === undefined || s === "" ? "NULL" : q(s);
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Minimal CSV reader handling double-quoted fields with embedded commas. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}
