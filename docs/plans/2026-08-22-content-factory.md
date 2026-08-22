# Content Factory Implementation Plan

> **For Hermes:** Implement parent-side, TDD per task. Do not delegate (subagent instability per project-state).

**Goal:** One content definition → both a viz page and a blog post, computed from real SSA data.

**Architecture:** Typed registry (`packages/shared/src/content/content-definitions.ts`) → pure compute core (`factory-compute.ts`) → two renderers → CLI (`scripts/content-gen.ts`). Artifacts: `apps/web/public/viz/<slug>.html` (pageShell-based, data embedded) and `content/blog/<slug>.md` (frontmatter + interpolated body template).

**Tech Stack:** TypeScript, tsx tests (repo convention), no new deps. Reuses `buildSparkline`, `pageShell`, `contentId`/`contentIdentityMeta`, `compileBlogPost`.

---

## Task 1: Factory types

**Files:** Create `packages/shared/src/content/factory-types.ts`; export from `packages/shared/src/index.ts`.

```ts
export type FactoryKind = "viz" | "post" | "both";
export type RolloutState = "draft" | "reviewed" | "published";

export interface FlashFloodMember {
  name: string; sex: string;
  firstYear: number; peakYear: number; peakCount: number;
  lastYear: number; lastCount: number;
  series: Record<number, number>;
}

export interface ComputeSpec {
  family: "flash-floods";
  minPeak?: number;      // default 100
  peakWindow?: number;   // default 2
  decayRatio?: number;   // default 0.2
  decayYears?: number;   // default 5
  limit?: number;        // max members in viz gallery
}

export type ClaimValue = number | string;

export interface ContentDefinition {
  slug: string;
  kind: FactoryKind;
  title: string;
  description: string;
  sourceVersion: string;
  rolloutState: RolloutState;
  compute: ComputeSpec;
  claims: Record<string, (members: FlashFloodMember[], meta: { totalNames: number }) => ClaimValue>;
  asserts?: Array<{ key: string; equals?: ClaimValue; approx?: [number, number] }>;
}
```

Test: `packages/shared/src/content/factory-types.test.ts` — compile-only smoke via tsx (types are erased; assert the module imports). Wire into package.json later (Task 6).

Commit: `feat: factory types`

## Task 2: CSV loader + compute core

**Files:** Create `packages/shared/src/content/factory-compute.ts` + test.

Functions:
- `parseSsaCsv(text: string): SsaRow[]` — `{year,name,percent,sex}`; lowercase-keyed grouping happens downstream.
- `computeFlashFloods(rows: SsaRow[], totals: Map<number, number>, spec): { members: FlashFloodMember[]; totalNames: number }`
  - births = percent × totals[year]; group by `${name.toLowerCase()}|${sex}`
  - firstYear/peakYear/peakCount from series
  - flood if `peakCount >= minPeak && (peakYear - firstYear) <= peakWindow && countAt(peakYear+decayYears) <= peakCount*decayRatio`
  - sort by peakCount desc; `limit` truncates members for the gallery but keep full list for stats.

Tests with fixture rows: one flood name (sharp spike then decay), one steady riser (excluded), one late-peaking name (excluded), boundary cases at exactly minPeak / window edge. Deterministic ordering assertion.

Run: `npx tsx --test packages/shared/src/content/factory-compute.test.ts` — expect fail → implement → pass.

Commit: `feat: flash-flood detector over SSA rows`

## Task 3: Claims + interpolation + asserts

**Files:** Extend `factory-compute.ts`; test additions.

- `evaluateClaims(def, result): Record<string, ClaimValue>` — calls def.claims.
- `verifyAsserts(def, evaluated): string[]` — returns violations (empty = pass); `equals` exact match, `approx: [value, tol]`.
- `interpolateBody(template: string, claims: Record<string, ClaimValue>, panels: Record<string, string>): string`
  - replaces `{{claim:key}}` and `{{panel:name.sex}}`; **throws on unresolved placeholder** (fail-closed prose drift guard).
  - Panel SVG comes from `buildSparkline(member.series, 1880, dataMaxYear, { status: statusFor(member) })` wrapped in the chart-panel markup from `gen-one-hit-wonder-post.ts` (reuse its structure verbatim).

Tests: interpolation resolves all placeholders; throws on unknown key; throws on leftover `{{...}}`; asserts pass/fail paths.

Commit: `feat: claim evaluation, assertion checks, template interpolation`

## Task 4: Renderers

**Files:** Create `packages/shared/src/content/render-factory-viz.ts`, `render-factory-post.ts` + tests.

**Viz renderer** — signature `renderFactoryVizPage(def, result, opts: { canonicalBase, dataMaxYear }): string`:
- Uses `pageShell({ title, description, canonical: base + "/viz/" + slug, body, structuredData: [WebPage, Dataset], scripts: [] , jsonDataBlocks: [{ id: "factory-data", data: { slug, generatedAtIsOmitted, members } }] })`
- Body: `<h1>` title, intro paragraph from def.description, one `.chart-panel` per member using buildSparkline SVG inline (server-rendered — no client JS needed), plus a `<noscript>`-safe static table (name, sex, peak year, peak births) as the fallback.
- Identity attrs: wrap main content in element carrying `contentIdentityMeta({ contentId("visualization", slug), contentType: "visualization", ... })`. NOTE: existing `ContentType` union already includes `"visualization"` — no union change needed (spec §6 anticipated one; verified not required).
- No d3 CDN needed since charts are server-rendered SVG (simpler than spec's sketch; same visual contract).

**Post renderer** — `renderFactoryPostMarkdown(def, evaluatedClaims, bodyTemplate, panels): string`:
- Frontmatter: title/date/description/author/status/og_image (same keys as `_template.md`)
- Body = `interpolateBody(...)` output
- Round-trip check inside renderer: `compileBlogPost(output, slug + ".md")` must succeed and yield matching slug/title/description — throw if not.

Tests: viz page has exactly one H1, canonical present, JSON-LD parses, embedded JSON block parses back to members array, table row count == members.length, no "undefined"/"NaN" substrings. Post round-trips through compileBlogPost.

Commit: `feat: factory renderers (viz page + blog post)`

## Task 5: CLI builder

**Files:** Create `scripts/content-gen.ts`; add npm script `content:gen`.

```
npm run content:gen -- --check                 # validate registry + run asserts against live CSV
npm run content:gen -- --item <slug> [--out <dir>]   # generate artifacts
npm run content:gen -- --all [--out <dir>]
```

- Loads `extra/baby-names.csv` + `extra/totals.csv` (streaming read is fine at 258k rows; use readline or plain split).
- Registry import: `packages/shared/src/content/content-definitions.ts` (Task 6 adds the first entry; CLI errors clearly if registry empty).
- Writes viz HTML to `apps/web/public/viz/<slug>.html` and post md to `content/blog/<slug>.md` unless `--out` given.
- Prints what it wrote; exits non-zero on assert failures.
- `dataMaxYear` read from `extra/totals.csv` max year (2025).

Test: light — run CLI with `--item nonexistent` expects exit 1 with message (spawn via tsx in test or just manual verification note; keep unit coverage in Tasks 2–4).

Commit: `feat: content-gen CLI`

## Task 6: flash-floods definition + body template

**Files:**
- Create `packages/shared/src/content/content-definitions.ts` exporting `CONTENT_DEFINITIONS: ContentDefinition[]` with one entry:
  - slug `flash-floods`, kind `both`, sourceVersion `ssa-national-2025`, rolloutState `draft`
  - title: "The Flash Floods — Names That Arrived All at Once"
  - claims used by both artifacts: top name/count, count of floods detected, share of floods that are extinct-status, decade histogram highlights
  - asserts pinning the six drafted names' peak figures: Kunta 1977→215, Arsenio 1989→397, Moesha 1996→426, Jkwon 2004→100, Bethzy 2006→301, Neymar 2014→499 (each as `equals` after computing; if real data drifts, the assert fails and we update copy deliberately)
- Create `content/blog/templates/flash-floods.body.md` — adapt the six-name draft from `gen-one-hit-wonder-post.ts` into markdown with `{{claim:*}}` placeholders and `{{panel:Kunta.M}}` etc. markers. Keep house voice; link `/name/X/` pages.

Verification: `npm run content:gen -- --check` passes (asserts hold against real data) — this validates every hand-written number in the draft.

Commit: `feat: flash-floods definition + post template`

## Task 7: Generate artifacts + wire tests

- Run `npm run content:gen -- --item flash-floods` → produces `apps/web/public/viz/flash-floods.html` + `content/blog/flash-floods.md` (+ migration SQL via existing `blog:publish` only at publish time — NOT now; post ships as draft status so no D1 write needed yet... actually ship `status: published` in the .md but do NOT create migration; publish gate stays with Michael).
- Add `test:content-factory` to package.json chain after `test:viz-payloads`: `tsx --test packages/shared/src/content/*.test.ts`.
- Full suite: `npm test` green.

Commit: `test: content factory suite wired into npm test`

## Task 8: Browser render verification

Per repo reference `references/browser-render-verification.md`:
- Serve repo statically (`python3 -m http.server` in apps/web/public), open `/viz/flash-floods.html` headless, screenshot desktop (1280px) + mobile (390px iframe trick), assert: charts visible (SVG path elements exist), no horizontal scroll (`scrollWidth <= clientWidth`), H1 correct.
- Fix any overflow (the grid/table `min-width:0` pitfall) before proceeding.

## Task 9: PR

- Branch `feat/content-factory`, push, open PR with: summary, artifact links, assert-verification results, screenshots, explicit note that merge/deploy/D1-publish remain approval-gated.
