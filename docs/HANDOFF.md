# Handoff: nobodynamed.com blog 1101 / D1 "too many SQL variables"

## Repo
- Monorepo: `~/Projects/babynames`
- Web app: `apps/web` (Cloudflare **Pages** project, name `nobodynamed`)
- Shared pkg: `packages/shared` (imported as `@nv/shared`)
- Remote D1 database name: `name-vitals` (id `fc4741db-1f6d-457c-b4e4-675a4ea3ebc2`)
- wrangler 4.69.0 installed (4.96.0 available)

## The symptom
`GET https://nobodynamed.com/blog/your-states-signature-name/` returns Cloudflare
**Error 1101 (Worker threw exception)**. Other routes (e.g. `/name/Saskia/`) return 200.
Page works in local dev, fails only on deployed/remote. Classic local-vs-prod data split.

## Current failing error (from `wrangler pages deployment tail --project-name=nobodynamed`)
```
Error: D1_ERROR: too many SQL variables at offset 253: SQLITE_ERROR
```
This is D1's per-statement bound-variable ceiling (lower than SQLite's native 999).
A variable-length `IN (?, ?, ...)` list is being built with one placeholder per item;
on the full remote dataset the list exceeds the ceiling. Local dev D1 uses the native
999 limit so it passes there.

## What was already done (DONE — do not redo)
1. **Migration drift fixed.** Five pending remote migrations were applied:
   `0008_enrichment_profiles`, `0008_add_name_label_to_charts`, `0009_split_bethzy_section`,
   `0010_add_name_states`, `0011_add_name_diaspora`. All green on remote `name-vitals`.
   NOTE: duplicate `0008` prefix exists in repo — still worth renumbering for deterministic
   future applies, but it applied cleanly this time.
2. **Column-name red herring resolved.** Code/diagnostics initially looked for `body_md` and
   a `posts` table. Reality: table is **`blog_posts`**, markdown column is **`body_html`**
   (already HTML, no markdown conversion needed). The target post row exists, is
   `status='published'`, `length(body_html)=59911`. Data is healthy. No seeding needed.
3. **Patched `apps/web/functions/api/gender-crossings.ts`** to chunk its `IN` list.
   This was a REAL latent overflow but is NOT the one hitting the blog page (the blog page
   makes no `/api/` fetch — confirmed by grep). This fix is still correct; keep it.

## Root cause (CONFIRMED location, fix NOT yet applied)
The blog page handler `apps/web/functions/blog/[slug]/index.ts` imports from `@nv/shared`
and renders server-side. The overflowing query lives in the shared package:

```
packages/shared/src/render-blog.ts:61   const placeholders = batch.map(() => "?").join(",");
packages/shared/src/render-blog.ts:63   .prepare(`SELECT DISTINCT name FROM names WHERE name_lower IN (${placeholders})`)
```
This looks up every name mentioned in the post body (a 50-state "signature name" post →
large name list). `batch` may be the full array rather than a fixed-size slice — verify
the loop is actually chunking and not just named "batch".

Second latent overflow (fix while here, lower priority):
```
packages/shared/src/d1-queries.ts:565   const placeholders = uniqueYears.map((_, idx) => `?${idx + 2}`).join(", ");
packages/shared/src/d1-queries.ts:571   AND year IN (${placeholders})
```

## CRITICAL deploy-pipeline bug (why two prior fixes changed nothing)
`apps/web/package.json` deploy script is:
```
"deploy": "wrangler pages deploy public --project-name=nobodynamed"
```
There is **NO build step**. `npm run deploy` ships whatever already sits in `public/` and
recompiles nothing. So source edits never reach the deployed bundle. Two separate fixes
produced byte-identical errors because neither was ever built/deployed.

Before any fix will land, you MUST establish the build chain:
- Determine how `@nv/shared` is consumed: source (wrangler/esbuild bundles it live) vs a
  prebuilt `dist/` (stale dist = ghost). Check `packages/shared/package.json` `main`/`exports`
  and whether `packages/shared/dist/` exists.
- Determine what populates `apps/web/public/` and the Functions bundle.
- Wire a real `build` into the deploy (or run it explicitly before deploy).

## Tasks for Claude Code (in order)
1. Read `packages/shared/src/render-blog.ts` fully. Confirm whether the `IN` loop chunks.
2. Fix `render-blog.ts`: batch the `name_lower IN (...)` lookup into chunks of 90, filter
   out null/empty values before binding, merge results. (Same pattern already applied to
   `gender-crossings.ts` — mirror it.)
3. Fix `d1-queries.ts:565` `uniqueYears` IN-list the same way.
4. OPTIONAL refactor: add a reusable `chunkedIn(db, sqlBuilder, items, chunk=90)` helper to
   `@nv/shared` and route all three call sites (render-blog, d1-queries, gender-crossings)
   through it so this class of bug can't recur.
5. Inspect root `package.json` + `packages/shared/package.json` build scripts (turbo? pnpm?
   plain npm workspaces?). Establish the correct rebuild-shared → rebuild-web → deploy chain.
6. Fix `apps/web/package.json` `deploy` to build before `wrangler pages deploy` (e.g.
   `"deploy": "npm run build && wrangler pages deploy public --project-name=nobodynamed"`),
   and add a `build` script if missing.
7. Deploy via the corrected chain. Then:
   - `wrangler pages deployment tail --project-name=nobodynamed`
   - reload `https://nobodynamed.com/blog/your-states-signature-name/` (hard refresh)
   - confirm 200 and full render.
8. Commit. Prior deploy was done with a dirty working tree (`--commit-dirty` warning) —
   get everything committed so a Git-triggered Pages build can't regress the fix.

## Verification commands (remote D1 is healthy, for reference)
```
wrangler d1 execute name-vitals --remote --command "PRAGMA table_info(blog_posts);"
wrangler d1 execute name-vitals --remote --command "SELECT slug, status, length(body_html) FROM blog_posts WHERE slug='your-states-signature-name';"
```

## Known constraints
- This is a Pages project: use `wrangler pages deploy`, NOT `wrangler deploy`.
- D1 bound-variable ceiling is below 999 on deployed runtime — never bind a variable-length
  list inline; always chunk (use 90 to be safe).
- `@nv/shared` is a workspace dep; it must be rebuilt before the web app bundles it.
