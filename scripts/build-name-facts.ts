#!/usr/bin/env tsx
// Builds data/dist/name-facts.sql — the `name_facts` and `name_collections`
// tables that back the /collections/ namespace and the name-page story strip.
//
// Usage:
//   npm run build-name-facts
//   npm run build-name-facts -- --names-zip=./names.zip --state-zip=./state.zip
//   npm run build-name-facts -- --limit=5000 --no-state     # fast local dataset
//
// Runs offline, not in the ingest worker, because two of the metrics are not
// computable there: rarity rank needs a global sort over the whole corpus, and
// the geography fields need the ~6M-row per-state distribution. See the header
// of migrations/0021_name_facts.sql.
//
// Output is a single idempotent transaction, so re-running is safe.

import fs from "node:fs/promises";
import path from "node:path";

import {
  computeSeriesFacts,
  computeStateConcentration,
  rarityBand,
} from "../packages/shared/src/facts-compute";
import { expandCollections } from "../packages/shared/src/collections";
import { variantKey, VARIANT_KEY_VERSION } from "../packages/shared/src/variant-key";
import { classify } from "../packages/shared/src/classify";
import type { NameFacts, Sex } from "../packages/shared/src/schema";
import {
  chunk,
  fetchZip,
  forEachStateRow,
  NATIONAL_URL,
  nOrNull,
  parseCsv,
  parseNational,
  q,
  sOrNull,
  STATE_URL,
} from "./lib/ssa-zip";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const OUT_FILE = path.join(REPO, "data/dist/name-facts.sql");
const MANUAL_DIR = path.join(REPO, "data/manual");

/** Rows per multi-value INSERT. Matches the enrichment builder. */
const ROWS_PER_STMT = 200;

const args = process.argv.slice(2);
const arg = (k: string): string | undefined =>
  args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const flag = (k: string): boolean => args.includes(`--${k}`);

// ---------------------------------------------------------------------------
// Pass 2-4: national series -> facts rows, ranked and variant-grouped.
// ---------------------------------------------------------------------------

export interface BuildOptions {
  analysisYear: number;
  sourceDataVersion: string | null;
  /** name_lower -> catalyst head, highest impact first. */
  catalysts?: Map<string, { year: number; title: string; type: string }>;
  /** "Name|S" -> (state -> lifetime births). */
  stateTotals?: Map<string, Map<string, number>>;
  /** First year the per-state file covers. National births before this year are
   *  excluded from the state-share denominator, since no state data exists for
   *  them and counting them would understate every concentration. */
  stateEraFirstYear?: number;
}

/**
 * Turns the national corpus into fully-populated facts rows. Exported so tests
 * can drive it with a small synthetic corpus.
 */
export function buildFactsRows(
  series: Map<string, Map<number, number>>,
  yM: number,
  opts: BuildOptions,
): NameFacts[] {
  const rows: NameFacts[] = [];

  for (const [key, yearMap] of series) {
    const sep = key.lastIndexOf("|");
    const name = key.slice(0, sep);
    const sex = key.slice(sep + 1) as Sex;
    const record: Record<number, number> = {};
    for (const [year, count] of yearMap) record[year] = count;

    const facts = computeSeriesFacts(record, yM);
    const cls = classify({ series: record, yM });
    if (!facts || !cls) continue;

    const nameLower = name.toLowerCase();
    // The denominator for state share is the name's NATIONAL births over the
    // years the state file covers — not the sum of the visible state rows,
    // which omits every state-year under SSA's five-birth floor.
    const eraStart = opts.stateEraFirstYear ?? -Infinity;
    let nationalInStateEra = 0;
    for (const [year, count] of yearMap) if (year >= eraStart) nationalInStateEra += count;
    const geo = computeStateConcentration(
      Object.fromEntries(opts.stateTotals?.get(key) ?? new Map<string, number>()),
      nationalInStateEra,
    );
    const catalyst = opts.catalysts?.get(`${nameLower}|${sex}`);

    rows.push({
      name,
      name_lower: nameLower,
      sex,
      total_count: cls.totalCount,
      peak_year: cls.peakYear,
      peak_count: cls.peakCount,
      latest_count: cls.latestCount,
      status: cls.status,

      // Filled by rankRarity() once the whole corpus is known.
      rarity_rank_sex: 0,
      rarity_total_sex: 0,
      rarity_pct_sex: 0,
      rarity_rank_all: 0,
      rarity_band: "common",

      first_year: facts.firstYear,
      last_year: facts.lastYear,
      years_recorded: facts.yearsRecorded,
      span_years: facts.spanYears,
      max_annual: facts.maxAnnual,
      gap_years_max: facts.gap?.length ?? 0,
      gap_start_year: facts.gap?.start ?? null,
      gap_end_year: facts.gap?.end ?? null,
      is_one_and_done: facts.isOneAndDone ? 1 : 0,
      is_sub_ten: facts.isSubTen ? 1 : 0,
      is_verge: facts.isVerge ? 1 : 0,

      spike_year: facts.spike?.year ?? null,
      spike_ratio: facts.spike?.ratio ?? null,
      spike_baseline: facts.spike?.baseline ?? null,
      spike_post_ratio: facts.spike?.postRatio ?? null,

      comeback_gap: facts.comeback?.gap ?? null,
      comeback_year: facts.comeback?.year ?? null,
      comeback_strength: facts.comeback?.strength ?? null,

      top_state: geo.top,
      top_state_share: geo.top ? geo.share : null,
      exclusive_state: geo.exclusive,
      states_seen: geo.top ? geo.statesSeen : null,

      // Filled by groupVariants().
      variant_key: variantKey(name),
      variant_count: 1,
      variant_is_primary: 0,

      catalyst_year: catalyst?.year ?? null,
      catalyst_title: catalyst?.title ?? null,
      catalyst_type: catalyst?.type ?? null,

      source_data_version: opts.sourceDataVersion,
      analysis_year: opts.analysisYear,
    });
  }

  rankRarity(rows);
  groupVariants(rows);
  return rows;
}

/**
 * Global sort. Rank 1 is the most common name within its sex; the percentile is
 * inverted so 100 means rarest, which is how it reads on the page ("rarer than
 * 99.2% of girls' names").
 */
export function rankRarity(rows: NameFacts[]): void {
  for (const sex of ["M", "F"] as const) {
    const inSex = rows.filter((r) => r.sex === sex).sort(byRarity);
    const total = inSex.length;
    inSex.forEach((row, i) => {
      row.rarity_rank_sex = i + 1;
      row.rarity_total_sex = total;
      // A rank of 1 out of 1 must not read as "rarer than 100%".
      row.rarity_pct_sex = total > 1 ? Number((((i) / (total - 1)) * 100).toFixed(2)) : 0;
      row.rarity_band = rarityBand(row.rarity_pct_sex, row.total_count);
    });
  }
  [...rows].sort(byRarity).forEach((row, i) => {
    row.rarity_rank_all = i + 1;
  });
}

const byRarity = (a: NameFacts, b: NameFacts): number =>
  b.total_count - a.total_count || a.name.localeCompare(b.name);

/**
 * Spelling families. `variant_is_primary` marks the highest-volume spelling in
 * each family — the one the "unusual spellings" collection excludes and the one
 * a rare variant is compared against.
 */
export function groupVariants(rows: NameFacts[]): void {
  const families = new Map<string, NameFacts[]>();
  for (const row of rows) {
    // Keyed by sex too: Jaime/M and Jaime/F are different naming traditions.
    const key = `${row.variant_key}|${row.sex}`;
    const list = families.get(key);
    if (list) list.push(row);
    else families.set(key, [row]);
  }
  for (const list of families.values()) {
    list.sort(byRarity);
    for (const row of list) row.variant_count = list.length;
    list[0]!.variant_is_primary = 1;
  }
}

// ---------------------------------------------------------------------------
// Pass 7: collection membership.
// ---------------------------------------------------------------------------

export interface CollectionMemberInsert {
  slug: string;
  nameLower: string;
  sex: Sex;
  name: string;
  rankIn: number;
  metricLabel: string;
  metricValue: number;
}

/**
 * Runs every registered collection's select() over the facts corpus. Exported
 * so tests can assert membership without a database.
 */
export function assembleCollections(
  rows: readonly NameFacts[],
  span: { minYear: number; maxYear: number },
): CollectionMemberInsert[] {
  const out: CollectionMemberInsert[] = [];
  for (const def of expandCollections(span)) {
    const picks = def.select(rows);
    picks.forEach((pick, i) => {
      out.push({
        slug: def.slug,
        nameLower: pick.row.name_lower,
        sex: pick.row.sex,
        name: pick.row.name,
        rankIn: i + 1,
        metricLabel: pick.metricLabel,
        metricValue: pick.metricValue,
      });
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// SQL emission.
// ---------------------------------------------------------------------------

const FACTS_COLUMNS = [
  "name_lower", "sex", "name",
  "total_count", "peak_year", "peak_count", "latest_count", "status",
  "rarity_rank_sex", "rarity_total_sex", "rarity_pct_sex", "rarity_rank_all", "rarity_band",
  "first_year", "last_year", "years_recorded", "span_years", "max_annual",
  "gap_years_max", "gap_start_year", "gap_end_year",
  "is_one_and_done", "is_sub_ten", "is_verge",
  "spike_year", "spike_ratio", "spike_baseline", "spike_post_ratio",
  "comeback_gap", "comeback_year", "comeback_strength",
  "top_state", "top_state_share", "exclusive_state", "states_seen",
  "variant_key", "variant_count", "variant_is_primary",
  "catalyst_year", "catalyst_title", "catalyst_type",
  "source_data_version", "analysis_year",
] as const;

function factsTuple(r: NameFacts): string {
  return `(${[
    q(r.name_lower), q(r.sex), q(r.name),
    r.total_count, r.peak_year, r.peak_count, r.latest_count, q(r.status),
    r.rarity_rank_sex, r.rarity_total_sex, r.rarity_pct_sex, r.rarity_rank_all, q(r.rarity_band),
    r.first_year, r.last_year, r.years_recorded, r.span_years, r.max_annual,
    r.gap_years_max, nOrNull(r.gap_start_year), nOrNull(r.gap_end_year),
    r.is_one_and_done, r.is_sub_ten, r.is_verge,
    nOrNull(r.spike_year), nOrNull(r.spike_ratio), nOrNull(r.spike_baseline), nOrNull(r.spike_post_ratio),
    nOrNull(r.comeback_gap), nOrNull(r.comeback_year), nOrNull(r.comeback_strength),
    sOrNull(r.top_state), nOrNull(r.top_state_share), sOrNull(r.exclusive_state), nOrNull(r.states_seen),
    q(r.variant_key), r.variant_count, r.variant_is_primary,
    nOrNull(r.catalyst_year), sOrNull(r.catalyst_title), sOrNull(r.catalyst_type),
    sOrNull(r.source_data_version), r.analysis_year,
  ].join(",")})`;
}

function memberTuple(m: CollectionMemberInsert): string {
  return `(${[
    q(m.slug), q(m.nameLower), q(m.sex), q(m.name), m.rankIn, q(m.metricLabel), m.metricValue,
  ].join(",")})`;
}

/**
 * The whole seed file, as one transaction. Exported for the build test, which
 * asserts the transaction is balanced and every literal is escaped.
 */
export function emitSql(
  rows: readonly NameFacts[],
  members: readonly CollectionMemberInsert[],
  sourceDataVersion: string,
): string {
  const out: string[] = [
    "-- Generated by scripts/build-name-facts.ts — do not edit by hand.",
    `-- ${rows.length} name_facts rows, ${members.length} name_collections rows.`,
    "BEGIN TRANSACTION;",
    "DELETE FROM name_collections;",
    "DELETE FROM name_facts;",
  ];

  for (const batch of chunk(rows, ROWS_PER_STMT)) {
    out.push(
      `INSERT INTO name_facts (${FACTS_COLUMNS.join(",")}) VALUES\n${batch.map(factsTuple).join(",\n")};`,
    );
  }
  for (const batch of chunk(members, ROWS_PER_STMT)) {
    out.push(
      "INSERT INTO name_collections (slug,name_lower,sex,name,rank_in,metric_label,metric_value) VALUES\n" +
        batch.map(memberTuple).join(",\n") +
        ";",
    );
  }

  // Staleness markers. facts_version records the corpus these rows were BUILT
  // from, passed in as --data-version.
  //
  // It deliberately does not SELECT the live data_version at seed time. Doing
  // that would make a stale seed file adopt whatever version happened to be
  // current, so applying an old build after a new ingest would silently mark
  // the stale rows as fresh and verify-name-facts would pass. Stamping the
  // build's own source version is the only value that can actually diverge.
  out.push(
    `INSERT INTO meta (key, value) VALUES ('facts_version', ${q(sourceDataVersion)})` +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
  );
  out.push(
    `INSERT INTO meta (key, value) VALUES ('variant_key_version', '${VARIANT_KEY_VERSION}')` +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
  );
  out.push("COMMIT;");
  return out.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

function loadCatalysts(csv: string[][]): Map<string, { year: number; title: string; type: string }> {
  const out = new Map<string, { year: number; title: string; type: string; impact: number }>();
  const impactRank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const header = (csv[0] ?? []).map((h) => h.trim());
  const col = (name: string) => header.indexOf(name);
  const iName = col("name_lower");
  const iSex = col("sex");
  const iYear = col("trigger_year");
  const iTitle = col("catalyst_title");
  const iType = col("catalyst_type");
  const iImpact = col("impact_score");

  for (let i = 1; i < csv.length; i++) {
    const r = csv[i]!;
    const nameLower = (r[iName] ?? "").trim().toLowerCase();
    const sex = (r[iSex] ?? "").trim();
    const year = Number((r[iYear] ?? "").trim());
    const title = (r[iTitle] ?? "").trim();
    if (!nameLower || !title || !Number.isFinite(year)) continue;
    const impact = impactRank[(r[iImpact] ?? "").trim().toLowerCase()] ?? 0;
    const key = `${nameLower}|${sex}`;
    const prev = out.get(key);
    // Highest impact wins; ties go to the earlier trigger, which is the one
    // that actually moved the curve.
    if (!prev || impact > prev.impact || (impact === prev.impact && year < prev.year)) {
      out.set(key, { year, title, type: (r[iType] ?? "").trim(), impact });
    }
  }
  return new Map([...out].map(([k, v]) => [k, { year: v.year, title: v.title, type: v.type }]));
}

/**
 * Lifetime births per state for every (name, sex). Accumulated in a streaming
 * pass — the decompressed state corpus is far too large to hold as rows.
 */
function accumulateStateTotals(zipBytes: Uint8Array): {
  totals: Map<string, Map<string, number>>;
  firstYear: number;
} {
  const totals = new Map<string, Map<string, number>>();
  let rowCount = 0;
  let firstYear = Infinity;
  forEachStateRow(zipBytes, (state, sex, year, name, count) => {
    rowCount++;
    if (year < firstYear) firstYear = year;
    const key = `${name}|${sex}`;
    let byState = totals.get(key);
    if (!byState) {
      byState = new Map();
      totals.set(key, byState);
    }
    byState.set(state, (byState.get(state) ?? 0) + count);
  });
  console.error(
    `State corpus: ${rowCount.toLocaleString()} rows over ${totals.size} (name,sex) pairs, from ${firstYear}`,
  );
  return { totals, firstYear: Number.isFinite(firstYear) ? firstYear : 1910 };
}

async function main(): Promise<void> {
  const limit = arg("limit") ? Math.max(1, Number(arg("limit"))) : Infinity;

  // Required, because it is what makes staleness detectable: verify-name-facts
  // compares the stamped facts_version against the live data_version, and a
  // build that invented its own value could never diverge from the database.
  // Read the current value with:
  //   wrangler d1 execute name-vitals --remote --config apps/web/wrangler.toml \
  //     --command "SELECT value FROM meta WHERE key='data_version'"
  const dataVersion = arg("data-version");
  if (!dataVersion) {
    console.error(
      "Missing --data-version=<live meta.data_version>.\n" +
        "It is stamped as meta.facts_version so verify-name-facts can detect a\n" +
        "stale build. Pass --data-version=local for a throwaway local dataset.",
    );
    process.exit(2);
  }

  const national = parseNational(await fetchZip(NATIONAL_URL, arg("names-zip"), "national"));
  console.error(
    `National: ${national.series.size} (name,sex) pairs, ${national.ym}–${national.yM}`,
  );

  let series = national.series;
  if (Number.isFinite(limit)) {
    // Keep the highest-volume names so a capped local build still exercises the
    // rank/variant/collection logic on realistic data.
    const ranked = [...series.entries()]
      .map(([key, s]) => {
        let total = 0;
        for (const c of s.values()) total += c;
        return { key, s, total };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
    series = new Map(ranked.map((r) => [r.key, r.s]));
    console.error(`--limit=${limit}: reduced to ${series.size} pairs`);
  }

  const catalysts = loadCatalysts(
    parseCsv(await fs.readFile(path.join(MANUAL_DIR, "name-catalysts.csv"), "utf-8")),
  );
  console.error(`Catalysts: ${catalysts.size} (name,sex) pairs`);

  const stateData = flag("no-state")
    ? undefined
    : accumulateStateTotals(await fetchZip(STATE_URL, arg("state-zip"), "state"));

  const rows = buildFactsRows(series, national.yM, {
    analysisYear: Number(arg("analysis-year")) || new Date().getUTCFullYear(),
    sourceDataVersion: dataVersion,
    catalysts,
    stateTotals: stateData?.totals,
    stateEraFirstYear: stateData?.firstYear,
  });
  console.error(`Facts: ${rows.length} rows`);

  const members = assembleCollections(rows, { minYear: national.ym, maxYear: national.yM });
  const bySlug = new Map<string, number>();
  for (const m of members) bySlug.set(m.slug, (bySlug.get(m.slug) ?? 0) + 1);
  console.error(`Collections: ${members.length} memberships across ${bySlug.size} populated slugs`);

  const sql = emitSql(rows, members, dataVersion);
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(OUT_FILE, sql, "utf-8");
  console.error(`Wrote ${path.relative(process.cwd(), OUT_FILE)} (${(sql.length / 1e6).toFixed(1)} MB)`);
}

// Only run when invoked directly, so the test can import the pure exports.
if (process.argv[1] && /build-name-facts\.(ts|js)$/.test(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
