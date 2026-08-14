// GET /names/:decade/spelling-families/ — spelling-families child route.
// Ships for any reviewed/seeded hub with a valid persisted profile.

import { loadDecadeHubRuntime, renderDecadeSpellingFamiliesGeneric } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function notFound(decade: string): Response {
  return new Response(
    `<!doctype html><html><body><h1>Not found</h1><p>No spelling-families page exists for ${escapeHtml(decade)}.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const decade = typeof ctx.params.decade === "string" ? ctx.params.decade : "";
  const runtime = await loadDecadeHubRuntime(ctx.env.DB, decade);
  if (runtime.status !== "eligible") {
    return notFound(decade);
  }

  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/names/${decade}/spelling-families/`;
  return new Response(renderDecadeSpellingFamiliesGeneric(runtime.profile, { origin, definition: runtime.definition, thesis: runtime.thesis }), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
};

export const onRequestHead: PagesFunction<Env, "decade"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
