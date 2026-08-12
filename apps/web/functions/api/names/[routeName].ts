// GET /api/names/emerging | /api/names/fading
// Backed by the precomputed name_momentum table (see
// migrations/20260812T120000_name_momentum.sql). Data only changes ~once/year
// when SSA releases new figures, so this reads straight from D1 behind the
// same edge Cache-Control convention as /api/landing/:kind and /api/movers/:year
// — no KV layer, since this project has no KV namespace binding.

import { getMeta, listMomentum, META_KEYS } from "@nv/shared";
import type { MomentumDirection, MomentumResponse, MomentumRouteName, MomentumSort, Sex } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

const ROUTE_TO_DIRECTION: Record<MomentumRouteName, MomentumDirection> = {
  emerging: "rising",
  fading: "fading",
};

const VALID_SORTS = new Set<MomentumSort>(["momentum", "total", "eta", "az"]);
const DEFAULT_LIMIT = 150;
const MAX_LIMIT = 500;

export const onRequestGet: PagesFunction<Env, "routeName"> = async (ctx) => {
  const routeName = ctx.params.routeName as MomentumRouteName;
  const direction = ROUTE_TO_DIRECTION[routeName];
  if (!direction) return new Response("unknown momentum route", { status: 400 });

  const url = new URL(ctx.request.url);
  const sexParam = url.searchParams.get("sex");
  const sex: Sex | undefined = sexParam === "M" || sexParam === "F" ? sexParam : undefined;
  if (sexParam && !sex) return new Response("sex must be M or F", { status: 400 });

  const sortParam = url.searchParams.get("sort") ?? "momentum";
  if (!VALID_SORTS.has(sortParam as MomentumSort)) {
    return new Response("sort must be one of momentum, total, eta, az", { status: 400 });
  }
  const sort = sortParam as MomentumSort;

  const limitParam = url.searchParams.get("limit");
  let limit = DEFAULT_LIMIT;
  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1) {
      return new Response("limit must be a positive integer", { status: 400 });
    }
    limit = Math.min(parsed, MAX_LIMIT);
  }

  const [rows, yMStr] = await Promise.all([
    listMomentum(ctx.env.DB, direction, { sex, sort, limit }),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  const body: MomentumResponse = {
    direction,
    sex: sex ?? null,
    sort,
    yM: Number(yMStr ?? 0),
    rows,
  };

  return Response.json(body, {
    headers: {
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      "Content-Type": "application/json; charset=utf-8",
    },
  });
};
