// GET /api/name/:name
// Returns both sexes (when present) for one name in the same shape the
// client renderer expects: { name, sex, ym, yM, series, other }.

import {
  describeStatus,
  getMeta,
  getNameWithSeries,
  META_KEYS,
  type ClassifyResult,
  type NameRecord,
  type NameRow,
  type Sex,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

// The `names` table stores classify.ts's output at ingest time (see
// packages/shared/src/classify.ts) — reconstruct the ClassifyResult shape
// from those stored columns rather than recomputing it here.
function classifyResultFromRow(row: NameRow): ClassifyResult {
  return {
    firstYear: row.first_year,
    lastYear: row.last_year,
    peakYear: row.peak_year,
    peakCount: row.peak_count,
    totalCount: row.total_count,
    latestCount: row.latest_count,
    status: row.status,
    declinePct: row.decline_pct,
    prevDecadeTotal: row.prev_decade ?? 0,
    currDecadeTotal: row.curr_decade ?? 0,
    growthX: row.growth_x,
  };
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const name = ctx.params.name;
  if (typeof name !== "string" || !name) {
    return new Response("missing name", { status: 400 });
  }

  const lower = decodeURIComponent(name).toLowerCase();
  const [rows, ymStr, yMStr] = await Promise.all([
    getNameWithSeries(ctx.env.DB, lower),
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  if (!rows.length) {
    return Response.json(
      { error: "not_found" },
      {
        status: 404,
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
      },
    );
  }

  const ym = Number(ymStr ?? rows[0]!.row.first_year);
  const yM = Number(yMStr ?? rows[0]!.row.last_year);

  // Pick dominant sex by total volume; build the "other" record if both exist.
  const bySex = new Map<Sex, NameRecord>();
  const rowBySex = new Map<Sex, NameRow>();
  for (const r of rows) {
    const series: Record<number, number> = {};
    for (const p of r.series) series[p.year] = p.count;
    bySex.set(r.row.sex, {
      name: r.row.name,
      sex: r.row.sex,
      ym,
      yM,
      series,
    });
    rowBySex.set(r.row.sex, r.row);
  }
  const m = bySex.get("M");
  const f = bySex.get("F");
  const total = (rec: NameRecord | undefined) =>
    rec ? Object.values(rec.series).reduce((a, b) => a + b, 0) : 0;
  const primary = total(m) >= total(f) ? m ?? f! : f ?? m!;
  const other = primary.sex === "M" ? f : m;
  const primaryRow = rowBySex.get(primary.sex)!;
  const classifyResult = classifyResultFromRow(primaryRow);
  const { status: displayStatus } = describeStatus(primary, classifyResult);
  const out: NameRecord = {
    ...primary,
    other: other ? { sex: other.sex, series: other.series } : undefined,
    status: classifyResult.status,
    displayStatus,
    peakYear: classifyResult.peakYear,
    peakCount: classifyResult.peakCount,
    declinePct: classifyResult.declinePct,
  };

  return Response.json(out, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
