#!/usr/bin/env tsx
// Offline builder for the Enrichment System. Computes the four precomputed
// dossier layers over the full SSA corpus and emits one deterministic,
// idempotent SQL file (data/dist/enrichment.sql).
//
// Inputs:
//   - National names.zip  (per-name, per-year counts + year totals)
//   - State namesbystate.zip  (for Location Quotient anomalies)
//   - data/manual/life-table.csv      (cumulative survival by age, by sex)
//   - data/manual/name-catalysts.csv  (curated cultural triggers)
//   - data/manual/historical-profiles.csv
//
// Usage:
//   npx tsx scripts/build-enrichment.ts                         # live fetch
//   npx tsx scripts/build-enrichment.ts --names-zip=./names.zip --state-zip=./namesbystate.zip
//   npx tsx scripts/build-enrichment.ts --no-state              # skip LQ/regional
//   npx tsx scripts/build-enrichment.ts --limit=2000            # top-N names only (fast test)
//
// Then apply with: npm run seed-enrichment   (or seed-enrichment:local)

import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import {
  ANALYSIS_YEAR,
  ageQuantiles,
  classifyWave,
  selectStoredRegionalAnomalies,
  weightedStdDev,
} from "../packages/shared/src/enrichment-compute";
import type { CatalystType, Sex, WaveTopology } from "../packages/shared/src/schema";

const NATIONAL_URL = "https://www.ssa.gov/oact/babynames/names.zip";
const STATE_URL = "https://www.ssa.gov/oact/babynames/state/namesbystate.zip";
const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const OUT_FILE = path.join(REPO, "data/dist/enrichment.sql");
const MANUAL_DIR = path.join(REPO, "data/manual");

// Data-quality floors (spec §18).
const MIN_TOTAL_COUNT = 100; // generate an actuarial profile only at/above this
const MIN_REGION_BIRTHS = 50; // hard floor for any regional anomaly row
const MIN_LQ = 1.5; // historical anomaly threshold
const MIN_CURRENT_LQ = 1.2; // lower display threshold for current strongholds
const MAX_ANOMALIES = 3; // strongest all-time rows per (name, sex)
const MAX_CURRENT_ANOMALIES = 12; // latest-era rows available to the map

const args = process.argv.slice(2);
const arg = (k: string): string | undefined => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string): boolean => args.includes(`--${k}`);

const namesZipArg = arg("names-zip");
const stateZipArg = arg("state-zip");
const noState = flag("no-state");
const limit = arg("limit") ? Math.max(1, Number(arg("limit"))) : Infinity;
const analysisYear = arg("analysis-year") ? Number(arg("analysis-year")) : ANALYSIS_YEAR;

function q(s: string): string {
  return "'" + s.replace(/'/g, "''") + "'";
}
function nOrNull(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? "NULL" : String(v);
}
function sOrNull(s: string | null | undefined): string {
  return s === null || s === undefined || s === "" ? "NULL" : q(s);
}

// ---------------------------------------------------------------------------
// CSV parsing (handles double-quoted fields with embedded commas / quotes).
// ---------------------------------------------------------------------------
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((v) => v !== "")) rows.push(row);
  }
  return rows;
}

async function fetchZip(url: string, localArg: string | undefined, label: string): Promise<Uint8Array> {
  if (localArg) {
    console.error(`Reading ${label} zip from ${localArg}`);
    return new Uint8Array(await fs.readFile(localArg));
  }
  console.error(`Fetching ${label}: ${url} …`);
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; name-vitals-enrichment/1.0; +https://github.com/michaelcolenso/babynames)",
      Accept: "application/zip, application/octet-stream, */*",
    },
  });
  if (!res.ok) throw new Error(`${label} fetch failed: ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Life table: cumulative survival from birth to a given age, by sex.
// CSV holds sparse checkpoints; we linearly interpolate between them.
// ---------------------------------------------------------------------------
type SurvivalTable = Record<Sex, [number, number][]>; // sorted [age, survival]

async function loadLifeTable(): Promise<SurvivalTable> {
  const text = await fs.readFile(path.join(MANUAL_DIR, "life-table.csv"), "utf-8");
  const rows = parseCsv(text);
  const table: SurvivalTable = { M: [], F: [] };
  for (let i = 1; i < rows.length; i++) {
    const [sex, age, surv] = rows[i]!;
    if (sex !== "M" && sex !== "F") continue;
    table[sex].push([Number(age), Number(surv)]);
  }
  table.M.sort((a, b) => a[0] - b[0]);
  table.F.sort((a, b) => a[0] - b[0]);
  if (!table.M.length || !table.F.length) throw new Error("life-table.csv missing M or F rows");
  return table;
}

function survivalAt(table: SurvivalTable, sex: Sex, age: number): number {
  const pts = table[sex];
  if (age <= pts[0]![0]) return pts[0]![1];
  if (age >= pts[pts.length - 1]![0]) return pts[pts.length - 1]![1];
  for (let i = 1; i < pts.length; i++) {
    const [a1, s1] = pts[i]!;
    if (age <= a1) {
      const [a0, s0] = pts[i - 1]!;
      const t = (age - a0) / (a1 - a0);
      return s0 + t * (s1 - s0);
    }
  }
  return pts[pts.length - 1]![1];
}

// ---------------------------------------------------------------------------
// National SSA parse → per-(name,sex) series + (year,sex) totals.
// ---------------------------------------------------------------------------
interface NationalData {
  series: Map<string, Map<number, number>>; // "name|sex" -> (year -> count)
  yearTotals: Map<string, number>; // "year:sex" -> total
  yM: number;
}

function parseNational(zipBytes: Uint8Array): NationalData {
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");
  const YOB_RE = /^yob(\d{4})\.txt$/i;
  const series = new Map<string, Map<number, number>>();
  const yearTotals = new Map<string, number>();
  let yM = 0;

  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = YOB_RE.exec(base);
    if (!m) continue;
    const year = Number(m[1]);
    if (year > yM) yM = year;
    const text = dec.decode(data);
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length !== 3) continue;
      const name = parts[0]!.trim();
      const sex = parts[1]!.trim() as Sex;
      const count = Number(parts[2]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
      const key = name + "|" + sex;
      let s = series.get(key);
      if (!s) {
        s = new Map();
        series.set(key, s);
      }
      s.set(year, count);
      const tk = year + ":" + sex;
      yearTotals.set(tk, (yearTotals.get(tk) ?? 0) + count);
    }
  }
  if (!yM) throw new Error("no yob*.txt files in national zip");
  return { series, yearTotals, yM };
}

// ---------------------------------------------------------------------------
// Profile + wave computation from a national series.
// ---------------------------------------------------------------------------
interface ProfileRow {
  nameLower: string;
  sex: Sex;
  totalLivingEst: number;
  medianAge: number;
  ageLow: number;
  ageHigh: number;
  wave: WaveTopology;
  latestPct: number;
}

function windowSum(series: Map<number, number>, from: number, to: number): number {
  let s = 0;
  for (let y = from; y <= to; y++) s += series.get(y) ?? 0;
  return s;
}

function buildProfile(
  displayName: string,
  sex: Sex,
  series: Map<number, number>,
  table: SurvivalTable,
  yearTotals: Map<string, number>,
  yM: number,
): ProfileRow | null {
  let total = 0;
  for (const c of series.values()) total += c;
  if (total < MIN_TOTAL_COUNT) return null;

  // Actuarial: age the birth-year cohorts to the analysis year.
  const ages = new Map<number, number>();
  let living = 0;
  for (const [year, count] of series) {
    const age = analysisYear - year;
    if (age < 0) continue;
    const surv = survivalAt(table, sex, age);
    const alive = count * surv;
    living += alive;
    ages.set(age, (ages.get(age) ?? 0) + alive);
  }
  const quant = ageQuantiles(ages);

  // latest_pct from latest national year of same sex.
  const latestCount = series.get(yM) ?? 0;
  const denom = yearTotals.get(yM + ":" + sex) ?? 0;
  const latestPct = denom > 0 ? latestCount / denom : 0;

  // Wave: birth-year spread + recent momentum.
  const sigma = weightedStdDev(series);
  const recent = windowSum(series, yM - 9, yM);
  const previous = windowSum(series, yM - 19, yM - 10);
  const recentDelta = (recent - previous) / Math.max(previous, 1);
  const wave = classifyWave(sigma, recentDelta);

  return {
    nameLower: displayName.toLowerCase(),
    sex,
    totalLivingEst: Math.round(living),
    medianAge: quant.median,
    ageLow: quant.low,
    ageHigh: quant.high,
    wave,
    latestPct,
  };
}

// ---------------------------------------------------------------------------
// Location Quotient anomalies from state data.
// ---------------------------------------------------------------------------
interface AnomalyRow {
  nameLower: string;
  sex: Sex;
  state: string;
  eraStartYear: number;
  lq: number;
  nameBirths: number;
  peakYear: number | null;
  anomalyType: string;
}

const STATE_FILE_RE = /^([A-Z]{2})\.txt$/i;
const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

function anomalyLabel(lq: number): string {
  if (lq >= 4) return "regional stronghold";
  if (lq >= 2.5) return "strong regional skew";
  return "regional skew";
}

function computeAnomalies(stateZip: Uint8Array): Map<string, AnomalyRow[]> {
  const files = unzipSync(stateZip);
  const dec = new TextDecoder("utf-8");
  const stateFiles: { state: string; text: string }[] = [];
  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = STATE_FILE_RE.exec(base);
    if (!m) continue;
    stateFiles.push({ state: m[1]!.toUpperCase(), text: dec.decode(data) });
  }
  if (!stateFiles.length) throw new Error("no <ST>.TXT files in state zip");

  // Pass A: national-from-state decade aggregates (consistent LQ baseline).
  const natNameDecade = new Map<string, number>(); // "name|sex|decade" -> count
  const natDecadeTotal = new Map<string, number>(); // "sex|decade" -> count
  let latestStateYear = 0;
  const eachRow = (text: string, fn: (name: string, sex: Sex, year: number, count: number) => void) => {
    for (const rawLine of text.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const p = line.split(",");
      if (p.length !== 5) continue;
      const sex = p[1]!.trim() as Sex;
      const year = Number(p[2]!.trim());
      const name = p[3]!.trim();
      const count = Number(p[4]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(year) || !Number.isFinite(count) || count <= 0) continue;
      fn(name, sex, year, count);
    }
  };

  for (const sf of stateFiles) {
    eachRow(sf.text, (name, sex, year, count) => {
      if (year > latestStateYear) latestStateYear = year;
      const d = decadeOf(year);
      const nk = name.toLowerCase() + "|" + sex + "|" + d;
      natNameDecade.set(nk, (natNameDecade.get(nk) ?? 0) + count);
      const tk = sex + "|" + d;
      natDecadeTotal.set(tk, (natDecadeTotal.get(tk) ?? 0) + count);
    });
  }
  const currentEra = decadeOf(latestStateYear);

  // Pass B: per-state LQ.
  const byName = new Map<string, AnomalyRow[]>(); // "nameLower|sex" -> rows
  for (const sf of stateFiles) {
    const locNameDecade = new Map<string, number>();
    const locDecadeTotal = new Map<string, number>();
    const locPeak = new Map<string, { year: number; count: number }>();
    eachRow(sf.text, (name, sex, year, count) => {
      const nl = name.toLowerCase();
      const d = decadeOf(year);
      const nk = nl + "|" + sex + "|" + d;
      locNameDecade.set(nk, (locNameDecade.get(nk) ?? 0) + count);
      locDecadeTotal.set(sex + "|" + d, (locDecadeTotal.get(sex + "|" + d) ?? 0) + count);
      const pk = locPeak.get(nk);
      if (!pk || count > pk.count) locPeak.set(nk, { year, count });
    });

    for (const [nk, nameBirths] of locNameDecade) {
      if (nameBirths < MIN_REGION_BIRTHS) continue;
      const [nl, sex, dStr] = nk.split("|");
      const d = Number(dStr);
      const totState = locDecadeTotal.get(sex + "|" + d) ?? 0;
      const natName = natNameDecade.get(nk) ?? 0;
      const totNat = natDecadeTotal.get(sex + "|" + d) ?? 0;
      if (totState <= 0 || natName <= 0 || totNat <= 0) continue;
      const lq = (nameBirths / totState) / (natName / totNat);
      const minLq = d === currentEra ? MIN_CURRENT_LQ : MIN_LQ;
      if (lq < minLq) continue;
      const key = nl + "|" + sex;
      const peak = locPeak.get(nk);
      const arr = byName.get(key) ?? [];
      arr.push({
        nameLower: nl!,
        sex: sex as Sex,
        state: sf.state,
        eraStartYear: d,
        lq,
        nameBirths,
        peakYear: peak?.year ?? null,
        anomalyType: anomalyLabel(lq),
      });
      byName.set(key, arr);
    }
  }

  // Keep the historical top-N and, independently, the true latest-era rows.
  // Without the second set, a current concentration weaker than a historical
  // peak is discarded before the request-time query can ever see it.
  for (const [key, arr] of byName) {
    byName.set(
      key,
      selectStoredRegionalAnomalies(arr, currentEra, MAX_ANOMALIES, MAX_CURRENT_ANOMALIES),
    );
  }
  return byName;
}

// ---------------------------------------------------------------------------
// SQL emission.
// ---------------------------------------------------------------------------
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const table = await loadLifeTable();
  const catalystsCsv = parseCsv(await fs.readFile(path.join(MANUAL_DIR, "name-catalysts.csv"), "utf-8"));
  const historicalCsv = parseCsv(await fs.readFile(path.join(MANUAL_DIR, "historical-profiles.csv"), "utf-8"));

  const national = parseNational(await fetchZip(NATIONAL_URL, namesZipArg, "national"));
  const sourceVersion = arg("source-version") ?? `ssa-${national.yM}`;
  console.error(`National: ${national.series.size} (name,sex) pairs, latest year ${national.yM}`);

  // Build profiles (optionally capped by --limit, taking highest-volume names).
  let pairs = [...national.series.entries()];
  if (Number.isFinite(limit)) {
    pairs = pairs
      .map(([key, s]) => {
        let t = 0;
        for (const c of s.values()) t += c;
        return { key, s, t };
      })
      .sort((a, b) => b.t - a.t)
      .slice(0, limit)
      .map((x) => [x.key, x.s] as [string, Map<number, number>]);
  }

  const profiles: ProfileRow[] = [];
  for (const [key, s] of pairs) {
    const pipe = key.indexOf("|");
    const name = key.slice(0, pipe);
    const sex = key.slice(pipe + 1) as Sex;
    const p = buildProfile(name, sex, s, table, national.yearTotals, national.yM);
    if (p) profiles.push(p);
  }
  profiles.sort((a, b) => a.nameLower.localeCompare(b.nameLower) || a.sex.localeCompare(b.sex));
  console.error(`Profiles: ${profiles.length}`);

  // Regional anomalies.
  let anomalies: AnomalyRow[] = [];
  if (!noState) {
    const byName = computeAnomalies(await fetchZip(STATE_URL, stateZipArg, "state"));
    // Only keep anomalies for names that have a profile (avoid orphan rows).
    const haveProfile = new Set(profiles.map((p) => p.nameLower + "|" + p.sex));
    for (const [key, rows] of byName) {
      if (!haveProfile.has(key)) continue;
      anomalies.push(...rows);
    }
    anomalies.sort(
      (a, b) =>
        a.nameLower.localeCompare(b.nameLower) ||
        a.sex.localeCompare(b.sex) ||
        b.lq - a.lq ||
        a.state.localeCompare(b.state),
    );
    console.error(`Regional anomalies: ${anomalies.length}`);
  } else {
    console.error("Skipping state data (--no-state)");
  }

  // ---- assemble SQL ----
  // No explicit BEGIN/COMMIT: `wrangler d1 execute --file` runs the whole
  // file as one atomic batch, and local D1 rejects explicit transactions.
  // The leading DELETEs make re-seeding deterministic (idempotent).
  const out: string[] = [
    "-- Generated by scripts/build-enrichment.ts — do not edit by hand.",
    `-- analysis_year=${analysisYear} source_version=${sourceVersion}`,
    "DELETE FROM name_catalysts;",
    "DELETE FROM name_historical_profiles;",
    "DELETE FROM name_regional_anomalies;",
    "DELETE FROM name_enrichment_profiles;",
  ];

  for (const grp of chunk(profiles, 50)) {
    const values = grp
      .map(
        (p) =>
          `(${q(p.nameLower)},${q(p.sex)},${p.totalLivingEst},${p.medianAge},${p.ageLow},${p.ageHigh},` +
          `${q(p.wave)},${p.latestPct},${analysisYear},${q(sourceVersion)})`,
      )
      .join(",\n  ");
    out.push(
      "INSERT INTO name_enrichment_profiles(name_lower,sex,total_living_est,median_age,age_range_low,age_range_high,wave_topology,latest_pct,analysis_year,source_version) VALUES\n  " +
        values +
        ";",
    );
  }

  // Catalysts (curated CSV).
  const catalystRows = catalystsCsv.slice(1).filter((r) => r.length >= 4 && r[0]);
  for (const r of catalystRows) {
    const [nameLower, sex, triggerYear, title, type, impact, desc, url] = r;
    if (sex !== "M" && sex !== "F") continue;
    out.push(
      "INSERT INTO name_catalysts(name_lower,sex,trigger_year,catalyst_title,catalyst_type,impact_score,description,source_url) VALUES " +
        `(${q(nameLower!.toLowerCase())},${q(sex)},${Number(triggerYear)},${q(title ?? "")},` +
        `${sOrNull((type ?? "") as CatalystType)},${sOrNull(impact)},${sOrNull(desc)},${sOrNull(url)});`,
    );
  }

  // Historical profiles (curated CSV; top_occupations stored as JSON text).
  const histRows = historicalCsv.slice(1).filter((r) => r.length >= 6 && r[0]);
  for (const r of histRows) {
    const [nameLower, sex, eraYear, occ, region, urban] = r;
    if (sex !== "M" && sex !== "F") continue;
    // Normalise occupations to a JSON array string regardless of CSV form.
    let occJson = occ ?? "[]";
    try {
      const parsed = JSON.parse(occJson);
      occJson = JSON.stringify(Array.isArray(parsed) ? parsed.map((v) => String(v)) : []);
    } catch {
      occJson = JSON.stringify(
        (occ ?? "")
          .split(";")
          .map((v) => v.trim())
          .filter(Boolean),
      );
    }
    out.push(
      "INSERT INTO name_historical_profiles(name_lower,sex,era_year,top_occupations,primary_region,urban_vs_rural) VALUES " +
        `(${q(nameLower!.toLowerCase())},${q(sex)},${Number(eraYear)},${q(occJson)},${q(region ?? "")},${q(urban ?? "")});`,
    );
  }

  // Regional anomalies.
  for (const grp of chunk(anomalies, 50)) {
    const values = grp
      .map(
        (a) =>
          `(${q(a.nameLower)},${q(a.sex)},${q(a.state)},${a.eraStartYear},` +
          `${a.lq.toFixed(4)},${a.nameBirths},${nOrNull(a.peakYear)},${q(a.anomalyType)})`,
      )
      .join(",\n  ");
    out.push(
      "INSERT INTO name_regional_anomalies(name_lower,sex,state,era_start_year,location_quotient,name_births,historical_peak_year,anomaly_type) VALUES\n  " +
        values +
        ";",
    );
  }

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, out.join("\n") + "\n");
  const rel = path.relative(process.cwd(), OUT_FILE);
  console.error(`\nWrote ${rel}`);
  console.error(`  profiles=${profiles.length} catalysts=${catalystRows.length} historical=${histRows.length} anomalies=${anomalies.length}`);
  console.error(`\nApply with: npm run seed-enrichment   (remote)  or  npm run seed-enrichment:local`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
