# NobodyNamed site audit — 2026-08-15

Scope: design, UI/UX, content, performance, accessibility. Based on the codebase at `claude/site-audit-comprehensive-tc0963` (13 commits ahead of `master`, includes the recent homepage redesign) plus spot-checks against the live site at `nobodynamed.com`. Every finding below is anchored to a specific file so it's actionable without re-deriving context.

## Summary

The site is in noticeably good shape for a solo project: dark mode is implemented with a correct three-way override architecture, the homepage degrades gracefully without JS, nav is keyboard- and crawler-friendly via native `<details>`, name pages are server-rendered (no content waterfall), and the D1 layer already pre-computes the expensive aggregates (rankings, viz payloads) instead of paying for them on every request. The programmatic footprint is large and healthy — ~17,000 indexed URLs.

The issues found are narrow and concrete, not structural: one accessibility contrast failure that hits every homepage visit, one guaranteed layout-shift on the homepage hero, an alt-text inconsistency on two pages, and a font stack that silently degrades for the majority (non-Apple) audience. Each is listed with severity, location, and a fix.

---

## Accessibility

### 1. Tapestry meta text fails WCAG AA contrast (High)
`apps/web/public/assets/style.css:913-919` — `.tapestry-meta` renders at `font-size: 0.6rem` (~10.8px) in `var(--brand-faded-contrast)` (`#9a968a`) against the tapestry card background (`rgba(var(--surface-rgb), 0.6)` ≈ `#fbf8f1`, effectively the paper tone). Computed contrast ≈ **2.6:1** — well under the 4.5:1 AA minimum for normal text, and this isn't large text either. This class renders on every homepage load (the hero tapestry, `index.html:119`) and on every `/names/:decade/` hub page. Recommend darkening to at least `--ink-soft` or `--muted` and re-checking with a contrast tool.

### 2. Lede/body copy contrast is borderline (Medium)
`apps/web/public/assets/style.css:9-10` — `--muted` (`#787064`) on `--paper` (`#f4f0e7`) computes to ≈ **4.3:1**, just under the 4.5:1 AA threshold for normal-size text (it does clear the 3:1 large-text/UI-component bar). This token backs the `.lede` paragraphs used throughout — homepage section intros, decade hub copy, etc. A small shift (e.g., toward `#6b6459`) would clear AA with negligible visual change. Worth confirming with an actual checker (manual sRGB→luminance calc here, not tool-verified) before touching the token, since it's used broadly.

### 3. Wordmark alt-text inconsistency (Low, but real)
Every page template uses `alt=""` on the header wordmark logo because the parent `<a>` already carries `aria-label="NobodyNamed home"` — correct, avoids double-announcement. Two pages break the pattern:
- `apps/web/public/emerging.html:39` — `alt="nobodynamed"`
- `apps/web/public/fading.html:39` — `alt="nobodynamed"`

Screen reader users on these two pages hear "NobodyNamed home, nobodynamed" instead of the clean "NobodyNamed home" everywhere else. One-line fix each; check whichever script/template generated these two pages so the same drift doesn't recur.

### What's already solid (no action needed)
- Skip link (`index.html:50`), semantic landmarks (`<header>`, `<main>`, `<nav aria-label>`, `<footer>`), `aria-live="polite"` on the hero name-preview panel, `aria-expanded`/`aria-controls`/`role="listbox"` on the search combobox pattern, visible `:focus-visible` outlines on every interactive element (`style.css:137-144`), `prefers-reduced-motion` respected (`style.css:2157`), and the nav-as-`<details>` pattern keeps all links crawlable and keyboard-operable without JS.

---

## Performance

### 4. Homepage hero tapestry has no reserved space → guaranteed CLS (High)
`apps/web/public/index.html:119` renders `<div class="river-hero-tapestry" id="tapestry"></div>` empty; it's populated entirely client-side by `tapestry.js` after an async render call (`index.html:364-368`). The corresponding CSS (`style.css:844-848`) sets no `min-height` or `aspect-ratio`, so the container has zero height until JS finishes fetching/building the grid. On every homepage load, the layout shifts once the tapestry pops in — this is the single highest-traffic page, and layout shift there directly hits Core Web Vitals (CLS). Fix: reserve height with `min-height` (matching the eventual rendered grid height at each breakpoint) or `aspect-ratio`, sized from the CSS already defining `.tapestry-row-cards`' grid.

### 5. Blog hero image ships unoptimized and unsized (Medium)
`content/blog/press-start-to-name.md:12` renders `press-start-hero.png` (1200×630 PNG, 284KB — verified via `file`) at `width:100%;height:auto` with **no `width`/`height` HTML attributes**, so the browser can't reserve aspect-ratio space before the image loads → contributes to CLS on that post. Also, PNG is a poor codec choice for a photographic/illustrated hero at this size; converting to WebP (or AVIF) at equivalent quality would likely cut this to well under 100KB. Also used as the `og_image` for the post, so the conversion benefits both LCP and social-preview load time.

### What's already solid (no action needed)
- Static assets are reasonably sized after gzip: `style.css` (84KB raw) → 16KB gzipped, `app.js` (40KB raw) → 10.8KB gzipped. Not a bottleneck.
- `viz-thumbs/*.jpg` are correctly pre-sized to their display dimensions (e.g., 480×282 for a thumbnail slot), 20-48KB each — no oversized-image waste there.
- Name pages (`packages/shared/src/render-name.ts`) are SSR'd, not client-fetched — avoids a data waterfall on the highest-value template.
- The D1 architecture already solves the expensive class of performance problem at the source: `name_rankings_by_year` and `viz_payloads` turn multi-million-row aggregates into single PK reads (documented in `CLAUDE.md`), with version-matched fallback to the live query so a stale rebuild is never served.
- Cache-Control strategy is deliberate and correct: static HTML uses `s-maxage` + `stale-while-revalidate`, and `_middleware.ts` layers a synthetic-key Worker cache on top of Functions responses specifically to avoid the content-negotiation cache-collision bug it documents inline (`_middleware.ts:136-147`).

---

## Design

### 6. Primary typefaces are Apple-exclusive system fonts (Medium)
`apps/web/public/assets/style.css:37-39`:
```
--sans: "Avenir Next", Avenir, "Segoe UI", system-ui, sans-serif;
--serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
```
"Avenir Next" and "Iowan Old Style" only exist on macOS/iOS. Windows, Android, and Linux visitors — almost certainly the majority of a baby-name research audience — silently fall back to `Segoe UI`/generic `system-ui` and `Georgia`. The fallbacks aren't broken, but the distinctive editorial-serif identity that defines the brand (visible in every screenshot/mockup reviewed) is invisible to most actual visitors. Consider a self-hosted or Google Fonts pairing that ships everywhere (with `font-display: swap`), or accept the fallback deliberately and design/test against it rather than the Apple-only preview.

### What's already solid
- The three-way dark-mode override (`:root` → `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` → `:root[data-theme="dark"]`) is correctly layered so an explicit user choice always wins over OS preference in both directions, and "fixed" tokens (`--ink-fixed`, `--share-bg`) are deliberately excluded from the dark override with a comment explaining why — this is careful, well-documented work, not accidental correctness.
- The paper-texture background, halftone dot overlay, and ochre/red accent give the site a consistent, distinctive identity across every programmatic template (decade hubs, name pages, viz gallery) rather than just the marketing pages — this is a real differentiator against generic baby-name-list sites.

---

## UI/UX

### 7. Theme toggle is a 30×30px target next to the mobile nav trigger (Low)
`apps/web/public/assets/style.css:328-329` — `.theme-toggle { width: 30px; height: 30px; }`. This clears the WCAG 2.2 AA minimum (24×24px) but is below the widely-used 44×44px comfortable-tap guideline, and it sits directly beside the hamburger menu in the mobile header where a mis-tap is likely. Low severity since it's not a blocker, but cheap to fix (increase padding/hit area without changing the visible icon size).

### What's already solid
- The homepage's progressive-enhancement pattern is genuinely good practice: server-rendered fallback cards ship in the initial HTML (`radar-grid`, `graveyard-grid`, `popular-grid`), and client JS only *replaces* them if the D1-backed fetch succeeds (`index.html:370-416`) — a slow network or JS failure degrades to real content, never a blank section. Same instinct applies to the `<noscript>` tapestry fallback (`index.html:121-123`) and the `<noscript>` search-control CSS (`index.html:25-30`).
- Search UX (collapse/expand on focus, live inline preview with debounce and request-token guarding against race conditions, `index.html:286-320`) is a well-built interaction — the token-guard on `previewToken` specifically prevents a slow earlier request from clobbering a faster later one, which is easy to get wrong and wasn't here.
- Nav-as-`<details>` avoids a common trap (JS-dependent dropdown menus that break crawlability or keyboard access) — this is called out with intent in `render-shell.ts:65-67`.

---

## Content

### 8. Editorial voice is a genuine differentiator (strength, no action)
Spot-checked `content/blog/how-many-karens-are-left.md`: specific numbers, an inline data table, and a real point of view ("Karen is dated... it points at a birth decade the way a rotary phone points at a kitchen wall") rather than generic SEO filler. The live blog has 13 published posts (per sitemap), not the 8 files visible in `content/blog/` — that directory appears to hold planning drafts (`IDEAS.md`, `_template.md`) separate from the actual D1-backed CMS (`apps/web/functions/api/blog/admin.ts`), so the live content is healthier than a first glance at the repo suggests.

### 9. `/about` title tag runs long (Low)
`apps/web/public/about.html:7` — title is 73 characters ("About NobodyNamed — Baby Name Trends, History & Vital Status Since 1880"); Google's SERP display budget is roughly 60 characters / 580px, so this will truncate. Cosmetic, cheap to trim.

### 10. Programmatic content scale (worth monitoring, not a defect)
The sitemap carries ~17,000 URLs, almost entirely programmatic (`/name/:name/`, `/names/:decade/`, `/year/:year/`). This is a real SEO asset, but at this scale it's worth periodically spot-checking that low-data names (single-digit historical counts) still render pages with enough unique content to avoid reading as thin/duplicate to search engines — not something this audit could fully verify by hand, but worth a targeted pass (e.g., pulling a sample of the lowest-traffic name pages via Ahrefs' Page Explorer) rather than assuming uniformly.

---

## Priority order (if only fixing a few things)

1. **Tapestry contrast fix** (#1) — accessibility failure on every homepage view, one CSS token change.
2. **Tapestry CLS fix** (#4) — Core Web Vitals hit on the homepage, one CSS rule (`min-height`/`aspect-ratio`).
3. **Wordmark alt-text fix** (#3) — two-line fix, removes an inconsistency screen reader users will notice.
4. **Blog hero image** (#5) — convert to WebP, add explicit dimensions.
5. Everything else is lower severity or already a documented tradeoff (font stack, muted-text contrast) worth a deliberate decision rather than a reflexive fix.
