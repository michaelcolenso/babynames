// GET /api/og/blog/:slug  — PNG social card for blog posts.
// 1200×630 px editorial card: eyebrow + wrapped title + description + byline.

import { getBlogPost } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import type { BlogPost } from "@nv/shared";
import { svgToPng } from "../_wasm";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

// Greedy word-wrap using an average glyph-width estimate (no font metrics in
// resvg). Conservative factor keeps lines inside the box; returns at most
// `maxLines`, ellipsizing the last line when text overflows.
function wrap(text: string, fontSize: number, maxWidth: number, maxLines: number): string[] {
  const maxChars = Math.max(6, Math.floor(maxWidth / (fontSize * 0.52)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  let truncated = false;

  for (let i = 0; i < words.length; i++) {
    const cand = cur ? `${cur} ${words[i]}` : words[i]!;
    if (cand.length > maxChars && cur) {
      lines.push(cur);
      cur = words[i]!;
      if (lines.length === maxLines) {
        cur = "";
        truncated = true;
        break;
      }
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);

  if (truncated && lines.length) {
    let last = lines[lines.length - 1]!;
    if (last.length > maxChars - 1 && last.includes(" ")) last = last.slice(0, last.lastIndexOf(" "));
    lines[lines.length - 1] = `${last.replace(/[.,;:!?]+$/, "")}…`;
  }
  return lines;
}

function titleFontSize(len: number): number {
  if (len <= 22) return 78;
  if (len <= 40) return 64;
  if (len <= 64) return 54;
  return 46;
}

function buildBlogOgSvg(post: BlogPost): string {
  const W = 1200,
    H = 630;
  const x = 80;
  const contentW = W - 160;

  const tSize = titleFontSize(post.title.length);
  const tLineH = Math.round(tSize * 1.16);
  const titleLines = wrap(post.title, tSize, contentW, 4);

  let y = 200;
  const titleSvg = titleLines
    .map((line, i) => {
      const ly = y + i * tLineH;
      return `<text x="${x}" y="${ly}" font-family="Georgia,serif" font-size="${tSize}" fill="#f7efe1" font-weight="500">${esc(line)}</text>`;
    })
    .join("");
  y += titleLines.length * tLineH + 18;

  const descLines = post.description ? wrap(post.description, 27, contentW, 2) : [];
  const descSvg = descLines
    .map((line, i) => {
      const ly = y + i * 38;
      return `<text x="${x}" y="${ly}" font-family="Georgia,serif" font-size="27" fill="rgba(247,239,225,0.62)">${esc(line)}</text>`;
    })
    .join("");

  const date = fmtDate(post.publishedAt);
  const byParts = [post.author ? `By ${post.author}` : "", date].filter(Boolean);
  const byline = byParts.join("  ·  ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<defs>
  <pattern id="grain" width="5" height="5" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="0.45" fill="rgba(247,239,225,0.16)"/>
  </pattern>
</defs>
<rect width="${W}" height="${H}" fill="#171511"/>
<rect width="${W}" height="${H}" fill="url(#grain)" opacity="0.45"/>
<rect x="${x}" y="48" width="46" height="4" fill="#d9a56f"/>
<text x="${x}" y="92" font-family="monospace" font-size="17" fill="#d9a56f" letter-spacing="4" font-weight="700">NOBODYNAMED / NAMECALLING</text>
${titleSvg}
${descSvg}
<path d="M${x} 540H${W - x}" stroke="rgba(247,239,225,0.16)"/>
<text x="${x}" y="582" font-family="Georgia,serif" font-size="24" fill="rgba(247,239,225,0.7)">${esc(byline)}</text>
<text x="${W - x}" y="582" font-family="monospace" font-size="16" fill="rgba(217,165,111,0.75)" text-anchor="end">nobodynamed.com</text>
</svg>`;
}

export const onRequestGet: PagesFunction<Env, "slug"> = async (ctx) => {
  const raw = ctx.params.slug;
  if (typeof raw !== "string" || !raw) {
    return new Response("missing slug", { status: 400 });
  }

  const post = await getBlogPost(ctx.env.DB, decodeURIComponent(raw));
  if (!post) {
    return new Response("not found", { status: 404 });
  }

  const png = await svgToPng(buildBlogOgSvg(post));
  return new Response(png, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, s-maxage=604800, stale-while-revalidate=86400",
    },
  });
};

export const onRequestHead: PagesFunction<Env, "slug"> = async (ctx) => withoutBody(await onRequestGet(ctx));

function withoutBody(response: Response): Response {
  return new Response(null, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
