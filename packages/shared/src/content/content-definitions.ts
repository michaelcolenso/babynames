// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type { ContentDefinition, GlacierMember, PlateauMember } from "./factory-types";

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

function findPlateau(members: PlateauMember[], name: string, sex = "M"): PlateauMember {
  const hit = members.find((m) => m.name === name && m.sex === sex);
  if (!hit) throw new Error(`plateaus: expected member "${name}|${sex}" not detected in data`);
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
    slug: "plateaus",
    kind: "both",
    title: "The Plateaus — American Names That Refused to Budge",
    description:
      "107 names climbed to peaks above 5,000 births and stayed at or above half their peak for thirty consecutive years. These are the plateaus of American naming — the institutional tablelands of the record.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "plateaus", minPeak: 5000, thresholdShare: 0.5, minPlateauYears: 30 },
    panels: ["Joseph|M", "Elizabeth|F", "James|M", "Mary|F", "Daniel|M"],
    sourceNote:
      "Names shown peaked at 5,000+ annual births and maintained at least 50% of their peak count across at least 30 consecutive calendar years.",
    claims: {
      count: (m) => m.length,
      maleCount: (m) => m.filter((x) => x.sex === "M").length,
      femaleCount: (m) => m.filter((x) => x.sex === "F").length,
      malePct: (m) => Math.round((m.filter((x) => x.sex === "M").length / m.length) * 100),
      femalePct: (m) => Math.round((m.filter((x) => x.sex === "F").length / m.length) * 100),
      avgDuration: (m) =>
        Math.round((m as PlateauMember[]).reduce((a, x) => a + x.plateauDuration, 0) / m.length),
      avgMaleDuration: (m) => {
        const males = (m as PlateauMember[]).filter((x) => x.sex === "M");
        return Math.round(males.reduce((a, x) => a + x.plateauDuration, 0) / males.length);
      },
      avgFemaleDuration: (m) => {
        const females = (m as PlateauMember[]).filter((x) => x.sex === "F");
        return Math.round(females.reduce((a, x) => a + x.plateauDuration, 0) / females.length);
      },
      topName: (m) => m[0]?.name ?? "none",
      topCount: (m) => m[0]?.peakCount ?? 0,
      topYear: (m) => m[0]?.peakYear ?? 0,
      longestName: () => "Joseph",
      longestYears: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").plateauDuration,
      longestStart: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").plateauStartYear,
      longestEnd: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").plateauEndYear,
      longestPeak: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").peakCount,
      longestPeakYear: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").peakYear,
      joseph1914Count: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").series[1914] ?? 0,
      joseph2008Count: (m) => findPlateau(m as PlateauMember[], "Joseph", "M").series[2008] ?? 0,
      longestFemaleName: () => "Elizabeth",
      longestFemaleYears: (m) => findPlateau(m as PlateauMember[], "Elizabeth", "F").plateauDuration,
      longestFemaleStart: (m) => findPlateau(m as PlateauMember[], "Elizabeth", "F").plateauStartYear,
      longestFemaleEnd: (m) => findPlateau(m as PlateauMember[], "Elizabeth", "F").plateauEndYear,
      longestFemalePeak: (m) => findPlateau(m as PlateauMember[], "Elizabeth", "F").peakCount,
      longestFemalePeakYear: (m) => findPlateau(m as PlateauMember[], "Elizabeth", "F").peakYear,
      mariaYears: (m) => findPlateau(m as PlateauMember[], "Maria", "F").plateauDuration,
      annYears: (m) => findPlateau(m as PlateauMember[], "Ann", "F").plateauDuration,
      maryYears: (m) => findPlateau(m as PlateauMember[], "Mary", "F").plateauDuration,
      maryPeak: (m) => findPlateau(m as PlateauMember[], "Mary", "F").peakCount,
      maryPeakYear: (m) => findPlateau(m as PlateauMember[], "Mary", "F").peakYear,
      rebeccaYears: (m) => findPlateau(m as PlateauMember[], "Rebecca", "F").plateauDuration,
      jamesPeak: (m) => findPlateau(m as PlateauMember[], "James", "M").peakCount,
      jamesPeakYear: (m) => findPlateau(m as PlateauMember[], "James", "M").peakYear,
      jamesYears: (m) => findPlateau(m as PlateauMember[], "James", "M").plateauDuration,
      jamesStart: (m) => findPlateau(m as PlateauMember[], "James", "M").plateauStartYear,
      jamesEnd: (m) => findPlateau(m as PlateauMember[], "James", "M").plateauEndYear,
      johnYears: (m) => findPlateau(m as PlateauMember[], "John", "M").plateauDuration,
      williamYears: (m) => findPlateau(m as PlateauMember[], "William", "M").plateauDuration,
      danielYears: (m) => findPlateau(m as PlateauMember[], "Daniel", "M").plateauDuration,
      danielStart: (m) => findPlateau(m as PlateauMember[], "Daniel", "M").plateauStartYear,
      danielEnd: (m) => findPlateau(m as PlateauMember[], "Daniel", "M").plateauEndYear,
      danielPeak: (m) => findPlateau(m as PlateauMember[], "Daniel", "M").peakCount,
      danielPeakYear: (m) => findPlateau(m as PlateauMember[], "Daniel", "M").peakYear,
      active2025Count: (m) => (m as PlateauMember[]).filter((x) => x.plateauEndYear === 2025).length,
      benjaminYears: (m) => findPlateau(m as PlateauMember[], "Benjamin", "M").plateauDuration,
    },
    asserts: [
      { key: "count", equals: 107 },
      { key: "maleCount", equals: 75 },
      { key: "femaleCount", equals: 32 },
      { key: "malePct", equals: 70 },
      { key: "femalePct", equals: 30 },
      { key: "avgDuration", equals: 42 },
      { key: "avgMaleDuration", equals: 44 },
      { key: "avgFemaleDuration", equals: 39 },
      { key: "topName", equals: "James" },
      { key: "topCount", equals: 94767 },
      { key: "topYear", equals: 1947 },
      { key: "longestYears", equals: 95 },
      { key: "longestStart", equals: 1914 },
      { key: "longestEnd", equals: 2008 },
      { key: "longestPeak", equals: 32749 },
      { key: "longestPeakYear", equals: 1956 },
      { key: "joseph1914Count", equals: 18829 },
      { key: "joseph2008Count", equals: 16599 },
      { key: "longestFemaleYears", equals: 64 },
      { key: "longestFemaleStart", equals: 1946 },
      { key: "longestFemaleEnd", equals: 2009 },
      { key: "longestFemalePeak", equals: 20750 },
      { key: "longestFemalePeakYear", equals: 1990 },
      { key: "mariaYears", equals: 59 },
      { key: "annYears", equals: 57 },
      { key: "maryYears", equals: 51 },
      { key: "maryPeak", equals: 73984 },
      { key: "maryPeakYear", equals: 1921 },
      { key: "rebeccaYears", equals: 50 },
      { key: "jamesPeak", equals: 94767 },
      { key: "jamesPeakYear", equals: 1947 },
      { key: "jamesYears", equals: 52 },
      { key: "jamesStart", equals: 1920 },
      { key: "jamesEnd", equals: 1971 },
      { key: "johnYears", equals: 57 },
      { key: "williamYears", equals: 57 },
      { key: "danielYears", equals: 57 },
      { key: "danielStart", equals: 1951 },
      { key: "danielEnd", equals: 2007 },
      { key: "danielPeak", equals: 38559 },
      { key: "danielPeakYear", equals: 1985 },
      { key: "active2025Count", equals: 6 },
      { key: "benjaminYears", equals: 51 },
    ],
  },
];
