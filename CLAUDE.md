# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev:web          # Pages dev server at :8788 (includes local D1)
npm run dev:ingest       # Ingest Worker dev server

# Type checking
npm run typecheck        # Type-check all apps + shared package

# Build
npm run build            # Compile packages/shared only (apps use wrangler bundling)

# Deploy
npm run deploy:web       # Deploy Cloudflare Pages
npm run deploy:ingest    # Deploy Ingest Worker

# Database migrations
npm run migrations:apply:local   # Apply migrations to local D1
npm run migrations:apply         # Apply migrations to remote D1

# Scripts
npm run seed                                    # One-time D1 population from legacy shards (run once pre-deploy)
npm run verify-parity -- --base=<preview-url>  # Validate API parity before DNS cutover
npm run backfill-rankings                       # Populate name_rankings_by_year on remote D1 (idempotent)
npm run backfill-rankings:local                 # Same against local D1
npm run backfill-viz-payloads                   # Rebuild viz_payloads on remote D1 (idempotent)

# Test cron trigger
npm run -w @nv/ingest-worker test:scheduled    # Test scheduled handler locally
```

## Architecture

**Name Vitals** — Tracks US baby name popularity using SSA data (1880–present). Monorepo with three deployment units:

| Package              | Type              | Purpose                                             |
| -------------------- | ----------------- | --------------------------------------------------- |
| `apps/web`           | Cloudflare Pages  | Static assets + Pages Functions (API + SSR)         |
| `apps/ingest-worker` | Cloudflare Worker | Weekly SSA data ingestion via cron + queues         |
| `packages/shared`    | npm package       | Shared types, classification, D1 queries, renderers |

### Shared Package (`@nv/shared`)

Path alias `@nv/shared` maps to `packages/shared/src/` in all apps. Key exports:

- **`classify.ts`** — Single source of truth for name status (rising/stable/declining/endangered/extinct) and all trend metrics. Used by ingest at write-time; do not duplicate this logic.
- **`d1-queries.ts`** — Typed D1 query helpers shared by Pages Functions and ingest.
- **`schema.ts`** — TypeScript types mirroring the D1 schema (`NameRow`, `SearchHit`, API contract types).
- **`render-name.ts`** — Full-page SSR renderer for `/name/:name` — used by both edge SSR and client hydration.
- **`spark-blob.ts`** — Encodes yearly counts into a 60-byte normalized BLOB (`encodeSpark`/`decodeSpark`). Stored in `names.spark_blob`, used for landing-page sparklines without fetching full series.

### D1 Database (`name-vitals`)

Shared by both apps (same `database_id` in both `wrangler.toml` files). Key tables:

- **`names`** — ~100k rows, one per (name, sex). Holds all pre-classified metrics + `spark_blob`.
- **`name_years`** — ~1.9M rows of (name_id, year, count). Sparse — only years with count > 0.
- **`year_totals`** — Annual total births per sex (~290 rows).
- **`name_rankings_by_year`** — Pre-computed top-200-per-(year, sex) ranks, PK `(year, sex, rank)`. Backs `/api/meta`, `/api/year/:year` and the river viz so those reads no longer rank ~137k rows per year at request time. Rebuilt by ingest finalize; backfill an existing DB with `npm run backfill-rankings`. Readers only trust it while `meta.rankings_version` matches `meta.data_version`, so an in-flight or partial rebuild is never served — they fall back to the live window-function query instead.
- **`viz_payloads`** — One row per whole-dataset viz endpoint (`concentration`, `terminal-letters`, `suffix-waves`, `name-survival`), holding the finished JSON response. Those aggregates read 4.4M–15.3M rows apiece when computed live; the payload turns each into a single PK read. Built by ingest finalize and by `npm run backfill-viz-payloads`. Each row carries the `source_version` it was built from — readers require it to match `meta.data_version`, so a stale or half-written payload falls back to the live query instead of being served.
- **`meta`** — Singleton key/value store (min/max year, schema version, `data_version` UUID for cache busting, `rankings_version` readiness marker, last SSA ETag).

**Rows read is the cost driver, not query count.** D1 bills every row a query *examines*. A `LIMIT 4` that has no usable index still reads the whole table. Two rules follow:

- Any `ORDER BY ABS(col - ?)` is unindexable and forces a full scan + temp b-tree sort. Where the "nearest N rows to a value" is wanted, walk outward from the target on an ordinary index instead — `limit` rows ascending from the target plus `limit` rows descending covers the true nearest `limit` — then merge and re-rank in JS. `listRelatedNames` / `listStatusNeighbors` / `listPeakEraNeighbors` do this; `scripts/name-neighbors.test.ts` pins them to the SQL they replaced. The index backing each walk must cover the *whole* multi-column ORDER BY, not just the column being walked — a lopsided `peak_year` distribution (production has 1,272 F names sharing a single peak year) otherwise leaves a same-key group to sort per call, which local test fixtures with a uniform distribution won't catch.
- A bounded two-sided walk needs **two** indexes per column, not one. Reversing a scan over a single index reverses the effective sort order of every column in it, not just the leading one — an index built `(sex, peak_year ASC, peak_count DESC, ...)`, walked backwards for the "down" side's `ORDER BY peak_year DESC, peak_count DESC, ...`, yields `peak_count ASC` on that tie-break, the opposite of what's asked for. Verify both directions' `EXPLAIN QUERY PLAN` independently — testing only the "up" side (as the first pass at these indexes did) leaves the "down" side silently paying for a temp sort. The fix is a second index with just the range column's direction flipped and the tie-break columns held fixed, e.g. `names_sex_peak_year` / `names_sex_peak_year_desc`.
- An uncorrelated `MAX(col)` subquery is only cheap when `col` leads an index. `getNameStrongholds` read all 27k rows of `name_regional_anomalies` per name page purely to resolve `MAX(era_start_year)`, which is the last column of that table's PK.

Indexes on `names` must be listed in `rebuildIndexesIfNeeded()` (`apps/ingest-worker/src/compute.ts`) as well as in a migration. Ingest finalize renames `names_staging` → `names` and drops the old table, taking its indexes with it — an index missing from that function disappears at the next ingest and the loss is invisible except as a jump in rows read.

### Ingest Pipeline

`scheduled()` → ETag check → fetch SSA zip → store in R2 → parse `yob*.txt` files → enqueue row chunks → `queue()` consumer inserts into staging tables → `finalize()` swaps staging → live in one transaction.

**Zero-downtime swap pattern**: bulk writes go to `names_staging` / `name_years_staging`. At finalize, a single transaction renames staging → live. Indexes are dropped during bulk insert and rebuilt at finalize. The `data_version` UUID in `meta` is updated to bust edge caches.

### Pages Functions Routing (`apps/web/functions/`)

- `_middleware.ts` — CDN caching wrapper for all functions
- `api/search.ts` — `GET /api/search?q=` prefix autocomplete (half-open range scan on `name_lower`)
- `api/name/[name].ts` — `GET /api/name/:name` — full timeseries for both sexes
- `api/meta.ts` — `GET /api/meta` — home-page aggregates + top-10 per year
- `api/landing/[kind].ts` — `GET /api/landing/extinct|endangered|rising`
- `name/[name]/index.ts` — `GET /name/:name/` — server-rendered HTML (replaces 2000+ legacy static files)

### Key Constraints

- SSA publishes new data once per year (typically May). The cron is ETag-gated so weekly runs are cheap.
- D1 limit: 10 GB. Current usage ~2 GB.
- `classify()` runs at ingest time and results are stored — API reads never recompute classification.
