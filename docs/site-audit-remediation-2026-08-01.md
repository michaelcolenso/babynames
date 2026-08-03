# NobodyNamed site-audit remediation plan

Audit source: Ahrefs project `9928668`

- Crawl: 2026-08-01T22:04:48Z
- Comparison crawl: 2026-07-25T19:44:24Z
- Orphan pages: 327 (+295)
- Missing alt text: 4,997 (+4,553)
- Slow pages: 82 (+45)
- Pages with one dofollow incoming internal link: 506 (+443)
- IndexNow candidates: 4,621 (+4,261)

## Root-cause finding already implemented

The canonical shell rendered the shared wordmark on virtually every HTML page as:

```html
<img class="brand-logo" src="/assets/brand/wordmark.svg" alt="">
```

An empty `alt` is valid when an image is decorative, and the surrounding home link already has an accessible name. Ahrefs nevertheless reports the empty value as missing alt text. The count is close to the number of crawlable pages and the markup is emitted by `packages/shared/src/render-shell.ts`, making this the high-confidence source of the sitewide warning.

The remediation changes the wordmark to:

```html
<img class="brand-logo" src="/assets/brand/wordmark.svg" alt="NobodyNamed">
```

The surrounding `aria-label="NobodyNamed home"` remains in place, so the home link keeps a clear accessible name.

## Required implementation order

### 1. Merge and deploy the shared wordmark fix

Files:

- `packages/shared/src/render-shell.ts`

Acceptance criteria:

- Every page rendered through `pageShell()` or `siteHeader()` includes a non-empty wordmark alt value.
- The header still links to `/` and retains `aria-label="NobodyNamed home"`.
- A rendered-page smoke check finds no `img.brand-logo[alt=""]`.
- The next Ahrefs crawl should remove most or all of the 4,997 warnings. If a residual set remains, export those URLs and locate the remaining route-specific image components.

Recommended validation:

```bash
npm run typecheck
npm test
```

### 2. Pull and classify the affected URL exports

Do not repair 327 orphan URLs or 506 weakly linked URLs one at a time. Export the full URL lists from Ahrefs and group them by normalized route family:

- `/name/{name}/`
- `/year/{year}/`
- `/names/{decade}s/`
- `/names/{decade}/methodology/`
- `/names/{decade}/classroom/`
- `/names/{decade}/spelling-families/`
- `/names/{initial}/`
- `/names/ending/{ending}/`
- `/extinct`, `/endangered`, `/comeback`, `/rising`
- `/viz/*`
- `/blog/*`
- other static or legacy routes

Produce a checked-in or CI artifact with this shape:

```csv
url,route_family,indexable,status,inbound_sources,action
https://nobodynamed.com/example,/example,true,200,0,add-links
```

For every orphan, decide one of only three outcomes:

1. **Keep and link** — the page has unique search or user value.
2. **Consolidate** — redirect it to a stronger canonical page and remove it from the sitemap.
3. **Exclude** — apply `noindex` and remove it from the sitemap when it is useful to users but not a search landing page.

Never treat sitemap inclusion as a substitute for an HTML internal link.

### 3. Introduce one indexable-route registry

The sitemap currently constructs route classes in `apps/web/functions/sitemap.xml.ts`. Create a shared registry so sitemaps, navigation modules, IndexNow, and link-graph validation enumerate the same canonical URLs.

Suggested location:

```text
packages/shared/src/indexable-routes.ts
```

Suggested model:

```ts
export interface IndexableRoute {
  path: string;
  family:
    | "static"
    | "name"
    | "year"
    | "decade"
    | "decade-child"
    | "initial"
    | "ending"
    | "status"
    | "visualization"
    | "blog";
  lastmod?: string;
  priority?: number;
}
```

The registry may be assembled from static route definitions plus D1-backed name and blog records. It must normalize:

- one canonical host
- HTTPS
- trailing-slash policy
- URL encoding
- exclusion of redirects
- exclusion of `noindex` pages
- exclusion of canonicalized duplicates

Refactor `sitemap.xml.ts` to serialize this registry rather than independently recreating the URL universe.

### 4. Implement the minimum-three-inbound-link architecture

The target is **at least three unique source pages linking to every indexable page**. Count unique source URLs, not repeated links in the same header, footer, or page.

All links used for discovery must be ordinary server-rendered `<a href>` links. Do not depend on client-side JavaScript, click handlers, search forms, or hidden mega-footers.

#### Name dossier: `/name/{name}/`

Every indexable name page should receive links from at least these sources:

1. Its initial directory or an initial-directory shard.
2. Its ending directory or an ending-directory shard.
3. At least one neighboring or cohort page.

Use several additional sources where relevant:

- previous and next names in canonical alphabetical order
- peak-year page
- peak-decade page
- status hub such as extinct, endangered, comeback, or rising
- spelling-family page
- related-name dossiers
- editorial collections or blog stories that discuss the name

Required fallback chain when semantic related names are sparse:

```text
spelling relatives
→ same peak year
→ same peak decade
→ same initial
→ same ending
→ alphabetical previous/next
```

Continue until the rendered module has enough valid unique targets. Never emit self-links, redirects, `noindex` targets, or duplicate canonical URLs.

Initial and ending directories must expose the full indexable set through crawlable pagination or deterministic shards. A hub that links only to a hand-picked top subset does not satisfy the guarantee.

#### Year page: `/year/{year}/`

Inbound sources:

1. `/year` index.
2. Previous year page.
3. Next year page.
4. Corresponding decade page.
5. Name dossiers whose peak or debut year is that year.

Boundary years still need three sources; use the year index, adjacent year, decade page, and relevant dossiers.

#### Decade page: `/names/{decade}s/`

Inbound sources:

1. A complete `/names/` browse index.
2. Previous decade page.
3. Next decade page.
4. Every year page in the decade through a “decade context” link.
5. Name dossiers whose peak decade matches.

The first and current incomplete decades need explicit boundary fallbacks from the browse index and child pages.

#### Decade child pages

Routes such as methodology, classroom, and spelling-families should receive links from:

1. Their decade landing page.
2. The other child pages in the same decade.
3. Relevant year or name pages.

Every child page should include a visible local subnavigation for all sibling pages.

#### Initial hub: `/names/{initial}/`

Inbound sources:

1. `/names/` browse index.
2. Previous initial hub.
3. Next initial hub.
4. Every listed name dossier through a reciprocal “Names beginning with X” link.

Provide crawlable pagination or prefix shards if the page would otherwise become too large.

#### Ending hub: `/names/ending/{ending}/`

Inbound sources:

1. A `/names/ending/` directory landing page.
2. Previous ending hub.
3. Next ending hub.
4. Every listed name dossier through a reciprocal ending link.

Add the directory landing page if it does not already exist; linking only to `/names/ending/a/` from navigation is not a complete browse architecture.

#### Status hubs: `/extinct`, `/endangered`, `/comeback`, `/rising`

Inbound sources:

1. Main navigation or the main browse index.
2. Other status hubs through visible peer navigation.
3. Every qualifying name dossier through reciprocal status links.
4. Relevant editorial and visualization pages.

#### Visualization: `/viz/*`

Every indexable visualization should receive links from:

1. `/viz/` gallery.
2. At least one related visualization.
3. At least one relevant data hub, name page, decade page, year page, or editorial story.

Each visualization must render a “Related explorations” module with at least two canonical links. Do not add a visualization to the sitemap before its gallery card and contextual link exist.

#### Blog article: `/blog/{slug}/`

Inbound sources:

1. `/blog/` index.
2. At least one category, series, or related-story module.
3. At least one data page that the article explains, when relevant.

Articles should link back to the underlying name, year, decade, or visualization pages, and those pages should expose selected editorial backlinks.

#### Static pages

About, press, newsletter, and other intentionally indexable static pages need at least three real navigation sources or should be exempted only when the page is deliberately utility-only. Exemptions must be explicit and documented in the route registry.

### 5. Add a build-time internal-link graph validator

Suggested file:

```text
scripts/validate-internal-links.ts
```

The validator should:

1. Obtain every indexable canonical URL from the shared route registry or a sitemap generated from it.
2. Render or fetch each page in the test environment.
3. Extract server-rendered `<a href>` targets.
4. Resolve relative URLs against the canonical origin.
5. Normalize trailing slashes, percent encoding, host, and protocol.
6. Ignore fragments, `mailto:`, `tel:`, external domains, `nofollow`, and non-HTML assets.
7. Follow the project’s redirect map and count only final canonical targets.
8. Build a map of target URL to unique internal source URLs.
9. Fail when an indexable URL has fewer than three unique inbound source URLs.
10. Fail when an indexable URL has zero inbound sources even if it appears in a sitemap.
11. Fail when a sitemap URL redirects, is `noindex`, or canonicalizes elsewhere.
12. Emit machine-readable JSON/CSV plus a readable summary grouped by route family.

Suggested output:

```text
artifacts/internal-link-graph.json
artifacts/internal-link-failures.csv
```

Suggested package scripts:

```json
{
  "audit:links": "tsx scripts/validate-internal-links.ts",
  "audit:site": "npm run audit:links && npm run validate:pages"
}
```

CI should run the validator against a local Pages/D1 fixture or a deterministic rendered-page fixture. A production URL mode can remain available for post-deploy verification, but CI must not depend solely on the live site.

### 6. Fix weak-link pages through template rules, not manual links

Once the graph report identifies route concentrations:

- repair the shared renderer for that route family
- add deterministic fallback links
- regenerate the graph
- verify the affected count falls to zero

Do not add one-off links to 506 pages unless a page has a genuinely unique editorial relationship.

### 7. Add IndexNow to the deployment pipeline

Use the route registry and the Git diff or content hashes to submit only canonical URLs whose public content changed.

Requirements:

- batch changed URLs after a successful production deploy
- include additions and meaningful updates
- submit removed URLs only after their redirects or removals are live
- never submit preview URLs, redirects, `noindex` pages, or canonical duplicates
- keep sitemap `lastmod` values tied to actual public-content changes rather than every build
- log accepted batches and failures

IndexNow accelerates discovery; it does not repair orphan pages.

### 8. Finish the smaller metadata and crawl issues

After the two systemic regressions are fixed:

- centralize Open Graph and X-card defaults in `pageShell()`
- require route renderers with share images to provide `ogImageAlt`
- add title and description length validation to `validate:pages`
- validate the two failing structured-data pages by route family
- remove redirect URLs from the sitemap
- rewrite internal links to final HTTPS canonical destinations
- collapse the remaining redirect chain
- profile the 82 slow pages by route family and keep visualization bundles off ordinary dossier pages

## Link-graph acceptance criteria

The work is complete when a rendered crawl of the production-equivalent build reports:

- 0 indexable orphan pages
- 0 indexable pages with fewer than 3 unique incoming internal source URLs
- 0 sitemap URLs that redirect
- 0 sitemap URLs that are `noindex` or canonicalize elsewhere
- 0 images without an explicit `alt` attribute
- no shared wordmark with an empty alt value
- every visualization linked from `/viz/` and at least two other relevant pages
- every year linked from the year index, an adjacent year, and its decade
- every name linked from initial, ending, and at least one cohort or neighboring page

## Agent execution brief

Use the following sequence in a new branch from the latest `master`:

1. Export the Ahrefs URL-level data for orphan, one-incoming-link, missing-alt, and slow-page issues.
2. Group affected URLs by route family and check the report into `artifacts/` only if repository policy allows generated audit artifacts; otherwise attach it to the PR.
3. Preserve the shared wordmark alt fix in `render-shell.ts`.
4. Introduce the shared indexable-route registry and refactor the sitemap to consume it.
5. Add missing browse landing pages, pagination/shards, reciprocal taxonomy links, adjacent-page links, and route-specific related modules.
6. Add the internal-link graph validator and package scripts.
7. Run the graph validator, `npm run typecheck`, `npm test`, and representative local route smoke tests.
8. Document route exemptions explicitly; do not silently lower the three-link threshold.
9. Deploy to preview and crawl the preview using the same validator.
10. Open a draft PR containing before/after route-family counts and any URLs intentionally consolidated or excluded.
11. After production deployment, submit changed canonical URLs to IndexNow and trigger a fresh Ahrefs crawl.

Keep the architecture useful to visitors. The three-link rule is a minimum safety rail, not a reason to manufacture repetitive sitewide links.
