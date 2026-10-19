// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type {
  ContentDefinition,
  FlashFloodMember,
  GlacierMember,
  RhymeCohortMember,
} from "./factory-types";

function findPeak(
  members: Array<{ name: string; sex: string; peakCount: number }>,
  name: string,
): number {
  const hit = members.find((m) => m.name === name);
  if (!hit) throw new Error(`flash-floods: expected member "${name}" not detected in data`);
  return hit.peakCount;
}

function findMember<T extends { name: string }>(members: T[], name: string): T {
  const hit = members.find((m) => m.name === name);
  if (!hit) throw new Error(`expected member "${name}" not detected in data`);
  return hit;
}

/** Rhyme-cohort claim helpers — every figure in the post is pinned. */
function rhyme(
  members: Array<FlashFloodMember | GlacierMember | RhymeCohortMember>,
  name: string,
): RhymeCohortMember {
  const hit = (members as RhymeCohortMember[]).find((m) => m.name === name);
  if (!hit) throw new Error(`aiden-singularity: expected member "${name}" not detected in data`);
  return hit;
}

const commas = (value: number) => value.toLocaleString("en-US");
const oneDecimal = (value: number) => Math.round(value * 10) / 10;
const per1000 = (part: number, whole: number) => (whole > 0 ? oneDecimal((part / whole) * 1000) : 0);
const sumSeriesAt = (members: RhymeCohortMember[], year: number) =>
  members.reduce((sum, m) => sum + (m.series[year] ?? 0), 0);
const byLatest = (members: RhymeCohortMember[], direction: 1 | -1 = -1) =>
  [...members].sort((a, b) => direction * (a.latestCount - b.latestCount) || a.name.localeCompare(b.name));

export const CONTENT_DEFINITIONS: ContentDefinition[] = [
  {
    slug: "flash-floods",
    kind: "both",
    title: "The Flash Floods — American Names That Arrived All at Once",
    description:
      "175 names surged from nowhere to a peak and collapsed within five years. These are the flash floods of American naming — cultural timestamps crystallized in birth records.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "flash-floods", minPeak: 100 },
    panels: ["Kunta|M", "Arsenio|M", "Moesha|F", "Jkwon|M", "Bethzy|F"],
    claims: {
      count: (m) => m.length,
      femalePct: (m) =>
        Math.round((m.filter((x) => x.sex === "F").length / m.length) * 100),
      topName: (m) => m[0]?.name ?? "none",
      topCount: (m) => m[0]?.peakCount ?? 0,
      topYear: (m) => m[0]?.peakYear ?? 0,
      kuntaCount: (m) => findPeak(m, "Kunta"),
      arsenioCount: (m) => findPeak(m, "Arsenio"),
      moeshaCount: (m) => findPeak(m, "Moesha"),
      jkwonCount: (m) => findPeak(m, "Jkwon"),
      bethzyCount: (m) => findPeak(m, "Bethzy"),
      kizzyCount: (m) => findPeak(m, "Kizzy"),
      kanyeCount: (m) => findPeak(m, "Kanye"),
      aadenCount: (m) => findPeak(m, "Aaden"),
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      // If the underlying data changes, the build fails and the copy gets reviewed.
      { key: "kuntaCount", equals: 215 },
      { key: "arsenioCount", equals: 397 },
      { key: "moeshaCount", equals: 426 },
      { key: "jkwonCount", equals: 100 },
      { key: "bethzyCount", equals: 301 },
      { key: "kizzyCount", approx: [1117, 2] },
      { key: "kanyeCount", approx: [509, 2] },
      { key: "aadenCount", approx: [1269, 2] },
    ],
  },
  {
    slug: "glaciers",
    kind: "both",
    title: "The Glaciers — Names That Took a Generation to Rise and Fell Just as Slowly",
    description:
      "84 names climbed to enormous peaks over 25+ years and declined for just as long. These are the glaciers of American naming — the slow-motion mountains behind every flash flood.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "glaciers", minPeak: 5000, minRiseYears: 25, minFallYears: 25, thresholdShare: 0.1 },
    panels: ["Robert|M", "Mary|F", "Christopher|M", "Barbara|F", "Sarah|F"],
    sourceNote:
      "Names shown peaked at 5,000+ annual births, rose for at least 25 years and declined for at least 25 more (years above 10% of peak), with the full decline inside the record.",
    claims: {
      count: (m) => m.length,
      femalePct: (m) =>
        Math.round((m.filter((x) => x.sex === "F").length / m.length) * 100),
      avgRiseYears: (m) =>
        Math.round(
          (m as GlacierMember[]).reduce((a, x) => a + (x.peakYear - x.riseStartYear), 0) /
            m.length,
        ),
      avgFallYears: (m) =>
        Math.round(
          (m as GlacierMember[]).reduce((a, x) => a + (x.fallEndYear - x.peakYear), 0) / m.length,
        ),
      topName: (m) => m[0]?.name ?? "none",
      topCount: (m) => m[0]?.peakCount ?? 0,
      topYear: (m) => m[0]?.peakYear ?? 0,
      robertPeak: (m) => findPeak(m, "Robert"),
      robertRiseYears: (m) => {
        const g = findMember(m as GlacierMember[], "Robert");
        return g.peakYear - g.riseStartYear;
      },
      johnFallYears: (m) => {
        const g = findMember(m as GlacierMember[], "John");
        return g.fallEndYear - g.peakYear;
      },
      maryPeak: (m) => findPeak(m, "Mary"),
      maryRiseYears: (m) => {
        const g = findMember(m as GlacierMember[], "Mary");
        return g.peakYear - g.riseStartYear;
      },
      christopherPeak: (m) => findPeak(m, "Christopher"),
      barbaraPeak: (m) => findPeak(m, "Barbara"),
      sarahPeak: (m) => findPeak(m, "Sarah"),
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      { key: "count", equals: 84 },
      { key: "femalePct", equals: 52 },
      { key: "avgRiseYears", equals: 39 },
      { key: "avgFallYears", equals: 47 },
      { key: "topName", equals: "Robert" },
      { key: "topCount", equals: 91655 },
      { key: "topYear", equals: 1947 },
      { key: "robertPeak", equals: 91655 },
      { key: "robertRiseYears", equals: 35 },
      { key: "johnFallYears", equals: 72 },
      { key: "maryPeak", equals: 73984 },
      { key: "maryRiseYears", equals: 39 },
      { key: "christopherPeak", equals: 60021 },
      { key: "barbaraPeak", equals: 48800 },
      { key: "sarahPeak", equals: 28483 },
    ],
  },
  {
    slug: "aiden-singularity",
    kind: "both",
    title: "The -aiden Singularity — One Sound, 59 Spellings, a Generation of Boys",
    description:
      "59 boys' names end in -aiden, -ayden, -aden, or -aeden. Together they took one boy in 23 in 2008 — and one in 59 in 2025.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "rhyme-cohort", minPeak: 25 },
    panels: ["Aiden|M", "Jayden|M", "Brayden|M", "Kayden|M", "Zayden|M", "Raiden|M"],
    sourceNote:
      "Names shown are the 59 boys' names ending in -aiden, -ayden, -aden, or -aeden that reached 25+ births in a single year. SSA publishes a name only in years it gets five or more births, so a blank year means fewer than five.",
    claims: {
      count: (m) => m.length,
      // The sound's own curve, summed across every spelling in the family.
      peakYear: (_m, meta) => meta.cohortPeakYear ?? 0,
      peakCount: (_m, meta) => commas(meta.cohortPeakCount ?? 0),
      peakSpellings: (m, meta) =>
        (m as RhymeCohortMember[]).filter(
          (x) => (x.series[meta.cohortPeakYear ?? 0] ?? 0) > 0,
        ).length,
      latestYear: (_m, meta) => meta.latestYear ?? 0,
      latestCount: (_m, meta) => commas(meta.latestCount ?? 0),
      latestSpellings: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.latestCount > 0).length,
      peakCohortAge: (_m, meta) => (meta.latestYear ?? 0) - (meta.cohortPeakYear ?? 0),
      totalBirths: (m) =>
        commas((m as RhymeCohortMember[]).reduce((sum, x) => sum + x.totalCount, 0)),
      cohort1970: (m) => commas(sumSeriesAt(m as RhymeCohortMember[], 1970)),
      cohort1990: (m) => commas(sumSeriesAt(m as RhymeCohortMember[], 1990)),
      cohort2000: (m) => commas(sumSeriesAt(m as RhymeCohortMember[], 2000)),
      // Share of all boys, not share of the family: 87,994 of 2,040,150 in
      // 2008, 28,974 of 1,708,076 in 2025.
      oneIn: (_m, meta) =>
        Math.round((meta.peakYearSexBirths ?? 0) / (meta.cohortPeakCount ?? 1)),
      oneInLatest: (_m, meta) =>
        Math.round((meta.latestYearSexBirths ?? 0) / (meta.latestCount ?? 1)),
      peakPer1000: (_m, meta) => per1000(meta.cohortPeakCount ?? 0, meta.peakYearSexBirths ?? 0),
      latestPer1000: (_m, meta) =>
        per1000(meta.latestCount ?? 0, meta.latestYearSexBirths ?? 0),
      declinePct: (_m, meta) =>
        Math.round((1 - (meta.latestCount ?? 0) / (meta.cohortPeakCount ?? 1)) * 100),
      latestVsPeakPct: (_m, meta) =>
        Math.round(((meta.latestCount ?? 0) / (meta.cohortPeakCount ?? 1)) * 100),
      shareDropPct: (_m, meta) =>
        Math.round(
          (1 -
            ((meta.latestCount ?? 0) / (meta.latestYearSexBirths ?? 1)) /
              ((meta.cohortPeakCount ?? 0) / (meta.peakYearSexBirths ?? 1))) *
            100,
        ),
      birthsDeclinePct: (_m, meta) =>
        Math.round((1 - (meta.latestYearSexBirths ?? 0) / (meta.peakYearSexBirths ?? 1)) * 100),
      maleBirthsPeakYear: (_m, meta) => commas(meta.peakYearSexBirths ?? 0),
      maleBirthsLatestYear: (_m, meta) => commas(meta.latestYearSexBirths ?? 0),
      // Shape of the family.
      preBoomCount: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.firstYear < 1920).length,
      preBoomNames: (m) =>
        [...(m as RhymeCohortMember[])]
          .filter((x) => x.firstYear < 1920)
          .sort((a, b) => a.firstYear - b.firstYear || a.name.localeCompare(b.name))
          .map((x) => x.name)
          .join(", "),
      namesPeaked2000s: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.peakYear >= 2000 && x.peakYear < 2010).length,
      namesPeaked2010s: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.peakYear >= 2010 && x.peakYear < 2020).length,
      namesPeaked2020s: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.peakYear >= 2020).length,
      namesPeakedBefore2000: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.peakYear < 2000).length,
      suffixAiden: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.name.toLowerCase().endsWith("aiden")).length,
      suffixAyden: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.name.toLowerCase().endsWith("ayden")).length,
      suffixAden: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.name.toLowerCase().endsWith("aden")).length,
      suffixAeden: (m) =>
        (m as RhymeCohortMember[]).filter((x) => x.name.toLowerCase().endsWith("aeden")).length,
      extinctCount: (m) => (m as RhymeCohortMember[]).filter((x) => x.latestCount === 0).length,
      extinctNames: (m) =>
        (m as RhymeCohortMember[])
          .filter((x) => x.latestCount === 0)
          .sort((a, b) => b.peakCount - a.peakCount || a.name.localeCompare(b.name))
          .map((x) => x.name)
          .join(", "),
      newestFirstYear: (m) => Math.max(...(m as RhymeCohortMember[]).map((x) => x.firstYear)),
      newestNames: (m) => {
        const rows = m as RhymeCohortMember[];
        const newest = Math.max(...rows.map((x) => x.firstYear));
        return rows
          .filter((x) => x.firstYear === newest)
          .map((x) => x.name)
          .sort()
          .join(", ");
      },
      topTodayName: (m) => byLatest(m as RhymeCohortMember[])[0]?.name ?? "none",
      // The peak and the present, spelled out.
      topPeakName: (m) => m[0]?.name ?? "none",
      topPeakCount: (m) => commas(m[0]?.peakCount ?? 0),
      topPeakYear: (m) => m[0]?.peakYear ?? 0,
      aidenPeak: (m) => commas(rhyme(m, "Aiden").peakCount),
      aidenPeakYear: (m) => rhyme(m, "Aiden").peakYear,
      aidenLatest: (m) => commas(rhyme(m, "Aiden").latestCount),
      jaydenPeak: (m) => commas(rhyme(m, "Jayden").peakCount),
      jaydenPeakYear: (m) => rhyme(m, "Jayden").peakYear,
      jaydenLatest: (m) => commas(rhyme(m, "Jayden").latestCount),
      braydenPeak: (m) => commas(rhyme(m, "Brayden").peakCount),
      braydenPeakYear: (m) => rhyme(m, "Brayden").peakYear,
      braydenLatest: (m) => commas(rhyme(m, "Brayden").latestCount),
      kaydenPeak: (m) => commas(rhyme(m, "Kayden").peakCount),
      kaydenPeakYear: (m) => rhyme(m, "Kayden").peakYear,
      kaydenLatest: (m) => commas(rhyme(m, "Kayden").latestCount),
      zaydenFirst: (m) => rhyme(m, "Zayden").firstYear,
      zaydenPeak: (m) => commas(rhyme(m, "Zayden").peakCount),
      zaydenPeakYear: (m) => rhyme(m, "Zayden").peakYear,
      zaydenLatest: (m) => commas(rhyme(m, "Zayden").latestCount),
      raidenFirst: (m) => rhyme(m, "Raiden").firstYear,
      raidenPeak: (m) => rhyme(m, "Raiden").peakCount,
      raidenPeakYear: (m) => rhyme(m, "Raiden").peakYear,
      raidenLatest: (m) => commas(rhyme(m, "Raiden").latestCount),
      xadenLatest: (m) => commas(rhyme(m, "Xaden").latestCount),
      xadenPeakYear: (m) => rhyme(m, "Xaden").peakYear,
      xaydenLatest: (m) => commas(rhyme(m, "Xayden").latestCount),
      xaydenPeakYear: (m) => rhyme(m, "Xayden").peakYear,
      padenPeak: (m) => rhyme(m, "Paden").peakCount,
      padenPeakYear: (m) => rhyme(m, "Paden").peakYear,
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      { key: "count", equals: 59 },
      { key: "peakYear", equals: 2008 },
      { key: "peakCount", equals: "87,994" },
      { key: "peakSpellings", equals: 59 },
      { key: "latestYear", equals: 2025 },
      { key: "latestCount", equals: "28,974" },
      { key: "latestSpellings", equals: 52 },
      { key: "peakCohortAge", equals: 17 },
      { key: "totalBirths", equals: "1,506,945" },
      { key: "cohort1970", equals: "148" },
      { key: "cohort1990", equals: "1,486" },
      { key: "cohort2000", equals: "17,460" },
      { key: "oneIn", equals: 23 },
      { key: "oneInLatest", equals: 59 },
      { key: "peakPer1000", equals: 43.1 },
      { key: "latestPer1000", equals: 17.0 },
      { key: "declinePct", equals: 67 },
      { key: "latestVsPeakPct", equals: 33 },
      { key: "shareDropPct", equals: 61 },
      { key: "birthsDeclinePct", equals: 16 },
      { key: "maleBirthsPeakYear", equals: "2,040,150" },
      { key: "maleBirthsLatestYear", equals: "1,708,076" },
      { key: "preBoomCount", equals: 6 },
      { key: "preBoomNames", equals: "Aden, Hayden, Graden, Haden, Braden, Grayden" },
      { key: "namesPeaked2000s", equals: 30 },
      { key: "namesPeaked2010s", equals: 24 },
      { key: "namesPeaked2020s", equals: 4 },
      { key: "namesPeakedBefore2000", equals: 1 },
      { key: "suffixAiden", equals: 13 },
      { key: "suffixAyden", equals: 22 },
      { key: "suffixAden", equals: 18 },
      { key: "suffixAeden", equals: 6 },
      { key: "extinctCount", equals: 7 },
      { key: "extinctNames", equals: "Bladen, Graden, Baden, Bayden, Draden, Chayden, Shaden" },
      { key: "newestFirstYear", equals: 2008 },
      { key: "newestNames", equals: "Jakaiden, Jakayden" },
      { key: "topTodayName", equals: "Aiden" },
      { key: "topPeakName", equals: "Jayden" },
      { key: "topPeakCount", equals: "17,316" },
      { key: "topPeakYear", equals: 2009 },
      { key: "aidenPeak", equals: "16,030" },
      { key: "aidenPeakYear", equals: 2009 },
      { key: "aidenLatest", equals: "5,046" },
      { key: "jaydenPeak", equals: "17,316" },
      { key: "jaydenPeakYear", equals: 2009 },
      { key: "jaydenLatest", equals: "4,653" },
      { key: "braydenPeak", equals: "9,122" },
      { key: "braydenPeakYear", equals: 2010 },
      { key: "braydenLatest", equals: "1,545" },
      { key: "kaydenPeak", equals: "4,742" },
      { key: "kaydenPeakYear", equals: 2014 },
      { key: "kaydenLatest", equals: "2,678" },
      { key: "zaydenFirst", equals: 2000 },
      { key: "zaydenPeak", equals: "2,232" },
      { key: "zaydenPeakYear", equals: 2014 },
      { key: "zaydenLatest", equals: "1,657" },
      { key: "raidenFirst", equals: 1993 },
      { key: "raidenPeak", equals: 935 },
      { key: "raidenPeakYear", equals: 2022 },
      { key: "raidenLatest", equals: "739" },
      { key: "xadenLatest", equals: "128" },
      { key: "xadenPeakYear", equals: 2025 },
      { key: "xaydenLatest", equals: "78" },
      { key: "xaydenPeakYear", equals: 2025 },
      { key: "padenPeak", equals: 78 },
      { key: "padenPeakYear", equals: 1987 },
    ],
  },
];
