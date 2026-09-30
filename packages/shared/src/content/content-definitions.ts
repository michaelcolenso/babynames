// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type {
  ComebackMember,
  ContentDefinition,
  FlashFloodMember,
  GlacierMember,
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

function findComeback(members: Array<ComebackMember>, name: string): ComebackMember {
  const hit = members.find((m) => m.name === name);
  if (!hit) throw new Error(`comebacks: expected member "${name}" not detected in data`);
  return hit;
}

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
      topCount: (m) => (m[0] as FlashFloodMember)?.peakCount ?? 0,
      topYear: (m) => (m[0] as FlashFloodMember)?.peakYear ?? 0,
      kuntaCount: (m) => findPeak(m as FlashFloodMember[], "Kunta"),
      arsenioCount: (m) => findPeak(m as FlashFloodMember[], "Arsenio"),
      moeshaCount: (m) => findPeak(m as FlashFloodMember[], "Moesha"),
      jkwonCount: (m) => findPeak(m as FlashFloodMember[], "Jkwon"),
      bethzyCount: (m) => findPeak(m as FlashFloodMember[], "Bethzy"),
      kizzyCount: (m) => findPeak(m as FlashFloodMember[], "Kizzy"),
      kanyeCount: (m) => findPeak(m as FlashFloodMember[], "Kanye"),
      aadenCount: (m) => findPeak(m as FlashFloodMember[], "Aaden"),
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
      topCount: (m) => (m[0] as GlacierMember)?.peakCount ?? 0,
      topYear: (m) => (m[0] as GlacierMember)?.peakYear ?? 0,
      robertPeak: (m) => findPeak(m as GlacierMember[], "Robert"),
      robertRiseYears: (m) => {
        const g = findMember(m as GlacierMember[], "Robert");
        return g.peakYear - g.riseStartYear;
      },
      johnFallYears: (m) => {
        const g = findMember(m as GlacierMember[], "John");
        return g.fallEndYear - g.peakYear;
      },
      maryPeak: (m) => findPeak(m as GlacierMember[], "Mary"),
      maryRiseYears: (m) => {
        const g = findMember(m as GlacierMember[], "Mary");
        return g.peakYear - g.riseStartYear;
      },
      christopherPeak: (m) => findPeak(m as GlacierMember[], "Christopher"),
      barbaraPeak: (m) => findPeak(m as GlacierMember[], "Barbara"),
      sarahPeak: (m) => findPeak(m as GlacierMember[], "Sarah"),
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
    slug: "comebacks",
    kind: "both",
    title: "The Comebacks — Names That Nearly Died and Lived Again",
    description:
      "91 names collapsed to near-extinction and then staged a real second life decades later. These are the comebacks of American naming — the boomerangs that broke the one-way street of name mortality.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: {
      family: "comebacks",
      minFirstLifePeak: 1000,
      minSecondPeak: 500,
      minFirstLifeYears: 20,
      minGapYears: 25,
      troughRatio: 0.15,
    },
    panels: ["Emma|F", "Hazel|F", "Violet|F", "Jack|M", "Leo|M", "Evelyn|F"],
    sourceNote:
      "Names shown peaked at 1,000+ annual births, fell to a valley below 15% of that first peak, then climbed to a second peak of 500+ births at least 25 years after the valley (and 25 years after the first peak).",
    claims: {
      count: (m) => m.length,
      femalePct: (m) =>
        Math.round((m.filter((x) => x.sex === "F").length / m.length) * 100),
      topName: (m) => m[0]?.name ?? "none",
      topFirstPeak: (m) => (m[0] as ComebackMember)?.firstLifePeak ?? 0,
      topValleyCount: (m) => (m[0] as ComebackMember)?.valleyCount ?? 0,
      topValleyYear: (m) => (m[0] as ComebackMember)?.valleyYear ?? 0,
      topSecondPeak: (m) => (m[0] as ComebackMember)?.secondPeak ?? 0,
      topSecondYear: (m) => (m[0] as ComebackMember)?.secondPeakYear ?? 0,
      emmaFirstPeakN: (m) => findComeback(m as ComebackMember[], "Emma").firstLifePeak.toLocaleString("en-US"),
      emmaSecondPeakN: (m) =>
        findComeback(m as ComebackMember[], "Emma").secondPeak.toLocaleString("en-US"),
      hazelSecondPeakN: (m) =>
        findComeback(m as ComebackMember[], "Hazel").secondPeak.toLocaleString("en-US"),
      emmaFirstPeak: (m) => findComeback(m as ComebackMember[], "Emma").firstLifePeak,
      emmaFirstYear: (m) => findComeback(m as ComebackMember[], "Emma").firstLifePeakYear,
      emmaValleyCount: (m) => findComeback(m as ComebackMember[], "Emma").valleyCount,
      emmaValleyYear: (m) => findComeback(m as ComebackMember[], "Emma").valleyYear,
      emmaSecondPeak: (m) => findComeback(m as ComebackMember[], "Emma").secondPeak,
      emmaSecondYear: (m) => findComeback(m as ComebackMember[], "Emma").secondPeakYear,
      hazelValleyCount: (m) => findComeback(m as ComebackMember[], "Hazel").valleyCount,
      hazelValleyYear: (m) => findComeback(m as ComebackMember[], "Hazel").valleyYear,
      hazelSecondPeak: (m) => findComeback(m as ComebackMember[], "Hazel").secondPeak,
      hazelFinalCount: (m) => findComeback(m as ComebackMember[], "Hazel").finalCount,
      violetValleyCount: (m) => findComeback(m as ComebackMember[], "Violet").valleyCount,
      violetValleyYear: (m) => findComeback(m as ComebackMember[], "Violet").valleyYear,
      violetSecondPeak: (m) => findComeback(m as ComebackMember[], "Violet").secondPeak,
      jackFirstPeak: (m) => findComeback(m as ComebackMember[], "Jack").firstLifePeak,
      jackValleyCount: (m) => findComeback(m as ComebackMember[], "Jack").valleyCount,
      jackSecondPeak: (m) => findComeback(m as ComebackMember[], "Jack").secondPeak,
      leoValleyCount: (m) => findComeback(m as ComebackMember[], "Leo").valleyCount,
      leoSecondPeak: (m) => findComeback(m as ComebackMember[], "Leo").secondPeak,
      evelynFirstPeak: (m) => findComeback(m as ComebackMember[], "Evelyn").firstLifePeak,
      evelynSecondPeak: (m) => findComeback(m as ComebackMember[], "Evelyn").secondPeak,
      avgGap: (m) =>
        Math.round(
          (m as ComebackMember[]).reduce(
            (a, x) => a + (x.secondPeakYear - x.valleyYear),
            0,
          ) / m.length,
        ),
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      // Values pin the verified detector run on name-vitals-2025 (1880–2025).
      { key: "count", equals: 91 },
      { key: "femalePct", equals: 82 },
      { key: "topName", equals: "Emma" },
      { key: "topFirstPeak", equals: 5324 },
      { key: "topValleyCount", equals: 414 },
      { key: "topValleyYear", equals: 1976 },
      { key: "topSecondPeak", equals: 22719 },
      { key: "topSecondYear", equals: 2003 },
      { key: "emmaFirstPeak", equals: 5324 },
      { key: "emmaFirstYear", equals: 1918 },
      { key: "emmaValleyCount", equals: 414 },
      { key: "emmaValleyYear", equals: 1976 },
      { key: "emmaSecondPeak", equals: 22719 },
      { key: "emmaSecondYear", equals: 2003 },
      { key: "hazelValleyCount", equals: 90 },
      { key: "hazelValleyYear", equals: 1983 },
      { key: "hazelSecondPeak", equals: 6432 },
      { key: "hazelFinalCount", equals: 6318 },
      { key: "violetValleyCount", equals: 109 },
      { key: "violetValleyYear", equals: 1972 },
      { key: "violetSecondPeak", equals: 7546 },
      { key: "jackFirstPeak", equals: 12802 },
      { key: "jackValleyCount", equals: 1579 },
      { key: "jackSecondPeak", equals: 10906 },
      { key: "leoValleyCount", equals: 415 },
      { key: "leoSecondPeak", equals: 8293 },
      { key: "evelynFirstPeak", equals: 14278 },
      { key: "evelynSecondPeak", equals: 10748 },
    ],
  },
];
