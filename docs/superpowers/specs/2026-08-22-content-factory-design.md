# Content Factory — Design Spec

**Date:** 2026-08-22
**Status:** Draft for review
**Owner:** NobodyNamed repo (~/projects/babynames)

## 1. Problem

nobodynamed.com has 30 hand-built viz pages and 5 hand-written blog posts.
Nothing generates either from the dataset. The one programmatic generator
(`scripts/gen-one-hit-wonder-post.ts`) proves the pattern but hardcodes its
series data — it cannot produce the next artifact.

Goal: one content definition emits **both** a viz page and a blog post, with
real computed numbers, through a deterministic, tested, PR-gated pipeline.
Run on demand via CLI first; cron/dispatcher triggers come after the
foundation is proven.

## 2. Current state (verified)

- **Viz pages:** `apps/web/public/viz/*.html` — static shells (house nav,
  viz-theme CSS, d3) that fetch `/api/<slug>` payloads at runtime. Payloads
  are precomputed into D1 `viz_payloads` (`computeVizPayload` /
  `writeVizPayload` in `@nv/shared`, backfilled by
  `scripts/backfill-viz-payloads.ts`); API routes use `getVizPayload` with a
  live-compute fallback. D1 writes are an approval gate.
- **Blog:** `content/blog/*.md` (frontmatter) → `scripts/blog-publish.ts`
  compiles to SQL migration → `npm run blog:apply:remote` writes D1
  `blog_posts`. Pipeline supports raw-HTML blocks and inline SVG, so generated
  chart panels work today.
- **Generator precedent:** `gen-one-hit-wonder-post.ts` renders real
  sparklines via `buildSparkline()` from `@nv/shared` — but its `names[]`
  array is hardcoded and its output is bare bodyHtml (no frontmatter/
  migration). The drafted copy (Kunta 1977 → 215, Arsenio 1989 → 397, Moesha
  1996 → 426, Jkwon 2004 → 100, Bethzy 2006 → 301, Neymar 2014 → 499) was
  never published — no migration exists.
- **Data:** `extra/baby-names.csv` (~258k rows, year,name,percent,sex) +
  `extra/totals.csv`. Births = percent × year total. Full SSA dump is local
  and free to compute against.
- **Backlog:** `content/blog/IDEAS.md` — 20+ GSC-validated ideas tagged by
  data lever (living population, median age, wave topology, catalysts,
  diaspora). House voice: stark number, short declarative sentences,
  sociological read, link to `/name/X/`, one inline visual.

## 3. Architecture

```
content-definitions.ts (typed registry)
        │
        ▼
factory-compute.ts (pure functions over CSV) ──► real numbers
        │
        ▼
factory-build.ts (builder: emit artifacts)
   ├─ viz:  render-factory-viz.ts  → apps/web/public/viz/<slug>.html  (data embedded)
   └─ post: render-factory-post.ts → content/blog/<slug>.md            (inline SVG charts)
        │
        ▼
CLI: npm run content:gen -- --item <slug> | --all | --check
        │
        ▼
PR (no D1 mutation) → review → merge/deploy (approval gate)
```

**Design rules**

- One `ContentDefinition` per artifact family. `kind: "viz" | "post" | "both"`.
- Compute is pure and deterministic — same CSV in, same artifacts out.
- Editorial copy is bound to computed values; a build-time check fails if a
  quoted figure no longer matches the data (provenance binding, per the
  programmatic-content-rollouts pattern already used for decade hubs).
- v1 writes **no D1**: viz pages embed their computed JSON (the `explore.html`
  524KB inline-data precedent); posts go through the existing
  `blog:publish` → migration flow, which is already approval-gated.
- Every generated page/post passes the repo verification matrix: one H1,
  canonical, valid JSON-LD, no `undefined`/`NaN`, no leaked literals, chart
  fallback without JS, mobile overflow check (≤390px).

## 4. Definition schema (v1)

```ts
// packages/shared/src/content/content-definitions.ts
export interface ContentDefinition {
  slug: string;                       // kebab-case; also the viz/post slug
  kind: "viz" | "post" | "both";
  title: string;
  description: string;                // meta description + post fallback desc
  compute: ComputeSpec;               // family + params (see §5)
  editorial: EditorialSpec;           // copy templates, chart panel layout
  rolloutState: "draft" | "reviewed" | "published";
  sourceVersion: string;              // ssa-national-2025 binding
  asserts?: Array<{ claim: string; numeric: number; tolerance?: number }>;
}
```

`EditorialSpec` v1 keeps short copy in the definition (title, intro,
per-section hooks) but long-form post prose lives in a markdown body
template at `content/blog/templates/<slug>.body.md`. The template carries
`{{claim:key}}` placeholders for computed values and
`{{panel:name.sex}}` chart-panel markers; the interpolator is the only way
numbers enter prose, so prose can never drift from data. `asserts` still
fail the build if a quoted figure no longer matches the data.

## 5. Compute core (v1)

`packages/shared/src/content/factory-compute.ts` — pure functions over the
CSV, tested on fixtures:

- `loadNames(rows)` → per-name series + births (percent × year total)
- `detectFlashFloods(series, opts)` — the v1 detector:
  - peak ≥ `minPeak` (default 100 births, or configurable)
  - peak occurs within `peakWindow` years of debut (default 2)
  - count decays to ≤ `decayRatio` of peak within `decayYears` (default 5)
  - returns: name, sex, firstYear, peakYear, peakCount, decaySeries, status
- `verifyAssertions(asserts, computed)` — build-time check that every
  editorial claim matches the data (fail on mismatch).

Later families add functions (median-age leaderboards, catalyst impact, etc.)
without changing the build contract.

## 6. Renderers

- **`render-factory-viz.ts`** — emits a complete static HTML page matching the
  viz house style (nav, `viz-theme.css`, theme script, d3 from CDN), with:
  title/meta/OG/canonical, one H1, JSON-LD (WebPage + Dataset),
  `data-content-id` / `data-content-type` (extend the `ContentType` union),
  embedded computed JSON, one d3 sparkline panel per family member, and a
  no-JS fallback (static table of the same numbers).
- **`render-factory-post.ts`** — reads `content/blog/templates/<slug>.body.md`,
  interpolates `{{claim:key}}` values and `{{panel:...}}` markers (chart
  panels use `buildSparkline()` SVGs), prepends frontmatter (title, date,
  description, author, og_image, status), and emits
  `content/blog/<slug>.md` — exactly what `blog-publish.ts` already accepts
  (raw HTML blocks + inline SVG).

## 7. CLI

```
npm run content:gen -- --item flash-floods          # one definition
npm run content:gen -- --all                        # every draft definition
npm run content:gen -- --check                      # validate registry + asserts
npm run content:gen -- --item flash-floods --out /tmp/staging   # dry output
```

`--check` validates definitions and runs `verifyAssertions` against live
computed data. Default output paths: `apps/web/public/viz/`,
`content/blog/`, plus a migration file when a post is emitted
(`npm run blog:publish` equivalent). No network calls, no D1 writes.

## 8. First family: flash-floods (one-hit wonders)

Definition `flash-floods`, `kind: "both"`:

1. **Compute:** run `detectFlashFloods` over the full SSA dump.
2. **Viz:** `apps/web/public/viz/flash-floods.html` — a generated gallery of
   every detected flood name (charts from computed series, not hardcoded).
   New page; does not clobber the hand-built `pop-culture-names.html`.
3. **Post:** `content/blog/one-hit-wonder-names.md` — reuse the drafted
   six-name copy (Kunta, Arsenio, Moesha, Jkwon, Bethzy, Neymar) with numbers
   **recomputed and verified** against the CSV via `asserts`. Any drift from
   the draft's figures is flagged in the PR (the draft was hand-written
   against a different computation).
4. **Ship:** PR with generated artifacts + tests; no D1 write, no deploy.

Why this family: proven copy, proven visual pattern, exercises the full
coupled pipeline end-to-end, and ships a drafted-but-unpublished post.

## 9. Testing & verification

- `scripts/content-factory.test.ts` (wired into `npm test`): definition
  validation (unique slugs, valid kinds), compute correctness on fixture CSV,
  render determinism (no `undefined`/`NaN`), `asserts` verification,
  generated-post passes `compileBlogPost()`.
- Browser check per the repo's render-verification reference: serve generated
  viz page, screenshot desktop + 390px, assert no horizontal scroll, charts
  render, no-JS fallback present.
- If the factory touches `style.css` → cache-bust bump (repo rule).

## 10. Rollout & gates

- Generated artifacts ship via PR (agents may branch/test/push/open PRs).
- Merge, deploy, D1 mutation, cache purge: explicit approval gates (Michael).
- `rolloutState` transitions: `draft → reviewed → published`, flipped by
  parent after review, mirroring the decade-hub convention.
- No cron and no GSC-dispatcher integration in v1; the CLI contract is the
  seam those triggers will call later.

## 11. Out of scope (v1)

- Cron scheduling / dispatcher lane integration.
- New D1 payload keys or API routes (embed-in-page is enough; the
  `viz_payloads` seam exists for when freshness demands it).
- State-level families (`data/raw/ssa-state` is empty — defer until pulled).
- Median-age / living-population families (need enrichment tables; the
  compute contract supports them later).
- Absorbing the 30 existing hand-built viz pages into the registry (follow-up
  parity work per programmatic-content-rollouts, not part of the first build).

## 12. Open decisions for review

1. First family = flash-floods + the unpublished one-hit-wonder post — OK?
2. Embed computed data in the static viz page (no D1 write) for v1 — OK?
3. Registry lives in `packages/shared/src/content/content-definitions.ts` —
   OK?
