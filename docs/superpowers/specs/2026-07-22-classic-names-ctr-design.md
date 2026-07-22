# Classic Names CTR Improvement Design

## Goal
Improve non-branded organic clicks to `/classic-names`, which GSC reports at 20 impressions, average position 1.0, and zero clicks over the latest 28-day window.

## Approach
Keep the existing editorial-page renderer and enrich only the `classic-names` configuration. Use a shorter search title, a 150–160 character value-led description, a clean H1 without the brand suffix, and three crawlable editorial sections totaling 300–500 words. The copy will explain the site's data-backed definition of a classic name, distinguish durable names from comeback names, and link to representative dossiers and decade pages.

## Scope
- Update `apps/web/functions/[slug].ts`.
- Add a reusable optional `sections` field to editorial page configuration and rendering.
- Add a focused test that checks classic-page metadata, H1, section headings, internal links, and editorial word count.
- No visual redesign, data-model change, or new dependency.

## Acceptance criteria
- Search title is 50–60 characters and contains “Classic Baby Names.”
- Meta description is 150–160 characters and does not fully answer the page intent in the snippet.
- H1 is `Classic Baby Names` without a brand suffix.
- Three H2 sections render server-side.
- Editorial prose is 300–500 words and contains contextual internal links.
- Typecheck, focused test, and production build pass.
