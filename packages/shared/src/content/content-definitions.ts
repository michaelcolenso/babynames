// Content Factory — content definitions registry.
// Each definition drives both a viz page and a blog post from the same
// computed numbers. Claims are the ONLY way numbers enter prose.

import type {
  ContentDefinition,
  FlashFloodMember,
  GlacierMember,
  HalfLifeMember,
  PlateauMember,
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

function findPlateau(members: PlateauMember[], name: string, sex = "M"): PlateauMember {
  const hit = members.find((m) => m.name === name && m.sex === sex);
  if (!hit) throw new Error(`plateaus: expected member "${name}|${sex}" not detected in data`);
  return hit;
}

function asHalfLives(
  members: Array<FlashFloodMember | GlacierMember | HalfLifeMember | PlateauMember>,
): HalfLifeMember[] {
  return members as HalfLifeMember[];
}

function findHalf(members: HalfLifeMember[], name: string, sex = "F"): HalfLifeMember {
  const hit = members.find((m) => m.name === name && m.sex === sex);
  if (!hit) throw new Error(`half-lives: expected member "${name}|${sex}" not detected in data`);
  return hit;
}

/** Round a share to a whole percent; used for every "%" figure in the copy. */
function pctOf(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}

/** Median of a cohort's half-lives; censored members carry observationYears. */
function medianHalf(members: HalfLifeMember[]): number {
  if (members.length === 0) throw new Error("half-lives: median of an empty cohort");
  const sorted = members.map((m) => m.halfLifeYears).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

/** Half-life editorial constants — mirrored in the prose via claims so the copy can't drift. */
const HALF_LIFE_MIN_PEAK = 2000;
const HALF_LIFE_ERA = 1950;
const HALF_LIFE_BIG_PEAK = 10000;

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
  {
    slug: "half-lives",
    kind: "both",
    title: "The Half-Lives — American Names Now Lose Half Their Births in Eleven Years",
    description:
      "661 names peaked above 2,000 births in a single year. Measured over the same thirty-year window, the median one loses half its annual births in twelve years — seventeen before 1950, eleven after.",
    sourceVersion: "ssa-national-2025",
    rolloutState: "draft",
    compute: { family: "half-lives", minPeak: 2000, observationYears: 30 },
    panels: ["Chelsea|F", "Hillary|F", "Deborah|F", "Shirley|F", "Jessica|F", "Mary|F", "Michael|M", "Benjamin|M"],
    sourceNote:
      "Names shown peaked at 2,000+ annual births with a full thirty years of record after the peak. Half-life = years until the annual count first fell below 50% of that peak; a name that never halved inside the window is recorded as 30+.",
    claims: {
      count: (m) => m.length,
      window: (m) => asHalfLives(m).reduce((a, x) => Math.max(a, x.halfLifeYears), 0),
      lastPeakYear: (m) => asHalfLives(m).reduce((a, x) => Math.max(a, x.peakYear), 0),
      minPeakLabel: () => HALF_LIFE_MIN_PEAK.toLocaleString("en-US"),
      bigPeakLabel: () => HALF_LIFE_BIG_PEAK.toLocaleString("en-US"),
      era: () => HALF_LIFE_ERA,
      halvedCount: (m) => asHalfLives(m).filter((x) => !x.survivedWindow).length,
      survivorCount: (m) => asHalfLives(m).filter((x) => x.survivedWindow).length,
      survivorPct: (m) => pctOf(asHalfLives(m).filter((x) => x.survivedWindow).length, m.length),
      medianHalf: (m) => medianHalf(asHalfLives(m)),
      pre1950Count: (m) => asHalfLives(m).filter((x) => x.peakYear < 1950).length,
      post1950Count: (m) => asHalfLives(m).filter((x) => x.peakYear >= 1950).length,
      preMedianHalf: (m) => medianHalf(asHalfLives(m).filter((x) => x.peakYear < 1950)),
      postMedianHalf: (m) => medianHalf(asHalfLives(m).filter((x) => x.peakYear >= 1950)),
      preFastDecadePct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear < 1950);
        return pctOf(
          cohort.filter((x) => !x.survivedWindow && x.halfLifeYears <= 10).length,
          cohort.length,
        );
      },
      postFastDecadePct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear >= 1950);
        return pctOf(
          cohort.filter((x) => !x.survivedWindow && x.halfLifeYears <= 10).length,
          cohort.length,
        );
      },
      preSurvivorPct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear < 1950);
        return pctOf(cohort.filter((x) => x.survivedWindow).length, cohort.length);
      },
      postSurvivorPct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear >= 1950);
        return pctOf(cohort.filter((x) => x.survivedWindow).length, cohort.length);
      },
      twentiesMedianHalf: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear >= 1920 && x.peakYear < 1930);
        return medianHalf(cohort);
      },
      seventiesMedianHalf: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear >= 1970 && x.peakYear < 1980);
        return medianHalf(cohort);
      },
      ninetiesMedianHalf: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.peakYear >= 1990 && x.peakYear < 2000);
        return medianHalf(cohort);
      },
      femaleCount: (m) => asHalfLives(m).filter((x) => x.sex === "F").length,
      maleCount: (m) => asHalfLives(m).filter((x) => x.sex === "M").length,
      femaleHalvedPct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.sex === "F");
        return pctOf(cohort.filter((x) => !x.survivedWindow).length, cohort.length);
      },
      maleHalvedPct: (m) => {
        const cohort = asHalfLives(m).filter((x) => x.sex === "M");
        return pctOf(cohort.filter((x) => !x.survivedWindow).length, cohort.length);
      },
      femaleMedianHalf: (m) => medianHalf(asHalfLives(m).filter((x) => x.sex === "F")),
      maleMedianHalf: (m) => medianHalf(asHalfLives(m).filter((x) => x.sex === "M")),
      bigSurvivorCount: (m) =>
        asHalfLives(m).filter((x) => x.peakYear >= 1950 && x.peakCount >= 10000 && x.survivedWindow)
          .length,
      bigSurvivorMaleCount: (m) =>
        asHalfLives(m).filter(
          (x) => x.peakYear >= 1950 && x.peakCount >= 10000 && x.survivedWindow && x.sex === "M",
        ).length,
      fastestName: (m) => {
        const big = asHalfLives(m)
          .filter((x) => x.peakCount >= 10000)
          .sort((a, b) => a.halfLifeYears - b.halfLifeYears || b.peakCount - a.peakCount);
        return big[0]?.name ?? "none";
      },
      fastestPeak: (m) => findHalf(asHalfLives(m), "Chelsea").peakCount,
      fastestYear: (m) => findHalf(asHalfLives(m), "Chelsea").peakYear,
      fastestHalf: (m) => findHalf(asHalfLives(m), "Chelsea").halfLifeYears,
      fastestHalfCount: (m) => findHalf(asHalfLives(m), "Chelsea").halfCount,
      hillaryPeak: (m) => findHalf(asHalfLives(m), "Hillary").peakCount,
      hillaryYear: (m) => findHalf(asHalfLives(m), "Hillary").peakYear,
      hillaryHalf: (m) => findHalf(asHalfLives(m), "Hillary").halfLifeYears,
      hillaryHalfCount: (m) => findHalf(asHalfLives(m), "Hillary").halfCount,
      mindyPeak: (m) => findHalf(asHalfLives(m), "Mindy").peakCount,
      mindyHalf: (m) => findHalf(asHalfLives(m), "Mindy").halfLifeYears,
      krystlePeak: (m) => findHalf(asHalfLives(m), "Krystle").peakCount,
      krystleHalf: (m) => findHalf(asHalfLives(m), "Krystle").halfLifeYears,
      shirleyPeak: (m) => findHalf(asHalfLives(m), "Shirley").peakCount,
      shirleyYear: (m) => findHalf(asHalfLives(m), "Shirley").peakYear,
      shirleyHalf: (m) => findHalf(asHalfLives(m), "Shirley").halfLifeYears,
      shirleyHalfCount: (m) => findHalf(asHalfLives(m), "Shirley").halfCount,
      deborahPeak: (m) => findHalf(asHalfLives(m), "Deborah").peakCount,
      deborahYear: (m) => findHalf(asHalfLives(m), "Deborah").peakYear,
      deborahHalf: (m) => findHalf(asHalfLives(m), "Deborah").halfLifeYears,
      deborahHalfCount: (m) => findHalf(asHalfLives(m), "Deborah").halfCount,
      tiffanyPeak: (m) => findHalf(asHalfLives(m), "Tiffany").peakCount,
      tiffanyYear: (m) => findHalf(asHalfLives(m), "Tiffany").peakYear,
      tiffanyHalf: (m) => findHalf(asHalfLives(m), "Tiffany").halfLifeYears,
      tiffanyHalfCount: (m) => findHalf(asHalfLives(m), "Tiffany").halfCount,
      jessicaPeak: (m) => findHalf(asHalfLives(m), "Jessica").peakCount,
      jessicaYear: (m) => findHalf(asHalfLives(m), "Jessica").peakYear,
      jessicaHalf: (m) => findHalf(asHalfLives(m), "Jessica").halfLifeYears,
      jessicaHalfCount: (m) => findHalf(asHalfLives(m), "Jessica").halfCount,
      ashleyPeak: (m) => findHalf(asHalfLives(m), "Ashley").peakCount,
      ashleyHalf: (m) => findHalf(asHalfLives(m), "Ashley").halfLifeYears,
      ashleyHalfCount: (m) => findHalf(asHalfLives(m), "Ashley").halfCount,
      amandaPeak: (m) => findHalf(asHalfLives(m), "Amanda").peakCount,
      amandaHalf: (m) => findHalf(asHalfLives(m), "Amanda").halfLifeYears,
      stephaniePeak: (m) => findHalf(asHalfLives(m), "Stephanie").peakCount,
      stephanieYear: (m) => findHalf(asHalfLives(m), "Stephanie").peakYear,
      stephanieHalf: (m) => findHalf(asHalfLives(m), "Stephanie").halfLifeYears,
      stephanieHalfCount: (m) => findHalf(asHalfLives(m), "Stephanie").halfCount,
      brittanyPeak: (m) => findHalf(asHalfLives(m), "Brittany").peakCount,
      brittanyHalf: (m) => findHalf(asHalfLives(m), "Brittany").halfLifeYears,
      jenniferPeak: (m) => findHalf(asHalfLives(m), "Jennifer").peakCount,
      jenniferYear: (m) => findHalf(asHalfLives(m), "Jennifer").peakYear,
      jenniferHalf: (m) => findHalf(asHalfLives(m), "Jennifer").halfLifeYears,
      michaelPeak: (m) => findHalf(asHalfLives(m), "Michael", "M").peakCount,
      michaelYear: (m) => findHalf(asHalfLives(m), "Michael", "M").peakYear,
      michaelHalfCount: (m) => findHalf(asHalfLives(m), "Michael", "M").halfCount,
      michaelHalfYear: (m) => findHalf(asHalfLives(m), "Michael", "M").halfYear,
      maryPeak: (m) => findHalf(asHalfLives(m), "Mary").peakCount,
      maryYear: (m) => findHalf(asHalfLives(m), "Mary").peakYear,
      maryHalfCount: (m) => findHalf(asHalfLives(m), "Mary").halfCount,
      maryHalfYear: (m) => findHalf(asHalfLives(m), "Mary").halfYear,
      josephPeak: (m) => findHalf(asHalfLives(m), "Joseph", "M").peakCount,
      josephYear: (m) => findHalf(asHalfLives(m), "Joseph", "M").peakYear,
      josephHalfCount: (m) => findHalf(asHalfLives(m), "Joseph", "M").halfCount,
      josephHalfYear: (m) => findHalf(asHalfLives(m), "Joseph", "M").halfYear,
      benjaminPeak: (m) => findHalf(asHalfLives(m), "Benjamin", "M").peakCount,
      benjaminYear: (m) => findHalf(asHalfLives(m), "Benjamin", "M").peakYear,
      benjaminHalfCount: (m) => findHalf(asHalfLives(m), "Benjamin", "M").halfCount,
      benjaminHalfYear: (m) => findHalf(asHalfLives(m), "Benjamin", "M").halfYear,
    },
    asserts: [
      // Every hand-written figure in the post body is pinned here.
      { key: "count", equals: 661 },
      { key: "window", equals: 30 },
      { key: "lastPeakYear", equals: 1995 },
      { key: "minPeakLabel", equals: "2,000" },
      { key: "era", equals: 1950 },
      { key: "bigPeakLabel", equals: "10,000" },
      { key: "halvedCount", equals: 604 },
      { key: "survivorCount", equals: 57 },
      { key: "survivorPct", equals: 9 },
      { key: "medianHalf", equals: 12 },
      { key: "pre1950Count", equals: 215 },
      { key: "post1950Count", equals: 446 },
      { key: "preMedianHalf", equals: 17 },
      { key: "postMedianHalf", equals: 11 },
      { key: "preFastDecadePct", equals: 13 },
      { key: "postFastDecadePct", equals: 47 },
      { key: "preSurvivorPct", equals: 20 },
      { key: "postSurvivorPct", equals: 3 },
      { key: "twentiesMedianHalf", equals: 21 },
      { key: "seventiesMedianHalf", equals: 9 },
      { key: "ninetiesMedianHalf", equals: 12 },
      { key: "femaleCount", equals: 414 },
      { key: "maleCount", equals: 247 },
      { key: "femaleHalvedPct", equals: 98 },
      { key: "maleHalvedPct", equals: 81 },
      { key: "femaleMedianHalf", equals: 11 },
      { key: "maleMedianHalf", equals: 16 },
      { key: "bigSurvivorCount", equals: 7 },
      { key: "bigSurvivorMaleCount", equals: 6 },
      { key: "fastestName", equals: "Chelsea" },
      { key: "fastestPeak", equals: 16177 },
      { key: "fastestYear", equals: 1992 },
      { key: "fastestHalf", equals: 2 },
      { key: "fastestHalfCount", equals: 7718 },
      { key: "hillaryPeak", equals: 2520 },
      { key: "hillaryYear", equals: 1992 },
      { key: "hillaryHalf", equals: 1 },
      { key: "hillaryHalfCount", equals: 1064 },
      { key: "mindyPeak", equals: 3712 },
      { key: "mindyHalf", equals: 2 },
      { key: "krystlePeak", equals: 2579 },
      { key: "krystleHalf", equals: 2 },
      { key: "shirleyPeak", equals: 42366 },
      { key: "shirleyYear", equals: 1935 },
      { key: "shirleyHalf", equals: 4 },
      { key: "shirleyHalfCount", equals: 20447 },
      { key: "deborahPeak", equals: 54674 },
      { key: "deborahYear", equals: 1954 },
      { key: "deborahHalf", equals: 6 },
      { key: "deborahHalfCount", equals: 25266 },
      { key: "tiffanyPeak", equals: 18364 },
      { key: "tiffanyYear", equals: 1988 },
      { key: "tiffanyHalf", equals: 5 },
      { key: "tiffanyHalfCount", equals: 8586 },
      { key: "jessicaPeak", equals: 55992 },
      { key: "jessicaYear", equals: 1987 },
      { key: "jessicaHalf", equals: 8 },
      { key: "jessicaHalfCount", equals: 27941 },
      { key: "ashleyPeak", equals: 54856 },
      { key: "ashleyHalf", equals: 8 },
      { key: "ashleyHalfCount", equals: 26606 },
      { key: "amandaPeak", equals: 41786 },
      { key: "amandaHalf", equals: 6 },
      { key: "stephaniePeak", equals: 24864 },
      { key: "stephanieHalf", equals: 6 },
      { key: "stephanieHalfCount", equals: 11643 },
      { key: "brittanyPeak", equals: 37792 },
      { key: "brittanyHalf", equals: 6 },
      { key: "jenniferPeak", equals: 63600 },
      { key: "jenniferYear", equals: 1972 },
      { key: "jenniferHalf", equals: 16 },
      { key: "michaelPeak", equals: 92781 },
      { key: "michaelYear", equals: 1957 },
      { key: "michaelHalfCount", equals: 63664 },
      { key: "michaelHalfYear", equals: 1987 },
      { key: "maryPeak", equals: 73984 },
      { key: "maryYear", equals: 1921 },
      { key: "maryHalfCount", equals: 65721 },
      { key: "maryHalfYear", equals: 1951 },
      { key: "josephPeak", equals: 32749 },
      { key: "josephYear", equals: 1956 },
      { key: "josephHalfCount", equals: 28834 },
      { key: "josephHalfYear", equals: 1986 },
      { key: "benjaminPeak", equals: 15733 },
      { key: "benjaminYear", equals: 1989 },
      { key: "benjaminHalfCount", equals: 13044 },
      { key: "benjaminHalfYear", equals: 2019 },
      { key: "stephanieYear", equals: 1990 },
    ],
  },
];
