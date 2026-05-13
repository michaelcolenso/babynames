# Name Vitals — Identity v3 Integration Plan

## Context
This plan integrates the newly uploaded GitHub logo and the attached identity notes into the production site with minimal regression risk. The notes establish a clear visual system based on a two-state wordmark (`ink` + `faded`) and a tighter typographic hierarchy for brand moments.

## Locked brand decisions adopted from the notes
- **Wordmark model**: two-state mark with semantic split (`nobody` in ink, `named` in faded gray).
- **Primary ink**: `#0E0E0C`.
- **Secondary faded gray**: `#B5B0A0` (with darker fallback `#9A968A` in high-contrast contexts).
- **Display face for brand headlines/wordmark**: `Source Serif 4` (black/heavy display usage).
- **Brand motif**: “one cut” model (alive segment in ink, post-cut segment in faded gray).

## What we will integrate

### 1) Brand assets and source-of-truth
1. Add the newly uploaded logo files to `apps/web/public/assets/brand/`:
   - `wordmark` (light + dark variants)
   - `seal` (light + dark variants)
   - optional `vital-trace` mark
2. Normalize exports to web-first formats:
   - SVG for UI and responsive display
   - PNG fallbacks for social previews/third-party embeds if needed
3. Add a short `README` in the brand directory documenting:
   - intended usage
   - minimum size
   - clear space
   - allowed color variants

### 2) Design tokens and typography
1. Extend global CSS tokens in `apps/web/public/assets/style.css`:
   - `--brand-ink: #0E0E0C`
   - `--brand-faded: #B5B0A0`
   - `--brand-faded-contrast: #9A968A`
2. Add brand font stacks and loading strategy:
   - `Source Serif 4` for wordmark/display brand lockups
   - preserve existing body/system typography for readability and performance
3. Add reusable brand utility classes:
   - `.brandmark` root
   - `.brandmark__alive` (ink)
   - `.brandmark__faded` (faded gray)

### 3) Header/footer rollout (phase 1)
1. Replace plain-text nav brand (`NobodyNamed`/`nobodynamed`) with the two-state logo lockup.
2. Apply consistently across:
   - home (`apps/web/public/index.html`)
   - static pages (`about`, `extinct`, `endangered`, `comeback`, `rising`, `404`)
   - SSR/function-rendered pages where the brand is output by templates
3. Ensure dark-mode/dark-surface-safe variant is available for future components.

### 4) Name page and data-story motif (phase 2)
1. Introduce the “ink-to-faded cut” treatment on key name visualizations where it fits data semantics.
2. For extinct names, style post-last-record segment with `--brand-faded`.
3. Add optional copy hook from notes in extinct contexts:
   - “Now nobody named.”
   - Keep this scoped to appropriate status pages/components to avoid semantic drift.

### 5) Share assets / certificate surfaces (phase 3)
1. Update share image generator (`apps/web/functions/api/og/[name].ts`) to use new brand mark and palette.
2. Align badge/seal placement for “certificate” style assets (if enabled in product flow).
3. Validate legibility at social preview sizes and preserve contrast.

## Technical implementation sequence
1. **Asset ingestion PR**: add logos + brand usage readme.
2. **Token PR**: add color/font tokens + utility classes.
3. **Shell PR**: migrate header/footer across all entry points.
4. **Data-visual PR**: apply cut motif to extinct-series rendering.
5. **OG PR**: refresh social image composition.

This sequence keeps risk low and allows staged visual QA.

## QA checklist
- Visual diffs for home + major landing pages + one name page.
- Verify no layout shift in header/nav across breakpoints.
- Confirm contrast ratios for text and logo states on paper and dark backgrounds.
- Confirm SVG logos render crisply on high DPI and low DPI.
- Confirm social image output still meets size and readability requirements.

## Content/copy updates from notes
- Prefer consistent lower-case brand styling where lockup is shown.
- Use the two-state logic as meaning, not decoration:
  - ink = present/active
  - faded = absent/dormant/post-cut
- Keep gradient/fade complexity out of brand marks; use binary two-state treatment.

## Risks and mitigations
- **Risk**: inconsistent brand output across static and SSR surfaces.
  - **Mitigation**: centralize brand partial/utility CSS and reuse.
- **Risk**: font loading regressions from introducing a new display face.
  - **Mitigation**: restrict display face usage to logo/headline lockups; keep body stack unchanged.
- **Risk**: semantic overuse of “extinction” language on non-extinct entities.
  - **Mitigation**: gate copy by classification (`extinct`, `endangered`, etc.).

## Definition of done
- New logo assets are in repo and documented.
- Header/footer brand lockup is updated across all web surfaces.
- Core brand tokens/classes are added and used in production CSS.
- Extinct-name visuals and copy reflect the two-state system where appropriate.
- OG/share output uses updated brand identity.
