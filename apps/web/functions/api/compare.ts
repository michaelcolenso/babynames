// GET /api/compare?names=Michael,James,David
// Returns up to 3 NameRecords for side-by-side comparison.

import { getMeta, getNameWithSeries, META_KEYS, type NameRecord, type Sex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const MAX_COMPARE = 3;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const rawNames = url.searchParams.get("names");
  if (!rawNames) {
    return Response.json(
      { error: "missing_names", message: "Provide names via ?names=A,B" },
      { status: 400 },
    );
  }

  const requested = rawNames
    .split(/[,+]/)
    .map((n) => decodeURIComponent(n).trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  if (requested.length < 2) {
    return Response.json(
      { error: "too_few_names", message: "Compare at least 2 names" },
      { status: 400 },
    );
  }

  const [ymStr, yMStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2023);

  const records: NameRecord[] = [];
  for (const name of requested) {
    const lower = name.toLowerCase();
    const rows = await getNameWithSeries(ctx.env.DB, lower);
    if (!rows.length) continue;

    const bySex = new Map<Sex, NameRecord>();
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
    }
    const m = bySex.get("M");
    const f = bySex.get("F");
    const total = (rec: NameRecord | undefined) =>
      rec ? Object.values(rec.series).reduce((a, b) => a + b, 0) : 0;
    const primary = total(m) >= total(f) ? m ?? f! : f ?? m!;
    const other = primary.sex === "M" ? f : m;
    records.push({
      ...primary,
      other: other ? { sex: other.sex, series: other.series } : undefined,
    });
  }

  if (records.length < 2) {
    return Response.json(
      { error: "not_enough_found", message: "At least two provided names must have data" },
      { status: 404 },
    );
  }

  return Response.json(
    { names: requested, records },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
