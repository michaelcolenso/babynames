// GET /compare/Michael,James/ or /compare/Michael/James/
// Server-rendered side-by-side name comparison.

import { renderComparePage } from "@nv/shared";
import { getMeta, META_KEYS } from "@nv/shared";
import type { NameRecord, Sex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { getNameWithSeries } from "@nv/shared";

const MAX_COMPARE = 3;

export const onRequestGet: PagesFunction<Env, "names"> = async (ctx) => {
  const raw = ctx.params.names;
  if (typeof raw !== "string" || !raw) {
    return new Response("missing names", { status: 400 });
  }

  const requested = raw
    .split(/[,+/]/)
    .map((n) => decodeURIComponent(n).trim())
    .filter(Boolean)
    .slice(0, MAX_COMPARE);

  if (requested.length < 2) {
    return Response.redirect(`${new URL(ctx.request.url).origin}/name/${encodeURIComponent(requested[0] || "")}/`, 302);
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
    return new Response("Need at least two names with data to compare", {
      status: 404,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/compare/${records.map((r) => encodeURIComponent(r.name)).join(",")}/`;
  const html = renderComparePage(records, { canonical });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
    },
  });
};
