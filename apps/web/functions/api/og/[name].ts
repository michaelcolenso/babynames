// GET /api/og/:name  — SVG social card for og:image meta tags.
// 1200×630 px editorial card, name + status pill + sparkline + stats.
// Works on Slack, iMessage, WhatsApp, Discord, LinkedIn, Facebook.
// Twitter/X requires a raster PNG — add @cf-wasm/og for that upgrade.

import { getMeta, getNameSpark, META_KEYS, decodeSpark } from "@nv/shared";
import type { PagesFunction, D1Database } from "@cloudflare/workers-types";
import type { Status, Sex } from "@nv/shared";

interface Env {
  DB: D1Database;
}

const STATUS_COLOR: Record<Status, string> = {
  rising: "#067d4a",
  stable: "#475569",
  declining: "#b7791f",
  endangered: "#b42318",
  extinct: "#2a2a2a",
};

const STATUS_LABEL: Record<Status, string> = {
  rising: "RISING",
  stable: "STABLE",
  declining: "STABLE DECLINE",
  endangered: "ENDANGERED",
  extinct: "EXTINCT",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtNum(n: number): string {
  if (n === 0) return "0";
  return n.toLocaleString("en-US");
}

function yearMarkers(ym: number, yM: number, sx: number, ty: number, sw: number): string {
  const span = yM - ym;
  if (span <= 0) return "";
  const step = span > 80 ? 30 : 20;
  let out = "";
  const start = Math.ceil(ym / step) * step;
  for (let y = start; y <= yM; y += step) {
    const x = sx + ((y - ym) / span) * sw;
    out += `<text x="${x.toFixed(1)}" y="${ty}" font-family="monospace" font-size="13" ` +
      `fill="rgba(247,239,225,0.35)" text-anchor="middle">${y}</text>`;
  }
  return out;
}

function buildOgSvg(
  name: string,
  sex: Sex,
  status: Status,
  peakYear: number,
  peakCount: number,
  latestCount: number,
  firstYear: number,
  yM: number,
  spark: number[],
): string {
  const W = 1200, H = 630;
  const sx = 80, sy = 360, sw = W - 160, sh = 140;

  const max = Math.max(1, ...spark);
  let linePath = "";
  let fillPath = "";
  for (let i = 0; i < spark.length; i++) {
    const x = sx + (i / Math.max(1, spark.length - 1)) * sw;
    const y = sy + sh - (spark[i]! / max) * sh;
    linePath += `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  fillPath = linePath +
    `L${(sx + sw).toFixed(1)},${(sy + sh).toFixed(1)}` +
    `L${sx.toFixed(1)},${(sy + sh).toFixed(1)}Z`;

  let peakIdx = 0;
  for (let i = 0; i < spark.length; i++) if ((spark[i] ?? 0) > (spark[peakIdx] ?? 0)) peakIdx = i;
  const peakX = sx + (peakIdx / Math.max(1, spark.length - 1)) * sw;
  const peakY = sy + sh - ((spark[peakIdx] ?? 0) / max) * sh;

  const color = STATUS_COLOR[status];
  const label = STATUS_LABEL[status];
  const pillW = label.length * 11 + 36;
  const sexLabel = sex === "M" ? "Masculine" : "Feminine";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#d9a56f" stop-opacity="0.30"/>
    <stop offset="100%" stop-color="#d9a56f" stop-opacity="0.04"/>
  </linearGradient>
  <pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.45" fill="rgba(247,239,225,0.16)"/>
  </pattern>
</defs>
<rect width="${W}" height="${H}" fill="#171511"/>
<rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.45"/>
<path d="M80 510H1120" stroke="rgba(247,239,225,0.16)"/>
<text x="80" y="66" font-family="monospace" font-size="17" fill="#d9a56f" letter-spacing="4" font-weight="700">NOBODYNAMED / NAME VITALS</text>
<text x="80" y="185" font-family="Georgia,serif" font-size="108" fill="#f7efe1" font-weight="500">${esc(name.toUpperCase())}</text>
<text x="80" y="229" font-family="Georgia,serif" font-size="24" fill="rgba(247,239,225,0.68)">${esc(sexLabel)} · ${firstYear}–${yM}</text>
<rect x="80" y="254" width="${pillW}" height="36" rx="18" fill="${esc(color)}"/>
<text x="${80 + pillW / 2}" y="278" font-family="monospace" font-size="15" fill="white" text-anchor="middle" font-weight="600">${esc(label)}</text>
<line x1="${sx}" y1="${sy + sh}" x2="${sx + sw}" y2="${sy + sh}" stroke="rgba(247,239,225,0.15)" stroke-width="1"/>
<path d="${esc(fillPath)}" fill="url(#sg)"/>
<path d="${esc(linePath)}" fill="none" stroke="#d9a56f" stroke-width="2.8"/>
<circle cx="${peakX.toFixed(1)}" cy="${peakY.toFixed(1)}" r="7" fill="#f1d18a"/>
${yearMarkers(firstYear, yM, sx, sy + sh + 20, sw)}
<text x="80" y="570" font-family="Georgia,serif" font-size="25" fill="#f7efe1">Peak: ${peakYear} · ${fmtNum(peakCount)}</text>
<text x="${W - 80}" y="570" font-family="Georgia,serif" font-size="25" fill="${latestCount === 0 ? "#d9a56f" : "#f7efe1"}" text-anchor="end">${yM}: ${fmtNum(latestCount)}</text>
<text x="${W - 80}" y="612" font-family="monospace" font-size="16" fill="rgba(217,165,111,0.75)" text-anchor="end">nobodynamed.com</text>
</svg>`;
}

export const onRequestGet: PagesFunction<Env, "name"> = async (ctx) => {
  const raw = ctx.params.name;
  if (typeof raw !== "string" || !raw) {
    return new Response("missing name", { status: 400 });
  }
  const nameLower = decodeURIComponent(raw).toLowerCase();

  const [row, yMStr] = await Promise.all([
    getNameSpark(ctx.env.DB, nameLower),
    getMeta(ctx.env.DB, META_KEYS.maxYear),
  ]);

  if (!row) {
    return new Response("not found", { status: 404 });
  }

  const yM = Number(yMStr ?? row.last_year);
  const spark = row.spark_blob ? decodeSpark(row.spark_blob) : new Array(60).fill(0);

  const svg = buildOgSvg(
    row.name,
    row.sex,
    row.status,
    row.peak_year,
    row.peak_count,
    row.latest_count,
    row.first_year,
    yM,
    spark,
  );

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
};
