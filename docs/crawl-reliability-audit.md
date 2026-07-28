# Crawl reliability audit

## Trigger

Google Search Console crawl statistics for the reporting period ending 2026-07-27 showed a material share of crawler responses in the 5xx class. The site’s real-user performance is otherwise strong, so server-side reliability is the first technical priority.

## Initial repository findings

1. `apps/web/functions/_middleware.ts` awaited `ctx.next()` in several paths without a top-level error boundary. Any uncaught route, D1, rendering, or cache exception could therefore escape as an opaque Pages 5xx response.
2. Function responses did not carry a request correlation ID.
3. Unhandled failures were not logged in a consistent machine-readable shape that could be grouped by route, agent, deployment, or exception type.
4. Failure responses had no explicit `no-store` or `noindex` policy.
5. Cached successful responses were protected by `res.ok`, so the middleware was not intentionally caching 5xx responses. That behavior should remain.

## First remediation

The `agent/crawl-reliability-p0` branch adds a global Pages Functions error boundary that:

- catches uncaught exceptions from routing, rendering, D1, and cache operations;
- emits one structured JSON log event per failure;
- includes request ID, Ray ID, method, pathname, query-parameter names, user agent, referrer origin, elapsed time, and error metadata;
- returns an uncached temporary `503` response;
- sends `X-Robots-Tag: noindex, nofollow` and a matching HTML robots meta tag;
- returns JSON for API requests and HTML for normal pages;
- exposes `X-Request-Id` for correlating a failed response with logs;
- preserves the existing rule that only successful responses enter `caches.default`.

## Follow-up investigation

After deployment, use Cloudflare Workers/Pages logs to group `pages_function_unhandled_error` events by:

1. `pathname`
2. `errorName`
3. `rayId`
4. `userAgent`
5. deployment version and hour

Then fix the highest-volume underlying route rather than treating the error boundary as the final solution.

## Acceptance targets

- crawler 5xx response rate below 0.5%;
- no repeating uncaught exception over a seven-day period;
- every temporary failure includes `X-Request-Id`, `Cache-Control: no-store`, and `X-Robots-Tag`;
- no 5xx response is written to the edge cache.
