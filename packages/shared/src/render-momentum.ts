// Server-side renderer for the /emerging and /fading momentum hubs. Ships
// crawlable HTML — real <a href="/name/…/"> links in the initial response —
// as a card grid (not a table, which doesn't reflow well on mobile), instead
// of relying on client-side JS (renderMomentumGrid in landing.js) to build it
// after load. Kept in sync with assets/landing.js so the SSR grid and the
// client re-render are visually identical.

import { contentId, contentIdentityMeta } from "./content-identity";
import type { MomentumDirection, MomentumRow } from "./schema";

// The SSA suppresses counts below 5 births/year, so 5 is the visible floor
// every momentum signal is measured against.
export const MOMENTUM_FLOOR = 5;

// Cards below this latest-window count get a visual "critical" flag —
// mirrors the reference prototypes' cutoff for names close to going dark.
export const MOMENTUM_CRITICAL_THRESHOLD = 10;

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : Number(n).toLocaleString("en-US");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Mini 5-point signal sparkline (y1..y5) with a dashed floor line at
// count=5, a gradient-fading trend line, and an end marker. Mirror of
// momentumSpark() in assets/landing.js — id must be unique per SVG on the
// page, so callers pass the row's position in the rendered list.
export function momentumSpark(row: MomentumRow, gradId: string): string {
  const w = 196;
  const h = 44;
  const pad = 4;
  const values = [row.y1, row.y2, row.y3, row.y4, row.y5];
  const max = Math.max(MOMENTUM_FLOOR, ...values, 8);
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * innerW;
    const y = pad + innerH - (v / max) * innerH;
    return [x, y] as const;
  });
  const floorY = pad + innerH - (MOMENTUM_FLOOR / max) * innerH;
  const path = points.map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1)).join("");
  const [lastX, lastY] = points[points.length - 1]!;
  const color = row.sex === "M" ? "var(--amber)" : "var(--emerald)";
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark momentum-spark">
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="1"/>
    </linearGradient></defs>
    <line x1="${pad}" y1="${floorY.toFixed(1)}" x2="${w - pad}" y2="${floorY.toFixed(1)}" class="spark-floor"/>
    <path class="line" d="${path}" stroke="url(#${gradId})"/>
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6" fill="${color}"/>
  </svg>`;
}

function renderCard(direction: MomentumDirection, r: MomentumRow, gradId: string): string {
  const linkTo = `/name/${encodeURIComponent(r.name)}/`;
  const name = escapeHtml(r.name);
  const sexClass = r.sex === "M" ? "momentum-sex-m" : "momentum-sex-f";
  const sexLabel = r.sex === "M" ? "Boy" : "Girl";
  const critical = r.y5 < MOMENTUM_CRITICAL_THRESHOLD ? " momentum-critical" : "";
  const spark = momentumSpark(r, gradId);

  const meta = direction === "rising"
    ? `<span>${r.firstYear} → ${fmt(r.y5)}</span><span class="momentum-secondary">momentum ${fmt(r.momentum)}</span>`
    : `<span>peak ${r.peakYear}</span><span class="momentum-secondary">${fmt(r.peakCount)} → ${fmt(r.y5)}</span>`;

  const etaLabel = direction === "fading" && r.etaYear
    ? `<div class="momentum-card-eta">↓ ${r.etaYear <= r.peakYear ? "already at the floor" : `est. below floor by ${r.etaYear}`}</div>`
    : "";

  return `<article class="momentum-card${critical}" data-sex="${r.sex}">
    <div class="momentum-card-top">
      <a href="${linkTo}" class="momentum-card-name">${name}</a>
      <span class="momentum-sex-badge ${sexClass}">${sexLabel}</span>
    </div>
    <div class="momentum-card-spark">${spark}</div>
    <div class="momentum-card-meta">${meta}</div>
    ${etaLabel}
  </article>`;
}

// Full card grid, matching assets/landing.js renderMomentumGrid() output.
export function renderMomentumGridHTML(direction: MomentumDirection, rows: MomentumRow[]): string {
  const slug = direction === "rising" ? "emerging" : "fading";
  const identityMeta = contentIdentityMeta({
    contentId: contentId("article", slug),
    contentType: "article",
    slug,
  });
  if (rows.length === 0) {
    return `<div class="momentum-grid" ${identityMeta}><div class="momentum-empty">no signals match — try clearing filters</div></div>`;
  }
  const cards = rows.map((r, i) => renderCard(direction, r, `mgrad-${slug}-${i}`)).join("");
  return `<div class="momentum-grid" ${identityMeta}>${cards}</div>`;
}
