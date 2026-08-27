// Pure function for generating SEO-friendly narrative copy from name statistics.
// No hallucinated etymology or made-up origin/meaning. Gracefully omits unavailable fields.

import type { ClassifyResult } from "./classify";
import type { NameRecord } from "./schema";

export interface NameNarrative {
  // Server-rendered summary paragraphs for the at-a-glance section.
  summaryParagraphs: string[];
  // Short Q&A answers, HTML-safe strings.
  answers: {
    population?: string;   // omitted if no reliable estimate
    rarity: string;
    age?: string;          // omitted if series too sparse
    trend: string;
    geography?: string;    // omitted if no anomaly data with LQ ≥ 1.5
  };
  // <title> and <meta name="description"> values.
  metaTitle: string;
  metaDescription: string;
}

// US SSA sex-averaged period life table (2020), l(x) per 100,000 live births.
// Source: SSA Actuarial Life Table, 2020 Period Life Table.
const LIFE_TABLE: [number, number][] = [
  [0,   100_000],
  [1,    99_330],
  [5,    99_223],
  [10,   99_117],
  [15,   99_008],
  [20,   98_618],
  [25,   98_127],
  [30,   97_658],
  [35,   96_958],
  [40,   95_999],
  [45,   94_499],
  [50,   92_274],
  [55,   88_641],
  [60,   83_167],
  [65,   75_241],
  [70,   65_178],
  [75,   52_098],
  [80,   37_655],
  [85,   20_553],
  [90,    8_536],
  [95,    2_558],
  [100,     447],
  [105,      39],
  [110,       2],
  [115,       0],
];

function survivalRate(age: number): number {
  if (age < 0) return 0;
  if (age >= 115) return 0;
  for (let i = 0; i < LIFE_TABLE.length - 1; i++) {
    const [a0, s0] = LIFE_TABLE[i]!;
    const [a1, s1] = LIFE_TABLE[i + 1]!;
    if (age >= a0 && age < a1) {
      const t = (age - a0) / (a1 - a0);
      return (s0 + t * (s1 - s0)) / 100_000;
    }
  }
  return 0;
}

interface AgeStats {
  estimatedLiving: number;
  medianAge: number | null;
  p25Age: number | null;
  p75Age: number | null;
  // Fraction of living bearers aged 0–11 ("playground age").
  playgroundFrac: number | null;
}

function computeAgeStats(series: Record<number, number>, currentYear: number): AgeStats {
  const entries: { year: number; count: number }[] = [];
  for (const yr of Object.keys(series)) {
    const y = Number(yr);
    const c = series[y] ?? 0;
    if (c > 0) entries.push({ year: y, count: c });
  }
  if (!entries.length) {
    return { estimatedLiving: 0, medianAge: null, p25Age: null, p75Age: null, playgroundFrac: null };
  }

  // Build a sorted list of (age, estimated-living-count) pairs.
  const living: { age: number; n: number }[] = [];
  let total = 0;
  let playgroundTotal = 0;

  for (const { year, count } of entries) {
    const age = currentYear - year;
    if (age < 0 || age >= 115) continue;
    const n = count * survivalRate(age);
    if (n > 0) {
      living.push({ age, n });
      total += n;
      if (age <= 11) playgroundTotal += n;
    }
  }

  if (total < 1) {
    return { estimatedLiving: 0, medianAge: null, p25Age: null, p75Age: null, playgroundFrac: null };
  }

  // Sort youngest to oldest for percentile scan.
  living.sort((a, b) => a.age - b.age);

  let cum = 0;
  let p25: number | null = null;
  let p50: number | null = null;
  let p75: number | null = null;
  for (const { age, n } of living) {
    cum += n;
    const pct = cum / total;
    if (p25 === null && pct >= 0.25) p25 = age;
    if (p50 === null && pct >= 0.50) p50 = age;
    if (p75 === null && pct >= 0.75) p75 = age;
  }

  return {
    estimatedLiving: Math.round(total),
    medianAge: p50,
    p25Age: p25,
    p75Age: p75,
    playgroundFrac: playgroundTotal / total,
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

// Formats a living-population estimate with appropriate rounding signal.
function fmtLiving(n: number): string {
  if (n >= 1_000_000) {
    const tenths = Math.round(n / 100_000) / 10;
    return `${tenths.toFixed(1).replace(/\.0$/, "")} million`;
  }
  return fmt(n);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function waveLabel(a: ClassifyResult): string {
  if (a.status === "extinct") return "historic";
  if (a.status === "endangered") return "fading";
  if (a.status === "rising") {
    // A name that peaked long ago but is now rising again is resurgent.
    return a.peakYear < 2000 ? "resurgent" : "modern";
  }
  if (a.status === "declining") return "vintage";
  // stable — use longevity to pick the right adjective
  const span = a.lastYear - a.firstYear;
  return span >= 70 ? "classic" : "established";
}

function sexBabyLabel(sex: "M" | "F"): string {
  return sex === "M" ? "boys" : "girls";
}

function sexNounLabel(sex: "M" | "F"): string {
  return sex === "M" ? "masculine" : "feminine";
}

export function generateNameNarrative(
  record: NameRecord,
  a: ClassifyResult,
  // Top geographic anomaly for the "Where is X most common?" answer.
  // Pass the full state name (already resolved from abbreviation).
  topAnomaly?: { state: string; lq: number },
): NameNarrative {
  const name = record.name;
  const safeName = esc(name);
  const sexNoun = sexNounLabel(record.sex);
  const sexBaby = sexBabyLabel(record.sex);
  const wave = waveLabel(a);
  // Use the year after the latest SSA data as "current" for age arithmetic.
  const currentYear = (record.yM > 0 ? record.yM : 2024) + 1;

  const age = computeAgeStats(record.series, currentYear);
  const hasReliableLiving = age.estimatedLiving >= 10;
  const hasAgeStats = age.medianAge !== null && age.p25Age !== null && age.p75Age !== null;

  // ── Summary paragraphs ────────────────────────────────────────────────────

  const summaryParagraphs: string[] = [];

  // P1: identity + estimated living population
  if (hasReliableLiving) {
    if (a.status === "extinct") {
      summaryParagraphs.push(
        `${safeName} is a historic American ${sexNoun} name. Based on SSA birth records through ${a.lastYear}, an estimated ${fmtLiving(age.estimatedLiving)} Americans born with this name may still be living today.`,
      );
    } else {
      summaryParagraphs.push(
        `${safeName} is a ${wave} American ${sexNoun} name carried by an estimated ${fmtLiving(age.estimatedLiving)} living Americans.`,
      );
    }
  } else if (a.status === "extinct") {
    summaryParagraphs.push(
      `${safeName} is a historic American ${sexNoun} name that has not appeared in SSA birth records since ${a.lastYear}.`,
    );
  } else if (a.totalCount > 0) {
    summaryParagraphs.push(
      `${safeName} is a ${wave} American ${sexNoun} name. The SSA has recorded about ${fmt(a.totalCount)} bearers since ${a.firstYear}.`,
    );
  }

  // P2: typical age and core age range
  if (hasAgeStats) {
    const median = age.medianAge!;
    const p25 = age.p25Age!;
    const p75 = age.p75Age!;
    const eraDesc =
      median >= 65
        ? "reflecting its strongest use in earlier generations"
        : median >= 45
          ? "reflecting its mid-century or older use pattern"
          : median <= 18
            ? "reflecting its recent rise"
            : "reflecting its cross-generational reach";
    summaryParagraphs.push(
      `The typical ${safeName} is about ${median} years old, with a core age range of ${p25}–${p75}, ${eraDesc}.`,
    );
  }

  // P3: rarity among children today (playground density)
  if (a.status !== "extinct" && hasReliableLiving && age.playgroundFrac !== null) {
    const pct = (age.playgroundFrac * 100).toFixed(1);
    if (age.playgroundFrac < 0.04 && a.latestCount > 0) {
      summaryParagraphs.push(
        `${safeName} is uncommon among children today: about ${pct}% of its living bearers are under 12 years old.`,
      );
    } else if (age.playgroundFrac >= 0.20) {
      summaryParagraphs.push(
        `${safeName} skews young — about ${pct}% of its living bearers are under 12 years old.`,
      );
    }
  }

  // ── Q&A answers ───────────────────────────────────────────────────────────

  // Population
  let population: string | undefined;
  if (hasReliableLiving) {
    if (a.status === "extinct") {
      population = `Based on SSA birth records through ${a.lastYear}, an estimated ${fmtLiving(age.estimatedLiving)} Americans born with the name ${safeName} may still be living. No new bearers have been recorded since ${a.lastYear}.`;
    } else {
      population = `An estimated ${fmtLiving(age.estimatedLiving)} living Americans are named ${safeName}.`;
    }
  }

  // Rarity
  let rarity: string;
  if (a.status === "extinct" || (a.latestCount === 0 && a.lastYear <= record.yM - 10)) {
    rarity = `${safeName} has not appeared in SSA records since ${a.lastYear}. It is effectively extinct as a new baby name — no ${sexBaby} received it in the latest available data.`;
  } else if (a.latestCount === 0) {
    rarity = `${safeName} fell below the SSA's 5-birth reporting floor in ${record.yM}. It is extremely rare as a new baby name.`;
  } else {
    const rarityLabel =
      a.latestCount < 50
        ? "very rare"
        : a.latestCount < 500
          ? "uncommon"
          : a.latestCount < 5_000
            ? "moderately uncommon"
            : "still widely used";
    const peakContext =
      a.declinePct !== null && a.declinePct > 5
        ? `, down ${a.declinePct}% from its ${a.peakYear} peak`
        : a.latestCount >= a.peakCount
          ? `, matching its recorded peak`
          : ``;
    rarity = `${safeName} is ${rarityLabel} among babies today, with ${fmt(a.latestCount)} ${sexBaby} receiving the name in ${record.yM}${peakContext}.`;
  }

  // Age
  let ageAnswer: string | undefined;
  if (hasAgeStats) {
    ageAnswer = `The median age of a living American named ${safeName} is approximately ${age.medianAge} years, with most bearers falling between ${age.p25Age} and ${age.p75Age} years old.`;
  }

  // Current popularity
  let trend: string;
  if (a.status === "extinct") {
    trend = `No. ${safeName} is <a href="/extinct">extinct in new births</a>; the SSA last recorded it in ${a.lastYear}.`;
  } else if (a.status === "rising") {
    const growthPart =
      a.growthX && a.growthX > 1
        ? ` Births this decade are running about ${a.growthX}× higher than the previous decade.`
        : "";
    trend = `Yes — ${safeName} is currently <a href="/rising">rising in popularity</a>, with ${fmt(a.latestCount)} births in ${record.yM}.${growthPart}`;
  } else if (a.status === "endangered") {
    // Names that are technically "endangered" (>90% decline from peak) but still
    // receive 5,000+ births per year are better described as "past peak" —
    // the same threshold used by render-name.ts's displayStatus()/describeStatus().
    const stillCommon = a.latestCount >= 5000;
    if (stillCommon) {
      trend = `Yes, but it is past its peak. ${safeName} still received ${fmt(a.latestCount)} births in ${record.yM}, down ${a.declinePct ?? 0}% from its ${a.peakYear} high.`;
    } else {
      trend = `No. ${safeName} is <a href="/endangered">endangered</a> as a baby name, down ${a.declinePct ?? 0}% from its ${a.peakYear} peak with ${fmt(a.latestCount)} births in ${record.yM}.`;
    }
  } else if (a.status === "declining") {
    trend = `${a.latestCount >= 1000 ? "Somewhat" : "Not especially"}. ${safeName} has been declining since its ${a.peakYear} peak and registered ${fmt(a.latestCount)} births in ${record.yM}.`;
  } else {
    // stable
    trend = `Yes. ${safeName} is holding steady, with ${fmt(a.latestCount)} births in ${record.yM} and a consistent recent baseline.`;
  }

  // Geography — only when the LQ is high enough to be meaningfully "most common"
  let geography: string | undefined;
  if (topAnomaly && topAnomaly.lq >= 1.5) {
    const lqStr = topAnomaly.lq.toFixed(1);
    geography = `${safeName} has its strongest geographic signal in ${topAnomaly.state}, where it appears ${lqStr}× more often than the national baseline.`;
  }

  // ── Meta ──────────────────────────────────────────────────────────────────

  const metaTitle = `${name} — Name Popularity, History & Stats | NobodyNamed`;

  let metaDescription: string;
  if (hasReliableLiving) {
    // State names come from D1 as proper-cased strings — never lowercase them.
    const geoPhrase = geography ? ` Strongest in ${topAnomaly!.state}.` : ``;
    metaDescription = `${name} peaked in ${a.peakYear} with ${fmt(a.peakCount)} births; ${fmt(a.latestCount)} in ${record.yM}. Rarity, median age, and vital status since 1880.${geoPhrase}`;
  } else if (a.latestCount > 0) {
    metaDescription = `${name} is a ${wave} baby name with ${fmt(a.latestCount)} births in ${record.yM}. See its full popularity history, rarity, and peak year data.`;
  } else {
    metaDescription = `See how many Americans are named ${name}, how rare it is, the typical age, popularity history, and where the name is most common.`;
  }

  return {
    summaryParagraphs,
    answers: {
      population,
      rarity,
      age: ageAnswer,
      trend,
      geography,
    },
    metaTitle,
    metaDescription,
  };
}
