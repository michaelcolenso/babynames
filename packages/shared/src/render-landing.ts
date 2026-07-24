// Server-side renderers for the landing hubs (/extinct, /endangered, /rising,
// /comeback) and the /year index. These exist so the hub pages ship crawlable
// HTML — real <a href="/name/…/"> and <a href="/year/…/"> links in the initial
// response — instead of relying on client-side JS (renderLandingTable in
// landing.js) to build the table after load. The markup here is kept in sync
// with assets/landing.js so the SSR table and the (optional) client re-render
// are visually identical.

import { contentId, contentIdentityMeta } from "./content-identity";
import type { LandingRow } from "./schema";

export type LandingTableKind = "extinct" | "endangered" | "rising" | "comeback";

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

// Mirror of miniSpark() in assets/landing.js.
function miniSpark(spark: number[] | undefined): string {
  const w = 120;
  const h = 28;
  if (!spark || !spark.length) return "";
  const max = Math.max(1, ...spark);
  let path = "";
  for (let i = 0; i < spark.length; i++) {
    const x = (i / Math.max(1, spark.length - 1)) * w;
    const y = h - (spark[i]! / max) * (h - 2) - 1;
    path += (i === 0 ? "M" : "L") + x.toFixed(1) + "," + y.toFixed(1);
  }
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="spark"><path class="line" d="${path}"/></svg>`;
}

const HEADERS: Record<LandingTableKind, (yM: number) => string> = {
  extinct: () =>
    `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">Last year on record</th><th>Trajectory</th><th></th></tr>`,
  endangered: (yM) =>
    `<tr><th>Name</th><th class="num">Peak year</th><th class="num">Peak</th><th class="num">${yM}</th><th class="num">Decline</th><th>Trajectory</th><th></th></tr>`,
  rising: (yM) =>
    `<tr><th>Name</th><th class="num">${yM}</th><th class="num">Prev decade</th><th class="num">This decade</th><th class="num">Growth</th><th>Trajectory</th><th></th></tr>`,
  comeback: (yM) =>
    `<tr><th>Name</th><th class="num">Peaked</th><th class="num">Peak</th><th class="num">${yM}</th><th class="num">Growth</th><th>Trajectory</th><th></th></tr>`,
};

function renderRow(kind: LandingTableKind, r: LandingRow): string {
  const linkTo = `/name/${encodeURIComponent(r.name)}/`;
  const name = escapeHtml(r.name);
  const spark = `<td class="sparkcell">${miniSpark(r.spark)}</td>`;
  const cta = `<td><a href="${linkTo}">Details →</a></td>`;
  const nameCell = `<td><a href="${linkTo}">${name}</a> <span class="meta">${r.sex}</span></td>`;
  if (kind === "extinct") {
    return `<tr>${nameCell}<td class="num">${r.peakYear}</td><td class="num">${fmt(r.peakCount)}</td><td class="num">${r.lastYearSeen ?? "—"}</td>${spark}${cta}</tr>`;
  }
  if (kind === "endangered") {
    return `<tr>${nameCell}<td class="num">${r.peakYear}</td><td class="num">${fmt(r.peakCount)}</td><td class="num">${fmt(r.latestCount)}</td><td class="num">−${r.declinePct ?? 0}%</td>${spark}${cta}</tr>`;
  }
  if (kind === "comeback") {
    return `<tr>${nameCell}<td class="num">${r.peakYear}</td><td class="num">${fmt(r.peakCount)}</td><td class="num">${fmt(r.latestCount)}</td><td class="num">${r.growthX ? r.growthX + "×" : "—"}</td>${spark}${cta}</tr>`;
  }
  // rising
  return `<tr>${nameCell}<td class="num">${fmt(r.latestCount)}</td><td class="num">${fmt(r.prevDecadeTotal)}</td><td class="num">${fmt(r.currDecadeTotal)}</td><td class="num">${r.growthX ? r.growthX + "×" : "—"}</td>${spark}${cta}</tr>`;
}

// Full table, matching assets/landing.js renderLandingTable() output.
export function renderLandingTableHTML(
  kind: LandingTableKind,
  rows: LandingRow[],
  yM: number,
): string {
  const body = rows.map((r) => renderRow(kind, r)).join("");
  const identityMeta = contentIdentityMeta({
    contentId: contentId("article", kind),
    contentType: "article",
    slug: kind,
  });
  return `<table class="table" ${identityMeta}><thead>${HEADERS[kind](yM)}</thead><tbody>${body}</tbody></table>`;
}

// Crawlable index of every birth-year page, grouped by decade. Rendered into
// the /year hub so the 1880–present year pages are reachable as real links
// rather than only via the client-side year picker.
export function renderYearIndexHTML(ym: number, yM: number): string {
  const startDecade = Math.floor(ym / 10) * 10;
  const endDecade = Math.floor(yM / 10) * 10;
  const groups: string[] = [];
  for (let d = startDecade; d <= endDecade; d += 10) {
    const links: string[] = [];
    for (let y = Math.max(d, ym); y < d + 10 && y <= yM; y++) {
      links.push(`<a href="/year/${y}/">${y}</a>`);
    }
    if (links.length) {
      groups.push(`<div class="year-decade"><h3>${d}s</h3><div class="year-links">${links.join("")}</div></div>`);
    }
  }
  const identityMeta = contentIdentityMeta({
    contentId: contentId("article", "year"),
    contentType: "article",
    slug: "year",
  });
  return `<section class="year-index" aria-label="Browse every birth year" ${identityMeta}>
    <h2>Browse every year, ${ym}–${yM}</h2>
    <div class="year-index-grid">${groups.join("")}</div>
  </section>`;
}
