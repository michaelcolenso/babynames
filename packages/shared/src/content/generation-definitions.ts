// Generation hub registry — the only checked-in list of generation windows,
// in chronological order. Boundaries are conventions, not data; every window
// below is documented with the convention it follows and the assumption it
// makes. The SSA annual records the product already holds (name_years +
// year_totals) cover every year listed, so each window can be summed exactly
// from the same data the decade hubs are built from — nothing is estimated.
//
// Rollout states:
//   - "draft": defined + data-supported, but no page, sitemap entry, or route.
//     Draft rows still serve as comparison baselines for their live neighbors
//     (the "shift from the previous generation" copy needs the previous
//     window's actual top names).
//   - "live": the route renders and the sitemap advertises it.
//
// This file owns generation rollout states. It deliberately does NOT touch
// DECADE_HUB_DEFINITIONS' rollout states (seeded/reviewed flips are owned by
// the decade rollout).

export type GenerationRolloutState = "draft" | "live";

export interface GenerationDecadeLink {
  /** Decade hub slug, e.g. "1980s" (must exist in DECADE_HUB_DEFINITIONS). */
  readonly slug: string;
  /** Descriptive anchor text for the internal link. */
  readonly anchor: string;
}

export interface GenerationDefinition {
  /** URL segment under /names/, plural form, e.g. "millennials". */
  readonly slug: string;
  /** Display label, e.g. "Millennial". */
  readonly label: string;
  /** Lowercase phrase used in SEO copy, e.g. "millennial". */
  readonly seoLabel: string;
  /** Title phrase before the colon, e.g. "Millennial Baby Names" / "Baby Boomer Names". */
  readonly titlePhrase: string;
  /** Inclusive first year of the window. */
  readonly startYear: number;
  /** Inclusive last year of the window. */
  readonly endYear: number;
  /** Documented boundary convention + assumption note (rendered verbatim). */
  readonly boundaryNote: string;
  readonly rolloutState: GenerationRolloutState;
  /** Unique editorial heading for the hub's opening section. */
  readonly heading: string;
  /** Numeric-free editorial paragraphs describing the generation's landscape. */
  readonly paragraphs: readonly string[];
  /** Constituent decade hubs, with descriptive anchors. */
  readonly decadeLinks: readonly GenerationDecadeLink[];
  /** Slug of the previous generation window used for the shift comparison. */
  readonly previous?: string;
}

export const GENERATION_DEFINITIONS: readonly GenerationDefinition[] = [
  {
    // Comparison baseline only (the cohort immediately before the Boomers).
    // Never advertised as a page in this rollout.
    slug: "silent",
    label: "Silent Generation",
    seoLabel: "silent generation",
    titlePhrase: "Silent Generation Names",
    startYear: 1928,
    endYear: 1945,
    boundaryNote:
      "The Silent Generation is commonly dated 1928–1945 (Pew Research Center's convention). This page does not exist yet; the window is used only as the comparison baseline for the Baby Boomer hub.",
    rolloutState: "draft" as const,
    heading: "The quiet years before the boom",
    paragraphs: [
      "The Silent Generation window, 1928 through 1945, spans the Depression and the war years — a period when naming was still highly concentrated and the same familiar names repeated across the country.",
    ],
    decadeLinks: [
      { slug: "1920s", anchor: "the 1920s decade hub, where the window begins" },
      { slug: "1930s", anchor: "the 1930s decade hub" },
      { slug: "1940s", anchor: "the 1940s decade hub, where the window ends" },
    ],
  },
  {
    slug: "boomers",
    label: "Baby Boomer",
    seoLabel: "baby boomer",
    titlePhrase: "Baby Boomer Names",
    startYear: 1946,
    endYear: 1964,
    boundaryNote:
      "The Baby Boomer generation is commonly dated 1946–1964 (Pew Research Center's convention). The SSA's annual files cover every year in the window, so every figure on this page is summed from exactly those nineteen calendar years.",
    rolloutState: "live" as const,
    heading: "The biggest classrooms American naming ever filled",
    paragraphs: [
      "The Baby Boomer window sits inside the most concentrated era of American naming on record. Birth totals were at their peak, and the same names repeated across classrooms, neighborhoods, and states to a degree no later generation matched. The tables below rank the names recorded most often between 1946 and 1964 — the era of James, Robert, Mary, and Linda — and the numbers come straight from the SSA's annual files, summed over exactly those years.",
      "Popularity measures size. Signature names measure identity: the names below the tables whose recorded histories are most tightly packed inside these nineteen years are the ones that now read as unmistakably Boomer — strong, familiar, and shared across an entire generation of school rosters.",
    ],
    decadeLinks: [
      { slug: "1940s", anchor: "the 1940s decade hub, where the boom began" },
      { slug: "1950s", anchor: "the 1950s decade hub, the boom's peak" },
      { slug: "1960s", anchor: "the 1960s decade hub, where the boom ended" },
    ],
    previous: "silent",
  },
  {
    slug: "gen-x",
    label: "Gen X",
    seoLabel: "gen x",
    titlePhrase: "Gen X Names",
    startYear: 1965,
    endYear: 1980,
    boundaryNote:
      "Gen X is commonly dated 1965–1980 (Pew Research Center's convention). The SSA's annual files cover every year in the window. This page is not live yet; the window currently serves as the comparison baseline for the Millennial hub.",
    rolloutState: "draft" as const,
    heading: "The latchkey decade of familiar favorites",
    paragraphs: [
      "The Gen X window, 1965 through 1980, begins as the post-war naming order loosens: the top names stay familiar — Michael, Jennifer — while the long tail of recorded names starts to grow.",
    ],
    decadeLinks: [
      { slug: "1960s", anchor: "the 1960s decade hub, where the window begins" },
      { slug: "1970s", anchor: "the 1970s decade hub" },
      { slug: "1980s", anchor: "the 1980s decade hub, where the window ends" },
    ],
    previous: "boomers",
  },
  {
    slug: "millennials",
    label: "Millennial",
    seoLabel: "millennial",
    titlePhrase: "Millennial Baby Names",
    startYear: 1981,
    endYear: 1996,
    boundaryNote:
      "The Millennial generation is commonly dated 1981–1996 (Pew Research Center's convention). The window crosses three calendar decades, and the SSA's annual files cover every year in it, so every figure on this page is summed from exactly those sixteen calendar years — not from decade labels.",
    rolloutState: "live" as const,
    heading: "The last generation of giant-name saturation",
    paragraphs: [
      "The Millennial window, 1981 through 1996, captures the end of an era of concentrated naming. Record-high birth totals produced a handful of names — Jessica, Ashley, Michael, Christopher — that dominated classrooms nationwide before the long tail opened up in the 2000s. Every figure on this page is summed from the SSA's annual birth records for exactly those sixteen years.",
      "What makes a name feel millennial is how much of its recorded history sits inside this window. The tables below rank the biggest names of the generation by recorded births, and the signature-name lists flag the names whose lifetimes are most concentrated inside it — the ones that will always read as 1990s classrooms.",
    ],
    decadeLinks: [
      { slug: "1980s", anchor: "the 1980s decade hub, where the millennial classroom filled up" },
      { slug: "1990s", anchor: "the 1990s decade hub, the millennial peak" },
      { slug: "2000s", anchor: "the 2000s decade hub, where the generation's youngest members were born" },
    ],
    previous: "gen-x",
  },
  {
    slug: "gen-z",
    label: "Gen Z",
    seoLabel: "gen z",
    titlePhrase: "Gen Z Names",
    startYear: 1997,
    endYear: 2012,
    boundaryNote:
      "Gen Z is commonly dated 1997–2012 (Pew Research Center's convention). The SSA's annual files cover every year in the window. This page is not live yet; the window is data-supported and can be enabled in a follow-up rollout.",
    rolloutState: "draft" as const,
    heading: "The first generation of the long tail",
    paragraphs: [
      "The Gen Z window, 1997 through 2012, is where the long tail finally wins: the top names — Madison, Emily, Jacob, Noah — are far smaller than their predecessors, and spelling variation multiplies.",
    ],
    decadeLinks: [
      { slug: "1990s", anchor: "the 1990s decade hub, where the window begins" },
      { slug: "2000s", anchor: "the 2000s decade hub" },
      { slug: "2010s", anchor: "the 2010s decade hub, where the window ends" },
    ],
    previous: "millennials",
  },
  {
    slug: "gen-alpha",
    label: "Gen Alpha",
    seoLabel: "gen alpha",
    titlePhrase: "Gen Alpha Names",
    startYear: 2013,
    endYear: 2025,
    boundaryNote:
      "Gen Alpha is commonly dated from 2013 onward (McCrindle's convention). The SSA data currently run through 2025, so this window is explicitly partial: it covers 2013–2025 and must not be projected forward. This page is not live yet; enabling it would use the same honest 'so far' framing as the partial 2020s decade hub.",
    rolloutState: "draft" as const,
    heading: "A generation still being named",
    paragraphs: [
      "The Gen Alpha window, 2013 through 2025, is the most distributed naming era in the SSA record so far — the top names hold a much smaller share of births than any earlier generation.",
    ],
    decadeLinks: [
      { slug: "2010s", anchor: "the 2010s decade hub, where the window begins" },
      { slug: "2020s", anchor: "the 2020s decade hub (partial, through 2025)" },
    ],
    previous: "gen-z",
  },
] as const satisfies readonly GenerationDefinition[];

const DEFINITIONS_BY_SLUG = new Map<string, GenerationDefinition>(
  GENERATION_DEFINITIONS.map((definition) => [definition.slug, definition]),
);

export function getGenerationDefinition(slug: string): GenerationDefinition | null {
  return DEFINITIONS_BY_SLUG.get(slug) ?? null;
}

export function isLiveGeneration(slug: string): boolean {
  return getGenerationDefinition(slug)?.rolloutState === "live";
}
