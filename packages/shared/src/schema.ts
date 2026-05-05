// Shared type definitions used by ingest, Pages Functions, and the client.
// Mirrors the D1 schema in migrations/0001_init.sql.

export type Sex = "M" | "F";

export type Status =
  | "rising"
  | "stable"
  | "declining"
  | "endangered"
  | "extinct";

export type LandingKind = "extinct" | "endangered" | "rising";

export interface NameRow {
  id: number;
  name: string;
  name_lower: string;
  sex: Sex;
  first_year: number;
  last_year: number;
  peak_year: number;
  peak_count: number;
  total_count: number;
  status: Status;
  decline_pct: number | null;
  latest_count: number;
  prev_decade: number | null;
  curr_decade: number | null;
  growth_x: number | null;
}

// API: GET /api/search?q=
export interface SearchHit {
  name: string;
  sex: Sex;
  peak_year: number;
  peak_count: number;
}

// Curated names eligible for XML sitemap inclusion.
export interface IndexableName {
  name: string;
  name_lower: string;
  total_count: number;
  peak_count: number;
  status: Status;
}

// Lightweight internal links for SSR name pages.
export interface RelatedName {
  name: string;
  sex: Sex;
  status: Status;
  peak_year: number;
  peak_count: number;
  total_count: number;
}

// API: GET /api/name/:name
export interface NameRecord {
  name: string;
  sex: Sex;
  ym: number;
  yM: number;
  series: Record<number, number>;
  other?: { sex: Sex; series: Record<number, number> };
}

// API: GET /api/landing/:kind
export interface LandingRow {
  name: string;
  sex: Sex;
  peakYear: number;
  peakCount: number;
  lastYearSeen?: number; // extinct
  latestCount?: number;  // endangered, rising
  declinePct?: number;   // endangered
  prevDecadeTotal?: number; // rising
  currDecadeTotal?: number; // rising
  growthX?: number | null;  // rising
  spark: number[]; // 60-bucket downsampled trajectory, values 0-255
}

export interface LandingResponse {
  yM: number;
  rows: LandingRow[];
}

// API: GET /api/meta
export interface MetaResponse {
  ym: number;
  yM: number;
  totalNames: number;
  totalRows: number;
  totalsByYear: Record<string, { M: number; F: number }>;
  top10PerYear: Record<string, [string, Sex, number][]>;
  dataVersion: string;
}

// Stored in `meta` key/value table.
export const META_KEYS = {
  minYear: "min_year",
  maxYear: "max_year",
  totalNames: "total_names",
  totalRows: "total_rows",
  lastIngestAt: "last_ingest_at",
  lastSsaEtag: "last_ssa_etag",
  schemaVersion: "schema_version",
  dataVersion: "data_version",
} as const;
