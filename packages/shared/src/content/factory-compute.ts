// Content Factory — compute core.
// Pure functions over SSA rows: parse, detect flash-flood names, evaluate
// editorial claims, verify assertions, interpolate body templates.

import type {
  ClaimValue,
  ComputeSpec,
  ContentDefinition,
  FlashFloodMember,
  FlashFloodsResult,
} from "./factory-types";
import { buildSparkline } from "../sparkline";
import type { Status } from "../schema";

export interface SsaRow {
  year: number;
  name: string;
  percent: number;
  sex: string;
}

export function parseSsaCsv(text: string): SsaRow[] {
  const lines = text.split("\n");
  const rows: SsaRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length < 4) continue;
    const year = Number(parts[0]);
    const percent = Number(parts[2]);
    if (!Number.isFinite(year) || !Number.isFinite(percent)) continue;
    rows.push({ year, name: parts[1]!.trim(), percent, sex: parts[3]!.trim() });
  }
  return rows;
}

export function parseTotalsCsv(text: string): Map<number, number> {
  const totals = new Map<number, number>();
  const lines = text.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const parts = line.split(",");
    const year = Number(parts[0]);
    const total = Number(parts[parts.length - 1]);
    if (Number.isFinite(year) && Number.isFinite(total)) totals.set(year, total);
  }
  return totals;
}

const DEFAULTS = { minPeak: 100, peakWindow: 2, decayRatio: 0.2, decayYears: 5 };

export function computeFlashFloods(
  rows: SsaRow[],
  totals: Map<number, number>,
  spec: Extract<ComputeSpec, { family: "flash-floods" }> = { family: "flash-floods" },
): FlashFloodsResult {
  const minPeak = spec.minPeak ?? DEFAULTS.minPeak;
  const peakWindow = spec.peakWindow ?? DEFAULTS.peakWindow;
  const decayRatio = spec.decayRatio ?? DEFAULTS.decayRatio;
  const decayYears = spec.decayYears ?? DEFAULTS.decayYears;

  // Group births by lowercase-name|sex, keeping the first display form seen.
  const series = new Map<string, Record<number, number>>();
  const display = new Map<string, string>();
  const sexes = new Map<string, string>();
  let totalNames = 0;

  for (const row of rows) {
    const key = `${row.name.toLowerCase()}|${row.sex}`;
    let s = series.get(key);
    if (!s) {
      s = {};
      series.set(key, s);
      display.set(key, row.name);
      sexes.set(key, row.sex);
    }
    const total = totals.get(row.year);
    if (!total || total <= 0) continue;
    s[row.year] = Math.round(row.percent * total);
  }
  totalNames = series.size;

  const members: FlashFloodMember[] = [];
  for (const [key, s] of series) {
    const years = Object.keys(s).map(Number).sort((a, b) => a - b);
    if (years.length === 0) continue;
    const firstYear = years[0]!;
    let peakYear = firstYear;
    let peakCount = 0;
    for (const y of years) {
      if (s[y]! > peakCount) {
        peakCount = s[y]!;
        peakYear = y;
      }
    }
    if (peakCount < minPeak) continue;
    if (peakYear - firstYear > peakWindow) continue;

    const decayTargetYear = peakYear + decayYears;
    const decayCount = nearestKnown(s, years, decayTargetYear);
    if (decayCount > peakCount * decayRatio) continue;

    members.push({
      name: display.get(key)!,
      sex: sexes.get(key)!,
      firstYear,
      peakYear,
      peakCount,
      lastYear: years[years.length - 1]!,
      lastCount: s[years[years.length - 1]!]!,
      series: s,
    });
  }

  members.sort((a, b) => b.peakCount - a.peakCount || a.name.localeCompare(b.name));
  return { members: spec.limit ? members.slice(0, spec.limit) : members, totalNames };
}

function nearestKnown(
  s: Record<number, number>,
  years: number[],
  target: number,
): number {
  if (s[target] !== undefined) return s[target]!;
  let best = years[0]!;
  for (const y of years) {
    if (Math.abs(y - target) < Math.abs(best - target)) best = y;
  }
  return s[best]!;
}

export function evaluateClaims(
  def: ContentDefinition,
  result: FlashFloodsResult,
): Record<string, ClaimValue> {
  const evaluated: Record<string, ClaimValue> = {};
  for (const [key, fn] of Object.entries(def.claims)) {
    const v = fn(result.members, { totalNames: result.totalNames });
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

export interface PanelSpec {
  member: FlashFloodMember;
  dataMaxYear: number;
  dataMinYear?: number;
}

export function chartPanelHtml(spec: PanelSpec): string {
  const { member, dataMaxYear } = spec;
  const ym = spec.dataMinYear ?? 1880;
  const status: Status = classifyStatus(member, dataMaxYear);
  const svg = buildSparkline(member.series, ym, dataMaxYear, { status });
  return `<div class="chart-panel">
  <div class="chart-panel-name">${escapeHtml(member.name)}</div>
  <div class="chart-caption"><span>${member.firstYear}</span><span>Peak ${member.peakYear}</span><span>${dataMaxYear}</span></div>
  ${svg}
</div>`;
}

function classifyStatus(m: FlashFloodMember, dataMaxYear: number): Status {
  const recent = m.series[dataMaxYear];
  if (recent === undefined || recent === 0) return "extinct";
  if (recent <= m.peakCount * 0.05) return "endangered";
  if (recent <= m.peakCount * 0.5) return "declining";
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
    if (!(k in panels)) throw new Error(`Unknown panel placeholder: {{panel:${k}}}`);
    return panels[k]!;
  });

  const leftover = out.match(/\{\{[^}]+\}\}/);
  if (leftover) throw new Error(`Unresolved template placeholder: ${leftover[0]}`);
  return out;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
