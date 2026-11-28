/**
 * gsc/quickwins.ts — Pull GSC query data and surface striking-distance keywords.
 *
 * Usage:
 *   npm run gsc:quickwins
 *   npm run gsc:quickwins -- --days=180 --path=/blog/ --compare --format=json
 *   npm run gsc:quickwins -- --country=usa --min-pos=5 --max-pos=15
 *
 * Env overrides: GSC_SA_KEY, GSC_SITE, GSC_DAYS, GSC_COUNTRY
 */

import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildConfig,
  loadServiceAccount,
  getAccessToken,
  querySearchAnalytics,
  makePeriodDates,
  expectedCtr,
  computeScore,
  isBranded,
  isPathMatch,
  rowsToCsv,
  fmtDate,
  type GscRow,
  type QuickWin,
  type PageAgg,
  type PeriodResult,
} from "./lib.js";

// ─── CLI ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const cfg = buildConfig(args);

const doCompare = args.includes("--compare");
const doJson = args.includes("--format=json") || args.includes("--json");
const noBrand = args.includes("--no-brand");
const pathPrefix = args.find((a) => a.startsWith("--path="))?.slice(7);

// ─── Auth ──────────────────────────────────────────────────────────────

const sa = loadServiceAccount(cfg.keyPath);

// ─── Dates ─────────────────────────────────────────────────────────────

const dates = makePeriodDates(cfg.days);

console.log(`\nProperty : ${cfg.site}`);
console.log(`Window   : ${dates.currentStart} → ${dates.currentEnd} (${cfg.days} days)`);
if (cfg.country) console.log(`Country  : ${cfg.country}`);
if (pathPrefix) console.log(`Path     : ${pathPrefix}`);
if (noBrand) console.log(`Brand    : filtered out`);
if (doCompare) {
  console.log(`Compare  : ${dates.prevStart} → ${dates.prevEnd}`);
}

async function main() {
  const token = await getAccessToken(sa, cfg.retries, cfg.retryDelayMs);

  // ─── Fetch data ──────────────────────────────────────────────────────

  async function fetchPeriod(
    label: string,
    start: string,
    end: string,
  ): Promise<PeriodResult> {
    const [byQuery, byQueryPage] = await Promise.all([
      querySearchAnalytics(
        token,
        cfg.site,
        {
          startDate: start,
          endDate: end,
          dimensions: ["query"],
          country: cfg.country,
          pathPrefix,
        },
        cfg.retries,
        cfg.retryDelayMs,
      ),
      querySearchAnalytics(
        token,
        cfg.site,
        {
          startDate: start,
          endDate: end,
          dimensions: ["query", "page"],
          country: cfg.country,
          pathPrefix,
        },
        cfg.retries,
        cfg.retryDelayMs,
      ),
    ]);

    return { label, startDate: start, endDate: end, rows: byQuery, rowsByPage: byQueryPage };
  }

  const current = await fetchPeriod("current", dates.currentStart, dates.currentEnd);
  const previous = doCompare
    ? await fetchPeriod("previous", dates.prevStart, dates.prevEnd)
    : undefined;

  if (current.rows.length === 0) {
    console.error(
      "\n✗ Zero rows returned. Likely causes:\n" +
        "  - The service-account email isn't added as a user on this GSC property.\n" +
        "  - GSC_SITE is wrong (domain property needs the sc-domain: prefix).\n",
    );
    process.exit(1);
  }

// ─── Build best-page map ───────────────────────────────────────────────

function buildBestPageMap(rowsByPage: GscRow[]): Map<string, { page: string; impressions: number }> {
  const map = new Map<string, { page: string; impressions: number }>();
  for (const r of rowsByPage) {
    const kw = r.keys[0]!;
    const page = r.keys[1]!;
    const cur = map.get(kw);
    if (!cur || r.impressions > cur.impressions) {
      map.set(kw, { page, impressions: r.impressions });
    }
  }
  return map;
}

const bestPageCurrent = buildBestPageMap(current.rowsByPage);
const bestPagePrevious = previous ? buildBestPageMap(previous.rowsByPage) : undefined;

// ─── Analyze ───────────────────────────────────────────────────────────

function analyzePeriod(
  period: PeriodResult,
  bestPage: Map<string, { page: string; impressions: number }>,
): QuickWin[] {
  return period.rows
    .filter(
      (r) =>
        r.position >= cfg.minPosition &&
        r.position <= cfg.maxPosition &&
        r.impressions >= 5,
    )
    .map((r) => {
      const kw = r.keys[0]!;
      const exp = expectedCtr(r.position);
      const ctrGap = exp > 0 ? r.ctr / exp : 0;
      const score = computeScore(r.impressions, r.position, cfg.minPosition, cfg.maxPosition);
      const bp = bestPage.get(kw);
      return {
        keyword: kw,
        position: Number(r.position.toFixed(1)),
        impressions: r.impressions,
        clicks: r.clicks,
        ctrPct: Number((r.ctr * 100).toFixed(1)),
        ctrVsExpected: Number(ctrGap.toFixed(2)),
        score: Math.round(score),
        page: bp?.page ?? "",
        pagePath: bp?.page ? new URL(bp.page).pathname : "",
      };
    })
    .filter((w) => (noBrand ? !isBranded(w.keyword, cfg.brandTerms) : true))
    .filter((w) => (pathPrefix ? isPathMatch(w.page, pathPrefix) : true))
    .sort((a, b) => b.score - a.score);
}

const winsCurrent = analyzePeriod(current, bestPageCurrent);
const winsPrevious = previous && bestPagePrevious
  ? analyzePeriod(previous, bestPagePrevious)
  : undefined;

// ─── Comparison ────────────────────────────────────────────────────────

interface ComparedWin extends QuickWin {
  prevPosition?: number;
  prevImpressions?: number;
  prevClicks?: number;
  prevScore?: number;
  positionDelta?: number;
  impressionDelta?: number;
  scoreDelta?: number;
  trend: "new" | "gaining" | "stable" | "losing" | "dropped";
}

function compareWins(
  currentWins: QuickWin[],
  prevWins?: QuickWin[],
): ComparedWin[] {
  if (!prevWins) {
    return currentWins.map((w) => ({ ...w, trend: "new" as const }));
  }

  const prevMap = new Map(prevWins.map((w) => [w.keyword, w]));

  return currentWins.map((w) => {
    const p = prevMap.get(w.keyword);
    if (!p) {
      return { ...w, trend: "new" as const };
    }

    const positionDelta = Number((p.position - w.position).toFixed(1)); // positive = improved
    const impressionDelta = w.impressions - p.impressions;
    const scoreDelta = w.score - p.score;

    let trend: ComparedWin["trend"] = "stable";
    if (positionDelta >= 1) trend = "gaining";
    else if (positionDelta <= -1) trend = "losing";

    return {
      ...w,
      prevPosition: p.position,
      prevImpressions: p.impressions,
      prevClicks: p.clicks,
      prevScore: p.score,
      positionDelta,
      impressionDelta,
      scoreDelta,
      trend,
    };
  });
}

const compared = compareWins(winsCurrent, winsPrevious);

// ─── Page aggregation ──────────────────────────────────────────────────

function aggregateByPage(wins: QuickWin[]): PageAgg[] {
  const map = new Map<string, PageAgg>();
  for (const w of wins) {
    const existing = map.get(w.page);
    if (existing) {
      existing.keywords += 1;
      existing.totalImpressions += w.impressions;
      existing.totalClicks += w.clicks;
      existing.totalScore += w.score;
      const bpCur = bestPageCurrent.get(w.keyword);
      if (bpCur && w.impressions > bpCur.impressions) {
        existing.topKeyword = w.keyword;
      }
    } else {
      map.set(w.page, {
        page: w.page,
        keywords: 1,
        totalImpressions: w.impressions,
        totalClicks: w.clicks,
        avgPosition: w.position,
        totalScore: w.score,
        topKeyword: w.keyword,
      });
    }
  }

  return Array.from(map.values())
    .map((p) => ({
      ...p,
      avgPosition: Number((p.avgPosition / p.keywords).toFixed(1)),
    }))
    .sort((a, b) => b.totalScore - a.totalScore);
}

const pageAggs = aggregateByPage(winsCurrent);

// ─── Console output ────────────────────────────────────────────────────

console.log(
  `\nFound ${compared.length} striking-distance keywords (pos ${cfg.minPosition}-${cfg.maxPosition}).`,
);

if (winsPrevious) {
  const newCount = compared.filter((w) => w.trend === "new").length;
  const gaining = compared.filter((w) => w.trend === "gaining").length;
  const losing = compared.filter((w) => w.trend === "losing").length;
  const stable = compared.length - newCount - gaining - losing;
  console.log(`Trends: ${newCount} new · ${gaining} gaining · ${losing} losing · ${stable} stable`);
}

console.log("\nTop 30 keywords:\n");

const headers = doCompare
  ? ["trend", "pos", "Δpos", "impr", "Δimpr", "clicks", "ctr%", "ctrVsExp", "score", "keyword"]
  : ["pos", "impr", "clicks", "ctr%", "ctrVsExp", "score", "keyword"];

console.log(headers.join("\t"));

for (const w of compared.slice(0, 30)) {
  if (doCompare) {
    console.log(
      [
        w.trend,
        w.position,
        w.positionDelta ?? "—",
        w.impressions,
        w.impressionDelta ?? "—",
        w.clicks,
        w.ctrPct,
        w.ctrVsExpected,
        w.score,
        w.keyword,
      ].join("\t"),
    );
  } else {
    console.log(
      [w.position, w.impressions, w.clicks, w.ctrPct, w.ctrVsExpected, w.score, w.keyword].join(
        "\t",
      ),
    );
  }
}

console.log("\nTop 10 pages by opportunity:\n");
console.log(["page", "kwds", "impr", "clicks", "avgPos", "score", "topKeyword"].join("\t"));
for (const p of pageAggs.slice(0, 10)) {
  console.log(
    [p.page, p.keywords, p.totalImpressions, p.totalClicks, p.avgPosition, p.totalScore, p.topKeyword].join(
      "\t",
    ),
  );
}

// ─── File output ───────────────────────────────────────────────────────

const today = fmtDate(new Date());
mkdirSync(cfg.outputDir, { recursive: true });

// Dated CSVs
const datedPath = `${cfg.outputDir}/quickwins-${today}.csv`;
const datedPagePath = `${cfg.outputDir}/quickwins-pages-${today}.csv`;

// Keyword CSV
const kwHeaders: (keyof ComparedWin)[] = doCompare
  ? [
      "keyword",
      "position",
      "prevPosition",
      "positionDelta",
      "impressions",
      "prevImpressions",
      "impressionDelta",
      "clicks",
      "prevClicks",
      "ctrPct",
      "ctrVsExpected",
      "score",
      "prevScore",
      "scoreDelta",
      "trend",
      "page",
    ]
  : ["keyword", "position", "impressions", "clicks", "ctrPct", "ctrVsExpected", "score", "page"];

writeFileSync(datedPath, rowsToCsv(compared, kwHeaders));
console.log(`\n✓ Keywords written to ${datedPath}`);

// Page CSV
writeFileSync(
  datedPagePath,
  rowsToCsv(pageAggs, ["page", "keywords", "totalImpressions", "totalClicks", "avgPosition", "totalScore", "topKeyword"]),
);
console.log(`✓ Pages written to   ${datedPagePath}`);

// JSON if requested
if (doJson) {
  const jsonPath = `${cfg.outputDir}/quickwins-${today}.json`;
  writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        meta: {
          site: cfg.site,
          days: cfg.days,
          period: `${dates.currentStart} to ${dates.currentEnd}`,
          previousPeriod: doCompare ? `${dates.prevStart} to ${dates.prevEnd}` : undefined,
          country: cfg.country,
          pathPrefix: pathPrefix || undefined,
          brandFilter: noBrand ? cfg.brandTerms : undefined,
        },
        keywords: compared,
        pages: pageAggs,
      },
      null,
      2,
    ),
  );
  console.log(`✓ JSON written to    ${jsonPath}`);
}

  // Convenience "latest" symlink by copying
  const latestPath = `${cfg.outputDir}/quickwins-latest.csv`;
  writeFileSync(latestPath, rowsToCsv(compared, kwHeaders));
  console.log(`✓ Latest written to  ${latestPath}`);
}

main().catch((err: unknown) => {
  console.error("\n✗", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
