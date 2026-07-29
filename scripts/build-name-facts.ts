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
import { expandCollections, MIN_PUBLISHABLE_MEMBERS } from "../packages/shared/src/collections";
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
      is_current_debut: facts.isOneAndDone && facts.lastYear >= yM ? 1 : 0,
      is_sub_ten: facts.isSubTen ? 1 : 0,
      is_verge: facts.isVerge ? 1 : 0,

      // The page reports the strongest inflection; the collection needs one
      // that demonstrably fell back. They are different events often enough
      // that storing only one made whichever consumer missed out wrong.
      spike_year: facts.spike.strongest?.year ?? null,
      spike_ratio: facts.spike.strongest?.ratio ?? null,
      spike_baseline: facts.spike.strongest?.baseline ?? null,
      spike_post_ratio: facts.spike.strongest?.postRatio ?? null,
      spike_fellback_year: facts.spike.fellBack?.year ?? null,
      spike_fellback_ratio: facts.spike.fellBack?.ratio ?? null,

      comeback_gap: facts.comeback?.gap ?? null,
      comeback_year: facts.comeback?.year ?? null,
      comeback_strength: facts.comeback?.strength ?? null,

      top_state: geo.top,
      top_state_share: geo.top ? geo.share : null,
      exclusive_state: geo.exclusive,
      states_seen: geo.top ? geo.statesSeen : null,

      // Filled by markCanonicalSex().
      is_canonical_sex: 1,

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
  markCanonicalSex(rows);
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

    // Competition ranking: identical lifetime totals must produce identical
    // rank, percentile, and band. 14% of male names share total_count = 5, and
    // ranking them by the alphabetical tie-break alone would spread otherwise
    // indistinguishable names across a wide range of rarity claims.
    let i = 0;
    while (i < inSex.length) {
      let j = i;
      while (j + 1 < inSex.length && inSex[j + 1]!.total_count === inSex[i]!.total_count) j++;
      // The share of names strictly MORE common than this group — the only
      // honest reading of "rarer than X% of names" when there are ties.
      const pct = total > 0 ? Number(((i / total) * 100).toFixed(2)) : 0;
      for (let k = i; k <= j; k++) {
        const row = inSex[k]!;
        row.rarity_rank_sex = i + 1;
        row.rarity_total_sex = total;
        row.rarity_pct_sex = pct;
        row.rarity_band = rarityBand(row.total_count);
      }
      i = j + 1;
    }
  }

  const all = [...rows].sort(byRarity);
  let i = 0;
  while (i < all.length) {
    let j = i;
    while (j + 1 < all.length && all[j + 1]!.total_count === all[i]!.total_count) j++;
    for (let k = i; k <= j; k++) all[k]!.rarity_rank_all = i + 1;
    i = j + 1;
  }
}

const byRarity = (a: NameFacts, b: NameFacts): number =>
  b.total_count - a.total_count || a.name.localeCompare(b.name);

/**
 * Marks the sex that /name/<Name>/ actually resolves to — the higher lifetime
 * total, matching the dominant-sex pick in apps/web/functions/name/[name]/index.ts.
 *
 * Without this a minority-sex row can carry a claim that contradicts its own
 * link: a spelling recorded once for one sex but with a long history for the
 * other would be filed as a one-year wonder pointing at a popular name's page.
 */
export function markCanonicalSex(rows: NameFacts[]): void {
  const byName = new Map<string, NameFacts[]>();
  for (const row of rows) {
    const list = byName.get(row.name_lower);
    if (list) list.push(row);
    else byName.set(row.name_lower, [row]);
  }
  for (const list of byName.values()) {
    let best = list[0]!;
    for (const row of list) {
      if (row.total_count > best.total_count) best = row;
      // Ties go to male, matching `total(m) >= total(f)` in the name route.
      // Without this the tie-break falls to source ordering and 124 spellings
      // would attach their claims to the sex the page does not display.
      else if (row.total_count === best.total_count && row.sex === "M") best = row;
    }
    for (const row of list) row.is_canonical_sex = row === best ? 1 : 0;
  }
}

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
    // A collection below the publish threshold is materialized as nothing at
    // all. Filtering only at render time meant each consumer had to remember to
    // do it — the hub and sitemap did, the collection page's related nav did
    // not until it was reported, and name-page memberships did not until it was
    // reported again. Dropping the rows makes "present in name_collections
    // implies publishable" true for every consumer, current and future.
    if (picks.length < MIN_PUBLISHABLE_MEMBERS) continue;
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
  "is_one_and_done", "is_current_debut", "is_sub_ten", "is_verge",
  "spike_year", "spike_ratio", "spike_baseline", "spike_post_ratio",
  "spike_fellback_year", "spike_fellback_ratio",
  "comeback_gap", "comeback_year", "comeback_strength",
  "top_state", "top_state_share", "exclusive_state", "states_seen",
  "is_canonical_sex", "variant_key", "variant_count", "variant_is_primary",
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
    r.is_one_and_done, r.is_current_debut, r.is_sub_ten, r.is_verge,
    nOrNull(r.spike_year), nOrNull(r.spike_ratio), nOrNull(r.spike_baseline), nOrNull(r.spike_post_ratio),
    nOrNull(r.spike_fellback_year), nOrNull(r.spike_fellback_ratio),
    nOrNull(r.comeback_gap), nOrNull(r.comeback_year), nOrNull(r.comeback_strength),
    sOrNull(r.top_state), nOrNull(r.top_state_share), sOrNull(r.exclusive_state), nOrNull(r.states_seen),
    r.is_canonical_sex, q(r.variant_key), r.variant_count, r.variant_is_primary,
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
/**
 * A fingerprint of the corpus the build actually read: last year covered and
 * total births across every (name, sex) pair.
 *
 * --data-version is a caller-supplied string, and the input zip is fetched or
 * passed separately, so nothing otherwise connects the two. During the annual
 * release window it is entirely possible to pair the live database UUID with a
 * newer SSA download, or a stale local zip with the current UUID, and stamp the
 * result as fresh. Both quantities below are recomputable from the live `names`
 * table, so verify-name-facts can check the claim rather than trust it.
 */
export interface StateCorpusStats {
  maxYear: number;
  totalBirths: number;
}

export function corpusFingerprint(
  rows: readonly NameFacts[],
  state?: StateCorpusStats | null,
): string {
  let maxYear = 0;
  let totalBirths = 0;
  for (const r of rows) {
    if (r.last_year > maxYear) maxYear = r.last_year;
    totalBirths += r.total_count;
  }
  // The state half identifies the per-state corpus, not just whether one was
  // supplied. `geo=yes` alone would still match after a build that read an
  // older namesbystate archive than the database was ingested from, leaving
  // every state share and only-in-* membership disagreeing with the live rows.
  // Both numbers are recomputable from name_states, so verification can check
  // the input rather than infer it from COUNT(*) > 0.
  const geo = state ? `${state.maxYear}:${state.totalBirths}` : "none";
  return `ssa:${maxYear}:${totalBirths}:geo=${geo}`;
}

export function emitSql(
  rows: readonly NameFacts[],
  members: readonly CollectionMemberInsert[],
  sourceDataVersion: string,
  stateStats?: StateCorpusStats | null,
  buildId: string = new Date().toISOString(),
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
  out.push(
    `INSERT INTO meta (key, value) VALUES ('facts_corpus', ${q(corpusFingerprint(rows, stateStats))})` +
      " ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
  );
  // Distinct for every build, unlike facts_version, which is the SSA data
  // version and stays put across a rebuild. Rebuilds happen for reasons that
  // have nothing to do with new SSA data — a corrected threshold, a changed
  // variant algorithm, new catalyst rows — and each one changes what pages
  // render. This is what the edge cache keys on, so a reseed lands on a new key
  // instead of serving the previous facts for another day.
  out.push(
    `INSERT INTO meta (key, value) VALUES ('facts_build', ${q(buildId)})` +
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
  stats: StateCorpusStats;
} {
  const totals = new Map<string, Map<string, number>>();
  let rowCount = 0;
  let firstYear = Infinity;
  let maxYear = 0;
  let stateBirths = 0;
  forEachStateRow(zipBytes, (state, sex, year, name, count) => {
    rowCount++;
    if (year < firstYear) firstYear = year;
    if (year > maxYear) maxYear = year;
    stateBirths += count;
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
  return {
    totals,
    firstYear: Number.isFinite(firstYear) ? firstYear : 1910,
    stats: { maxYear, totalBirths: stateBirths },
  };
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

  // --no-state is a local convenience. Combined with a real data version it
  // would emit a full production seed with the geography silently stripped, so
  // the two are mutually exclusive; the fingerprint records the choice as well.
  if (flag("no-state") && !/^(local|fixture|test)/i.test(dataVersion)) {
    console.error(
      `--no-state builds omit every geographic fact and all only-in-* collections.\n` +
        `Refusing to stamp one with --data-version=${dataVersion}. Use a data version\n` +
        `beginning "local" for throwaway builds, or drop --no-state.`,
    );
    process.exit(2);
  }
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

  const sql = emitSql(rows, members, dataVersion, stateData?.stats ?? null);
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
