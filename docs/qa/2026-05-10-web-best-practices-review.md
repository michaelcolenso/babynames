# Web App (Pages Functions) Best Practices Review

**Date:** 2026-05-10  
**Scope:** `apps/web` — all Pages Functions  
**Reference:** [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) (retrieved 2026-05-10)  
**Types:** `@cloudflare/workers-types@4.20260510.1` (latest)

---

## Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Configuration | ✅ Pass | `compatibility_date` current, `observability` enabled |
| Types | ✅ Pass | `wrangler types` generated, no hand-written `Env` |
| Security | ✅ Pass | No secrets in handlers; service binding used correctly |
| Request/Response | ✅ Pass | Proper cache headers, no unbounded buffering |
| Architecture | ✅ Pass | Bindings over REST, D1 queries centralized |
| Observability | ⚠️ Partial | No structured JSON logging (recommendation, not required) |
| Code Patterns | ✅ Pass | No floating promises, no global request state |

---

## Changes Applied

### P1 — Configuration

#### `wrangler.toml`
- **Bumped `compatibility_date`** from `2024-09-09` → `2026-05-10`
- **Added `[observability]`** block:
  ```toml
  [observability]
  enabled = true
  head_sampling_rate = 1
  ```

#### `package.json`
- **Bumped `@cloudflare/workers-types`** from `^4.20240909.0` → `^4.20260510.1`
- **Updated `dev` script** compat date from `2024-09-09` → `2026-05-10`

### P1 — Types

#### `wrangler types` generated
- Ran `wrangler types` → `worker-configuration.d.ts` (kept for reference, not compiled)
- Created `functions/env.d.ts` with the generated `Env` interface + `AMAZON_ASSOCIATES_TAG` augmentation
- Removed **15 hand-written `interface Env` / `type Env` declarations** across all function files
- Removed unused `D1Database` and `Fetcher` imports from `@cloudflare/workers-types`

**Files cleaned:**
```
functions/api/decade/[decade].ts
functions/api/enrich/[name].ts
functions/api/landing/[kind].ts
functions/api/landing/comeback.ts
functions/api/meta.ts
functions/api/name/[name].ts
functions/api/og/[name].ts
functions/api/search.ts
functions/api/twin/[name].ts
functions/api/year/[year].ts
functions/name/[name]/index.ts
functions/names/[decade]/index.ts
functions/sitemap.xml.ts
functions/[slug].ts
```

#### Service binding cleanup (`functions/api/enrich/[name].ts`)
- Removed custom `EnrichWorkerBinding` interface
- Removed the `if (ctx.env.ENRICH_WORKER)` guard (types now guarantee the binding exists; `try/catch` still handles local-dev unavailability)

### P2 — Architecture (already correct, verified)

| Pattern | Evidence |
|---------|----------|
| **Bindings over REST** | Uses `env.DB`, `env.ENRICH_WORKER` directly — no Cloudflare REST API calls |
| **Service binding fallback** | `/api/enrich/[name]` tries service binding first, falls back to local D1 compute |
| **D1 query centralization** | All SQL lives in `packages/shared/src/d1-queries.ts` |
| **Edge caching** | `_middleware.ts` wraps all downstream handlers with `caches.default` + `ctx.waitUntil()` |

### P3 — Performance Note (no code change)

#### `/api/twin/:name` — in-memory cosine similarity
- Fetches **~30–50k rows** (`listNameSparks`) into Worker memory on every request
- With ~2 MB of spark data + CPU for similarity scoring, this is the heaviest handler
- **Mitigation:** The endpoint is behind a 1-day edge cache (`s-maxage=86400`) so repeated hits for the same name are served from cache
- **Future:** Consider pre-computing twins at ingest time and storing in D1 if traffic grows

---

## What Was Already Correct

| Pattern | Evidence |
|---------|----------|
| **No global request state** | All state passed through `ctx` and function arguments |
| **No floating promises** | Every async call is `await`ed or passed to `ctx.waitUntil()` |
| **Parameterized queries** | All D1 queries use `.bind()` — no string interpolation of user input |
| **Proper cache headers** | All handlers set `Cache-Control` with `s-maxage` + `stale-while-revalidate` |
| **Zero-downtime data** | `dataVersion` cache-bust key ensures stale cache never overlaps with new data |
| **No `passThroughOnException`** | Not used anywhere |

---

## Recommendations (not applied)

### Structured JSON logging
The web app uses plain string `console.error` in a few places (e.g., `.catch(() => [])` silences errors). Consider adding structured logging for 5xx paths so errors are searchable in the Workers Observability dashboard.

### Testing
Add `@cloudflare/vitest-pool-workers` tests for the heaviest handlers (`/api/meta`, `/api/twin/:name`, `/name/:name`) to catch runtime regressions that type-checking misses.

---

## Files Modified

```
apps/web/
├── wrangler.toml                          (+observability, compat_date)
├── package.json                           (+workers-types version, dev script)
├── tsconfig.json                          (+functions/**/*.d.ts)
├── functions/env.d.ts                     (new — generated Env + augmentation)
├── worker-configuration.d.ts              (generated, not compiled)
└── functions/
    ├── [slug].ts                          (-Fetcher import, -type Env)
    ├── api/decade/[decade].ts             (-D1Database import, -interface Env)
    ├── api/enrich/[name].ts               (-custom types, -if guard)
    ├── api/landing/[kind].ts              (-D1Database import, -interface Env)
    ├── api/landing/comeback.ts            (-D1Database import, -interface Env)
    ├── api/meta.ts                        (-D1Database import, -interface Env)
    ├── api/name/[name].ts                 (-D1Database import, -interface Env)
    ├── api/og/[name].ts                   (-D1Database import, -interface Env)
    ├── api/search.ts                      (-D1Database import, -interface Env)
    ├── api/twin/[name].ts                 (-D1Database import, -interface Env)
    ├── api/year/[year].ts                 (-D1Database import, -interface Env)
    ├── name/[name]/index.ts               (-D1Database import, -interface Env)
    ├── names/[decade]/index.ts            (-D1Database import, -interface Env)
    └── sitemap.xml.ts                     (-D1Database import, -interface Env)
```

## Validation

```bash
npm run typecheck
# ✅ tsc -b apps/web apps/ingest-worker packages/shared — clean
```
