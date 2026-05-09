# Production QA Pass — nobodynamed.com

Date: 2026-05-09 (UTC)
Target: https://nobodynamed.com

## Scope

This pass covered HTTP availability, routing behavior, API responses, response headers, and machine-readable assets (`robots.txt`, `sitemap.xml`).

## Commands executed

- `curl -I https://nobodynamed.com`
- Batch status/content-type checks for:
  - `/`
  - `/api/meta`
  - `/api/search?q=emma`
  - `/api/name/emma`
  - `/api/landing/rising`
  - `/name/emma/`
  - `/robots.txt`
  - `/sitemap.xml`
- `curl -sIL https://nobodynamed.com/name/emma/`

## Findings

### 1) Name detail route redirects to home instead of rendering name page (High)

- Requesting `/name/emma/` returns `302 Found` with `location: /`, then lands on home.
- Expected behavior is SSR name page rendering at `/name/:name/`.
- Impact:
  - Deep links and SEO landing pages for names are effectively broken in production.
  - Users cannot access core detail experience directly by URL.

### 2) API endpoints return `text/html` content-type instead of JSON (High)

- `/api/meta`, `/api/search?q=emma`, `/api/name/emma`, and `/api/landing/rising` all responded with `content-type: text/html; charset=utf-8`.
- Expected behavior for API endpoints is `application/json; charset=utf-8`.
- Impact:
  - API consumers may parse failures or require non-standard handling.
  - Browser/proxy/content negotiation behavior may be inconsistent.
  - Suggests route handling is likely falling through to non-API handler in production.

### 3) `sitemap.xml` served as `text/html` (Medium)

- `/sitemap.xml` returned status `200` but `content-type: text/html; charset=utf-8`.
- Expected content type is `application/xml` or `text/xml`.
- Impact:
  - Search crawlers may still ingest, but behavior is less reliable and can reduce SEO correctness.

## Likely root-cause areas in repository

Based on current source layout, likely misconfig/deploy drift areas are:

- Pages Functions route mapping for:
  - `apps/web/functions/name/[name]/index.ts`
  - `apps/web/functions/api/*.ts`
- Potential static asset/function precedence or rewrite behavior in Pages deployment config:
  - `apps/web/wrangler.toml`
  - `apps/web/_routes.json` (if present)
  - any Pages build output routing config.

## Remediation plan

### Phase 1 — Triage & reproduce in local Pages runtime

1. Run local web app (`npm run dev:web`) and verify:
   - `/name/emma/` renders SSR page.
   - API routes return JSON with correct `content-type`.
2. If local passes, capture effective prod routing config and compare deploy artifact + branch.
3. Confirm whether production is serving latest commit/build output.

### Phase 2 — Fix routing and headers in deployment pipeline

1. Validate that function files are emitted and deployed under correct `functions` directory.
2. Audit/adjust route include-exclude patterns to ensure:
   - `/api/*` reaches functions.
   - `/name/:name/` reaches SSR function.
   - `sitemap.xml` is served with XML mime type (either static header config or function response).
3. Add explicit smoke checks in CI (or pre-deploy script):
   - assert status, redirect behavior, and `content-type` for the affected endpoints.

### Phase 3 — Verify and harden

1. Re-run parity/smoke tests against preview deployment.
2. Promote to production.
3. Re-run the exact production QA command set from this document.
4. Add a scheduled external monitor (daily) for:
   - `/api/meta` content type
   - `/name/emma/` non-redirect SSR success
   - `/sitemap.xml` XML content-type

## Exit criteria

- `/name/emma/` returns `200` SSR HTML and does not redirect to `/`.
- `/api/meta`, `/api/search?q=emma`, `/api/name/emma`, `/api/landing/rising` return valid JSON with `application/json` content type.
- `/sitemap.xml` returns XML with correct mime type.
- Smoke tests are automated in CI/pre-deploy to prevent recurrence.
