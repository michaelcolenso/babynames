# Analytics baseline — July 24, 2026

Snapshot taken at the start of Phase 1 (Measurement foundation) of the [editorial growth plan](plans/2026-07-24-nobodynamed-editorial-growth.md), before any typed funnel events exist. This documents what we can and can't measure today, so Phase 1's exit gate ("funnel events verified in production, one week of stable baseline data collected") has something to compare against.

## What's currently instrumented

**Cloudflare Web Analytics** (privacy-respecting beacon, no cookies) is live site-wide. It gives:

- Total visits / pageviews, with a 30-day rolling window
- Pageviews by URL path (`Top Pages`), country, device type, browser, OS
- Referral sources (direct vs. internal vs. external, e.g. Reddit)
- Core Web Vitals (LCP/INP/CLS) broken down by URL, browser, OS, country

It does **not** give: per-visitor sessions, funnel/conversion tracking, custom event properties, content-type grouping, or franchise-level rollups. Everything is path-based aggregate counts — sufficient for "which page gets more traffic" (as used for the July 24 `/viz` re-rank, PR #100) but not for anything the growth plan's funnel requires (discovery click-through, second-content-view rate, newsletter conversion attribution).

**Google Search Console** covers organic search demand only (queries, impressions, clicks, position) — a different funnel stage (acquisition), already used ad hoc for SEO audits (`docs/seo/`). Not part of the on-site funnel.

**No internal event pipeline exists yet.** `packages/shared/src/analytics.ts` (added in #99) defines the typed event vocabulary and validation, but nothing calls it — there is no client script, no ingestion endpoint, and no events table.

## Baseline numbers (last 30 days, as of July 24, 2026)

From Cloudflare Web Analytics, whole-site:

- Visits: 220 · Page views: 1,130
- Core Web Vitals: 96% good LCP, 97% good INP, 100% good CLS — performance is not a current blocker for new client-side instrumentation, but a new tracking script must not regress these.

Filtered to `/viz/*` (the only segment we've broken down so far):

| Page | Pageviews |
|---|---|
| `/viz/debut-of-the-year` | 32 |
| `/viz/` (gallery index) | 20 |
| `/viz/graveyard` | 14 |
| `/viz/living-treemap` | 9 |
| `/viz/nobody-named-2025` | 8 |
| `/viz/heartbeats` | 8 |
| `/viz/velocity` | 6 |
| `/viz/survival`, `/viz/wavefront` | 5 each |
| `/viz/naming-diversity-index` | 4 |
| `/viz/heatwave`, `/viz/empire` | 2 each |

Device split for `/viz/*`: 76 mobile vs. 47 desktop. Referrers include several internal `nobodynamed.com` links (confirming the #87/#88 cross-linking is driving traffic) plus one Reddit referral.

We have no equivalent breakdown yet for `/name/*`, `/blog/*`, or the landing pages (`/rising`, `/endangered`, `/extinct`, `/comeback`) — pulling those would require repeating the same manual Cloudflare-dashboard-export process used for `/viz`, which does not scale to a recurring weekly report. That gap is exactly what the typed event pipeline + D1-backed weekly query (Phase 1, tasks 3–5) is meant to close.

## Gaps this phase must close

1. **No session concept.** Can't measure "second content view" or "return visit" without a client-generated session/visitor identifier.
2. **No content-type rollups.** Cloudflare's per-path breakdown can't be grouped by `content_type` or `franchise_id` without manual bucketing of URLs.
3. **No click-level attribution.** Can't tell whether traffic to a page arrived via the homepage strip, the gallery, a related-name module, or a blog cross-link — only the referring *page*, not the specific link.
4. **No newsletter funnel visibility.** `/api/newsletter/subscribe` (from #99) writes to `newsletter_subscribers` but nothing records signup *starts*, so conversion rate (start → complete) isn't measurable yet.
5. **Manual, not repeatable.** Every number above came from a one-off dashboard export. Phase 1's task 5 (weekly reporting query) is what turns this into something we run on a schedule instead of screenshotting a mobile dashboard.

## What "verified in production" will mean

Phase 1 is done measuring itself once, for at least 7 consecutive days, all of the following hold:

- Every priority route (name page, article, visualization, franchise hub, newsletter page) renders a `data-content-id` and fires exactly one `landing` or `meaningful_content_view` event per pageview (checked by comparing event counts against Cloudflare's independent pageview counts for the same paths — no more than a small discrepancy expected from ad blockers).
- `internal_discovery_click` events resolve to a valid `targetContentId` for the homepage strip, the `/viz/` gallery, and landing-page cross-links.
- Newsletter signup start/complete events exist and their ratio is a plausible conversion rate (not 0% or >100%).
- The weekly reporting query runs against real data without manual intervention.
