// GET /shadow/:name/:year/  → The Counterfactual You page
//
// Renders a side-by-side comparison between a name in its birth year and
// its "shadow" — the name that occupied the same popularity rank 50 years
// earlier.

import {
  getMeta,
  getNameWithSeries,
  getShadowName,
  META_KEYS,
  pageShell,
  renderShadowPage,
} from "@nv/shared";
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

  const sexParam = new URL(ctx.request.url).searchParams.get("sex");
  const sex = sexParam === "M" || sexParam === "F" ? sexParam : undefined;
  const sexQuery = sex ? `?sex=${sex}` : "";

  const [ymStr, yMStr] = await Promise.all([
    getMeta(ctx.env.DB, META_KEYS.minYear),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);
  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 2024);

  if (year < ym || year > yM) {
    return notFound(`No data for ${year}. Available: ${ym}–${yM}.`);
  }

  // Redirect to the canonical URL (correct casing + trailing slash) in a
  // single hop — the middleware skips trailing-slash redirects for shadow
  // routes so lowercase requests don't bounce twice.
  const [inputRowsCheck] = await Promise.all([
    getNameWithSeries(ctx.env.DB, name.toLowerCase()),
  ]);
  const canonicalName = inputRowsCheck[0]?.row.name;
  const requestPath = new URL(ctx.request.url).pathname;
  if ((canonicalName && canonicalName !== name) || !requestPath.endsWith("/")) {
    const finalName = canonicalName ?? name;
    return new Response(null, {
      status: 301,
      headers: { Location: `/shadow/${encodeURIComponent(finalName)}/${year}/${sexQuery}`, "Cache-Control": "public, s-maxage=86400" },
    });
  }

  const shadowYear = year - 50;
  if (shadowYear < ym) {
    return notFound(`Shadow year ${shadowYear} is before the earliest data (${ym}). Try a later birth year.`);
  }

  const match = await getShadowName(ctx.env.DB, name.toLowerCase(), year, shadowYear, sex);
  if (!match) {
    return notFound(
      `No data for ${name} in ${year}, or no matching shadow name found in ${shadowYear}.`,
    );
  }

  const [inputRows, shadowRows] = await Promise.all([
    getNameWithSeries(ctx.env.DB, match.inputNameLower),
    getNameWithSeries(ctx.env.DB, match.shadowNameLower),
  ]);

  const input = inputRows.find((r) => r.row.sex === match.inputSex);
  const shadow = shadowRows.find((r) => r.row.sex === match.shadowSex);

  if (!input || !shadow) {
    return notFound("Failed to load full series for one or both names.");
  }

  const url = new URL(ctx.request.url);
  const canonical = `${url.origin}/shadow/${encodeURIComponent(match.inputName)}/${year}/${sexQuery}`;

  const html = renderShadowPage({
    input,
    shadow,
    match,
    canonical,
    origin: url.origin,
  });

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "name" | "year"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function notFound(msg: string): Response {
  const safe = msg.replace(/[<>&"]/g, (c) => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;"})[c]!);
  return new Response(
    pageShell({
      title: "Shadow not found | NobodyNamed",
      description: msg,
      canonical: "https://nobodynamed.com/shadow/",
      body: `
    <h1>Shadow not found</h1>
    <p class="lede">${safe}</p>
    <p><a href="/">Try another name</a></p>
  `,
      footerVariant: "full",
    }),
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
