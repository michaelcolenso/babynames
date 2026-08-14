# Migration TODO — recovered routes and static assets

This file tracks production behavior that still needs source or deployment
verification. Resolved migrations remain summarized so old warnings are not
mistaken for current blockers.

## `/names/[decade]/` — resolved

The decade route family is now repository-owned:

- `apps/web/functions/names/[decade]/index.ts` serves the generic main route
  with legacy fallback behavior.
- Generic `methodology/`, `classroom/`, and `spelling-families/` child routes
  are gated by registry review state and validated D1 profiles.
- `packages/shared/src/content/decade-hub-definitions.ts` is the canonical list
  of all 15 decades from the 1880s through the partial 2020s.
- Distinct reviewed theses and family inputs are checked into the repository.
- Sitemap and internal links derive from registry state rather than a hard-coded
  featured-decade list.
- The main route remains available when a specialized profile is absent; child
  routes fail closed.

The previous warning that a clean deploy could lose orphaned decade functions is
obsolete. Build, review, test, seed, deploy, and annual-refresh procedures now
live in [`docs/decade-hub.md`](./decade-hub.md). Production D1 writes, deploys,
and cache purges remain explicit approval gates.

## /api/landing/comeback — verify schema

The Pages Function exists at `apps/web/functions/api/landing/comeback.ts`
and is reachable in prod. No action.

## /favicon.svg — verify after [slug].ts fix deploys

Before this branch's catch-all bailout, the static file at
`apps/web/public/favicon.svg` was being shadowed by the `[slug].ts`
catch-all and returning 404 sitewide.
After the bailout merges, verify it renders. If not, the static asset
deploy itself isn't picking up the `public/` directory contents — separate
problem.

## /apple-touch-icon.png, /site.webmanifest

Not in the repo. Browsers and OS install prompts will fall back to
generic icons. Add these as static files in `apps/web/public/` when
brand assets are finalized.
