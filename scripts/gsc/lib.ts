/**
 * gsc/lib.ts — Shared Google Search Console utilities.
 *
 * Auth, querying, retry, scoring, and formatting helpers used by all
 * GSC scripts. Zero external runtime deps.
 */

import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

// ─── Types ───────────────────────────────────────────────────────────

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscConfig {
  keyPath: string;
  site: string;
  days: number;
  country?: string;
  minPosition: number;
  maxPosition: number;
  brandTerms: string[];
  outputDir: string;
  retries: number;
  retryDelayMs: number;
}

export interface QueryParams {
  startDate: string;
  endDate: string;
  dimensions: string[];
  rowLimit?: number;
  country?: string;
  pathPrefix?: string;
}

export interface QuickWin {
  keyword: string;
  position: number;
  impressions: number;
  clicks: number;
  ctrPct: number;
  ctrVsExpected: number;
  score: number;
  page: string;
  pagePath: string;
}

export interface PageAgg {
  page: string;
  keywords: number;
  totalImpressions: number;
  totalClicks: number;
  avgPosition: number;
  totalScore: number;
  topKeyword: string;
}

export interface PeriodResult {
  label: string;
  startDate: string;
  endDate: string;
  rows: GscRow[];
  rowsByPage: GscRow[];
}

// ─── Defaults ────────────────────────────────────────────────────────

export const TOKEN_URI = "https://oauth2.googleapis.com/token";
export const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export const API_BASE = "https://searchconsole.googleapis.com/webmasters/v3";

export const DEFAULT_CONFIG: GscConfig = {
  keyPath: process.env.GSC_SA_KEY ?? "scripts/.gsc-service-account.json",
  site: process.env.GSC_SITE ?? "sc-domain:nobodynamed.com",
  days: Number(process.env.GSC_DAYS ?? "90"),
  country: process.env.GSC_COUNTRY?.toLowerCase() || undefined,
  minPosition: 4,
  maxPosition: 20,
  brandTerms: ["nobodynamed", "nobody named", "nobodynamed.com"],
  outputDir: process.env.GSC_OUTPUT_DIR ?? "scripts/gsc-data",
  retries: 3,
  retryDelayMs: 1000,
};

// ─── Auth ────────────────────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export async function getAccessToken(
  sa: ServiceAccount,
  retries = 3,
  delayMs = 1000,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri ?? TOKEN_URI,
      exp: now + 3600,
      iat: now,
    }),
  );
  const signingInput = `${header}.${claim}`;
  const signature = b64url(
    createSign("RSA-SHA256").update(signingInput).sign(sa.private_key),
  );
  const assertion = `${signingInput}.${signature}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(sa.token_uri ?? TOKEN_URI, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Token exchange failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { access_token?: string };
      if (!json.access_token) throw new Error("No access_token in response");
      return json.access_token;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries - 1) {
        await sleep(delayMs * 2 ** attempt);
      }
    }
  }
  throw lastErr ?? new Error("Token exchange failed after retries");
}

// ─── API ─────────────────────────────────────────────────────────────

export async function querySearchAnalytics(
  token: string,
  site: string,
  params: QueryParams,
  retries = 3,
  delayMs = 1000,
): Promise<GscRow[]> {
  const body: Record<string, unknown> = {
    startDate: params.startDate,
    endDate: params.endDate,
    dimensions: params.dimensions,
    rowLimit: params.rowLimit ?? 25000,
    dataState: "final",
  };

  if (params.country) {
    body.dimensionFilterGroups = [
      {
        filters: [
          {
            dimension: "country",
            operator: "equals",
            expression: params.country,
          },
        ],
      },
    ];
  }

  if (params.pathPrefix) {
    const filters = (body.dimensionFilterGroups as Array<{ filters: unknown[] }>)?.[0]
      ?.filters ?? [];
    filters.push({
      dimension: "page",
      operator: "contains",
      expression: params.pathPrefix,
    });
    body.dimensionFilterGroups = [{ filters }];
  }

  const url = `${API_BASE}/sites/${encodeURIComponent(site)}/searchAnalytics/query`;

  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Search Analytics query failed (${res.status}): ${txt}`);
      }
      const json = (await res.json()) as { rows?: GscRow[] };
      return json.rows ?? [];
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries - 1) {
        await sleep(delayMs * 2 ** attempt);
      }
    }
  }
  throw lastErr ?? new Error("Query failed after retries");
}

// ─── URL Inspection API ──────────────────────────────────────────────

export interface InspectResult {
  inspectionResultLink?: string;
  indexStatusResult?: {
    verdict: string;
    coverageState: string;
    lastCrawlTime?: string;
    pageFetchState?: string;
    robotsTxtState?: string;
    crawlingAllowed?: string;
  };
  mobileUsabilityResult?: {
    verdict: string;
  };
  richResultsResult?: {
    verdict: string;
  };
}

export async function inspectUrl(
  token: string,
  site: string,
  url: string,
  retries = 3,
  delayMs = 1000,
): Promise<InspectResult> {
  const apiUrl = `${API_BASE}/sites/${encodeURIComponent(site)}/urlInspection/index/inspect`;
  const payload = { inspectionUrl: url, siteUrl: site };

  let lastErr: Error | undefined;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Inspect failed (${res.status}): ${txt}`);
      }
      return (await res.json()) as InspectResult;
    } catch (err) {
      lastErr = err as Error;
      if (attempt < retries - 1) {
        await sleep(delayMs * 2 ** attempt);
      }
    }
  }
  throw lastErr ?? new Error("Inspect failed after retries");
}

// ─── Config loading ──────────────────────────────────────────────────

export function loadServiceAccount(keyPath: string): ServiceAccount {
  try {
    return JSON.parse(readFileSync(keyPath, "utf8")) as ServiceAccount;
  } catch {
    throw new Error(
      `Could not read service-account key at "${keyPath}".\n` +
        `  Set GSC_SA_KEY or place the JSON there. See scripts/GSC-SETUP.md.`,
    );
  }
}

export function buildConfig(argv: string[]): GscConfig {
  const cfg = { ...DEFAULT_CONFIG };

  for (const arg of argv) {
    if (arg.startsWith("--days=")) cfg.days = Number(arg.slice(7));
    if (arg.startsWith("--site=")) cfg.site = arg.slice(7);
    if (arg.startsWith("--key=")) cfg.keyPath = arg.slice(6);
    if (arg.startsWith("--country=")) cfg.country = arg.slice(10).toLowerCase();
    if (arg.startsWith("--min-pos=")) cfg.minPosition = Number(arg.slice(10));
    if (arg.startsWith("--max-pos=")) cfg.maxPosition = Number(arg.slice(10));
    if (arg.startsWith("--output=")) cfg.outputDir = arg.slice(9);
    if (arg.startsWith("--brand=")) {
      const terms = arg.slice(8).split(",").map((t) => t.trim().toLowerCase());
      cfg.brandTerms = terms.length ? terms : cfg.brandTerms;
    }
  }

  return cfg;
}

// ─── Scoring ─────────────────────────────────────────────────────────

export function expectedCtr(pos: number): number {
  const curve: Record<number, number> = {
    1: 0.28,
    2: 0.15,
    3: 0.1,
    4: 0.07,
    5: 0.05,
    6: 0.04,
    7: 0.03,
    8: 0.025,
    9: 0.02,
    10: 0.018,
  };
  if (pos <= 10) return curve[Math.round(pos)] ?? 0.02;
  return 0.01;
}

export function computeScore(
  impressions: number,
  position: number,
  minPos: number,
  maxPos: number,
): number {
  const proximity = Math.max(0, (maxPos - position) / (maxPos - minPos));
  return impressions * (0.5 + 0.5 * proximity);
}

// ─── Date utilities ──────────────────────────────────────────────────

export function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function makePeriodDates(days: number): {
  currentStart: string;
  currentEnd: string;
  prevStart: string;
  prevEnd: string;
} {
  const end = new Date();
  end.setDate(end.getDate() - 3); // GSC lags ~2–3 days

  const currentStart = new Date(end);
  currentStart.setDate(currentStart.getDate() - days);

  const prevEnd = new Date(currentStart);
  prevEnd.setDate(prevEnd.getDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - days);

  return {
    currentStart: fmtDate(currentStart),
    currentEnd: fmtDate(end),
    prevStart: fmtDate(prevStart),
    prevEnd: fmtDate(prevEnd),
  };
}

// ─── Filtering ───────────────────────────────────────────────────────

export function isBranded(keyword: string, brandTerms: string[]): boolean {
  const lower = keyword.toLowerCase();
  return brandTerms.some((t) => lower.includes(t));
}

export function isPathMatch(page: string, pathPrefix?: string): boolean {
  if (!pathPrefix) return true;
  return page.includes(pathPrefix);
}

// ─── Formatting ──────────────────────────────────────────────────────

export function csvEscape(value: string | number): string {
  if (typeof value === "number") return String(value);
  const escaped = value.replace(/"/g, '""');
  if (escaped.includes(",") || escaped.includes('"') || escaped.includes("\n")) {
    return `"${escaped}"`;
  }
  return escaped;
}

export function rowsToCsv(
  rows: object[],
  headers: string[],
): string {
  const lines = [
    headers.map((h) => csvEscape(String(h))).join(","),
    ...rows.map((r) =>
      headers.map((h) => {
        const v = (r as Record<string, unknown>)[h];
        return csvEscape(typeof v === "string" || typeof v === "number" ? v : String(v ?? ""));
      }).join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}

// ─── Misc ────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
