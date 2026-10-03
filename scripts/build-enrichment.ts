#!/usr/bin/env tsx
// Offline builder for the Enrichment System. Computes the four precomputed
// dossier layers over the full SSA corpus and emits one deterministic,
// idempotent SQL file (data/dist/enrichment.sql).
//
// Inputs:
//   - National names.zip  (per-name, per-year counts + year totals)
//   - State namesbystate.zip  (for Location Quotient anomalies)
//   - data/manual/life-table.csv      (cumulative survival by age, by sex;
//                                      provenance in data/manual/README.md)
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
//
// Layout: the first half of this file is pure (no I/O) and importable —
// `computeEnrichmentRows` and `buildEnrichmentSql` are what
// scripts/enrichment.test.ts exercises. The CLI (zip/CSV loading and the SQL
// file write) lives at the bottom and only runs when the file is executed
// directly.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

// ---------------------------------------------------------------------------
// Pure computation — inputs and outputs.
// ---------------------------------------------------------------------------

/** One checkpoint of data/manual/life-table.csv: cumulative survival from birth to `age`. */
export interface LifeTableRow {
  sex: Sex;
  age: number;
  survival_probability: number;
}

export interface NationalNameInput {
  name: string;
  name_lower: string;
  sex: Sex;
  /** Informational: the builder re-derives totals from `series`. */
  total_count: number;
  /** Informational: `latest_pct` is read from `series` at the latest year. */
  latest_count: number;
  /** Birth year -> SSA count (counts below the 5-birth floor are absent). */
  series: Record<number, number>;
}

export interface YearTotalInput {
  year: number;
  sex: Sex;
  total: number;
}

export interface CatalystInput {
  name_lower: string;
  sex: Sex;
  trigger_year: number;
  catalyst_title: string;
  catalyst_type: CatalystType | string | null;
  impact_score: string | null;
  description: string | null;
  source_url: string | null;
}

export interface HistoricalProfileInput {
  name_lower: string;
  sex: Sex;
  era_year: number;
  top_occupations: string[];
  primary_region: string;
  urban_vs_rural: string;
}

export interface StateRow {
  name_lower: string;
  sex: Sex;
  year: number;
  count: number;
}

/** One state's rows. `rows` is walked more than once, so it must be re-iterable (an array or a re-iterable lazy source, not a one-shot generator). */
export interface StateSeriesInput {
  state: string;
  rows: Iterable<StateRow>;
}

export interface EnrichmentSourceData {
  analysisYear: number;
  sourceVersion: string;
  lifeTable: LifeTableRow[];
  nationalNames: NationalNameInput[];
  yearTotals: YearTotalInput[];
  catalysts: CatalystInput[];
  historicalProfiles: HistoricalProfileInput[];
  /** Empty = skip the regional-anomaly layer. */
  stateSeries: StateSeriesInput[];
}

/** Row shapes match the D1 columns they are written to. */
export interface EnrichmentProfileRow {
  name_lower: string;
  sex: Sex;
  total_living_est: number;
  median_age: number;
  age_range_low: number;
  age_range_high: number;
  wave_topology: WaveTopology;
  latest_pct: number;
  analysis_year: number;
  source_version: string;
}

export interface RegionalAnomalyRow {
  name_lower: string;
  sex: Sex;
  state: string;
  era_start_year: number;
  location_quotient: number;
  name_births: number;
  historical_peak_year: number | null;
  anomaly_type: string;
}

export interface EnrichmentRows {
  analysisYear: number;
  sourceVersion: string;
  profiles: EnrichmentProfileRow[];
  catalysts: CatalystInput[];
  historicalProfiles: HistoricalProfileInput[];
  anomalies: RegionalAnomalyRow[];
}

// ---------------------------------------------------------------------------
// SQL helpers.
// ---------------------------------------------------------------------------
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
export function parseCsv(text: string): string[][] {
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

// ---------------------------------------------------------------------------
// Life table: cumulative survival from birth to a given age, by sex.
// CSV holds sparse checkpoints; we linearly interpolate between them.
// ---------------------------------------------------------------------------
export type SurvivalTable = Record<Sex, [number, number][]>; // sorted [age, survival]

/** Parses data/manual/life-table.csv (header row `sex,age,survival_probability`). */
export function parseLifeTableCsv(text: string): LifeTableRow[] {
  const rows = parseCsv(text);
  const out: LifeTableRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const [sex, age, surv] = rows[i]!;
    if (sex !== "M" && sex !== "F") continue;
    out.push({ sex, age: Number(age), survival_probability: Number(surv) });
  }
  return out;
}

export function buildSurvivalTable(rows: LifeTableRow[]): SurvivalTable {
  const table: SurvivalTable = { M: [], F: [] };
  for (const r of rows) table[r.sex].push([r.age, r.survival_probability]);
  table.M.sort((a, b) => a[0] - b[0]);
  table.F.sort((a, b) => a[0] - b[0]);
  return table;
}

/** The CLI refuses a life table that lacks either sex before it fetches anything. */
export function assertLifeTableComplete(table: SurvivalTable): void {
  if (!table.M.length || !table.F.length) throw new Error("life-table.csv missing M or F rows");
}

export function survivalAt(table: SurvivalTable, sex: Sex, age: number): number {
  const pts = table[sex];
  if (!pts.length) throw new Error(`life table has no rows for sex ${sex}`);
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
// Profile + wave computation from a national series.
// ---------------------------------------------------------------------------
function windowSum(series: Map<number, number>, from: number, to: number): number {
  let s = 0;
  for (let y = from; y <= to; y++) s += series.get(y) ?? 0;
  return s;
}

function buildProfile(
  nameLower: string,
  sex: Sex,
  series: Map<number, number>,
  table: SurvivalTable,
  yearTotals: Map<string, number>,
  yM: number,
  analysisYear: number,
  sourceVersion: string,
): EnrichmentProfileRow | null {
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
    name_lower: nameLower,
    sex,
    total_living_est: Math.round(living),
    median_age: quant.median,
    age_range_low: quant.low,
    age_range_high: quant.high,
    wave_topology: wave,
    latest_pct: latestPct,
    analysis_year: analysisYear,
    source_version: sourceVersion,
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

const decadeOf = (year: number): number => Math.floor(year / 10) * 10;

function anomalyLabel(lq: number): string {
  if (lq >= 4) return "regional stronghold";
  if (lq >= 2.5) return "strong regional skew";
  return "regional skew";
}

/** "nameLower|sex" -> stored anomaly rows (historical top-N plus latest-era rows). */
export function computeRegionalAnomalies(stateSeries: Iterable<StateSeriesInput>): Map<string, AnomalyRow[]> {
  const states = [...stateSeries];

  // Pass A: national-from-state decade aggregates (consistent LQ baseline).
  const natNameDecade = new Map<string, number>(); // "name|sex|decade" -> count
  const natDecadeTotal = new Map<string, number>(); // "sex|decade" -> count
  let latestStateYear = 0;
  for (const sf of states) {
    for (const { name_lower, sex, year, count } of sf.rows) {
      if (year > latestStateYear) latestStateYear = year;
      const d = decadeOf(year);
      const nk = name_lower + "|" + sex + "|" + d;
      natNameDecade.set(nk, (natNameDecade.get(nk) ?? 0) + count);
      const tk = sex + "|" + d;
      natDecadeTotal.set(tk, (natDecadeTotal.get(tk) ?? 0) + count);
    }
  }
  const currentEra = decadeOf(latestStateYear);

  // Pass B: per-state LQ.
  const byName = new Map<string, AnomalyRow[]>(); // "nameLower|sex" -> rows
  for (const sf of states) {
    const locNameDecade = new Map<string, number>();
    const locDecadeTotal = new Map<string, number>();
    const locPeak = new Map<string, { year: number; count: number }>();
    for (const { name_lower: nl, sex, year, count } of sf.rows) {
      const d = decadeOf(year);
      const nk = nl + "|" + sex + "|" + d;
      locNameDecade.set(nk, (locNameDecade.get(nk) ?? 0) + count);
      locDecadeTotal.set(sex + "|" + d, (locDecadeTotal.get(sex + "|" + d) ?? 0) + count);
      const pk = locPeak.get(nk);
      if (!pk || count > pk.count) locPeak.set(nk, { year, count });
    }

    for (const [nk, nameBirths] of locNameDecade) {
      if (nameBirths < MIN_REGION_BIRTHS) continue;
      const [nl, sex, dStr] = nk.split("|");
      const d = Number(dStr);
      const totState = locDecadeTotal.get(sex + "|" + d) ?? 0;
      const natName = natNameDecade.get(nk) ?? 0;
      const totNat = natDecadeTotal.get(sex + "|" + d) ?? 0;
      if (totState <= 0 || natName <= 0 || totNat <= 0) continue;
      const lq = nameBirths / totState / (natName / totNat);
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
    byName.set(key, selectStoredRegionalAnomalies(arr, currentEra, MAX_ANOMALIES, MAX_CURRENT_ANOMALIES));
  }
  return byName;
}

// ---------------------------------------------------------------------------
// Rows for every dossier layer, from in-memory source data. No I/O.
// ---------------------------------------------------------------------------
export function computeEnrichmentRows(source: EnrichmentSourceData): EnrichmentRows {
  const table = buildSurvivalTable(source.lifeTable);

  const yearTotals = new Map<string, number>();
  let yM = 0;
  for (const t of source.yearTotals) {
    yearTotals.set(t.year + ":" + t.sex, t.total);
    if (t.year > yM) yM = t.year;
  }
  if (!yM) {
    for (const n of source.nationalNames) {
      for (const y of Object.keys(n.series)) yM = Math.max(yM, Number(y));
    }
  }

  const profiles: EnrichmentProfileRow[] = [];
  for (const n of source.nationalNames) {
    const series = new Map<number, number>();
    for (const [y, c] of Object.entries(n.series)) series.set(Number(y), c);
    const p = buildProfile(
      n.name_lower,
      n.sex,
      series,
      table,
      yearTotals,
      yM,
      source.analysisYear,
      source.sourceVersion,
    );
    if (p) profiles.push(p);
  }
  profiles.sort((a, b) => a.name_lower.localeCompare(b.name_lower) || a.sex.localeCompare(b.sex));

  // Regional anomalies — only for names that have a profile (avoid orphan rows).
  const anomalies: RegionalAnomalyRow[] = [];
  if (source.stateSeries.length) {
    const byName = computeRegionalAnomalies(source.stateSeries);
    const haveProfile = new Set(profiles.map((p) => p.name_lower + "|" + p.sex));
    const rows: AnomalyRow[] = [];
    for (const [key, list] of byName) {
      if (!haveProfile.has(key)) continue;
      rows.push(...list);
    }
    rows.sort(
      (a, b) =>
        a.nameLower.localeCompare(b.nameLower) ||
        a.sex.localeCompare(b.sex) ||
        b.lq - a.lq ||
        a.state.localeCompare(b.state),
    );
    for (const a of rows) {
      anomalies.push({
        name_lower: a.nameLower,
        sex: a.sex,
        state: a.state,
        era_start_year: a.eraStartYear,
        location_quotient: a.lq,
        name_births: a.nameBirths,
        historical_peak_year: a.peakYear,
        anomaly_type: a.anomalyType,
      });
    }
  }

  return {
    analysisYear: source.analysisYear,
    sourceVersion: source.sourceVersion,
    profiles,
    catalysts: source.catalysts,
    historicalProfiles: source.historicalProfiles,
    anomalies,
  };
}

// ---------------------------------------------------------------------------
// SQL emission.
// ---------------------------------------------------------------------------
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function buildEnrichmentSql(rows: EnrichmentRows): string {
  // No explicit BEGIN/COMMIT: `wrangler d1 execute --file` runs the whole
  // file as one atomic batch, and local D1 rejects explicit transactions.
  // The leading DELETEs make re-seeding deterministic (idempotent).
  const out: string[] = [
    "-- Generated by scripts/build-enrichment.ts — do not edit by hand.",
    `-- analysis_year=${rows.analysisYear} source_version=${rows.sourceVersion}`,
    "DELETE FROM name_catalysts;",
    "DELETE FROM name_historical_profiles;",
    "DELETE FROM name_regional_anomalies;",
    "DELETE FROM name_enrichment_profiles;",
  ];

  for (const grp of chunk(rows.profiles, 50)) {
    const values = grp
      .map(
        (p) =>
          `(${q(p.name_lower)},${q(p.sex)},${p.total_living_est},${p.median_age},${p.age_range_low},${p.age_range_high},` +
          `${q(p.wave_topology)},${p.latest_pct},${p.analysis_year},${q(p.source_version)})`,
      )
      .join(",\n  ");
    out.push(
      "INSERT INTO name_enrichment_profiles(name_lower,sex,total_living_est,median_age,age_range_low,age_range_high,wave_topology,latest_pct,analysis_year,source_version) VALUES\n  " +
        values +
        ";",
    );
  }

  // Catalysts (curated CSV).
  for (const c of rows.catalysts) {
    out.push(
      "INSERT INTO name_catalysts(name_lower,sex,trigger_year,catalyst_title,catalyst_type,impact_score,description,source_url) VALUES " +
        `(${q(c.name_lower)},${q(c.sex)},${c.trigger_year},${q(c.catalyst_title)},` +
        `${sOrNull(c.catalyst_type)},${sOrNull(c.impact_score)},${sOrNull(c.description)},${sOrNull(c.source_url)});`,
    );
  }

  // Historical profiles (curated CSV; top_occupations stored as JSON text).
  for (const h of rows.historicalProfiles) {
    out.push(
      "INSERT INTO name_historical_profiles(name_lower,sex,era_year,top_occupations,primary_region,urban_vs_rural) VALUES " +
        `(${q(h.name_lower)},${q(h.sex)},${h.era_year},${q(JSON.stringify(h.top_occupations))},${q(h.primary_region)},${q(h.urban_vs_rural)});`,
    );
  }

  // Regional anomalies.
  for (const grp of chunk(rows.anomalies, 50)) {
    const values = grp
      .map(
        (a) =>
          `(${q(a.name_lower)},${q(a.sex)},${q(a.state)},${a.era_start_year},` +
          `${a.location_quotient.toFixed(4)},${a.name_births},${nOrNull(a.historical_peak_year)},${q(a.anomaly_type)})`,
      )
      .join(",\n  ");
    out.push(
      "INSERT INTO name_regional_anomalies(name_lower,sex,state,era_start_year,location_quotient,name_births,historical_peak_year,anomaly_type) VALUES\n  " +
        values +
        ";",
    );
  }

  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// CLI: load zips + curated CSVs, compute, write data/dist/enrichment.sql.
// ---------------------------------------------------------------------------
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

// National SSA parse → per-(name,sex) series + (year,sex) totals.
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

function toNationalNames(national: NationalData): NationalNameInput[] {
  const out: NationalNameInput[] = [];
  for (const [key, s] of national.series) {
    const pipe = key.indexOf("|");
    const name = key.slice(0, pipe);
    const sex = key.slice(pipe + 1) as Sex;
    const series: Record<number, number> = {};
    let total = 0;
    for (const [year, count] of s) {
      series[year] = count;
      total += count;
    }
    out.push({ name, name_lower: name.toLowerCase(), sex, total_count: total, latest_count: s.get(national.yM) ?? 0, series });
  }
  return out;
}

function toYearTotals(national: NationalData): YearTotalInput[] {
  const out: YearTotalInput[] = [];
  for (const [key, total] of national.yearTotals) {
    const [year, sex] = key.split(":");
    out.push({ year: Number(year), sex: sex as Sex, total });
  }
  return out;
}

const STATE_FILE_RE = /^([A-Z]{2})\.txt$/i;

// One state file → rows (state, sex, year, name, count). Lazy and re-iterable.
function* parseStateRows(text: string): Generator<StateRow> {
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
    yield { name_lower: name.toLowerCase(), sex, year, count };
  }
}

function loadStateSeries(stateZip: Uint8Array): StateSeriesInput[] {
  const files = unzipSync(stateZip);
  const dec = new TextDecoder("utf-8");
  const out: StateSeriesInput[] = [];
  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = STATE_FILE_RE.exec(base);
    if (!m) continue;
    const text = dec.decode(data);
    out.push({ state: m[1]!.toUpperCase(), rows: { [Symbol.iterator]: () => parseStateRows(text) } });
  }
  if (!out.length) throw new Error("no <ST>.TXT files in state zip");
  return out;
}

function catalystFromCsv(r: string[]): CatalystInput | null {
  if (r.length < 4 || !r[0]) return null;
  const [nameLower, sex, triggerYear, title, type, impact, desc, url] = r;
  if (sex !== "M" && sex !== "F") return null;
  return {
    name_lower: nameLower!.toLowerCase(),
    sex,
    trigger_year: Number(triggerYear),
    catalyst_title: title ?? "",
    catalyst_type: type ?? "",
    impact_score: impact ?? null,
    description: desc ?? null,
    source_url: url ?? null,
  };
}

// top_occupations arrives either as a JSON array or as "a; b; c".
function parseOccupations(occ: string | undefined): string[] {
  try {
    const parsed = JSON.parse(occ ?? "[]");
    return Array.isArray(parsed) ? parsed.map((v) => String(v)) : [];
  } catch {
    return (occ ?? "")
      .split(";")
      .map((v) => v.trim())
      .filter(Boolean);
  }
}

function historicalFromCsv(r: string[]): HistoricalProfileInput | null {
  if (r.length < 6 || !r[0]) return null;
  const [nameLower, sex, eraYear, occ, region, urban] = r;
  if (sex !== "M" && sex !== "F") return null;
  return {
    name_lower: nameLower!.toLowerCase(),
    sex,
    era_year: Number(eraYear),
    top_occupations: parseOccupations(occ),
    primary_region: region ?? "",
    urban_vs_rural: urban ?? "",
  };
}

async function main(argv: string[]): Promise<void> {
  const arg = (k: string): string | undefined => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const flag = (k: string): boolean => argv.includes(`--${k}`);
  const namesZipArg = arg("names-zip");
  const stateZipArg = arg("state-zip");
  const noState = flag("no-state");
  const limit = arg("limit") ? Math.max(1, Number(arg("limit"))) : Infinity;
  const analysisYear = arg("analysis-year") ? Number(arg("analysis-year")) : ANALYSIS_YEAR;

  const lifeTable = parseLifeTableCsv(await fs.readFile(path.join(MANUAL_DIR, "life-table.csv"), "utf-8"));
  assertLifeTableComplete(buildSurvivalTable(lifeTable)); // fail fast, before any network fetch
  const catalystsCsv = parseCsv(await fs.readFile(path.join(MANUAL_DIR, "name-catalysts.csv"), "utf-8"));
  const historicalCsv = parseCsv(await fs.readFile(path.join(MANUAL_DIR, "historical-profiles.csv"), "utf-8"));

  const national = parseNational(await fetchZip(NATIONAL_URL, namesZipArg, "national"));
  const sourceVersion = arg("source-version") ?? `ssa-${national.yM}`;
  console.error(`National: ${national.series.size} (name,sex) pairs, latest year ${national.yM}`);

  // Optionally cap to the highest-volume names (--limit).
  let nationalNames = toNationalNames(national);
  if (Number.isFinite(limit)) {
    nationalNames = nationalNames.sort((a, b) => b.total_count - a.total_count).slice(0, limit);
  }

  let stateSeries: StateSeriesInput[] = [];
  if (!noState) stateSeries = loadStateSeries(await fetchZip(STATE_URL, stateZipArg, "state"));
  else console.error("Skipping state data (--no-state)");

  const catalysts = catalystsCsv.slice(1).map(catalystFromCsv).filter((c): c is CatalystInput => c !== null);
  const historicalProfiles = historicalCsv
    .slice(1)
    .map(historicalFromCsv)
    .filter((h): h is HistoricalProfileInput => h !== null);

  const rows = computeEnrichmentRows({
    analysisYear,
    sourceVersion,
    lifeTable,
    nationalNames,
    yearTotals: toYearTotals(national),
    catalysts,
    historicalProfiles,
    stateSeries,
  });
  console.error(`Profiles: ${rows.profiles.length}`);
  if (!noState) console.error(`Regional anomalies: ${rows.anomalies.length}`);

  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, buildEnrichmentSql(rows));
  const rel = path.relative(process.cwd(), OUT_FILE);
  console.error(`\nWrote ${rel}`);
  console.error(
    `  profiles=${rows.profiles.length} catalysts=${rows.catalysts.length} historical=${rows.historicalProfiles.length} anomalies=${rows.anomalies.length}`,
  );
  console.error(`\nApply with: npm run seed-enrichment   (remote)  or  npm run seed-enrichment:local`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
