// GET /api/og/default  — branded PNG for static pages with no name-specific data.
// Used as og:image on the homepage, /extinct, /endangered, /rising, /comeback, /year.

import type { PagesFunction } from "@cloudflare/workers-types";
import { svgToPng } from "./_wasm";

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<defs>
  <pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.45" fill="rgba(247,239,225,0.16)"/>
  </pattern>
</defs>
<rect width="1200" height="630" fill="#171511"/>
<rect width="1200" height="630" fill="url(#grain)" opacity="0.45"/>
<text x="80" y="66" font-family="monospace" font-size="17" fill="#d9a56f" letter-spacing="4" font-weight="700">NOBODYNAMED / NAME VITALS</text>
<text x="80" y="240" font-family="Georgia,serif" font-size="72" fill="#f7efe1" font-weight="400">Every name</text>
<text x="80" y="330" font-family="Georgia,serif" font-size="72" fill="#f7efe1" font-weight="400">rides a wave.</text>
<text x="80" y="420" font-family="Georgia,serif" font-size="28" fill="rgba(247,239,225,0.6)">A cultural history of American names since 1880.</text>
<text x="80" y="580" font-family="monospace" font-size="22" fill="rgba(217,165,111,0.75)">nobodynamed.com</text>
</svg>`;

export const onRequestGet: PagesFunction = async () => {
  const png = await svgToPng(SVG);
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=2592000, stale-while-revalidate=86400",
    },
  });
};

export const onRequestHead: PagesFunction = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
