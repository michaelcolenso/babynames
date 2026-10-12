// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type {
  ContentDefinition,
  FlashFloodMember,
  GlacierMember,
  GrandmotherMember,
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

/** Grandmother-names claim helpers — every figure in the post is pinned. */
function grandmother(members: Array<FlashFloodMember | GlacierMember | GrandmotherMember>, name: string): GrandmotherMember {
  const hit = (members as GrandmotherMember[]).find((m) => m.name === name);
  if (!hit) throw new Error(`grandmother-names: expected member "${name}" not detected in data`);
  return hit;
}

const per1000 = (share: number) => Math.round(share * 1000 * 10) / 10;
const oneDecimal = (value: number) => Math.round(value * 10) / 10;
/** Big counts read as prose figures: 1,010,533 not 1010533. */
const commas = (value: number) => value.toLocaleString("en-US");
const sumSeriesSince = (series: Record<number, number>, from: number) =>
  Object.entries(series).reduce((sum, [year, count]) => (Number(year) >= from ? sum + count : sum), 0);
const peakDecadeCount = (
  members: Array<FlashFloodMember | GlacierMember | GrandmotherMember>,
  decadeStart: number,
) =>
  (members as GrandmotherMember[]).filter(
    (m) => m.peakYear >= decadeStart && m.peakYear < decadeStart + 10,
  ).length;

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
    slug: "grandmother-names",
    kind: "both",
    title: "The Grandmother Names — 34 American Names With Almost Nobody Young Left",
    description:
      "34 names have at least 100,000 living bearers and at least nine in ten of them are 50 or older. Every one of the 34 is a girls' name.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "grandmother-names", minLiving: 100_000, minOver50Share: 0.9 },
    panels: ["Linda|F", "Debra|F", "Susan|F", "Dorothy|F", "Mateo|M"],
    sourceNote:
      "Names shown have an estimated 100,000+ living bearers at the 2026 analysis year, at least 90% of them aged 50 or older. Living counts and ages are SSA birth records aged with the shared life table; SSA publishes a name only in the years it gets five or more births, so a blank year means fewer than five.",
    claims: {
      count: (m) => m.length,
      femaleCount: (m) => m.filter((x) => x.sex === "F").length,
      maleCount: (m) => m.filter((x) => x.sex === "M").length,
      atFloor: (_m, meta) => meta.atFloor ?? 0,
      combinedLiving: (m) =>
        commas((m as GrandmotherMember[]).reduce((sum, x) => sum + x.livingEst, 0)),
      avgLiving: (m) =>
        commas(
          Math.round(
            (m as GrandmotherMember[]).reduce((sum, x) => sum + x.livingEst, 0) / m.length,
          ),
        ),
      avgMedianAge: (m) =>
        oneDecimal((m as GrandmotherMember[]).reduce((sum, x) => sum + x.medianAge, 0) / m.length),
      avgOver50Pct: (m) =>
        oneDecimal(
          ((m as GrandmotherMember[]).reduce((sum, x) => sum + x.over50Share, 0) / m.length) * 100,
        ),
      peakBirthsTotal: (m) =>
        commas((m as GrandmotherMember[]).reduce((sum, x) => sum + x.peakCount, 0)),
      recentBirthsTotal: (m) =>
        commas(
          (m as GrandmotherMember[]).reduce((sum, x) => sum + sumSeriesSince(x.series, 2016), 0),
        ),
      fiftiesPeaks: (m) => peakDecadeCount(m, 1950),
      fortiesPeaks: (m) => peakDecadeCount(m, 1940),
      sixtiesPeaks: (m) => peakDecadeCount(m, 1960),
      twentiesPeaks: (m) => peakDecadeCount(m, 1920) + peakDecadeCount(m, 1930),
      earliestPeakName: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => a.peakYear - b.peakYear)[0]?.name ?? "none",
      earliestPeakYear: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => a.peakYear - b.peakYear)[0]?.peakYear ?? 0,
      latestPeakName: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => b.peakYear - a.peakYear)[0]?.name ?? "none",
      latestPeakYear: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => b.peakYear - a.peakYear)[0]?.peakYear ?? 0,
      latestPeakYearsAgo: (m, meta) =>
        (meta.analysisYear ?? 0) -
        ([...(m as GrandmotherMember[])].sort((a, b) => b.peakYear - a.peakYear)[0]?.peakYear ?? 0),
      oldestMedianName: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => b.medianAge - a.medianAge)[0]?.name ?? "none",
      oldestMedianAge: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => b.medianAge - a.medianAge)[0]?.medianAge ?? 0,
      youngestMemberName: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => a.medianAge - b.medianAge)[0]?.name ?? "none",
      youngestMemberMedian: (m) =>
        [...(m as GrandmotherMember[])].sort((a, b) => a.medianAge - b.medianAge)[0]?.medianAge ?? 0,
      // Linda — the largest living population in the family
      lindaLiving: (m) => commas(grandmother(m, "Linda").livingEst),
      lindaMedian: (m) => grandmother(m, "Linda").medianAge,
      lindaPeak: (m) => commas(grandmother(m, "Linda").peakCount),
      lindaPeakYear: (m) => grandmother(m, "Linda").peakYear,
      lindaLatest: (m) => grandmother(m, "Linda").latestCount,
      lindaUnder18Per1000: (m) => per1000(grandmother(m, "Linda").under18Share),
      // Susan — the 1955 boom in one name
      susanLiving: (m) => commas(grandmother(m, "Susan").livingEst),
      susanMedian: (m) => grandmother(m, "Susan").medianAge,
      susanPeak: (m) => commas(grandmother(m, "Susan").peakCount),
      susanPeakYear: (m) => grandmother(m, "Susan").peakYear,
      susanLatest: (m) => grandmother(m, "Susan").latestCount,
      // Debra — the steepest childless profile
      debraLiving: (m) => commas(grandmother(m, "Debra").livingEst),
      debraMedian: (m) => grandmother(m, "Debra").medianAge,
      debraPeak: (m) => commas(grandmother(m, "Debra").peakCount),
      debraPeakYear: (m) => grandmother(m, "Debra").peakYear,
      debraPeakAge: (m, meta) => (meta.analysisYear ?? 0) - grandmother(m, "Debra").peakYear,
      debraLatest: (m) => grandmother(m, "Debra").latestCount,
      debraUnder18Per1000: (m) => per1000(grandmother(m, "Debra").under18Share),
      // Peggy and Vicki — the finished end of the list
      peggyLiving: (m) => commas(grandmother(m, "Peggy").livingEst),
      peggyMedian: (m) => grandmother(m, "Peggy").medianAge,
      peggyOver50Pct: (m) => oneDecimal(grandmother(m, "Peggy").over50Share * 100),
      peggyLatest: (m) => grandmother(m, "Peggy").latestCount,
      vickiLiving: (m) => commas(grandmother(m, "Vicki").livingEst),
      vickiMedian: (m) => grandmother(m, "Vicki").medianAge,
      vickiLatest: (m) => grandmother(m, "Vicki").latestCount,
      // Dorothy — the only member still getting a real cohort of babies
      dorothyLiving: (m) => commas(grandmother(m, "Dorothy").livingEst),
      dorothyMedian: (m) => grandmother(m, "Dorothy").medianAge,
      dorothyLatest: (m) => grandmother(m, "Dorothy").latestCount,
      over500Latest: (m) =>
        (m as GrandmotherMember[]).filter((x) => x.latestCount >= 500).length,
      // Rhonda — the newest summit on the list
      rhondaLiving: (m) => commas(grandmother(m, "Rhonda").livingEst),
      rhondaLatest: (m) => grandmother(m, "Rhonda").latestCount,
      // The same-size contrast at the other end of the age range
      youngestName: (_m, meta) => meta.youngest?.name ?? "none",
      youngestLiving: (_m, meta) => commas(meta.youngest?.livingEst ?? 0),
      youngestMedianAge: (_m, meta) => meta.youngest?.medianAge ?? 0,
      youngestPeakYear: (_m, meta) => meta.youngest?.peakYear ?? 0,
      youngestPeakCount: (_m, meta) => commas(meta.youngest?.peakCount ?? 0),
      youngestLatest: (_m, meta) => commas(meta.youngest?.latestCount ?? 0),
      // Boys' names that clear the 50+ share below the living floor
      maleNearMissCount: (_m, meta) => meta.maleNearMisses?.length ?? 0,
      maleNearMissNames: (_m, meta) =>
        (meta.maleNearMisses ?? []).map((x) => x.name).join(", ") || "none",
      dataMaxYear: () => 2025,
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      { key: "count", equals: 34 },
      { key: "femaleCount", equals: 34 },
      { key: "maleCount", equals: 0 },
      { key: "atFloor", equals: 533 },
      { key: "combinedLiving", equals: "10,597,943" },
      { key: "avgLiving", equals: "311,704" },
      { key: "avgMedianAge", equals: 70.7 },
      { key: "avgOver50Pct", equals: 93.9 },
      { key: "peakBirthsTotal", equals: "858,925" },
      { key: "recentBirthsTotal", equals: "45,108" },
      { key: "fiftiesPeaks", equals: 17 },
      { key: "fortiesPeaks", equals: 8 },
      { key: "sixtiesPeaks", equals: 3 },
      { key: "twentiesPeaks", equals: 6 },
      { key: "earliestPeakName", equals: "Dorothy" },
      { key: "earliestPeakYear", equals: 1924 },
      { key: "latestPeakName", equals: "Rhonda" },
      { key: "latestPeakYear", equals: 1965 },
      { key: "latestPeakYearsAgo", equals: 61 },
      { key: "oldestMedianName", equals: "Betty" },
      { key: "oldestMedianAge", equals: 79 },
      { key: "youngestMemberName", equals: "Rhonda" },
      { key: "youngestMemberMedian", equals: 62 },
      { key: "lindaLiving", equals: "1,010,533" },
      { key: "lindaMedian", equals: 72 },
      { key: "lindaPeak", equals: "99,692" },
      { key: "lindaPeakYear", equals: 1947 },
      { key: "lindaLatest", equals: 294 },
      { key: "lindaUnder18Per1000", equals: 6.8 },
      { key: "susanLiving", equals: "838,838" },
      { key: "susanMedian", equals: 68 },
      { key: "susanPeak", equals: "47,418" },
      { key: "susanPeakYear", equals: 1955 },
      { key: "susanLatest", equals: 222 },
      { key: "debraLiving", equals: "445,808" },
      { key: "debraMedian", equals: 68 },
      { key: "debraPeak", equals: "50,563" },
      { key: "debraPeakYear", equals: 1955 },
      { key: "debraPeakAge", equals: 71 },
      { key: "debraLatest", equals: 31 },
      { key: "debraUnder18Per1000", equals: 1.9 },
      { key: "peggyLiving", equals: "162,120" },
      { key: "peggyMedian", equals: 72 },
      { key: "peggyOver50Pct", equals: 96.1 },
      { key: "peggyLatest", equals: 12 },
      { key: "vickiLiving", equals: "118,412" },
      { key: "vickiMedian", equals: 68 },
      { key: "vickiLatest", equals: 0 },
      { key: "dorothyLiving", equals: "244,545" },
      { key: "dorothyMedian", equals: 77 },
      { key: "dorothyLatest", equals: 743 },
      { key: "over500Latest", equals: 1 },
      { key: "rhondaLiving", equals: "178,106" },
      { key: "rhondaLatest", equals: 19 },
      { key: "youngestName", equals: "Mateo" },
      { key: "youngestLiving", equals: "125,137" },
      { key: "youngestMedianAge", equals: 7 },
      { key: "youngestPeakYear", equals: 2024 },
      { key: "youngestPeakCount", equals: "11,349" },
      { key: "youngestLatest", equals: "11,045" },
      { key: "maleNearMissCount", equals: 7 },
      { key: "maleNearMissNames", equals: "Jim, Bill, Tom, Tim, Bob, Lynn, Kim" },
    ],
  },
];
