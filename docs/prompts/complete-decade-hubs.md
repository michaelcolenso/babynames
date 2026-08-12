# Implementation prompt: complete the NobodyNamed decade hubs

Use this prompt to plan and implement the remaining decade hubs. Replace the
values in **Run configuration** before starting. The 1920s and 1980s hubs are
the reference implementations; they are existing production work, not pages to
rebuild or describe as newly created.

## Run configuration

- **Target decades:** `[TARGET_DECADES]` (for example, `1930s, 1940s`)
- **Source vintage:** `[SOURCE_VERSION]` (must be the newest verified SSA/D1
  vintage; never silently ship the frozen 2017 shards)
- **Delivery size:** `[ONE_DECADE | SMALL_REVIEWABLE_BATCH]`
- **Reference pages:** `/names/1920s/` and `/names/1980s/`
- **Public origin:** `https://nobodynamed.com`

If no target is supplied, inventory all complete decades from 1880 through the
last fully available decade, recommend an implementation order, and stop after
producing the plan. Do not generate or publish every hub in one unreviewable
change.

---

## Prompt

You are working in the NobodyNamed baby-name repository. Complete the configured
decade hub or small batch by extending the system demonstrated by the existing
1920s and 1980s hubs.

### Product goal

Build a coherent set of useful, server-rendered decade resources for durable
non-brand searches such as “1930s names” and “popular names of the 1970s.” Each
hub must answer two questions without JavaScript:

1. Which girl and boy names were most popular in this decade?
2. What distinguishes this decade from adjacent decades in the recorded SSA
   data?

Preserve NobodyNamed's data-led editorial voice. A completed hub is a researched
editorial/data product, not a keyword-swapped template or a visualization shell.
The 1920s and 1980s pages establish the quality floor and the module set.

### Non-goals

- Do not recreate, replace, or claim to introduce the existing 1920s or 1980s
  hubs.
- Do not create thin pages for every decade merely to increase URL count.
- Do not write generic historical or baby-name prose.
- Do not make causal cultural claims from name counts.
- Do not infer events, identity, ethnicity, or parental motivation from SSA
  data.
- Do not copy 1920s/1980s facts, classroom years, spelling families, titles, or
  prose into another decade.
- Do not add schema types merely because they may appear attractive in search.
- Do not change unrelated name pages, visual identity, analytics, or navigation.
- Do not seed remote D1, deploy, or purge production caches unless the repository
  owner explicitly requests it.

### Read before changing code

Read the full files, their history, and applicable tests—not only matching
snippets:

- `docs/decade-hub.md`
- `packages/shared/src/decade-hub-types.ts`
- `packages/shared/src/decade-hub-compute.ts`
- `packages/shared/src/decade-hub-compute-1920.ts`
- `packages/shared/src/render-decade-hub.ts` (1980s reference)
- `packages/shared/src/render-decade-hub-1920.ts` (1920s reference)
- `packages/shared/src/content/decade-theses.ts`
- `scripts/build-decade-hub.ts`
- `scripts/build-decade-hub-1920.ts`
- `scripts/decade-hub*.test.ts`
- `scripts/seed-decade-hub.ts`
- `data/manual/spelling-families.csv`
- `data/manual/spelling-families-1920.csv`
- `apps/web/functions/names/[decade]/index.ts`
- the three child routes under `apps/web/functions/names/[decade]/`
- `apps/web/functions/sitemap.xml.ts`
- `packages/shared/src/indexable-routes.ts`
- `apps/web/public/assets/decade-hub.js` and the decade-hub CSS

Inspect both reference hubs live at desktop and phone widths, with JavaScript
enabled and disabled. Record for each reference page: title, description,
canonical, H1, first 300 words of main content, module order, tables and chart
fallbacks, adjacent/year/name links, JSON-LD, child routes, and responsive
behavior. This is a baseline comparison, not evidence that a new hub is needed.

### Phase 1: inventory and architecture decision

Before implementing a target decade:

1. Inventory every hard-coded `1920`, `1924`, `1980`, and `1984`, as well as
   route allowlists, artifact names, source-file names, content IDs, analytics
   IDs, schema text, accessibility labels, child-route links, sitemap entries,
   seed assumptions, and sanity anchors.
2. Compare the 1920s and 1980s implementations and classify differences as:
   - **shared behavior** — should become configuration or a generic function;
   - **decade data** — must come from the generated `DecadeProfile`;
   - **reviewed editorial content** — belongs in a typed content/config record;
   - **reference-era legacy** — must not be propagated.
3. Propose the smallest migration that removes copy/paste pressure. Prefer one
   parameterized compute/build/render/route path with typed decade configuration
   over a third `*-1930.ts` copy. Preserve the production behavior and URLs of
   the 1920s and 1980s during this refactor.
4. Identify fields that the present `DecadeProfile` lacks before inventing prose
   around them. If “fastest risers,” start-to-end changes, or adjacent-decade
   comparisons are promised, compute and store those facts deterministically;
   do not derive them ad hoc in the renderer.
5. Present the inventory and migration plan before broad implementation if it
   affects more than one deployment unit or changes the payload contract.

### Phase 2: data and configuration

Create a reviewed, typed configuration for each target decade. At minimum it
must contain or reference:

- decade start/end and label;
- a representative classroom year selected by a documented rule (default to
  the midpoint only if the rule supports it);
- source vintage expected by the editorial copy;
- decade-specific sanity anchors independently verified against the source;
- approved spelling-family input and rationales, or an explicit reviewed
  “none” state if no family clears the established thresholds;
- title, description, H1, thesis heading, and reviewed thesis paragraphs;
- adjacent-decade availability;
- any decade-specific module omission and its reason.

Generate the profile offline from the newest verified SSA-backed D1 or official
SSA zip. `--source=shards` is for offline validation only because its lifetime
history ends in 2017. Record `sourceVersion`, `methodologyVersion`,
`generatedAt`, and optional build commit in the payload.

Keep all computed claims reproducible. At minimum verify and make available to
the renderer:

- total, female, and male recorded births;
- leading female and male names and exact decade totals;
- top-10 and top-100 pooled shares;
- ownership rankings and the popularity/ownership distinction;
- the deterministic classroom result;
- spelling-family totals and ranks when reviewed families exist;
- limitations required to interpret the figures.

If adding a trend/shift module, define the denominator, eligibility floor,
tie-breaks, missing-year treatment, and comparison window in code and on the
methodology page. Add fixture tests for edge cases. “Fastest rising” must never
mean an unexplained sort of raw percentage growth from a tiny base.

### Phase 3: editorial standard

Write the thesis only after generating and inspecting the target payload. Every
quantitative statement must map to a payload field or a checked derivation. For
each paragraph, maintain a review table in the PR description:

| Claim | Payload field/query | Value | Source vintage |
|---|---|---:|---|
| Example: leading girls' name | `femaleChampion` | `[NAME, COUNT]` | `[VERSION]` |

The editorial opening should be compact and answer the search intent directly,
then introduce an insight unique to the decade. Use the reference hubs' pattern:

1. **What was popular:** leaders, totals, and concentration.
2. **What belonged to the decade:** popularity versus ownership, with named
   examples and exact ranks/counts.
3. **A concrete scale model:** the representative classroom, accurately labeled
   as a statistical reconstruction.
4. **A spelling insight:** only from manually reviewed variants.
5. **Limits:** SSA records sex rather than gender, suppresses name-and-sex
   year counts below five, does not cover every birth, and cannot explain why a
   name was chosen. Use the exact limitations supported by the current source
   documentation.

Do not use interchangeable phrases such as “captured the spirit of the era,”
“crossed class lines,” or “defined a generation” unless independently sourced
and necessary. Prefer observations that another decade's payload could falsify.

### Phase 4: page contract

A completed `/names/<decade>/` hub must provide in the initial HTML response:

- a unique, natural `<title>` containing the decade and popular-name intent;
- a unique meta description grounded in actual page contents;
- an HTTPS canonical ending in `/names/<decade>/`;
- one H1 that clearly answers “<decade> names”;
- a compact factual opening and substantial reviewed thesis;
- linked female and male popularity champions;
- accessible popularity and ownership lists/tables with captions, scoped
  headers, visible units, and deterministic ranks;
- text equivalents for every visualization; enhanced charts must not be the
  sole carrier of information;
- representative links to name dossiers, all ten year pages, and available
  adjacent decade hubs, using descriptive anchor text;
- a concise source/methodology/limitations note and provenance;
- functional methodology, classroom, and spelling-family child routes when the
  corresponding modules exist;
- valid `BreadcrumbList`, `WebPage`, and `ItemList` JSON-LD where they describe
  visible content. Add `Dataset` only if the page exposes a coherent dataset and
  all required provenance/coverage fields are accurate—do not duplicate or
  conflict with methodology-page schema;
- content identity and analytics attributes following
  `decade-hub:<decade>` and `decade-hub:<decade>/<child>`;
- useful HTML with JS blocked and no console errors when JS runs.

Keep the established visual components. Do not move a large scorecard or chart
above the direct answer unless phone and desktop inspection demonstrates that
it improves comprehension.

### Phase 5: route, index, and rollout safety

- Drive hub and child-route eligibility from one registry/configuration source;
  do not add more nested `is1920s` conditionals.
- Validate the requested decade against the loaded profile; a wrong-decade or
  malformed payload must fail closed to the established fallback/404 behavior.
- Generate sitemap and indexable-route entries from the same registry.
- Keep cache and canonical headers consistent with the HTML canonical.
- Update the seed script so it accepts an explicit decade/artifact safely and
  continues to use bound parameters rather than a giant inline SQL statement.
- Couple reviewed thesis copy to `sourceVersion` (or implement an equivalent
  mismatch guard) so a new payload cannot be shown with stale factual prose.
- Document the deploy/seed/cache-purge order and rollback for the target.

### Required tests

Add table-driven tests so adding the next reviewed decade mostly means adding a
configuration/profile fixture, not copying an entire test file. For every target
assert:

1. Profile decade, range, completeness, classroom year, source version, and
   methodology version.
2. Birth totals reconcile by sex; ranks, shares, and scores remain bounded and
   deterministically sorted.
3. Decade-specific sanity anchors pass against the real source.
4. Spelling families are approved, unique, threshold-compliant, and arithmetically
   consistent—or the reviewed empty state renders honestly.
5. Hub response is 200 and includes unique title, description, canonical, H1,
   substantial SSR text, exact flagship facts, methodology/limitations,
   representative name links, all year links, and correct adjacent links.
6. All JSON-LD parses and its URLs, dates, counts, and item ordering match the
   visible page.
7. Child routes render for configured hubs and fail closed for unconfigured or
   malformed profiles.
8. The generic legacy decade and initial-letter routes remain unchanged.
9. The hub remains meaningful when scripts are removed from its HTML.
10. Existing 1920s and 1980s snapshots/contracts remain valid.

Run narrow checks first, then the repository suite:

```bash
npm run test:decade-hub
npm run test:editorial
npm run test:indexable-routes
npm run audit:site
npm run typecheck
npm test
```

Treat a skipped or environment-blocked check as evidence to report, not a pass.
Fix product regressions; do not weaken assertions merely to make the suite green.

### Visual and live verification

Render each target from the exact SSR function/profile that will ship. Capture
full-page screenshots at approximately 390 px and 1440 px widths. Inspect:

- the answer and leaders above the first major interaction;
- heading hierarchy and absence of duplicated headings;
- table overflow, tab wrapping, focus states, and readable units;
- no clipped names/counts or horizontal page scroll;
- chart accessibility and tabular fallbacks;
- adjacent/year/name links;
- no-JS content parity.

Also inspect the existing live generic target URL before implementation and
record what it already provides. The PR must distinguish inherited behavior
from newly added behavior.

### Definition of done

A target decade is complete only when:

- its data artifact is generated from the approved current source;
- its claims have been manually checked and listed in the PR evidence table;
- it meets the page contract without JS;
- its child routes, internal links, schema, analytics identity, sitemap, and
  fallback behavior are correct;
- desktop and phone inspection passes;
- the required tests pass or genuine environment limitations are documented;
- 1920s and 1980s behavior has not regressed;
- operational build, seed, deploy, purge, and rollback steps are documented.

Do not call an inventory, scaffold, empty config, or generic fallback a completed
hub.

### Delivery format

Use a focused feature branch and commit. The PR must include:

- target decades and why this batch is reviewable;
- architecture changes and files changed;
- explicit statement that 1920s and 1980s were pre-existing references;
- before/after SERP copy and page outline for each target;
- the factual claim-to-payload review table;
- source and methodology versions plus exact build command;
- approved spelling-family decisions;
- route/sitemap/analytics changes;
- exact test commands and results, including skips or limitations;
- phone and desktop screenshots;
- no-JS verification evidence;
- seed/deploy/cache-purge/rollback instructions;
- next safest decade or batch;
- KPI: non-brand impressions, average position, CTR, and eventual clicks for
  each decade query cluster, monitored separately from branded traffic.

### Final self-review

Before requesting review, answer yes or no:

- Did I reuse and generalize the two completed hubs rather than copy one?
- Can every factual sentence be traced to current data or an explicit source?
- Does the page answer popularity and change without JavaScript?
- Are visualizations redundant with accessible text/tables?
- Are all internal links descriptive and valid?
- Is structured data visible, accurate, and non-duplicative?
- Can stale editorial copy be detected when the data vintage changes?
- Can the next decade be added primarily through reviewed configuration/data?
- Did I avoid claiming existing 1920s/1980s work as part of this change?
- Is the rollout reversible?

Any “no” blocks completion unless the PR clearly records an approved exception.
