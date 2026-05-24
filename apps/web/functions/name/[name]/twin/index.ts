// GET /name/:name/twin/ — HTML page showing names with similar trajectories.

import { getNameSpark, getCachedNameSparks, decodeSpark, renderTwinPage, getMeta, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function cosineSim(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
    normA += (a[i] ?? 0) ** 2;
    normB += (b[i] ?? 0) ** 2;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const raw = ctx.params.name;
  if (typeof raw !== "string" || !raw) {
    return new Response("missing name", { status: 400 });
  }
  const decoded = decodeURIComponent(raw);
  const nameLower = decoded.toLowerCase();

  const url = new URL(ctx.request.url);
  const sexParam = (url.searchParams.get("sex") ?? "").trim().toUpperCase();

  const dataVersion = (await getMeta(ctx.env.DB, META_KEYS.dataVersion)) ?? "dev";
  const [targetRow, allSparks] = await Promise.all([
    getNameSpark(ctx.env.DB, nameLower),
    getCachedNameSparks(ctx.env.DB, dataVersion),
  ]);

  if (!targetRow) {
    return new Response("not found", { status: 404 });
  }

  const targetSex = sexParam === "M" || sexParam === "F" ? sexParam : targetRow.sex;
  if (targetRow.name !== decoded) {
    const redirectUrl = new URL(`/name/${encodeURIComponent(targetRow.name)}/twin/`, ctx.request.url);
    if (sexParam === "M" || sexParam === "F") redirectUrl.searchParams.set("sex", targetSex);
    return Response.redirect(redirectUrl.toString(), 301);
  }

  const targetSpark = targetRow.spark_blob
    ? decodeSpark(targetRow.spark_blob)
    : new Array(60).fill(0);

  const scored = allSparks
    .filter((r) => r.name.toLowerCase() !== nameLower && r.sex === targetSex)
    .map((r) => ({
      name: r.name,
      sex: r.sex,
      score: cosineSim(targetSpark, r.spark),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const canonical = `${url.origin}/name/${encodeURIComponent(targetRow.name)}/twin/`;
  const html = renderTwinPage(
    targetRow.name,
    targetSex,
    scored.map((r) => ({ name: r.name, sex: r.sex, similarity: +r.score.toFixed(4) })),
    { canonical, origin: url.origin },
  );

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "name"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
