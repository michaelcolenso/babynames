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
  factsVersion: "facts_version",
  /** Fingerprint of the SSA corpus the facts were built from. */
  factsCorpus: "facts_corpus",
  variantKeyVersion: "variant_key_version",
} as const;

// Rare-name story metrics — one row per (name, sex), mirroring `name_facts`.
// Precomputed offline by scripts/build-name-facts.ts because rarity rank needs
// a global sort and the geography fields need the per-state SSA corpus, neither
// of which the ingest worker's streaming pager can see.
export interface NameFacts {
  name_lower: string;
  sex: Sex;
  name: string;

  // Carried from `names` so a collection's select() is a pure function of one row.
  total_count: number;
  peak_year: number;
  peak_count: number;
  latest_count: number;
  status: Status;

  // Rarity. `rarity_pct_sex` is 0-100 where 100 is the rarest.
  rarity_rank_sex: number;
  rarity_total_sex: number;
  rarity_pct_sex: number;
  rarity_rank_all: number;
  rarity_band: RarityBand;

  // Lifecycle.
  first_year: number;
  last_year: number;
  years_recorded: number;
  span_years: number;
  max_annual: number;
  gap_years_max: number;
  gap_start_year: number | null;
  gap_end_year: number | null;
  is_one_and_done: 0 | 1;
  is_sub_ten: 0 | 1;
  is_verge: 0 | 1;

  // A single dramatic year measured against the name's own recent baseline.
  spike_year: number | null;
  spike_ratio: number | null;
  spike_baseline: number | null;
  /** Post-spike level as a fraction of the spike year; null when unknowable. */
  spike_post_ratio: number | null;

  // Revival after a long dormancy.
  comeback_gap: number | null;
  comeback_year: number | null;
  comeback_strength: number | null;

  // Geography, from name_states.
  top_state: string | null;
  top_state_share: number | null;
  exclusive_state: string | null;
  states_seen: number | null;

  /** 1 when this sex is the one /name/<Name>/ resolves to. */
  is_canonical_sex: 0 | 1;

  // Spelling family (see variant-key.ts).
  variant_key: string;
  variant_count: number;
  variant_is_primary: 0 | 1;

  // Denormalized head of name_catalysts, for the story strip.
  catalyst_year: number | null;
  catalyst_title: string | null;
  catalyst_type: string | null;

  source_data_version: string | null;
  analysis_year: number;
}

export type RarityBand = "ultra-rare" | "very-rare" | "rare" | "uncommon" | "common" | "ubiquitous";

/** A name's membership in one editorial collection. */
export interface CollectionMembership {
  slug: string;
  rank_in: number;
  metric_label: string | null;
}

/** One row of a collection page's table. */
export interface CollectionMemberRow {
  name: string;
  sex: Sex;
  rank_in: number;
  metric_label: string | null;
  metric_value: number | null;
  peak_year: number;
  peak_count: number;
  total_count: number;
  latest_count: number;
  first_year: number;
  last_year: number;
  status: Status;
  spark_blob: ArrayBuffer | null;
}

/** A same-spelling-family sibling, surfaced on name pages. */
export interface VariantSibling {
  name: string;
  sex: Sex;
  total_count: number;
  status: Status;
  peak_year: number;
}

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
