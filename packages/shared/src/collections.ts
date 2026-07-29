// Editorial collection registry — the single source of truth for the
// /collections/ namespace.
//
// One definition drives four consumers: the offline builder that materializes
// membership into `name_collections`, the Pages Function that renders a
// collection, the hub, and the sitemap. Keeping `select()` here rather than in
// the build script means a unit test can assert membership rules against
// synthetic rows without touching D1.
//
// Every collection is a claim about the American usage record, not about a
// name's meaning or origin. If a cluster cannot be expressed as a predicate
// over `NameFacts`, it does not belong here.

import { SPIKE_DRAMATIC_RATIO, SPIKE_FELL_BACK_RATIO } from "./facts-compute";
import type { NameFacts } from "./schema";
import { ALL_STATES, stateName, stateSlug } from "./us-states-map";

export type CollectionGroup = "rarity" | "lifecycle" | "geography" | "spelling" | "culture";

export type CollectionColumn = "metric" | "peak" | "latest" | "total" | "years" | "spark";

/** Minimum members before a collection is worth publishing and sitemapping. */
export const MIN_PUBLISHABLE_MEMBERS = 8;

/** Rows per page on a collection page. */
export const COLLECTION_PAGE_SIZE = 100;

const DEFAULT_MAX_MEMBERS = 100;

export interface CollectionPick {
  row: NameFacts;
  metricLabel: string;
  metricValue: number;
}

export interface CollectionDef {
  slug: string;
  /** On-page <h1> and breadcrumb. */
  title: string;
  seoTitle: string;
  seoDescription: string;
  eyebrow: string;
  lede: string;
  /** One or two paragraphs framing what the data shows. HTML allowed. */
  body: string;
  group: CollectionGroup;
  columns: CollectionColumn[];
  /** Header for the collection-specific metric column. */
  metricHeading: string;
  related: string[];
  maxMembers: number;
  /** Selection and display order. Runs offline over the full facts corpus. */
  select(facts: readonly NameFacts[]): CollectionPick[];
}

const fmt = (n: number): string => n.toLocaleString("en-US");

/**
 * Selection helper. Membership is restricted to the canonical sex for every
 * collection: a card's claim has to be true of the page its link opens, and
 * /name/<Name>/ always resolves to the higher-total sex.
 */
function take(
  facts: readonly NameFacts[],
  where: (f: NameFacts) => boolean,
  order: (a: NameFacts, b: NameFacts) => number,
  label: (f: NameFacts) => string,
  value: (f: NameFacts) => number,
  limit: number,
): CollectionPick[] {
  return facts
    .filter((f) => f.is_canonical_sex === 1 && where(f))
    .sort(order)
    .slice(0, limit)
    .map((row) => ({ row, metricLabel: label(row), metricValue: value(row) }));
}

/** Most total births first. Rare names still differ by orders of magnitude in
 *  how findable they are, and the ones with the longest records are the ones
 *  people actually search for. */
const byTotalDesc = (a: NameFacts, b: NameFacts): number =>
  b.total_count - a.total_count || a.name.localeCompare(b.name);

const BASE: readonly CollectionDef[] = [
  {
    slug: "given-to-fewer-than-ten",
    title: "Names Given to Fewer Than Ten Babies",
    seoTitle: "Baby Names Given to Fewer Than 10 Babies in a Year | NobodyNamed",
    seoDescription:
      "Names that never reached ten births in a single year, yet appear in the Social Security record year after year. The rarest names in American birth data, with full usage histories.",
    eyebrow: "Rarity file",
    lede:
      "Names that appear in the national birth record but never cleared ten babies in any single year — often for decades at a stretch.",
    body:
      "<p>The Social Security Administration suppresses any name-year combination below five births, so these names sit just above the floor of what the United States records at all. That they persist across many years is the interesting part: a name used by six or seven families annually for forty years is not a mistake in the data, it is a small and durable tradition.</p><p>Ordered by lifetime births, so the names with the longest continuous records come first.</p>",
    group: "rarity",
    columns: ["metric", "years", "peak", "total", "spark"],
    metricHeading: "Best year",
    related: ["one-year-wonders", "on-the-verge", "unusual-spellings"],
    maxMembers: 200,
    select: (facts) =>
      take(
        facts,
        (f) => f.is_sub_ten === 1 && f.years_recorded >= 5,
        byTotalDesc,
        (f) => `${f.max_annual} births in ${f.peak_year}`,
        (f) => f.max_annual,
        200,
      ),
  },
  {
    slug: "one-year-wonders",
    title: "Names That Appeared Once and Vanished",
    seoTitle: "Baby Names That Appeared Once and Never Again | NobodyNamed",
    seoDescription:
      "Names recorded in exactly one year of American birth data and never again. One year in the record, then nothing — see which names appeared once and vanished.",
    eyebrow: "Rarity file",
    lede: "Names with exactly one year in the entire national record. They appeared, and then never again.",
    body:
      "<p>A single recorded year tells you at least five American babies were given this name in one twelve-month window, and fewer than five in every year before or since. Some are transcription-era spellings that never took hold; some are a single television episode, a single local story, a single family.</p><p>Ordered by the size of that one year.</p>",
    group: "rarity",
    columns: ["metric", "total", "spark"],
    metricHeading: "Its one year",
    related: ["given-to-fewer-than-ten", "one-hit-spikes", "unusual-spellings"],
    maxMembers: 200,
    select: (facts) =>
      take(
        facts,
        (f) => f.is_one_and_done === 1,
        (a, b) => b.max_annual - a.max_annual || a.name.localeCompare(b.name),
        (f) => `${f.max_annual} births, ${f.first_year}`,
        (f) => f.max_annual,
        200,
      ),
  },
  {
    slug: "unusual-spellings",
    title: "Unusual Spelling Variants",
    seoTitle: "Unusual Baby Name Spellings and Their Rarer Variants | NobodyNamed",
    seoDescription:
      "Rare spellings of familiar names — the variants parents chose instead of the standard form. See how each alternate spelling performed against the dominant one.",
    eyebrow: "Spelling file",
    lede:
      "Alternate spellings of names that already had a dominant form — the variant that never became the default.",
    body:
      "<p>Each name here shares a spelling family with a much more common sibling. Grouping is done on a normalized consonant skeleton, so Kaitlyn, Katelyn, and Caitlin land together regardless of which one a given family chose.</p><p>The variants that persist are the ones worth looking at: a spelling used steadily for decades is a genuine parallel tradition, not a misfiling.</p>",
    group: "spelling",
    columns: ["metric", "peak", "total", "spark"],
    metricHeading: "Spelling family",
    related: ["given-to-fewer-than-ten", "one-year-wonders"],
    maxMembers: 200,
    select: (facts) =>
      take(
        facts,
        (f) => f.variant_count >= 3 && f.variant_is_primary === 0 && f.total_count >= 100,
        byTotalDesc,
        (f) => `1 of ${f.variant_count} spellings`,
        (f) => f.variant_count,
        200,
      ),
  },
  {
    slug: "one-hit-spikes",
    title: "Names With One Dramatic Spike",
    seoTitle: "Baby Names With One Dramatic Popularity Spike | NobodyNamed",
    seoDescription:
      "Names that jumped many times over their own baseline in a single year, then fell back. See the exact spike year and multiple for each name.",
    eyebrow: "Lifecycle file",
    lede: "Names that multiplied several times over in one year, then returned to something like their old level.",
    body:
      "<p>A spike is measured against the name's own recent baseline, not against the national top ten — a name going from twenty births to four hundred is a far sharper event than a top-ten name gaining a few thousand. Names with no prior usage are excluded, because a debut is not a spike.</p><p>The cause is usually identifiable: a film, a song, a televised moment. Where the record names one, it appears on the name's own page.</p>",
    group: "lifecycle",
    columns: ["metric", "peak", "total", "spark"],
    metricHeading: "Spike",
    related: ["famous-name-effects", "fifty-year-comebacks", "one-year-wonders"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        // The fall-back requirement is what makes the collection's claim true:
        // a step change from 20 a year to 100 a year forever is a 5x jump but
        // is not a name that "returned to something like its old level".
        (f) =>
          (f.spike_ratio ?? 0) >= SPIKE_DRAMATIC_RATIO &&
          f.spike_year !== null &&
          f.spike_post_ratio !== null &&
          f.spike_post_ratio <= SPIKE_FELL_BACK_RATIO,
        (a, b) => (b.spike_ratio ?? 0) - (a.spike_ratio ?? 0) || a.name.localeCompare(b.name),
        (f) => `${(f.spike_ratio ?? 0).toFixed(1)}× baseline in ${f.spike_year}`,
        (f) => f.spike_ratio ?? 0,
        DEFAULT_MAX_MEMBERS,
      ),
  },
  {
    slug: "fifty-year-comebacks",
    title: "Names That Came Back After 50 Years",
    seoTitle: "Baby Names That Returned After 50+ Years of Silence | NobodyNamed",
    seoDescription:
      "Names absent from American birth records for half a century or more, then used again. See the exact dormancy window and the year each one returned.",
    eyebrow: "Lifecycle file",
    lede: "Names that disappeared from the record entirely for fifty years or more, then came back into use.",
    body:
      "<p>A revival this long is different from a name that merely dipped. These names left the record completely — not a low year, but no recorded year at all — for longer than most people are alive, and then reappeared with real volume behind them.</p><p>The dormancy window is shown for each name; the revival is measured over the five years following it, so a single stray birth does not count.</p>",
    group: "lifecycle",
    columns: ["metric", "peak", "latest", "spark"],
    metricHeading: "Dormancy",
    related: ["one-hit-spikes", "on-the-verge", "famous-name-effects"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        (f) => (f.comeback_gap ?? 0) >= 50,
        (a, b) => (b.comeback_gap ?? 0) - (a.comeback_gap ?? 0) || a.name.localeCompare(b.name),
        // Derived from the comeback, not from gap_start_year/gap_end_year: those
        // describe the LONGEST gap, which is not necessarily the one that
        // produced the revival. Mixing them prints a window and a duration that
        // contradict each other.
        (f) => `Absent ${(f.comeback_year ?? 0) - (f.comeback_gap ?? 0)}–${(f.comeback_year ?? 0) - 1} (${f.comeback_gap} years)`,
        (f) => f.comeback_gap ?? 0,
        DEFAULT_MAX_MEMBERS,
      ),
  },
  {
    slug: "on-the-verge",
    title: "Names on the Verge of Disappearing",
    seoTitle: "Baby Names About to Disappear From American Records | NobodyNamed",
    seoDescription:
      "Names down to single digits after a real peak, and still falling. The names most likely to vanish from the Social Security record within a few years.",
    eyebrow: "Lifecycle file",
    lede: "Names still in the record, but down to single digits and falling fast from a peak that was genuinely large.",
    body:
      "<p>These are not names that were always rare. Each one cleared a meaningful peak and has since collapsed to fewer than ten births a year, with the last five years running well below the five before them. On current trajectory most will drop below the reporting floor and vanish from the published data entirely.</p><p>This collection deliberately covers smaller names than the endangered list, which requires a much larger historical peak.</p>",
    group: "lifecycle",
    columns: ["metric", "peak", "total", "spark"],
    metricHeading: "Latest year",
    related: ["fifty-year-comebacks", "given-to-fewer-than-ten"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        (f) => f.is_verge === 1,
        (a, b) => b.peak_count - a.peak_count || a.name.localeCompare(b.name),
        (f) => `${f.latest_count} births, down from ${fmt(f.peak_count)}`,
        (f) => f.latest_count,
        DEFAULT_MAX_MEMBERS,
      ),
  },
  {
    slug: "famous-name-effects",
    title: "Famous-Person Effects on Naming",
    seoTitle: "How Famous People Changed American Baby Names | NobodyNamed",
    seoDescription:
      "Names whose popularity turned on a identifiable cultural moment — a film, a song, an athlete, a televised event. See the trigger year and the response in the data.",
    eyebrow: "Culture file",
    lede: "Names whose curve turns on a datable cultural moment, with the trigger recorded alongside the response.",
    body:
      "<p>The naming record is one of the few places where cultural influence shows up as a number. A film released in one year produces a measurable bump in the next year's births; a televised moment can do it within months.</p><p>Each entry names the trigger and the year it landed. The name's own page plots the moment directly on its curve.</p>",
    group: "culture",
    columns: ["metric", "peak", "total", "spark"],
    metricHeading: "Trigger",
    related: ["one-hit-spikes", "fifty-year-comebacks"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        (f) => f.catalyst_year !== null && f.catalyst_title !== null,
        (a, b) => b.peak_count - a.peak_count || a.name.localeCompare(b.name),
        (f) => `${f.catalyst_year} · ${f.catalyst_title}`,
        (f) => f.catalyst_year ?? 0,
        DEFAULT_MAX_MEMBERS,
      ),
  },
];

// ---------------------------------------------------------------------------
// Generated families
// ---------------------------------------------------------------------------

function decadeCollection(decade: number): CollectionDef {
  const label = `${decade}s`;
  return {
    slug: `lost-names-of-the-${label}`,
    title: `Lost Names of the ${label}`,
    seoTitle: `Lost Baby Names of the ${label}: Gone From the Record | NobodyNamed`,
    seoDescription: `Names that peaked in the ${label} and have since disappeared from American birth records entirely. See when each one was last recorded.`,
    eyebrow: "Lost decade",
    lede: `Names that had their best year in the ${label} and are no longer recorded at all.`,
    body: `<p>Every one of these names peaked during the ${label} and has since fallen out of the national record completely — not reduced, but absent. The decade a name peaks in tends to be the decade it is permanently associated with, which is exactly why so few of them survive their own generation.</p><p>Ordered by how large each name was at its height, so the biggest losses come first.</p>`,
    group: "lifecycle",
    columns: ["metric", "peak", "years", "spark"],
    metricHeading: "Last recorded",
    related: ["fifty-year-comebacks", "on-the-verge", "given-to-fewer-than-ten"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        // status === "extinct" is classify()'s own definition (nothing in the
        // latest year AND nothing for a decade). latest_count === 0 alone only
        // means the name fell under the reporting floor once, so a name last
        // recorded in the previous release would be called lost.
        (f) =>
          f.peak_year >= decade &&
          f.peak_year < decade + 10 &&
          f.status === "extinct" &&
          f.peak_count >= 25,
        (a, b) => b.peak_count - a.peak_count || a.name.localeCompare(b.name),
        (f) => `Last seen ${f.last_year}`,
        (f) => f.last_year,
        DEFAULT_MAX_MEMBERS,
      ),
  };
}

function stateCollection(abbr: string): CollectionDef {
  const full = stateName(abbr);
  return {
    slug: `only-in-${stateSlug(abbr)}`,
    title: `Names Found Almost Only in ${full}`,
    seoTitle: `Baby Names Unique to ${full} | NobodyNamed`,
    seoDescription: `Names where nearly every recorded American birth happened in ${full}. Regional naming traditions that never crossed the state line.`,
    eyebrow: "Geography file",
    lede: `Names where ${full} accounts for almost every recorded birth in the country.`,
    body: `<p>The Social Security Administration publishes births by state, which makes it possible to find names that never left one. Each name here has at least ninety percent of its national births in ${full} across the years state-level records cover, with enough volume that the concentration is not an artifact of the per-state reporting floor. The share is measured against national births, not against the states that happen to clear the floor — otherwise thinly-spread names would look falsely exclusive.</p><p>Some are family traditions that stayed local. Some track a place, an institution, or a community with a hard geographic boundary.</p>`,
    group: "geography",
    columns: ["metric", "peak", "total", "spark"],
    metricHeading: `Share in ${full}`,
    related: ["given-to-fewer-than-ten", "unusual-spellings"],
    maxMembers: DEFAULT_MAX_MEMBERS,
    select: (facts) =>
      take(
        facts,
        (f) => f.exclusive_state === abbr,
        (a, b) => b.total_count - a.total_count || a.name.localeCompare(b.name),
        (f) => `${Math.round((f.top_state_share ?? 0) * 100)}% of births since 1910`,
        (f) => f.top_state_share ?? 0,
        DEFAULT_MAX_MEMBERS,
      ),
  };
}

/**
 * The full registry for a given corpus span: the seven base collections plus
 * one per decade and one per state. Callers filter by actual membership count
 * before publishing — `expandCollections` describes what *could* exist, not
 * what has members.
 */
export function expandCollections(opts: { minYear: number; maxYear: number }): CollectionDef[] {
  const out: CollectionDef[] = [...BASE];
  const firstDecade = Math.max(1880, Math.floor(opts.minYear / 10) * 10);
  // Stop one full decade short of the corpus end: a name cannot be shown to
  // have vanished when its peak decade has barely finished.
  const lastDecade = Math.floor((opts.maxYear - 20) / 10) * 10;
  for (let d = firstDecade; d <= lastDecade; d += 10) out.push(decadeCollection(d));
  for (const abbr of ALL_STATES) out.push(stateCollection(abbr));
  return out;
}

/** Registry keyed by slug, for the widest plausible corpus. Route lookups use
 *  this so an unknown slug 404s without a database round-trip. */
const REGISTRY = new Map<string, CollectionDef>(
  expandCollections({ minYear: 1880, maxYear: new Date().getUTCFullYear() }).map((c) => [c.slug, c]),
);

export function getCollection(slug: string): CollectionDef | undefined {
  return REGISTRY.get(slug);
}

export function allCollections(): CollectionDef[] {
  return [...REGISTRY.values()];
}

export const GROUP_LABELS: Record<CollectionGroup, string> = {
  rarity: "Rarity",
  lifecycle: "Lifecycle",
  geography: "Geography",
  spelling: "Spelling",
  culture: "Culture",
};

export const GROUP_ORDER: readonly CollectionGroup[] = [
  "rarity",
  "lifecycle",
  "geography",
  "spelling",
  "culture",
];

export function collectionsByGroup(defs: readonly CollectionDef[] = allCollections()): Record<
  CollectionGroup,
  CollectionDef[]
> {
  const out = {} as Record<CollectionGroup, CollectionDef[]>;
  for (const g of GROUP_ORDER) out[g] = [];
  for (const def of defs) out[def.group].push(def);
  return out;
}
