// Server-side renderer for the /emerging and /fading momentum hubs. Ships
// crawlable HTML — real <a href="/name/…/"> links in the initial response —
// instead of relying on client-side JS (renderMomentumTable in landing.js)
// to build the table after load. Kept in sync with assets/landing.js so the
// SSR table and the client re-render are visually identical.

import { contentId, contentIdentityMeta } from "./content-identity";
import type { MomentumDirection, MomentumRow } from "./schema";

// The SSA suppresses counts below 5 births/year, so 5 is the visible floor
// every momentum signal is measured against.
export const MOMENTUM_FLOOR = 5;

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
// count=5. Mirror of momentumSpark() in assets/landing.js.
function momentumSpark(row: MomentumRow): string {
  const w = 120;
  const h = 28;
  const values = [row.y1, row.y2, row.y3, row.y4, row.y5];
  const max = Math.max(MOMENTUM_FLOOR, ...values);
  const yFor = (v: number) => h - (v / max) * (h - 2) - 1;
  let path = "";
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + yFor(values[i]!).toFixed(1);
  }
  const floorY = yFor(MOMENTUM_FLOOR).toFixed(1);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark momentum-spark">` +
    `<line x1="0" y1="${floorY}" x2="${w}" y2="${floorY}" class="spark-floor"/>` +
    `<path class="line" d="${path}"/>` +
    `</svg>`;
}

const HEADERS: Record<MomentumDirection, string> = {
  rising: `<tr><th>Name</th><th class="num">First seen</th><th class="num">Latest</th><th class="num">Momentum</th><th>Signal</th><th></th></tr>`,
  fading: `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">Est. floor year</th><th>Signal</th><th></th></tr>`,
};

function renderRow(direction: MomentumDirection, r: MomentumRow): string {
  const linkTo = `/name/${encodeURIComponent(r.name)}/`;
  const name = escapeHtml(r.name);
  const sexClass = r.sex === "M" ? "momentum-sex-m" : "momentum-sex-f";
  const nameCell = `<td><a href="${linkTo}">${name}</a> <span class="meta ${sexClass}">${r.sex}</span></td>`;
  const spark = `<td class="sparkcell">${momentumSpark(r)}</td>`;
  const cta = `<td><a href="${linkTo}">Details →</a></td>`;
  if (direction === "rising") {
    return `<tr>${nameCell}<td class="num">${r.firstYear}</td><td class="num">${fmt(r.y5)}</td><td class="num">${fmt(r.momentum)}</td>${spark}${cta}</tr>`;
  }
  return `<tr>${nameCell}<td class="num">${r.peakYear}</td><td class="num">${fmt(r.peakCount)}</td><td class="num">${r.etaYear ?? "—"}</td>${spark}${cta}</tr>`;
}

// Full table, matching assets/landing.js renderMomentumTable() output.
export function renderMomentumTableHTML(direction: MomentumDirection, rows: MomentumRow[]): string {
  const body = rows.map((r) => renderRow(direction, r)).join("");
  const slug = direction === "rising" ? "emerging" : "fading";
  const identityMeta = contentIdentityMeta({
    contentId: contentId("article", slug),
    contentType: "article",
    slug,
  });
  return `<table class="table" ${identityMeta}><thead>${HEADERS[direction]}</thead><tbody>${body}</tbody></table>`;
}
