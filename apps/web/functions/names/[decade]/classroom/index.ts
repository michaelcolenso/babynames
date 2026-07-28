// GET /names/:decade/classroom/ — representative-classroom child route.
// Ships for 1980s only; every other decade gets the repo's plain 404.

import { fetchDecadeHubProfile, renderDecadeClassroom } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function notFound(decade: string): Response {
  return new Response(
    `<!doctype html><html><body><h1>Not found</h1><p>No classroom page exists for ${decade}. The decade hub currently ships for the <a href="/names/1980s/">1980s</a> only.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const decade = typeof ctx.params.decade === "string" ? ctx.params.decade : "";
  if (decade !== "1980s") {
    return notFound(decade);
  }

  const profile = await fetchDecadeHubProfile(ctx.env.DB);
  if (!profile) {
    return notFound(decade);
  }

  const origin = new URL(ctx.request.url).origin;
  const canonical = `${origin}/names/1980s/classroom/`;
  return new Response(renderDecadeClassroom(profile, { origin }), {
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
