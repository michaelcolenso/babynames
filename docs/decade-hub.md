# Decade hub operations guide

This is the canonical runbook for the 15 registry-driven decade hubs from the
1880s through the partial 2020s. Each hub has a main page plus `methodology/`,
`classroom/`, and `spelling-families/` children. Primary content is SSR; the
browser script adds progressive enhancement only.

The original phased implementation brief remains at
[`docs/prompts/complete-decade-hubs.md`](prompts/complete-decade-hubs.md), but
this operations guide supersedes its pre-rollout status assumptions.

## Architecture and source of truth

- Registry: `packages/shared/src/content/decade-hub-definitions.ts`
- Editorial theses: `packages/shared/src/content/decade-theses.ts`
- Family reviews: `data/manual/spelling-families-YYYY.csv`
- Builder: `scripts/build-decade-hubs.ts`
- Runtime validator: `packages/shared/src/decade-hub-validate.ts`
- Seeder: `scripts/seed-decade-hub.ts`
- D1 table: `decade_hub`, one compact JSON payload per decade slug
- Methodology: `decade-hub/v1.0.0`

Registry rollout states have distinct meanings:

- `draft`: local validation only; not eligible for specialized routes or seed.
- `reviewed`: editorial inputs and provenance are approved; eligible to seed.
- `seeded`: reviewed hub known to exist in production.

Coverage comes from the source, not the nominal decade label. The 2020s profile
currently covers 2020–2025 and must remain `isComplete: false`. Never invent
future years.

## Build all profiles from current D1

Use live D1 for any shipping candidate:

```bash
npm run build-decade-hubs -- --all --source=d1
```

The managed output directory is `data/dist/decade-hubs/` by default. It contains
one JSON and one inspection-only SQL file per selected decade plus
`decade-hub-manifest.json`. The manifest records source identity, source bounds,
validation-only state, methodology, compact-payload SHA-256, and UTF-8 byte
length. The builder loads the source once, validates the complete output set,
and atomically swaps the managed directory.

Useful alternatives:

```bash
npm run build-decade-hubs -- --decade=1930 --source=d1
npm run build-decade-hubs -- --all --source=sqlite --sqlite=/path/to/current.sqlite
npm run build-decade-hubs -- --all --source=zip --zip=/path/to/names.zip
```

Tracked shards stop at 2017. They are validation-only and must never be seeded.
The explicit `--allow-validation-artifacts` flag permits local artifact writing;
it does not make those artifacts production-safe.

## Review before seed

A build is not an approval. Before changing D1:

1. Diff the manifest and profiles against the last reviewed generation.
2. Reconcile profile totals, champions, classroom output, family totals, source
   bounds, and sanity anchors against independent current-source evidence.
3. Re-check every numeric thesis claim in `decade-theses.ts`.
4. Review every changed family semantically as well as numerically.
5. Confirm every shipping manifest entry has `familyStatus: "reviewed"` and is
   not validation-only.
6. Run the full verification gates below and obtain independent review.

Family CSV schema:

```text
family_id,label,canonical,variant,review_status,rationale
```

Only approved rows are considered. A shipped family requires at least two
approved variants, at least 1,000 decade births per variant, at least 20,000
combined births, no cross-family variant overlap, and a defensible semantic
relationship. An explicit header-only file is valid when review finds no honest
family, as in the 1880s.

## Verification gates

Run narrow checks first, then broad checks:

```bash
npx tsx --test scripts/seed-decade-hubs.test.ts
npm run test:decade-hub
npm run typecheck
npm run test:indexable-routes
npm run audit:links
npm test
npm run build
```

`test:decade-hub` is the aggregate decade contract. It covers computation,
classrooms, families, all-decade builds, registry/provenance, runtime validation,
routes, pilot parity, editorial claims, and seeding safeguards. Do not document
a fixed test count; the aggregate suite is intentionally extended as rollout
coverage grows.

Task 12 adds rendered verification across all 60 hub/child pages. Before any
production write, also inspect representative complete, partial, empty-family,
and multi-family pages on mobile and desktop.

## D1 preflight and seed

Dry run is always the default:

```bash
npm run seed-decade-hubs -- --decade=1930
npm run seed-decade-hubs -- --all-reviewed
```

Use `--artifacts=/absolute/path` to inspect another managed output directory.
Apply `migrations/20260814T060000_decade_hub_source_fingerprint.sql` before
using this seeder version. The seeder validates the complete selected set before
its first D1 request or write: manifest schema/status, registry state, runtime
profile shape, thesis/profile/manifest source agreement, methodology, exact
hash/bytes, coverage, strict D1 `meta.max_year`, the complete source
fingerprint, canonical live-row metadata/payload consistency, and downgrade
protection.

Rows created before the fingerprint migration remain nullable. The seeder may
backfill such a row only when its payload and all existing metadata are exactly
byte-identical to the approved candidate. A differing legacy row fails closed;
never stamp a guessed fingerprint onto it.

The historical pilot rows predate this contract and will therefore fail closed:
the committed 1980s artifact is `ssa-national-2017` while current candidates are
`ssa-national-2025`, and every fresh build changes `generated_at`. That refusal
is intended. To adopt the contract, backfill the fingerprint only from an
artifact that is the exact same payload the row already contains:

```bash
# 1. Identify the exact payload bytes of the live row.
npm run seed-decade-hubs -- --decade=1980   # dry run reports the refusal

# 2. After an approved production window, either:
#    a. seed the reviewed replacement row for the decade (new payload), or
#    b. for a byte-identical legacy row, run the approved candidate with a
#       pinned generated-at value:
npm run build-decade-hubs -- --decade=1980 --generated-at=2026-08-12T11:33:53.891Z
npm run seed-decade-hubs -- --decade=1980 --apply --artifacts=/path/to/pinned-build
```

Never delete a live row merely to bypass the fingerprint check; replace it with
an approved candidate or leave it untouched.

Writing is a separate production action and requires explicit approval plus the
`--apply` flag:

```bash
npm run seed-decade-hubs -- --decade=1930 --apply
npm run seed-decade-hubs -- --all-reviewed --apply
```

The seeder never executes generated SQL. It uses bound parameters, skips exact
existing payloads, and writes one row at a time with optimistic concurrency:
an insert must still find no row, and an update must still match every field
read during preflight. Each successful conditional write is followed by a
second complete payload-and-metadata readback. D1 cannot provide a transaction
across HTTP requests. On failure, the command stops and reports the failing row
and every earlier changed row.

Do not deploy, seed production, purge caches, or merge merely because a dry run
passes. Those are independent approval gates.

## Cache and rollout

`reviewed` means approved content, not production availability. The sitemap emits
specialized child routes only for definitions marked `seeded`. For each rollout
batch, deploy reviewed code and the provenance migration first, seed and smoke
the D1 rows while they remain `reviewed`, then change only the verified batch to
`seeded` in a follow-up deploy. This ordering may briefly leave working child
routes undiscoverable, but it never advertises child URLs that return 404.

For every changed decade the seeder prints these paths:

```text
/names/YYYYs/
/names/YYYYs/methodology/
/names/YYYYs/classroom/
/names/YYYYs/spelling-families/
```

Hub responses use long edge caching. After an approved deploy and seed, purge or
version-invalidate every printed path; otherwise old rendered HTML can survive
the rollout. Then smoke all affected routes and confirm canonical headers,
source/version copy, child navigation, and partial coverage.

A missing or rejected `decade_hub` row fails soft: the main route falls back to
the legacy decade page and specialized children return 404. Renderer programmer
errors must still surface rather than being disguised as missing data.

## Annual SSA refresh order

Run this sequence for each new SSA vintage:

1. Build all profiles from current D1.
2. Review manifest/profile diffs and every thesis claim.
3. Update `thesisSourceVersion` only after the copy matches the new evidence.
4. Review changed family files and rerun all tests.
5. Run the seeder in dry-run mode and independently review its candidate set.
6. Obtain approval for the production window.
7. Deploy renderer/content changes and any required provenance migration while
   affected definitions remain `reviewed`.
8. Seed reviewed rows promptly so compiled copy and payload stay aligned.
9. Smoke all four routes for each seeded row and verify exact D1 readback.
10. Change only those verified definitions to `seeded` and deploy that registry
    transition so their children enter the sitemap.
11. Purge every affected hub and child route cache.
12. Re-fetch the sitemap, audit its links, and record source/data versions and
    readback evidence.

There is no perfectly safe order for a vintage change when compiled thesis copy
and D1 payload figures change together: deploy-first briefly serves new copy with
old data; seed-first briefly serves old copy with new data. Keep the approved
window short, seed promptly after deploy, purge immediately, and smoke the exact
changed routes.

## Analytics contract

Event names are stable and decade-neutral. Keep the closed vocabulary synchronized
between `packages/shared/src/analytics.ts` and
`apps/web/functions/api/analytics/event.ts`.

Identity varies by route:

- Main hub: `content_id = decade-hub:YYYYs`
- Child: `content_id = decade-hub:YYYYs/<child>`
- All: `content_type = decade-hub`

The SSR wrapper supplies `data-content-*`; `apps/web/public/assets/decade-hub.js`
reads that identity rather than embedding a decade literal. Existing event names
such as `decade_hub_view`, `ownership_sort_changed`, `classroom_completed`, and
`spelling_variant_clicked` must not be renamed during rollout. All browser
analytics remain no-op enhancements when `window.nvTrack` is absent.

## Methodology changes

`DECADE_HUB_ALPHA` controls ownership-score shrinkage. Before changing it, run:

```bash
npm run sensitivity:decade-hub
```

Review rank churn and low-volume intrusion, update the methodology version for
formula changes, rebuild all profiles, re-review all affected thesis claims,
and repeat the complete verification/deploy/seed/purge sequence. Never mix two
methodology versions under one registry/thesis approval state.
