// Enrichment pipeline: generates unique narrative copy per name from the
// shape of its SSA time series. Used by the ingest worker's /enrich endpoint
// and can be precomputed at finalize-time in the future.

import type { D1Database } from "@cloudflare/workers-types";
import type { Sex } from "./schema";
import { META_KEYS } from "./schema";
import { getMeta } from "./d1-queries";

export interface EnrichResult {
  name: string;
  sex: Sex | null;
  snippet: string;
  sources: { id: string; label: string }[];
}

type Shape =
  | "all-time-high"
  | "one-hit-wonder"
  | "ghost"
  | "cliff-diver"
  | "evergreen"
  | "revival"
  | "late-bloomer"
  | "dominant-era"
  | "steady-rise"
  | "steady-fall"
  | "standard";

interface SeriesPoint {
  year: number;
  count: number;
}

function computeShape(
  series: SeriesPoint[],
  yM: number,
): { shape: Shape; details: Record<string, number> } {
  if (series.length === 0) return { shape: "standard", details: {} };

  const sortedByYear = [...series].sort((a, b) => a.year - b.year);
  const sortedByCount = [...series].sort((a, b) => b.count - a.count);

  const peak = sortedByCount[0]!;
  const first = sortedByYear[0]!;
  const last = sortedByYear[sortedByYear.length - 1]!;

  const latest = series.find((s) => s.year === yM);
  const latestCount = latest ? latest.count : 0;

  // All-time high: peak in last 5 years
  if (peak.year >= yM - 5 && latestCount > 0) {
    return { shape: "all-time-high", details: { peakYear: peak.year, peakCount: peak.count } };
  }

  // One-hit wonder: peak is 5×+ second highest
  const secondHighest = sortedByCount[1];
  if (secondHighest && peak.count >= secondHighest.count * 5 && peak.count >= 1000) {
    return {
      shape: "one-hit-wonder",
      details: {
        peakYear: peak.year,
        peakCount: peak.count,
        ratio: Math.round(peak.count / secondHighest.count),
      },
    };
  }

  // Ghost: extinct for 30+ years
  if (last.year <= yM - 30 && latestCount === 0) {
    return {
      shape: "ghost",
      details: { lastYear: last.year, absentYears: yM - last.year },
    };
  }

  // Cliff diver: dropped 75%+ within 5 years after peak
  const fiveAfter = series.find((s) => s.year === peak.year + 5);
  if (fiveAfter && peak.count > 0 && fiveAfter.count / peak.count <= 0.25) {
    return {
      shape: "cliff-diver",
      details: {
        peakYear: peak.year,
        dropPct: Math.round(100 * (1 - fiveAfter.count / peak.count)),
      },
    };
  }

  // Dominant era: peak count >= 20k
  if (peak.count >= 20000) {
    return {
      shape: "dominant-era",
      details: { peakYear: peak.year, peakCount: peak.count },
    };
  }

  // Revival: peaked earlier, dropped significantly, then peaked again 20+ years later
  const prePeak = series.filter((s) => s.year < peak.year);
  if (prePeak.length > 0) {
    const prePeakMax = prePeak.reduce((p, s) => (s.count > p.count ? s : p), prePeak[0]!);
    const valley = series.filter((s) => s.year > prePeakMax.year && s.year < peak.year);
    if (valley.length > 0) {
      const valleyMin = valley.reduce((m, s) => (s.count < m.count ? s : m), valley[0]!);
      const valleyDepth = prePeakMax.count > 0 ? valleyMin.count / prePeakMax.count : 1;
      if (peak.year - prePeakMax.year >= 20 && valleyDepth <= 0.3) {
        return {
          shape: "revival",
          details: {
            prePeakYear: prePeakMax.year,
            peakYear: peak.year,
            gap: peak.year - prePeakMax.year,
          },
        };
      }
    }
  }

  // Evergreen: span > 50 years, CV < 1.0, peak > 1000
  const span = last.year - first.year;
  const mean = series.reduce((sum, s) => sum + s.count, 0) / series.length;
  const variance = series.reduce((sum, s) => sum + (s.count - mean) ** 2, 0) / series.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;
  if (span >= 50 && cv < 1.0 && peak.count >= 1000) {
    return { shape: "evergreen", details: { span } };
  }

  // Late bloomer: first year > 1950, peaked within 15 years, 10×+ growth
  if (first.year > 1950 && peak.year - first.year <= 15 && peak.count >= first.count * 10 && peak.count >= 500) {
    return {
      shape: "late-bloomer",
      details: { firstYear: first.year, peakYear: peak.year },
    };
  }

  // Steady rise: last 10 years avg >= 2× previous 10 years
  const last10 = series.filter((s) => s.year > yM - 10);
  const prev10 = series.filter((s) => s.year > yM - 20 && s.year <= yM - 10);
  const last10Avg = last10.length > 0 ? last10.reduce((sum, s) => sum + s.count, 0) / last10.length : 0;
  const prev10Avg = prev10.length > 0 ? prev10.reduce((sum, s) => sum + s.count, 0) / prev10.length : 0;
  if (prev10Avg > 0 && last10Avg / prev10Avg >= 2 && latestCount >= 100) {
    return {
      shape: "steady-rise",
      details: { growthX: Math.round((last10Avg / prev10Avg) * 10) / 10 },
    };
  }

  // Steady fall: last 10 years avg <= 0.5× previous 10 years
  if (prev10Avg > 0 && last10Avg / prev10Avg <= 0.5 && latestCount > 0) {
    return {
      shape: "steady-fall",
      details: { dropX: Math.round((prev10Avg / last10Avg) * 10) / 10 },
    };
  }

  return {
    shape: "standard",
    details: { peakYear: peak.year, peakCount: peak.count, latestCount },
  };
}

function generateSnippet(
  name: string,
  sex: Sex | null,
  series: SeriesPoint[],
  yM: number,
  shape: Shape,
  details: Record<string, number>,
): string {
  const sexLabel = sex === "M" ? "boys" : sex === "F" ? "girls" : "children";

  switch (shape) {
    case "all-time-high": {
      return `${name} is at an all-time high in the latest SSA data. With ${fmt(details.peakCount)} ${sexLabel} in ${details.peakYear}, it has never been more common.`;
    }

    case "one-hit-wonder": {
      return `${name} had a singular moment: ${fmt(details.peakCount)} ${sexLabel} in ${details.peakYear}, nearly ${details.ratio}× its next-best year. A genuine one-hit wonder in the naming charts.`;
    }

    case "ghost": {
      return `${name} disappeared from SSA records in ${details.lastYear} and has not been seen in ${details.absentYears} years. Its absence is now longer than many names' entire recorded lifespan.`;
    }

    case "cliff-diver": {
      return `${name} fell hard after ${details.peakYear}. Within five years it had dropped ${details.dropPct}% from its peak — one of the steepest post-peak collapses on record.`;
    }

    case "evergreen": {
      return `${name} is a cross-generational constant. Across ${details.span} years of SSA records, it has never had a true boom or bust cycle — just quiet, persistent presence.`;
    }

    case "revival": {
      return `${name} has a second act. After fading from its ${details.prePeakYear} peak, it disappeared for ${details.gap} years before finding new momentum in ${details.peakYear}.`;
    }

    case "late-bloomer": {
      return `${name} barely registered before ${details.firstYear}, then climbed fast. It went from statistical noise to its ${details.peakYear} peak in about a decade.`;
    }

    case "dominant-era": {
      return `At its ${details.peakYear} peak, ${name} claimed ${fmt(details.peakCount)} births — a genuinely dominant era that defined the sound of its generation.`;
    }

    case "steady-rise": {
      return `${name} has been climbing steadily. The last decade averaged ${details.growthX}× the decade before — not a viral spike, but a sustained ascent.`;
    }

    case "steady-fall": {
      return `${name} has been in gradual retreat. The last decade averaged ${details.dropX}× lower than the decade before it — a slow, steady fade rather than a collapse.`;
    }

    default: {
      const peak = series.reduce((p, s) => (s.count > p.count ? s : p), series[0]!);
      const latest = series.find((s) => s.year === yM);
      const latestCount = latest ? latest.count : 0;
      if (latestCount === 0) {
        const total = series.reduce((sum, s) => sum + s.count, 0);
        const last = series.reduce((p, s) => (s.year > p.year ? s : p), series[0]!);
        return `${name} last appeared in SSA records in ${last.year}. Across its recorded history, about ${fmt(total)} American ${sexLabel} received the name.`;
      }
      const trend =
        latestCount > peak.count * 0.8
          ? "has held most of its peak strength"
          : latestCount > peak.count * 0.3
            ? `is down ${Math.round(100 * (1 - latestCount / peak.count))}% from its ${peak.year} high`
            : "is a faint echo of its former self";
      return `${name} peaked in ${peak.year} with ${fmt(peak.count)} ${sexLabel}. Today it ${trend}, with ${fmt(latestCount)} births in ${yM}.`;
    }
  }
}

export async function enrichName(
  db: D1Database,
  name: string,
  sex?: Sex,
): Promise<EnrichResult> {
  const normalized = name[0]!.toUpperCase() + name.slice(1).toLowerCase();
  const nameLower = normalized.toLowerCase();

  const yMStr = await getMeta(db, META_KEYS.maxYear);
  const yM = yMStr ? parseInt(yMStr, 10) : new Date().getFullYear();

  const r = await db
    .prepare(
      `SELECT n.name, n.sex, ny.year, ny.count
       FROM names n
       JOIN name_years ny ON ny.name_id = n.id
       WHERE n.name_lower = ?1
       ORDER BY n.sex, ny.year`,
    )
    .bind(nameLower)
    .all<{ name: string; sex: Sex; year: number; count: number }>();

  const rows = r.results ?? [];
  if (!rows.length) {
    return {
      name: normalized,
      sex: sex || null,
      snippet: `${normalized} does not appear in SSA records.`,
      sources: [{ id: "ssa", label: "SSA naming records" }],
    };
  }

  // Group by sex
  const bySex = new Map<Sex, typeof rows>();
  for (const row of rows) {
    if (!bySex.has(row.sex)) bySex.set(row.sex, []);
    bySex.get(row.sex)!.push(row);
  }

  let selectedSex: Sex;
  let selectedRows: typeof rows;

  if (sex && bySex.has(sex)) {
    selectedSex = sex;
    selectedRows = bySex.get(sex)!;
  } else {
    const sexTotals = [...bySex.entries()].map(([s, rs]) => ({
      sex: s,
      total: rs.reduce((sum, r) => sum + r.count, 0),
    }));
    sexTotals.sort((a, b) => b.total - a.total);
    selectedSex = sexTotals[0]!.sex;
    selectedRows = bySex.get(selectedSex)!;
  }

  const series = selectedRows.map((r) => ({ year: r.year, count: r.count }));
  const { shape, details } = computeShape(series, yM);
  const snippet = generateSnippet(normalized, selectedSex, series, yM, shape, details);

  return {
    name: normalized,
    sex: selectedSex,
    snippet,
    sources: [{ id: "ssa", label: "SSA naming records" }],
  };
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return Number(n).toLocaleString("en-US");
}
