// Content Factory — compute core v2.
// Sources: local QA SQLite snapshot (full 1880–2025 name_years) or SSA CSV
// (1880–2008 fallback). Pure functions: parse, detect flash floods, evaluate
// claims, verify assertions, interpolate body templates.

import type {
  ClaimValue,
  ContentDefinition,
  FlashFloodMember,
  FlashFloodsResult,
  GlacierMember,
  GlaciersResult,
} from "./factory-types";
import { buildSparkline } from "../sparkline";
import type { Status } from "../schema";

export const DATA_MIN_YEAR = 1880;
export const DATA_MAX_YEAR = 2025;

export interface NameYearRow {
  name: string;
  sex: string;
  year: number;
  count: number;
}

/** Group raw name/year/count rows into per-name series (grouped by name+sex). */
export function groupSeries(rows: NameYearRow[]): Map<string, Record<number, number>> {
  const series = new Map<string, Record<number, number>>();
  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.sex}`;
    let s = series.get(key);
    if (!s) {
      s = {};
      series.set(key, s);
    }
    s[row.year] = row.count;
  }
  return series;
}

export interface FlashFloodOptions {
  minPeak: number;      // default 100
  runupRatio: number;   // default 0.35 — a year within 2 before peak below this share = sudden arrival
  decayRatio: number;   // default 0.2
  decayYears: number;   // default 5
  dataMaxYear: number;  // exclude peaks whose decay window is unresolved
}

export const DEFAULT_FLOOD_OPTIONS: FlashFloodOptions = {
  minPeak: 100,
  runupRatio: 0.35,
  decayRatio: 0.2,
  decayYears: 5,
  dataMaxYear: DATA_MAX_YEAR,
};

/**
 * Flash flood: the name surges to a peak (>= minPeak) with little run-up
 * (some year in the two before the peak sat below runupRatio × peak), then
 * collapses (count at peak+decayYears <= decayRatio × peak; absence from the
 * record counts as zero — SSA omits names under 5 births).
 */
export function computeFlashFloods(
  series: Map<string, Record<number, number>>,
  displayNames: Map<string, string>,
  options: Partial<FlashFloodOptions> = {},
): FlashFloodsResult {
  const opts = { ...DEFAULT_FLOOD_OPTIONS, ...options };
  const members: FlashFloodMember[] = [];

  for (const [key, s] of series) {
    const years = [...Object.keys(s).map(Number)].sort((a, b) => a - b);
    if (years.length === 0) continue;

    let peakYear = years[0]!;
    let peakCount = 0;
    for (const y of years) {
      if (s[y]! > peakCount) {
        peakCount = s[y]!;
        peakYear = y;
      }
    }
    if (peakCount < opts.minPeak) continue;
    if (peakYear + opts.decayYears > opts.dataMaxYear) continue;

    const prev1 = s[peakYear - 1] ?? 0;
    const prev2 = s[peakYear - 2] ?? 0;
    if (!(prev1 < peakCount * opts.runupRatio || prev2 < peakCount * opts.runupRatio)) continue;

    const decayCount = s[peakYear + opts.decayYears] ?? 0;
    if (decayCount > peakCount * opts.decayRatio) continue;

    const firstYear = years[0]!;
    const lastYear = years[years.length - 1]!;
    members.push({
      name: displayNames.get(key) ?? key.split("|")[0]!,
      sex: key.split("|")[1] ?? "",
      firstYear,
      peakYear,
      peakCount,
      lastYear,
      lastCount: s[lastYear] ?? 0,
      series: s,
    });
  }

  members.sort((a, b) => b.peakCount - a.peakCount || a.name.localeCompare(b.name));
  return { members, totalNames: series.size };
}

export interface GlacierOptions {
  minPeak: number;        // default 5000
  thresholdShare: number; // default 0.10 — "active" years sit at >= 10% of peak
  minRiseYears: number;   // default 25
  minFallYears: number;   // default 25
  dataMaxYear: number;    // fall must complete inside the record
}

export const DEFAULT_GLACIER_OPTIONS: GlacierOptions = {
  minPeak: 5000,
  thresholdShare: 0.1,
  minRiseYears: 25,
  minFallYears: 25,
  dataMaxYear: DATA_MAX_YEAR,
};

/**
 * Glacier: the name climbs to a big peak (>= minPeak) over at least
 * minRiseYears (measured from the first year it crossed thresholdShare × peak),
 * then declines over at least minFallYears, with the whole decline resolved
 * inside the record. The slow-motion counterpart of a flash flood.
 */
export function computeGlaciers(
  series: Map<string, Record<number, number>>,
  displayNames: Map<string, string>,
  options: Partial<GlacierOptions> = {},
): GlaciersResult {
  const opts = { ...DEFAULT_GLACIER_OPTIONS, ...options };
  const members: GlacierMember[] = [];

  for (const [key, s] of series) {
    const years = [...Object.keys(s).map(Number)].sort((a, b) => a - b);
    if (years.length === 0) continue;

    // Earliest year holding the maximum count is the peak.
    let peakYear = years[0]!;
    let peakCount = 0;
    for (const y of years) {
      if (s[y]! > peakCount) {
        peakCount = s[y]!;
        peakYear = y;
      }
    }
    if (peakCount < opts.minPeak) continue;
    if (peakYear + opts.minFallYears > opts.dataMaxYear) continue;

    const threshold = peakCount * opts.thresholdShare;
    const riseStartYear = years.find((y) => y <= peakYear && s[y]! >= threshold);
    if (riseStartYear === undefined) continue;
    if (peakYear - riseStartYear < opts.minRiseYears) continue;

    const fallEndYear = [...years].reverse().find((y) => y >= peakYear && s[y]! >= threshold);
    if (fallEndYear === undefined || fallEndYear >= opts.dataMaxYear) continue;
    if (fallEndYear - peakYear < opts.minFallYears) continue;

    members.push({
      name: displayNames.get(key) ?? key.split("|")[0]!,
      sex: key.split("|")[1] ?? "",
      riseStartYear,
      peakYear,
      peakCount,
      fallEndYear,
      fallEndCount: s[fallEndYear] ?? 0,
      finalCount: s[opts.dataMaxYear] ?? 0,
      series: s,
    });
  }

  members.sort((a, b) => b.peakCount - a.peakCount || a.name.localeCompare(b.name));
  return { members, totalNames: series.size };
}

export interface SsaCsvRow {
  year: number;
  name: string;
  percent: number;
  sex: string;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseSsaCsv(text: string): SsaCsvRow[] {
  const lines = text.split("\n");
  const rows: SsaCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = splitCsvLine(line);
    if (parts.length < 4) continue;
    const year = Number(parts[0]);
    const percent = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(percent)) continue;
    rows.push({ year, name: parts[1]!.trim(), percent, sex: parts[3]!.trim() });
  }
  return rows;
}

export function parseTotalsCsv(text: string): Map<number, { male: number; female: number }> {
  const totals = new Map<number, { male: number; female: number }>();
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = line.split(",");
    const year = Number(parts[0]);
    const male = Number(parts[1]);
    const female = Number(parts[2]);
    if (Number.isFinite(year) && Number.isFinite(male) && Number.isFinite(female)) {
      totals.set(year, { male, female });
    }
  }
  return totals;
}

/** Convert SSA CSV rows (percent-of-sex) into NameYearRow birth counts. */
export function csvToNameYearRows(rows: SsaCsvRow[], totals: Map<number, { male: number; female: number }>): NameYearRow[] {
  const sexCode = (raw: string) => (raw === "boy" || raw === "M" ? "M" : "F");
  return rows.map((row) => {
    const t = totals.get(row.year);
    const base = t ? (sexCode(row.sex) === "M" ? t.male : t.female) : 0;
    return {
      year: row.year,
      name: row.name,
      sex: sexCode(row.sex),
      count: Math.round(row.percent * base),
    };
  });
}

export function evaluateClaims(
  def: ContentDefinition,
  result: FlashFloodsResult | GlaciersResult,
): Record<string, ClaimValue> {
  const evaluated: Record<string, ClaimValue> = {};
  for (const [key, fn] of Object.entries(def.claims)) {
    const v = fn(result.members as Array<FlashFloodMember | GlacierMember>, { totalNames: result.totalNames });
    if (typeof v !== "number" && typeof v !== "string") {
      throw new Error(`Claim "${key}" in ${def.slug} did not resolve to a number or string`);
    }
    evaluated[key] = v;
  }
  return evaluated;
}

export function verifyAsserts(
  def: ContentDefinition,
  evaluated: Record<string, ClaimValue>,
): string[] {
  const violations: string[] = [];
  for (const a of def.asserts ?? []) {
    const actual = evaluated[a.key];
    if (actual === undefined) {
      violations.push(`${def.slug}: assert key "${a.key}" not found in claims`);
      continue;
    }
    if (a.equals !== undefined && actual !== a.equals) {
      violations.push(
        `${def.slug}: claim "${a.key}" is ${JSON.stringify(actual)}, expected ${JSON.stringify(a.equals)}`,
      );
    }
    if (a.approx) {
      const [expected, tol] = a.approx;
      const num = Number(actual);
      if (!Number.isFinite(num) || Math.abs(num - expected) > tol) {
        violations.push(
          `${def.slug}: claim "${a.key}" is ${String(actual)}, expected ~${expected} (±${tol})`,
        );
      }
    }
  }
  return violations;
}

export interface PanelMember {
  name: string;
  firstYear: number;
  peakYear: number;
  peakCount: number;
  series: Record<number, number>;
  /** Present on flash-flood members; drives status classification when set. */
  lastCount?: number;
}

export interface PanelSpec {
  member: PanelMember;
  dataMaxYear: number;
  dataMinYear?: number;
}

export function chartPanelHtml(spec: PanelSpec): string {
  const { member, dataMaxYear } = spec;
  const ym = spec.dataMinYear ?? DATA_MIN_YEAR;
  const status: Status = classifyStatus(member);
  const svg = buildSparkline(member.series, ym, dataMaxYear, { status });
  return `<div class="chart-panel">
  <div class="chart-panel-name">${escapeHtml(member.name)}</div>
  <div class="chart-caption"><span>${member.firstYear}</span><span>Peak ${member.peakYear}</span><span>${dataMaxYear}</span></div>
  ${svg}
</div>`;
}

function classifyStatus(m: PanelMember): Status {
  if (m.lastCount === undefined) return "declining";
  if (m.lastCount === 0) return "extinct";
  if (m.lastCount <= m.peakCount * 0.05) return "endangered";
  if (m.lastCount <= m.peakCount * 0.5) return "declining";
  return "stable";
}

/**
 * Interpolate {{claim:key}} and {{panel:name.SEX}} placeholders.
 * Throws on any unknown key or leftover placeholder — prose can never
 * silently drift from computed data.
 */
export function interpolateBody(
  template: string,
  claims: Record<string, ClaimValue>,
  panels: Record<string, string>,
): string {
  let out = template.replace(/\{\{claim:([^}]+)\}\}/g, (_m, key: string) => {
    const k = key.trim();
    if (!(k in claims)) throw new Error(`Unknown claim placeholder: {{claim:${k}}}`);
    return String(claims[k]!);
  });

  out = out.replace(/\{\{panel:([^}]+)\}\}/g, (_m, key: string) => {
    const k = key.trim();
    // Accept both "Name.SEX" and "Name|SEX" spellings.
    const lookup = k in panels ? k : k.replace(".", "|");
    if (!(lookup in panels)) throw new Error(`Unknown panel placeholder: {{panel:${k}}}`);
    return panels[lookup]!;
  });

  const leftover = out.match(/\{\{[^}]+\}\}/);
  if (leftover) throw new Error(`Unresolved template placeholder: ${leftover[0]}`);
  return out;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
