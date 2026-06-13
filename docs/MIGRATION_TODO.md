# Migration TODO — decade pages and other recovered routes

This file documents working production routes that are **not yet sourced
in this repo**. They serve traffic on nobodynamed.com today, but a
clean redeploy from this commit alone may not reproduce them.

## /names/[decade]/  — 15 working pages, no source

Working in prod:

- `/names/1880s/` through `/names/2020s/` (15 pages)
- All return SSR'd HTML with proper meta, schema.org, adjacent-decade nav,
  and a JSON-encoded `nv-decade-data` blob the client uses to re-render

Source state in this repo:

- ❌ No `apps/web/functions/names/[decade]/index.ts`
- ❌ No `apps/web/public/names/` directory
- The client-side `renderDecadeTable()` exists in `apps/web/public/assets/landing.js`

Hypothesis: a previous deploy (pre-rebrand or unrelated branch) shipped a
Pages Function that's still serving from the Cloudflare Pages route table
even though it isn't in this commit. Cloudflare typically does not delete
orphaned routes between deploys, but this is a fragile contract — a
clean redeploy or a Pages project recreation could lose them.

### What needs to be ported

A Pages Function at `apps/web/functions/names/[decade]/index.ts` that:

1. Validates the decade slug (e.g. `1980s` matches `/^\d{4}s$/`)
2. Queries D1 for `name_year` rows where `year BETWEEN startYear AND endYear`,
   summed by `(name, sex)`, ranked top-25 per sex
3. Renders SSR HTML matching the existing format:
   - `<title>{decade}s Baby Names | NobodyNamed</title>`
   - Custom lede + `year-story` paragraph with name links (this is the
     editorial bit — prior pages had distinct copy per decade)
   - `decade-nav` with adjacent decade links
   - Two-column boys/girls top-25 list
   - JSON-encoded `<script type="application/json" id="nv-decade-data">` blob
4. Cache headers: `public, s-maxage=604800, stale-while-revalidate=86400`

The query is straightforward; the editorial copy per decade is the part
that requires authorial input. Reference the live pages at
`/names/{decade}s/` for current copy before deploying — they may not
survive a clean redeploy.

### Action before next deploy

1. Curl all 15 decade pages and save the editorial copy:

```
for d in 1880 1890 1900 1910 1920 1930 1940 1950 1960 1970 1980 1990 2000 2010 2020; do
  curl -sS "https://nobodynamed.com/names/${d}s/" -o "decade-${d}s.html"
done
```

2. Extract the `<p class="lede">` and `<p class="year-story">` per decade
3. Write `apps/web/functions/names/[decade]/index.ts` with those decade-specific
   strings hardcoded
4. Add the 15 decade URLs to `functions/sitemap.xml.ts:STATIC_PATHS`

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
