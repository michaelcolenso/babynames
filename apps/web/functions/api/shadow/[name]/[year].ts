// GET /api/shadow/:name/:year
// Returns JSON with input name, shadow name, and match metadata.

import { getMeta, getNameWithSeries, getShadowName, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestGet: PagesFunction<Env, "name" | "year"> = async (ctx) => {
  const rawName = ctx.params.name;
  const rawYear = ctx.params.year;
  if (typeof rawName !== "string" || !rawName || typeof rawYear !== "string" || !rawYear) {
    return new Response("missing params", { status: 400 });
  }

  const name = decodeURIComponent(rawName);
  const year = Number(rawYear);
  if (!Number.isInteger(year) || year < 1880 || year > 2100) {
    return new Response("year must be 1880–present", { status: 400 });
  }

  const [ymStr, yMStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);
  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);

  if (year < ym || year > yM) {
    return Response.json({ error: `No data for ${year}. Available: ${ym}–${yM}.` }, { status: 404 });
  }

  const shadowYear = year - 50;
  if (shadowYear < ym) {
    return Response.json(
      { error: `Shadow year ${shadowYear} is before the earliest data (${ym}). Try a later birth year.` },
      { status: 400 },
    );
  }

  const match = await getShadowName(ctx.env.DB, name.toLowerCase(), year, shadowYear);
  if (!match) {
    return Response.json(
      { error: `No data for ${name} in ${year}, or no matching shadow name found in ${shadowYear}.` },
      { status: 404 },
    );
  }

  const [inputRows, shadowRows] = await Promise.all([
    getNameWithSeries(ctx.env.DB, match.inputNameLower),
    getNameWithSeries(ctx.env.DB, match.shadowNameLower),
  ]);

  const input = inputRows.find((r) => r.row.sex === match.inputSex);
  const shadow = shadowRows.find((r) => r.row.sex === match.shadowSex);

  if (!input || !shadow) {
    return Response.json({ error: "Failed to load full series for one or both names." }, { status: 500 });
  }

  return Response.json({ match, input: input.row, shadow: shadow.row }, {
    headers: {
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};

export const onRequestHead: PagesFunction<Env, "name" | "year"> = async (ctx) => {
  const res = await onRequestGet(ctx);
  return new Response(null, { status: res.status, statusText: res.statusText, headers: res.headers });
};
