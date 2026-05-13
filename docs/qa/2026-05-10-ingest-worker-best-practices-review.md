# Ingest Worker Best Practices Review

**Date:** 2026-05-10  
**Scope:** `apps/ingest-worker`  
**Reference:** [Cloudflare Workers Best Practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/) (retrieved 2026-05-10)  
**Types:** `@cloudflare/workers-types@4.20260510.1` (latest)

---

## Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| Configuration | ✅ Pass | `compatibility_date` current, `observability` enabled |
| Types | ✅ Pass | `wrangler types` generated, no hand-written `Env` |
| Security | ✅ Pass | Timing-safe secret comparison, size guards on fetch |
| Request/Response | ✅ Pass | Known bounded payload documented, guard added |
| Architecture | ✅ Pass | Bindings used directly, queues for async work |
| Observability | ✅ Pass | Structured JSON logging throughout |
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

### P1 — Types

#### `wrangler types` generated
- Ran `wrangler types` → `worker-configuration.d.ts`
- Removed hand-written `interface Env` from `src/index.ts`
- Added `declare global { interface Env { TRIGGER_SECRET: string } }` to augment the generated type with the secret binding
- Updated `tsconfig.json` to include `worker-configuration.d.ts` in compilation

### P2 — Security

#### Timing-safe secret comparison (`src/index.ts:53`)
**Before:**
```ts
if (!env.TRIGGER_SECRET || auth !== `Bearer ${env.TRIGGER_SECRET}`) {
```
**After:**
```ts
const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
if (!env.TRIGGER_SECRET || !(await timingSafeCompare(token, env.TRIGGER_SECRET))) {
```

New helper hashes both values with SHA-256 and compares with `crypto.subtle.timingSafeEqual`:
```ts
async function timingSafeCompare(a: string, b: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [aHash, bHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return crypto.subtle.timingSafeEqual(new Uint8Array(aHash), new Uint8Array(bHash));
}
```

#### Size guard on external fetch (`src/ssa.ts:11-22`)
**Added:**
```ts
const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB

export async function fetchNamesZip(url: string): Promise<SsaFetchResult> {
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`SSA fetch failed: ${r.status} ${r.statusText}`);
  const contentLength = r.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len > MAX_ZIP_BYTES) {
      throw new Error(`SSA zip too large: ${len} bytes`);
    }
  }
  // ...
}
```

### P2 — Observability

#### Structured JSON logging (`src/index.ts`)
Replaced all plain string `console.log` / `console.error` calls with structured JSON:

| Location | Before | After |
|----------|--------|-------|
| `scheduled()` | — | `console.error(JSON.stringify({ message: "scheduled ingest failed", error: ... }))` |
| `/run` | — | `console.error(JSON.stringify({ message: "manual ingest failed", error: ... }))` |
| `queue()` | `console.error("queue message failed", err)` | `console.error(JSON.stringify({ message: "queue message failed", error: ..., msgType, runId }))` |
| `runIngest` skip | `` `ingest: ETag unchanged (${head}), skipping` `` | `JSON.stringify({ message: "ingest skipped", reason: "etag_unchanged", etag: head })` |
| `runIngest` start | `` `ingest: run ${runId} starting ...` `` | `JSON.stringify({ message: "ingest starting", runId, headEtag: head, lastEtag })` |
| `runIngest` enqueue | `` `ingest: enqueued runId=${runId} years=${ym}-${yM}` `` | `JSON.stringify({ message: "ingest enqueued", runId, years: { min: ym, max: yM } })` |
| `runIngest` error | — | `JSON.stringify({ message: "ingest failed", runId, error: ... })` |
| `finalize` success | `` `ingest complete: rows=...` `` | `JSON.stringify({ message: "ingest complete", runId, rowsInserted, namesInserted, dataVersion })` |
| `finalize` error | — | `JSON.stringify({ message: "ingest finalize failed", runId, error: ... })` |

---

## What Was Already Correct

| Pattern | Evidence |
|---------|----------|
| **Bindings over REST** | Uses `env.DB`, `env.INGEST_CACHE`, `env.INGEST_QUEUE` directly — no Cloudflare REST API calls |
| **Queues for background work** | ~1.9M rows split into 1k-row chunks enqueued on `INGEST_QUEUE`; finalize runs after all chunks land |
| **No global request state** | All state passed through function arguments |
| **No floating promises** | Every async call is `await`ed or passed to `ctx.waitUntil()` |
| **Web Crypto for IDs** | `crypto.randomUUID()` used for `runId` and `dataVersion` |
| **No `passThroughOnException`** | Explicit try/catch used throughout |
| **Zero-downtime swap** | `ALTER TABLE ... RENAME` inside `db.batch()` transaction |
| **ETag-gated cron** | Cheap no-op when SSA dataset hasn't changed |

---

## Out of Scope (Justified)

| Item | Reason |
|------|--------|
| Streaming unzip | `fflate` does not expose a streaming zip API. The ~10 MB → ~70 MB operation is a known bounded workload well within the 128 MB limit. The new `Content-Length` guard provides defense-in-depth. |
| Worker-to-Worker service bindings | Not applicable — no internal Worker calls. |
| Hyperdrive | Not applicable — uses D1 binding, not external PostgreSQL/MySQL. |
| Workflows | The pipeline is already durable via Queues + D1 staging tables. Converting to Workflows would add complexity without meaningful benefit for a once-per-year batch job. |

---

## Files Modified

```
apps/ingest-worker/
├── wrangler.toml                          (+observability, compat_date)
├── package.json                           (+workers-types version)
├── tsconfig.json                          (+worker-configuration.d.ts)
├── worker-configuration.d.ts              (generated)
└── src/
    ├── index.ts                           (Env, auth, logging)
    └── ssa.ts                             (size guard)
```

## Validation

```bash
npm run typecheck
# ✅ tsc -b apps/web apps/ingest-worker packages/shared — clean
```
