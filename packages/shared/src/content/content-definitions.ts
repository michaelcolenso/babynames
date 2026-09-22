// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type { ContentDefinition, GlacierMember, OneWayStreetMember } from "./factory-types";

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

function findOneWay(members: Array<OneWayStreetMember>, name: string): OneWayStreetMember {
  const hit = members.find((m) => m.name === name);
  if (!hit) throw new Error(`one-way-street: expected member "${name}" not detected in data`);
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
    slug: "one-way-street",
    kind: "both",
    title: "The One-Way Street — When Names Crossed From Boys to Girls",
    description:
      "25 names made a one-way crossing: a substantial male peak came first, nearly vanished, and was followed by a much larger female wave.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: {
      family: "one-way-street",
      minMalePeak: 500,
      minFemalePeak: 500,
      maxPeakGapYears: 20,
      maxMaleShareAtFemalePeak: 0.2,
      minFemaleToMalePeakRatio: 1.5,
    },
    panels: ["Ashley|F", "Taylor|F", "Tracy|F", "Kelly|F", "Leslie|F"],
    sourceNote:
      "Names shown had male and female peaks of at least 500 births, with the female peak arriving within 20 years, after male usage fell below 20% of its peak, and at least 1.5× larger.",
    claims: {
      count: (m) => m.length,
      topName: (m) => m[0]?.name ?? "none",
      topFemalePeak: (m) => (m[0] as OneWayStreetMember)?.femalePeak ?? 0,
      topMalePeak: (m) => (m[0] as OneWayStreetMember)?.malePeak ?? 0,
      ashleyMalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Ashley").malePeak,
      ashleyFemalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Ashley").femalePeak,
      ashleyMaleYear: (m) => findOneWay(m as OneWayStreetMember[], "Ashley").malePeakYear,
      ashleyFemaleYear: (m) => findOneWay(m as OneWayStreetMember[], "Ashley").femalePeakYear,
      taylorMalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Taylor").malePeak,
      taylorFemalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Taylor").femalePeak,
      tracyMalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Tracy").malePeak,
      tracyFemalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Tracy").femalePeak,
      kellyMalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Kelly").malePeak,
      kellyFemalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Kelly").femalePeak,
      leslieMalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Leslie").malePeak,
      leslieFemalePeak: (m) => findOneWay(m as OneWayStreetMember[], "Leslie").femalePeak,
    },
    asserts: [
      { key: "count", equals: 25 },
      { key: "topName", equals: "Ashley" },
      { key: "topFemalePeak", equals: 54856 },
      { key: "topMalePeak", equals: 746 },
      { key: "ashleyMalePeak", equals: 746 },
      { key: "ashleyFemalePeak", equals: 54856 },
      { key: "ashleyMaleYear", equals: 1980 },
      { key: "ashleyFemaleYear", equals: 1987 },
      { key: "taylorMalePeak", equals: 8239 },
      { key: "taylorFemalePeak", equals: 21270 },
      { key: "tracyMalePeak", equals: 3380 },
      { key: "tracyFemalePeak", equals: 18464 },
      { key: "kellyMalePeak", equals: 3093 },
      { key: "kellyFemalePeak", equals: 18234 },
      { key: "leslieMalePeak", equals: 2358 },
      { key: "leslieFemalePeak", equals: 6103 },
    ],
  },
];
