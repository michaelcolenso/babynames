// GET /api/og/decade/:decade  — SVG social card for decade pages.

import { getMeta, topByDecade, META_KEYS } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function parseDecade(raw: string): { label: string; start: number; end: number } | null {
  const m = /^((?:18|19|20)\d{2})s$/.exec(raw);
  if (!m) return null;
  const start = Number(m[1]);
  return { label: `${start}s`, start, end: start + 9 };
}

function buildDecadeOgSvg(label: string, girls: string[], boys: string[]): string {
  const W = 1200, H = 630;
  const girlList = girls.map((n, i) => `${i + 1}. ${escape(n)}`).join("   ");
  const boyList = boys.map((n, i) => `${i + 1}. ${escape(n)}`).join("   ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="#171511"/>
<rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.45"/>
<defs>
  <pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.45" fill="rgba(247,239,225,0.16)"/>
  </pattern>
</defs>
<text x="80" y="66" font-family="monospace" font-size="17" fill="#d9a56f" letter-spacing="4" font-weight="700">NOBODYNAMED / NAME VITALS</text>
<text x="80" y="185" font-family="Georgia,serif" font-size="96" fill="#f7efe1" font-weight="500">Top names of the ${escape(label)}</text>
<text x="80" y="260" font-family="Georgia,serif" font-size="28" fill="rgba(247,239,225,0.68)">Social Security Administration birth records</text>
<text x="80" y="400" font-family="monospace" font-size="22" fill="#f7efe1" font-weight="600">Girls</text>
<text x="80" y="440" font-family="Georgia,serif" font-size="32" fill="#d9a56f">${girlList}</text>
<text x="80" y="510" font-family="monospace" font-size="22" fill="#f7efe1" font-weight="600">Boys</text>
<text x="80" y="550" font-family="Georgia,serif" font-size="32" fill="#d9a56f">${boyList}</text>
<text x="${W - 80}" y="612" font-family="monospace" font-size="16" fill="rgba(217,165,111,0.75)" text-anchor="end">nobodynamed.com</text>
</svg>`;
}

export const onRequestGet: PagesFunction<Env, "decade"> = async (ctx) => {
  const raw = ctx.params.decade;
  if (typeof raw !== "string") return new Response("bad request", { status: 400 });

  const decade = parseDecade(raw);
  if (!decade) return new Response("decade must be like 1980s", { status: 400 });

  const [rows, yMStr, ymStr] = await Promise.all([
    topByDecade(ctx.env.DB, decade.start, decade.end, 3),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
    getMeta(ctx.env.DB, META_KEYS.minYear),
  ]);

  const yM = Number(yMStr ?? 0);
  const ym = Number(ymStr ?? 1880);
  if (decade.start > yM || decade.end < ym) {
    return new Response("no data", { status: 404 });
  }

  const girls = rows.filter((r) => r.sex === "F").map((r) => r.name);
  const boys = rows.filter((r) => r.sex === "M").map((r) => r.name);

  const svg = buildDecadeOgSvg(decade.label, girls, boys);
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
};
