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

export type NameDiscoveryClusterKind =
  | "same-status"
  | "same-era"
  | "current-alternatives";

export interface NameDiscoveryCard {
  name: string;
  sex: Sex;
  status: Status;
  peak_year: number;
  peak_count: number;
  total_count: number;
  latest_count: number;
}

export interface NameDiscoveryCluster {
  kind: NameDiscoveryClusterKind;
  title: string;
  items: NameDiscoveryCard[];
}

export interface NameDiscoveryModule {
  clusters: NameDiscoveryCluster[];
}

// API: GET /api/name/:name
export interface NameRecord {
  name: string;
  sex: Sex;
  ym: number;
  yM: number;
  series: Record<number, number>;
  other?: { sex: Sex; series: Record<number, number> };
  // Pre-computed classification (see classify.ts) — present on API reads
  // that pass it through; never recomputed in the browser.
  status?: Status;
  displayStatus?: string;
  peakYear?: number;
  peakCount?: number;
  declinePct?: number | null;
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

// API: GET /api/names/emerging|fading — backed by the precomputed
// name_momentum table (see migrations/20260812T120000_name_momentum.sql).
export type MomentumDirection = "rising" | "fading";
export type MomentumRouteName = "emerging" | "fading";
export type MomentumSort = "momentum" | "total" | "eta" | "az";

export interface MomentumRow {
  name: string;
  sex: Sex;
  firstYear: number;
  peakYear: number;
  peakCount: number;
  totalCount: number;
  // Last 5 years of the momentum window, oldest to newest.
  y1: number;
  y2: number;
  y3: number;
  y4: number;
  y5: number;
  momentum: number;
  etaYear: number | null;
  // The 5-year window y1..y5 were computed over — lets clients label a
  // composite chart's x-axis correctly without hardcoding a year range that
  // silently goes stale after the next annual refresh.
  windowStart: number;
  windowEnd: number;
}

export interface MomentumResponse {
  direction: MomentumDirection;
  sex: Sex | null;
  sort: MomentumSort;
  yM: number;
  rows: MomentumRow[];
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

// Enrichment System — precomputed dossier layers (see migrations/0008).
export type WaveTopology =
  | "Flash Flood"
  | "Glacier"
  | "Steady Decline"
  | "Steady Wave"
  | "Plateau";

export type CatalystType =
  | "movie"
  | "tv"
  | "music"
  | "historical_event"
  | "sports"
  | "literature"
  | "celebrity"
  | "religion"
  | "politics"
  | "internet";

export interface NameEnrichmentProfile {
  name_lower: string;
  sex: Sex;
  total_living_est: number;
  median_age: number;
  age_range_low: number;
  age_range_high: number;
  wave_topology: WaveTopology;
  latest_pct: number;
  analysis_year: number;
  source_version: string | null;
}

export interface NameCatalyst {
  trigger_year: number;
  catalyst_title: string;
  catalyst_type: CatalystType;
  impact_score: string | null;
  description: string | null;
  source_url: string | null;
}

export interface NameHistoricalProfile {
  era_year: number;
  top_occupations: string[];
  primary_region: string;
  urban_vs_rural: string;
}

export interface NameRegionalAnomaly {
  state: string;
  era_start_year: number;
  location_quotient: number;
  name_births: number;
  historical_peak_year: number | null;
  anomaly_type: string;
}

export interface NameEnrichmentBundle {
  profile: NameEnrichmentProfile | null;
  catalysts: NameCatalyst[];
  historicalProfiles: NameHistoricalProfile[];
  regionalAnomalies: NameRegionalAnomaly[];
}

// Stored in `meta` key/value table.
// Blog
export interface BlogPost {
  id: number;
  slug: string;
  title: string;
  description: string;
  bodyHtml: string;
  bodyMd: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published";
  author: string;
  ogImage: string | null;
}

export interface BlogPostSummary {
  slug: string;
  title: string;
  description: string;
  publishedAt: string | null;
  author: string;
}

export interface BlogPostAdminSummary {
  slug: string;
  title: string;
  status: "draft" | "published";
  publishedAt: string | null;
  updatedAt: string;
}

export const META_KEYS = {
  minYear: "min_year",
  maxYear: "max_year",
  totalNames: "total_names",
  totalRows: "total_rows",
  lastIngestAt: "last_ingest_at",
  lastSsaEtag: "last_ssa_etag",
  lastStateSsaEtag: "last_state_ssa_etag",
  schemaVersion: "schema_version",
  dataVersion: "data_version",
  // The data_version that name_rankings_by_year was last fully built for.
  // Readers only trust the table when this matches data_version — see
  // rankings.ts.
  rankingsVersion: "rankings_version",
  // The data_version that state_year_rankings was last fully built for.
  // Readers only trust the table when this matches data_version — see
  // state-rankings.ts.
  stateRankingsVersion: "state_rankings_version",
} as const;

// Diaspora — per-name geographic diffusion (see name_diaspora table).
export interface NameDiasporaRow {
  name: string;
  name_lower: string;
  sex: Sex;
  origin_state: string | null;
  origin_year: number | null;
  peak_national_year: number | null;
  spread_json: string;
  never_adopted: string;
  total_states: number;
  diffusion_years: number;
}

export interface DiasporaSpreadPoint {
  state: string;
  year: number;
  count: number;
}

export interface DiasporaResponse {
  name: string;
  sex: Sex;
  origin: { state: string; year: number } | null;
  peakNationalYear: number | null;
  spread: DiasporaSpreadPoint[];
  neverAdopted: string[];
  totalStates: number;
  diffusionYears: number;
}
