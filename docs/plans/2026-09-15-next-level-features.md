# Three features to take nobodynamed to the next level

**Date:** September 15, 2026
**Status:** Proposal — not yet scheduled
**Author's scope note:** Every claim below is anchored to a file in this repo.

**Revised September 15, 2026.** This document was first written against the repo's 2–3 month
old traffic exports, with a note to re-pull before acting. That data has now been re-pulled: a
fresh GSC export covering June 13 – September 12, 2026 is analyzed in
`docs/seo/2026-09-14-gsc-three-month-review.md`. **It overturns the premise this plan was
built on.** Section 0 states what changed and re-orders the work; the original feature
write-ups are preserved below, corrected in place.

---

## 0. Revision: what the fresh data changed

**The original premise was wrong, and the ordering below it was wrong with it.**

This plan was built on the June 9 finding *"we rank, we don't get clicked"* — page-1 rankings
returning no clicks, making snippet and title work the highest-return lever. The September
export says that is no longer the site's situation.

What the fresh export establishes (full working in `docs/seo/2026-09-14-gsc-three-month-review.md`):

| Finding | Figure |
|---|---|
| Clicks in 92 days | 175 |
| From the brand query `nobodynamed` alone | 128 (73%) |
| Landing on the homepage | 162 (93%) |
| **Earned by all 833 other URLs combined** | **14 — 0.15/day** (non-*homepage*) |
| Clicks not from the query `nobodynamed` | 47 — 0.51/day (non-*brand*) |
| Genuine name-research queries named in the export | 184 |
| Their weighted average position | **78.6 — page 9** |
| How many of those 184 rank on page 1 | **1, with 1 impression** |
| Enhanced search appearances earned (`Search appearance.csv`) | **none — file is header-only** |
| Impressions/day, June → September | 22.4 → 16.4 → 18.5 → 9.4 (flat, then dipping) |

So the site is not converting good rankings badly. **For anything with identifiable query
intent it ranks on page 8–9**, and its traffic is its own brand name. The page-1 impressions
that do exist are, by inference, brand sitelinks (`/about`, `/comeback`, `/viz/`, `/blog/` —
the nav set, all at position ~2 with zero clicks) plus ultra-long-tail single-name lookups
(581 of 766 name URLs have exactly one impression).

### What that does to the three features

**The ceiling arithmetic that demotes Feature 1:** at ~17 impressions/day, a 10× CTR
improvement across every page-1 impression yields on the order of 1–2 clicks/day. Snippet work
is cheap, correct, and worth doing — it is not a growth plan, and this document originally
presented it as one.

| | Original position | Revised |
|---|---|---|
| **Answer-first name pages** | #1, "highest and fastest return" | **Still do it — resized.** Cheap, and §5 of the review gives it a harder justification than CTR: the site earns *zero* rich results despite JSON-LD on every template. But the prize is ~1–2 clicks/day, not growth. |
| **Newsletter pipeline** | #2 | **Defer.** A retention loop needs an audience to retain. The right figure here is **0.51 non-brand clicks/day** (47 clicks not from the brand query), not the 0.15 non-*homepage* rate an earlier draft used — 3.4× larger, still far too small for a list to grow faster than it decays. The build stays correct; the timing is wrong. |
| **Name finder** | #3 | **Defer.** Large build targeting "names like X", where the site currently draws ~25 impressions/quarter at positions 31–64. No evidence of reachable demand yet. |

### The work that actually comes first

Not a feature — a diagnosis, and it gates everything else.

> **Corrected.** This section originally led with `/names/1930s/` (pos 4.8) against
> `/names/1920s/` (85.1) as "the same generator, 80 positions apart." **That comparison is
> withdrawn** — the 1920s hub is the only one carrying `searchSurface: true`
> (`decade-hub-definitions.ts:70`), which changes its title, description, H1, content sections
> and schema; its rollout state also differs from the 1930s hub's; and the surface shipped
> 2026-08-21, so only ~3 of the window's 13 weeks postdate it. Most per-decade positions in the
> export also rest on 2–6 impressions, which is noise. See the review doc §6.

The sounder entry point, from the same export:

| Family | URLs | Impressions | Clicks | CTR | Avg position |
|---|---:|---:|---:|---:|---:|
| `/name/:name/` | 669 | 1,037 | 9 | 0.87% | 12.1 |
| `/name/:name/twin/` | **97** | **128** | **0** | **0%** | **26.4** |

`/name/:name/twin/` is already the site's "names like X" page — titled exactly that
(`render-twin.ts:18`), emitting an `ItemList`, linked from every name page
(`render-name.ts:918`). It is indexed and matching the right queries (`/name/Clara/twin/`
against "names like clara", `/name/Rosie/twin/` against "names similar to rosie"). It ranks
around **page 3** and has converted **zero clicks in 92 days**.

A purpose-built page that matches its query exactly and still sits at position 26 is a bounded,
concrete thing to diagnose, and the answer generalizes to the other 16,000 URLs. Start there,
then: **cannibalization** (`/millennial-names` at 43.8 vs `/names/2000s/` vs `/names/`) →
**markup validity for types still eligible** → **off-site authority**.

That last one deserves saying plainly: 17,000 URLs drawing 17 impressions/day is the profile of
a site with no inbound link equity. If that is the binding constraint, then no feature in this
document — or in the backlog — addresses it, and the honest next step is a distribution
decision, not an engineering one.

### Revised sequence

1. **Diagnose the ranking gap** (cannibalization audit, rich-result validation). Days, not weeks.
2. **Answer-first name pages** — resized: title rewrite, `/living/` hub, OG cards. **No
   structured-data work.** (The FAQPage block is already shipped and cannot earn a rich result;
   validating the still-eligible types is a diagnostic task in step 1, not part of this build.)
3. **Re-measure.** If impressions/day on intent queries have not moved, stop and confront
   distribution before building Feature 2 or 3.
4. Newsletter, then name finder — **only once there is traffic to retain and demand to serve.**

---

## 1. The problem this plan is actually solving

nobodynamed is **supply-rich and demand-poor**. That framing should drive the next cycle,
because it rules out the obvious move.

What already exists, verified by reading the tree:

| Asset | Evidence |
|---|---|
| ~17,000 indexed URLs | `docs/site-audit-2026-08-15.md` |
| 28 visualization pages (excluding index, gallery, and share variants) | `apps/web/public/viz/` |
| Programmatic hub families: name, year, decade, generation, state, initial, ending, status | `packages/shared/src/indexable-routes.ts` |
| Server-rendered name pages with enrichment, diaspora, catalysts, strongholds | `packages/shared/src/render-name.ts` |
| Content factory (auto-generated viz pages + posts from real data) | `packages/shared/src/content/` |
| Typed analytics event pipeline, wired client-side | `apps/web/public/assets/analytics.js`, `functions/api/analytics/event.ts` |
| Newsletter double opt-in, Resend integration | `packages/shared/src/newsletter-email.ts:39` |
| Agent surface: MCP server, A2A, WebBotAuth, x402 paid endpoint | `functions/mcp.ts`, `functions/a2a.ts`, `functions/api/premium/report/[name].ts` |

What that produces, per the last recorded measurement:

- **220 visits / 1,130 pageviews in 30 days** (`docs/analytics-baseline.md`, July 24 2026).
- **~70 clicks on ~6,000 impressions**, average position 15.7 US
  (`docs/seo/2026-06-09-gsc-blog-demand.md`, ~3-week window ending June 9 2026).

Thirty visualizations and seventeen thousand URLs are converting to roughly seven visits a day.
**The constraint is not feature supply.** Building visualization thirty-one, hub family eight, or
another franchise moves nothing. Each of the three features below is chosen because it converts
an asset the project has *already paid for* into audience.

The three axes, in order of expected return:

1. **Capture** — turn rankings the site already holds into clicks.
2. **Retain** — turn one-time search visitors into a returning audience.
3. **Expand** — serve the one query cluster with commercial intent that currently has no surface.

---

## 2. Feature 1 — Answer-first name pages

**Axis:** Capture. **Expected return:** ~1–2 clicks/day at current impression volume — see §0. **Risk:** Low.

> **Revised twice.** The June framing below ("we rank, we don't get clicked") no longer
> describes the site; see §0. The fallback justification — "zero rich results earned" — then
> also turned out not to support this feature: the relevant markup (FAQPage) is already
> shipped, and Google fully deprecated FAQ rich results on May 7, 2026. What survives is the
> **title rewrite, the `/living/` hub, and the OG cards** — genuinely cheap, worth doing, and
> worth roughly 1–2 clicks/day at current impression volume. Nothing here moves the
> trajectory on its own.

### The finding

The repo's own GSC analysis identified the single biggest near-term lever and named it plainly:
*"we rank, we don't get clicked."* Pages sitting at position 1.0–4.2 were returning **zero
clicks** (`docs/seo/2026-06-09-gsc-blog-demand.md`).

That finding was **acted on for year pages and not for name pages.** Compare:

`packages/shared/src/render-year.ts:29-32` — fixed, and the code says why:
```ts
// at ~0% CTR despite page-1 rankings (see docs/seo/2026-06-09-gsc-blog-demand.md).
const title = hasLeaders
  ? `Top Baby Names of ${year}: ${topGirlName} & ${topBoyName} Led the Year | NobodyNamed`
  : `Top Baby Names of ${year}: Most Popular Boys & Girls | NobodyNamed`;
```

`packages/shared/src/generate-narrative.ts:323` — untouched:
```ts
const metaTitle = `${name} — Name Popularity, History & Stats | NobodyNamed`;
```

That generic title is shape-identical to every competing baby-name site's title, and it is
serving the largest route family on the site. The meta description below it *is* data-driven
(`generate-narrative.ts:329-333`) — so the fix is half-done: the snippet earns the click, the
title throws it away.

### The asset being wasted

`name_enrichment_profiles` stores `total_living_est`, `median_age`, `age_range_low`, and
`age_range_high`, computed from an SSA period life table over the **full SSA corpus** —
`scripts/build-enrichment.ts` runs the whole corpus by default; `--limit` is a test flag only.
Schema: `migrations/0008_enrichment_profiles.sql`. Rendered today as a panel partway down the
name page: `render-name.ts:669-672`.

This answers two query clusters that the GSC analysis flagged as the **only intents with a high
moat — "no competitor answers well"**:

| Intent | Distinct queries | Backing column |
|---|---:|---|
| "how many people are named X" | 25 | `total_living_est` |
| "how old is X" / age | 12 | `median_age`, `age_range_*` |

37 of 581 distinct queries, against data no competitor computes, surfaced nowhere in the title,
nowhere in structured data, and on no dedicated URL.

### What to build

1. **Data-driven name-page titles.** Replace the single generic `metaTitle` with a variant
   selected by what the data supports for that name — mirroring the `hasLeaders` branch pattern
   already proven in `render-year.ts`. Lead with the number that is unique to this site:
   - Reliable living estimate → `About ${fmt(living)} Americans Are Named ${name} | NobodyNamed`
   - Strong peak, weak living estimate → `${name}: Peaked in ${peakYear}, ${fmt(latest)} Born in ${yM} | NobodyNamed`
   - Extinct / near-extinct → `${name}: A Name America Stopped Using | NobodyNamed`
   **Gate on the persisted enrichment profile, not on `hasReliableLiving`.** The original
   draft said to reuse that check; it does not do what the sentence claimed. `hasReliableLiving`
   is `age.estimatedLiving >= 10` (`generate-narrative.ts:185`), computed in-process from
   `computeAgeStats(record.series)` — it never consults `name_enrichment_profiles`, and
   `build-enrichment.ts` only writes a profile at `MIN_TOTAL_COUNT = 100` total births
   (`build-enrichment.ts:40,234`), using a separate sex-specific life table. So a name with,
   say, 40 total births passes `hasReliableLiving`, has no persisted profile, and would get a
   title asserting a living count the on-page enrichment panel does not show — two different
   numbers from two different models on one page. Either pass the persisted profile into the
   title decision, or reconcile the two reliability rules into one. *(Caught by Codex review on
   this PR; verified against the source.)*

2. ~~**`FAQPage` structured data**~~ — **cut. This was already built, and it cannot pay off.**

   The original draft proposed adding FAQPage schema from `narrative.answers`. That is already
   shipped: `buildFaqStructuredData()` at `render-name.ts:1078` constructs exactly those
   questions and `render-name.ts:377-380` appends it to the page's schema array. Proposing it
   as new work was an error in this document.

   It is also moot. Google restricted FAQ rich results to authoritative government and health
   sites in August 2023, then **fully deprecated them on May 7, 2026** — before the GSC window
   analyzed in the review doc even opened. The shipped markup cannot produce a rich result for
   any site. Leave it in place (it is harmless and machine-readable for non-Google consumers),
   but claim no SEO return from it and do not duplicate it. *(Caught by Codex review on this
   PR; the deprecation was verified separately — see the review doc §5.)*

3. **A `/living/` hub** ranking names by `total_living_est`, split by sex and by median-age band —
   the index page for the 25-query cluster, and an internal-link target for all 17k name pages.
   The aggregate is a single ordered read over `name_enrichment_profiles`; follow the
   `viz_payloads` precedent in `CLAUDE.md` if it needs pre-computing.

4. **OG cards that lead with the number**, not the name. `functions/api/og/[name].ts` exists;
   change what it renders.

### Acceptance criteria

- Each name page selects the correct data-backed title branch for that name, and every
  non-extinct title carries a real metric. *(Originally worded "no two titles differ only by
  name" — unsatisfiable against these templates, since the extinct branch is
  `${name}: A Name America Stopped Using` for every extinct name, and living titles legitimately
  collide when estimates round to the same displayed value. Test branch selection, not global
  uniqueness.)*
- No title claims a living estimate unless a persisted `name_enrichment_profiles` row backs it.
- **A title that says "Americans" states the all-sex total.** `name_enrichment_profiles` is keyed
  `(name_lower, sex)` and the SSR route resolves a single dominant sex and fetches only that
  profile (`functions/name/[name]/index.ts:94-118`). Presenting one sex's estimate as the total
  would undercount every name recorded for both — sum both profiles, or qualify the number.
- `/living/` renders, is in the sitemap (`indexable-routes.ts`), and satisfies the repo's
  three-inbound-link rule.
- Title/description length bounds are unit-tested, mirroring `scripts/editorial-pages.test.ts`.

### How we'll know it worked

GSC CTR for the `/name/*` path group, 28 days pre vs. post. The year-page fix is the control:
if that one moved CTR, this one should move it further, because name pages carry more of the
17k-URL footprint. **Kill criterion:** no measurable CTR change after 6 weeks at stable
impressions means the snippet isn't the constraint and the rest of this plan's capture thesis
needs rethinking.

**Estimated size:** Small. One narrative function, one new route, one OG template, plus loading
the second sex's enrichment profile where a title claims an all-sex total. No JSON-LD work — the
FAQPage block is already shipped and cannot earn a rich result. No migration, no ingest change,
no new data.

---

## 3. Feature 2 — Ship the newsletter that already has subscribers

**Axis:** Retain. **Expected return:** Compounding — *once there is an audience.* **Risk:** Low technical, medium editorial.

> **Deferred per §0.** The diagnosis of the gap below is unchanged and still correct: the send
> half was never built. But at **0.51 non-brand clicks/day** — 47 clicks in 92 days not from
> the brand query — there is no audience to retain yet. *(An earlier draft used 0.15/day here,
> which is the non-**homepage** rate; the export cannot join queries to pages, so the two are
> different measures and the query-based one is the right one for this decision. Caught by
> Codex review on this PR.)* Hold until intent-query impressions move.

### The finding

The newsletter is built up to — and not including — the part that sends.

Verified present:
- `newsletter_subscribers`, double opt-in (`migrations/0020_newsletter_double_optin.sql`)
- Subscribe / confirm / unsubscribe routes (`functions/newsletter/*`, `functions/api/newsletter/*`)
- Token signing and rate limiting (`newsletter-tokens.ts`, `newsletter-ratelimit.ts`)
- Resend transport (`newsletter-email.ts:39`)

Verified absent:
- `newsletter_issues` is declared at `migrations/0017_editorial_growth.sql:41` and referenced by
  **zero TypeScript or JavaScript files** in the repo. Grepped: the only hit in the tree is the
  `CREATE TABLE` itself.
- No issue composer and no send job. **The archive route is *not* absent** — `/newsletter`
  already renders content ID `newsletter:archive` with the archive title and canonical; what it
  lacks is issue content and per-issue detail pages. (An earlier draft listed it as missing,
  contradicting build item 4 below.)

So the Resend integration exists solely to send the confirmation email. **Every subscriber
acquired to date has opted in and received nothing since.** That is the worst possible state for
an email list: acquisition cost paid, retention value zero, and list decay running the whole time.

This is also the editorial growth plan's own next phase — Phase 5, "Newsletter launch,"
September 21–October 4 2026, whose definition-of-complete item 9 reads *"At least two live
newsletter issues have been sent"*
(`docs/plans/2026-07-24-nobodynamed-editorial-growth.md`). As of today that is not buildable,
because none of the sending half exists.

### What to build

1. **Issue composer.** A script that assembles an issue from data the project already generates:
   content-factory posts published since the last issue (`content/`, `blog_posts`) and one name
   drawn from the enrichment layer. Writes a row to `newsletter_issues` with status `draft`.

   **Not `/api/movers/:year`, on a weekly cadence.** The original draft listed "the current
   week's movers" as a segment. That endpoint computes a fixed year-over-year ranking
   (`functions/api/movers/[year].ts:51-74`) against data the SSA publishes once a year
   (`CLAUDE.md`, `AGENTS.md`) — between releases it returns the same gainers and losers every
   time, so automated weekly issues would feature identical names indefinitely. Either treat
   movers as a once-a-year segment tied to the SSA release, or add explicit issue-level
   rotation state so a name isn't repeated. This is one more argument for the monthly cadence
   in §7: the underlying data simply does not change weekly. *(Caught by Codex review on this
   PR.)*
2. **Render once, use twice.** One renderer producing both the email HTML and the archive page,
   following the existing `render-blog.ts` pattern. Do not maintain two templates.
3. **Send job.** Batched Resend send over confirmed subscribers, with per-subscriber
   unsubscribe tokens (`newsletter-tokens.ts` already signs these).

   **A resume cursor is not sufficient for the no-duplicate guarantee**, which the original
   draft got wrong. A `last_sent_subscriber_id` advanced after the send is not atomic with the
   send: if Resend accepts a recipient and the worker dies before the cursor persists, the
   retry mails that subscriber again. Cursor advancement is evidence of progress, not proof of
   delivery. Use a per-`(issue_id, subscriber_id)` delivery record written as the unit of
   progress, plus a deterministic provider idempotency key derived from that pair, so a replay
   is rejected at the provider even if the local write was lost. *(Caught by Codex review on
   this PR.)*
4. **Public archive — extend `/newsletter`, don't add a second one.** The original draft
   proposed `/newsletter/archive/`. That route already exists in all but content:
   `functions/newsletter/index.ts` renders content ID `newsletter:archive`, slug `archive`,
   title "NobodyNamed Newsletter Archive", canonical `/newsletter` — and the header nav
   (`render-shell.ts:40`) plus both footers (`:159,:167`) already point there. Adding
   `/newsletter/archive/` would create a second crawlable archive index while every sitewide
   link kept pointing at the first. Fill in the existing route and add `/newsletter/:issue/`
   beneath it; the earlier growth plan specifies the same shape. *(Caught by Codex review on
   this PR.)*
5. **Suppression handling.** Consume Resend bounce/complaint webhooks into a suppression column.
   Skipping this is how a young domain's sending reputation dies.

### The honest constraint

This is not primarily an engineering problem. The send pipeline is maybe a week of work; the
hard part is having something worth sending every week, forever. The content factory partly
solves this — it already generates posts and viz pages from real data. **Build the composer to
assemble automatically and require a human approval step before send.** If an issue can't be
assembled without meaningful manual work, the cadence is wrong, not the tooling.

### Acceptance criteria

- Two real issues sent to the live list.
- Archive pages render and are indexable.
- Unsubscribe works from a sent email, end to end, and is honored on the next send.
- A failed send is resumable without duplicate delivery.
- Bounce and complaint events are recorded and suppressed on subsequent sends.

### How we'll know it worked

Open rate and click-through to the site, both of which Resend and a tagged link give directly.

**Returning-visitor share is *not* usable as written, and the original draft was wrong to name
it the number that matters.** The existing `return_visit` event fires on every pageview after
the browser's first-ever one — `analytics.js:103-107` checks a `localStorage` flag, so a second
page in the same visit or a refresh both count — and nothing attributes a visit to a campaign.
It measures "not your first-ever pageview," not "came back." (`second_content_view` immediately
above it uses `sessionStorage` and *is* visit-scoped, so the distinction is already understood
in that file.) Using it as the deciding metric requires two things this plan does not currently
scope: a real visit/session boundary, and campaign attribution on inbound newsletter links.
Either scope both, or judge the newsletter on open rate and click-through alone and say so.
*(Caught by Codex review on this PR.)*

**Kill criterion:** if issues 3–6 need more than an hour of manual assembly each, or open rate
sits below ~20%, stop sending and reclaim the time; the list isn't an audience.

**Estimated size:** Medium. One migration (suppression + a per-`(issue_id, subscriber_id)`
delivery ledger — *not* a send cursor, which build item 3 rejects as unable to meet the
no-duplicate criterion), one composer script, one renderer, one send job, one extended route
plus `/newsletter/:issue/`, one webhook handler.

---

## 4. Feature 3 — The name finder

**Axis:** Expand. **Expected return:** Highest ceiling, slowest. **Risk:** Medium.

> **Deferred per §0, and re-scoped.** The premise below — that the "names like X" cluster has
> no surface — **is wrong.** `/name/:name/twin/` is a server-rendered page titled exactly
> "Names like {name}" (`render-twin.ts:18`), emitting an `ItemList`, linked from every name page
> (`render-name.ts:918`). In this window it drew 128 impressions across 97 URLs at average
> position 26.4 and **zero clicks**. The missing capability is *faceted filtering*, not a
> user-facing tool. Measure and extend the existing surface before scoping a separate large
> build — and understand why it converts nothing first, or the finder inherits the same problem.
> *(Caught by Codex review on this PR.)*

### The finding

The third-largest query cluster in the GSC window is **"names like X" / "similar to X" — 70
distinct queries** (`docs/seo/2026-06-09-gsc-blog-demand.md`), alongside ~145 queries about
popularity and rarity ("is Emma a rare name", "what is the rarest name in the US").

This is the **only cluster with commercial intent.** Someone asking how many Karens are left is
curious. Someone asking for names like Imogen but rarer is choosing a name for a child, and that
is the audience with a reason to return, subscribe, and eventually pay.

The site has every ingredient, and — contrary to the original draft — it already has a tool:
`/name/:name/twin/` serves precisely this query shape. What it lacks is filtering:

| Ingredient | Where |
|---|---|
| Trajectory similarity (cosine over `spark_blob`) | `functions/api/twin/[name].ts` |
| **A shipped, indexed "Names like X" page** | **`functions/name/[name]/twin/index.ts`, `render-twin.ts`** |
| Terminal-sound families | `functions/api/phoneme-families.ts`, `api/terminal-letters.ts` |
| Rarity, status, peak era, per-name metrics | `names` table, `classify.ts` |
| Living population + median age | `name_enrichment_profiles` |
| Geographic skew | `name_states`, `name_diaspora` |
| Shadow / counterfactual matching | `name_shadow_matches` |

And the actual search endpoint is prefix-only — `q` and `limit`, nothing else
(`functions/api/search.ts:11-12`). `/api/twin` takes one name and returns five look-alikes,
framed in its own header comment as *"shareable pairing content"* — a content feature, not a
discovery tool.

What there is no way to ask is the *filtered* form of the question — the part `/twin/` doesn't
serve: **"Names like Imogen, but rarer, and not trending up."** `/twin/` returns five
trajectory matches with no way to constrain them.

### What to build

A faceted finder at `/find/`, server-rendered with shareable URLs:

- **Seed by name** ("like Imogen") using the existing trajectory similarity, or start unseeded.
- **Facets:** rarity band (from `total_living_est` / latest count), trajectory (`classify.ts`
  status: rising / stable / declining / endangered / extinct), peak era, sound (initial,
  terminal cluster), sex, state skew.
- **Every result explains itself** — "1,240 living · declining since 1991 · peaks in Vermont."
  The explanation *is* the differentiator; every competitor returns a bare list.
- **Every result links to its name page**, which after Feature 1 is a strong landing page.
- **Shareable, indexable facet URLs — as paths, not query strings.** The original draft wrote
  these as `/find/?like=imogen&rarity=rare`. That form cannot be sitemapped by the current
  registry: `canonicalRoutePath()` returns only `url.pathname`
  (`indexable-routes.ts:78-83`), `buildIndexableRoutes()` deduplicates on that value
  (`:143-145`) so every `/find/?…` collapses to a single `/find/`, `absoluteIndexableUrl()`
  rebuilds from the canonical path, and the link auditor clears `url.search` outright
  (`validate-internal-links.ts:25`). Use path-based facets — `/find/like/imogen/rare/` or a
  similar segment scheme — or scope a registry, canonicalization, and auditor redesign into
  this feature explicitly. *(Caught by Codex review on this PR; verified against the source.)*

### Cost discipline

This is the feature that can quietly wreck the D1 bill. `CLAUDE.md` is explicit: *rows read is
the cost driver*, `ORDER BY ABS(col - ?)` is unindexable, and a bounded two-sided walk needs two
directional indexes. A faceted query over `names` with arbitrary filter combinations is exactly
the shape that degenerates into full scans.

Two constraints, non-negotiable:

- **Facets must map to indexed columns or pre-computed buckets.** Store rarity band and era
  band as materialized columns on `names` at ingest; don't compute them per request.
- **Any new index on `names` must be added to `rebuildIndexesIfNeeded()`**
  (`apps/ingest-worker/src/compute.ts`) *as well as* a migration. `CLAUDE.md` warns that ingest
  finalize renames `names_staging` → `names` and an index missing from that function silently
  disappears at the next ingest, visible only as a jump in rows read.

Follow `scripts/name-neighbors.test.ts`, which pins the existing neighbor walks to the SQL they
replaced — the new finder queries need the same treatment, with `EXPLAIN QUERY PLAN` verified
**in both scan directions**.

### Acceptance criteria

- Facet combinations return in comparable time to existing name-page reads, with no temp
  b-tree sort in `EXPLAIN QUERY PLAN` for any supported combination, verified both directions.
- Every result carries a plain-language reason.
- Facet URLs are shareable, server-rendered, and crawlable, and a representative set actually
  appears in the sitemap — which requires the path-based scheme above, since the registry
  discards query strings.
- Works without JavaScript for the core query path.
- Rows-read per query is measured and recorded in the PR, not assumed.

### How we'll know it worked

Impressions and clicks on `/find/*` for "names like" queries; result→name-page click-through in
the event pipeline. **Kill criterion:** if `/find/` doesn't out-earn the flat `/names/` index
within 8 weeks of indexing, the discovery thesis is wrong and the effort belongs back in capture.

**Estimated size:** Large. Migration + ingest change + compute columns + indexes (two per
directional walk) + API + SSR page + client enhancement + query-plan tests.

---

## 5. What this plan deliberately excludes

Each of these is a plausible idea rejected on current evidence:

- **More visualizations.** Twenty-eight exist. The best-performing one drew 32 pageviews in 30 days
  (`docs/analytics-baseline.md`). Marginal return is near zero until traffic exists.
- **More shareable artifacts.** Already built and not the bottleneck: `/viz/nameprint`
  (generative fingerprint), `/shadow/:name/:year/` ("The Counterfactual You"), `/viz/tenure`
  (redesigned for Reddit sharing, commit 6953b7a). Adding another one is repeating a move that
  hasn't paid yet.
- **International / UK ONS data.** The data is in the repo (`extra/`), and it would roughly
  double addressable queries — but it's a second product with a second data pipeline, and the
  US product isn't converting yet. Revisit after Feature 3 proves the finder thesis.
- **Deeper agent/MCP investment.** `functions/mcp.ts`, `a2a.ts`, `webbotauth.ts`, and the x402
  paid endpoint are a genuinely differentiated bet, already placed. But the site currently has
  more agent infrastructure than human audience, and returns there are unmeasurable today.
  Hold, don't grow, until the analytics pipeline can attribute something to it.
- **User accounts and watchlists.** Explicitly out of scope in the editorial growth plan, and
  premature at 220 visits/month. The newsletter is the right retention primitive at this stage.

---

## 6. Sequencing

**Superseded by §0.** The original ordering (name pages → newsletter → finder) assumed the
capture lever was large. It is not, at current impression volume. The live sequence is §0's:
diagnose the ranking gap, ship the resized name-page work, re-measure, and only then revisit
Features 2 and 3.

The original ordering is preserved here for the record:

| Order | Feature | Original rationale |
|---|---|---|
| 1 | Answer-first name pages | Smallest change, largest immediate effect, converts existing rankings. |
| 2 | Newsletter pipeline | Only worth sending once there's traffic to convert. |
| 3 | Name finder | Largest build, highest cost risk; do it once the other loops close. |

## 7. Open decisions

These need a human call; none of them block starting Feature 1.

1. **Newsletter cadence.** Weekly is the editorial growth plan's assumption. Monthly is far more
   survivable for a solo project and probably the right answer.
2. **Does `/find/` target expectant parents explicitly?** That audience converts, but it pulls
   the brand toward the generic baby-name-site positioning the project has so far avoided. The
   current voice ("Is your name going extinct?") is a differentiator worth protecting.
3. **The distribution question §0 raises.** If off-site authority is the binding constraint,
   the next move is a distribution decision (links, partnerships, press, syndication), not a
   feature. That is outside what this document scopes and needs an explicit call.
4. **Is monetization in scope this cycle?** The x402 endpoint exists but is testnet-only
   (`base-sepolia`, `functions/api/premium/report/[name].ts`). The editorial growth plan ruled
   out paid subscriptions for its cycle. Feature 3 is the first thing that would plausibly
   support one.
