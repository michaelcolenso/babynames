// GET /api/twin/:name
// Find the names with the most similar trajectory (spark_blob cosine similarity).
// "Michael and Jennifer have the same lifecycle." — shareable pairing content.
//
// Fetches all name sparks with peak_count >= 200 (~30-50k rows, ~2MB),
// computes cosine similarity in-process, returns top 5 matches per sex.

import { getNameSpark, listNameSparks, decodeSpark } from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";
import type { Sex } from "@nv/shared";

interface Env {
  DB: D1Database;
}

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
  const nameLower = decodeURIComponent(raw).toLowerCase();

  const url = new URL(ctx.request.url);
  const sexParam = url.searchParams.get("sex") as Sex | null;

  const [targetRow, allSparks] = await Promise.all([
    getNameSpark(ctx.env.DB, nameLower),
    listNameSparks(ctx.env.DB),
  ]);

  if (!targetRow) {
    return new Response(JSON.stringify({ error: "Name not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }

  const targetSex = sexParam ?? targetRow.sex;
  const targetSpark = targetRow.spark_blob
    ? decodeSpark(targetRow.spark_blob)
    : new Array(60).fill(0);

  // Score all candidates (same sex, exclude the name itself)
  const scored = allSparks
    .filter((r) => r.name.toLowerCase() !== nameLower && r.sex === targetSex && r.spark_blob)
    .map((r) => ({
      name: r.name,
      sex: r.sex,
      score: cosineSim(targetSpark, decodeSpark(r.spark_blob!)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return Response.json(
    {
      name: targetRow.name,
      sex: targetSex,
      twins: scored.map((r) => ({ name: r.name, sex: r.sex, similarity: +r.score.toFixed(4) })),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800",
        "Content-Type": "application/json; charset=utf-8",
      },
    },
  );
};
