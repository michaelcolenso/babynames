// GET /names/:decade/methodology/ — decade-hub methodology child route.
// Ships for the precomputed 1920s and 1980s hubs; other decades get a plain 404.

import { fetchDecadeHubProfile, renderDecadeMethodology, fetchDecadeHubProfile1920, renderDecadeMethodology1920 } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function notFound(decade: string): Response {
  return new Response(
    `<!doctype html><html><body><h1>Not found</h1><p>No methodology page exists for ${decade}. Flagship child pages are available for the <a href="/names/1920s/">1920s</a> and <a href="/names/1980s/">1980s</a>.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const decade = typeof ctx.params.decade === "string" ? ctx.params.decade : "";
  if (decade !== "1980s" && decade !== "1920s") {
    return notFound(decade);
  }

  const is1920s = decade === "1920s";
  const profile = is1920s ? await fetchDecadeHubProfile1920(ctx.env.DB) : await fetchDecadeHubProfile(ctx.env.DB);
  if (!profile) {
    return notFound(decade);
  }

  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/names/${decade}/methodology/`;
  return new Response(is1920s ? renderDecadeMethodology1920(profile, { origin }) : renderDecadeMethodology(profile, { origin }), {
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
