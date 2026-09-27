// GET /compare/michael-vs-james/ — server-rendered side-by-side comparison.
// Also accepts /compare/Michael,James/, /compare/Michael+James/ and
// /compare/Michael/James/ (the [[names]] catch-all), and 301s every form to
// the one canonical lowercase "-vs-" URL.

import { pageShell, renderComparePage } from "@nv/shared";
import { getMeta, META_KEYS } from "@nv/shared";
import type { NameRecord, Sex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { getNameWithSeries } from "@nv/shared";

const MAX_COMPARE = 3;

export const onRequestGet: PagesFunction<Env, "names"> = async (ctx) => {
  const param = ctx.params.names;
  const raw = Array.isArray(param) ? param.join("/") : param;
  if (typeof raw !== "string" || !raw) {
    return new Response("missing names", { status: 400 });
  }

  const requested = raw
    .split(/[,+/]|-vs-/i)
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
    return notFound(requested);
  }

  const url = new URL(ctx.request.url);
  const canonicalPath = compareCanonicalPath(records.map((r) => r.name));
  if (url.pathname !== canonicalPath) {
    return new Response(null, {
      status: 301,
      headers: { Location: canonicalPath, "Cache-Control": "public, s-maxage=86400" },
    });
  }
  const canonical = `${url.origin}${canonicalPath}`;
  const html = renderComparePage(records, { canonical });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

// SSA names are ASCII letters only, so lowercase + "-vs-" is unambiguous.
export function compareCanonicalPath(names: string[]): string {
  return `/compare/${names.map((n) => encodeURIComponent(n.toLowerCase())).join("-vs-")}/`;
}

function notFound(requested: string[]): Response {
  const list = requested.map((n) => n.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!)).join(", ");
  const html = pageShell({
    title: "Comparison not found — NobodyNamed",
    description: "Need at least two names with SSA data to compare.",
    canonical: "https://nobodynamed.com/",
    headExtras: '<meta name="robots" content="noindex">',
    body: `
  <h1>Nothing to compare</h1>
  <p class="lede">Need at least two names with SSA data to compare. Requested: ${list || "none"}.</p>
  <p><a href="/">← Search a name</a></p>
`,
  });
  return new Response(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}
