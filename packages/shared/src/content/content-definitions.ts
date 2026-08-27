// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type { ContentDefinition, GlacierMember } from "./factory-types";

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
];
