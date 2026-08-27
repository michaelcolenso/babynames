// GET /metrics/ — graceful no-op for the Cloudflare Zaraz tool that injects
// `<script src="/metrics/">` into every page. Zaraz is configured
// dashboard-side (not in this repo) to load that path as a tool script; the
// path never existed, so every pageview logged a console 404 and a wasted
// request. Serve an empty, cacheable JS body instead of 404ing.
//
// The real cleanup is removing the stale Zaraz tool in the Cloudflare
// dashboard (Zaraz → Tools). This endpoint exists so the page stays clean
// even while that tool is still configured.

import type { PagesFunction } from "@cloudflare/workers-types";

const BODY = "/* no-op: Zaraz tool placeholder — see functions/metrics/index.ts */\n";

export const onRequestGet: PagesFunction = async () =>
  new Response(BODY, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "X-Robots-Tag": "noindex",
    },
  });

export const onRequestHead: PagesFunction = async () =>
  new Response(null, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=86400, s-maxage=604800",
      "X-Robots-Tag": "noindex",
    },
  });
