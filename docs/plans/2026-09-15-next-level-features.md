# Three features to take nobodynamed to the next level

**Date:** September 15, 2026
**Status:** Proposal — not yet scheduled
**Author's scope note:** Every claim below is anchored to a file in this repo. Traffic figures
come from the repo's own recorded exports (`docs/analytics-baseline.md`, July 24 2026;
`docs/seo/2026-06-09-gsc-blog-demand.md`, June 9 2026). Those exports are 2–3 months old and
were **not** re-verified against live GSC or Cloudflare Analytics for this document — the
Ahrefs GSC connector available in this environment is plan-gated and returned
`Insufficient plan`. Treat the numbers as directionally true but stale; re-pull before
committing to the sequencing in §6.

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

**Axis:** Capture. **Expected return:** Highest and fastest. **Risk:** Low.

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
   Gate on the existing `hasReliableLiving` check (`generate-narrative.ts:326`) so no title
   asserts a number the enrichment layer won't stand behind.

2. **`FAQPage` structured data** built from the four answers `generateNarrative()` already
   returns (`answers.population / rarity / age / trend / geography`,
   `generate-narrative.ts:338-344`). These are already-written prose answers to the exact
   questions being searched; they are currently invisible to the SERP. Add alongside the existing
   JSON-LD block in `render-name.ts:1024-1051`.

3. **A `/living/` hub** ranking names by `total_living_est`, split by sex and by median-age band —
   the index page for the 25-query cluster, and an internal-link target for all 17k name pages.
   The aggregate is a single ordered read over `name_enrichment_profiles`; follow the
   `viz_payloads` precedent in `CLAUDE.md` if it needs pre-computing.

4. **OG cards that lead with the number**, not the name. `functions/api/og/[name].ts` exists;
   change what it renders.

### Acceptance criteria

- Every name page title is derived from that name's own data; no two titles differ only by name.
- No title claims a living estimate where `hasReliableLiving` is false.
- `FAQPage` JSON-LD validates in Google's Rich Results Test for a name in each branch.
- `/living/` renders, is in the sitemap (`indexable-routes.ts`), and satisfies the repo's
  three-inbound-link rule.
- Title/description length bounds are unit-tested, mirroring `scripts/editorial-pages.test.ts`.

### How we'll know it worked

GSC CTR for the `/name/*` path group, 28 days pre vs. post. The year-page fix is the control:
if that one moved CTR, this one should move it further, because name pages carry more of the
17k-URL footprint. **Kill criterion:** no measurable CTR change after 6 weeks at stable
impressions means the snippet isn't the constraint and the rest of this plan's capture thesis
needs rethinking.

**Estimated size:** Small. One narrative function, one JSON-LD block, one new route, one OG
template. No migration, no ingest change, no new data.

---

## 3. Feature 2 — Ship the newsletter that already has subscribers

**Axis:** Retain. **Expected return:** Compounding. **Risk:** Low technical, medium editorial.

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
- No issue composer, no send job, no public archive route.

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
   content-factory posts published since the last issue (`content/`, `blog_posts`), the current
   week's movers (`functions/api/movers/[year].ts`), and one name drawn from the enrichment
   layer. Writes a row to `newsletter_issues` with status `draft`.
2. **Render once, use twice.** One renderer producing both the email HTML and the archive page,
   following the existing `render-blog.ts` pattern. Do not maintain two templates.
3. **Send job.** Batched Resend send over confirmed subscribers, with per-subscriber
   unsubscribe tokens (`newsletter-tokens.ts` already signs these), resumable from a
   `last_sent_subscriber_id` cursor so a mid-batch failure doesn't double-send.
4. **Public archive** at `/newsletter/archive/` and `/newsletter/:issue/` — indexable, in the
   sitemap, and an SEO surface in its own right.
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

Open rate, click-through to site, and — the number that matters — **returning-visitor share**
in the analytics pipeline that already exists. **Kill criterion:** if issues 3–6 need more than
an hour of manual assembly each, or open rate sits below ~20%, stop sending and reclaim the
time; the list isn't an audience.

**Estimated size:** Medium. One migration (suppression + send cursor), one composer script, one
renderer, one send job, two routes, one webhook handler.

---

## 4. Feature 3 — The name finder

**Axis:** Expand. **Expected return:** Highest ceiling, slowest. **Risk:** Medium.

### The finding

The third-largest query cluster in the GSC window is **"names like X" / "similar to X" — 70
distinct queries** (`docs/seo/2026-06-09-gsc-blog-demand.md`), alongside ~145 queries about
popularity and rarity ("is Emma a rare name", "what is the rarest name in the US").

This is the **only cluster with commercial intent.** Someone asking how many Karens are left is
curious. Someone asking for names like Imogen but rarer is choosing a name for a child, and that
is the audience with a reason to return, subscribe, and eventually pay.

The site has every ingredient and no tool:

| Ingredient | Where |
|---|---|
| Trajectory similarity (cosine over `spark_blob`) | `functions/api/twin/[name].ts` |
| Terminal-sound families | `functions/api/phoneme-families.ts`, `api/terminal-letters.ts` |
| Rarity, status, peak era, per-name metrics | `names` table, `classify.ts` |
| Living population + median age | `name_enrichment_profiles` |
| Geographic skew | `name_states`, `name_diaspora` |
| Shadow / counterfactual matching | `name_shadow_matches` |

And the actual search endpoint is prefix-only — `q` and `limit`, nothing else
(`functions/api/search.ts:11-12`). `/api/twin` takes one name and returns five look-alikes,
framed in its own header comment as *"shareable pairing content"* — a content feature, not a
discovery tool.

There is no way to ask the site the question its data is uniquely able to answer:
**"Names like Imogen, but rarer, and not trending up."**

### What to build

A faceted finder at `/find/`, server-rendered with shareable URLs:

- **Seed by name** ("like Imogen") using the existing trajectory similarity, or start unseeded.
- **Facets:** rarity band (from `total_living_est` / latest count), trajectory (`classify.ts`
  status: rising / stable / declining / endangered / extinct), peak era, sound (initial,
  terminal cluster), sex, state skew.
- **Every result explains itself** — "1,240 living · declining since 1991 · peaks in Vermont."
  The explanation *is* the differentiator; every competitor returns a bare list.
- **Every result links to its name page**, which after Feature 1 is a strong landing page.
- **Shareable, indexable facet URLs** — `/find/?like=imogen&rarity=rare` — so the long tail of
  "names like X" queries has a real destination instead of a generic search box.

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
- Facet URLs are shareable, server-rendered, and crawlable; a representative set is in the
  sitemap.
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

Strictly ordered. Each stage de-risks the next.

| Order | Feature | Why here |
|---|---|---|
| 1 | Answer-first name pages | Smallest change, largest immediate effect, and it converts rankings that already exist. Also makes the landing pages Feature 3 depends on worth landing on. |
| 2 | Newsletter pipeline | Only worth sending once there's traffic to convert. Unblocks the editorial growth plan's own Phase 5. |
| 3 | Name finder | Largest build, highest cost risk. Do it once the capture and retention loops are closed, so its traffic has somewhere to go. |

**Before starting:** re-pull GSC and Cloudflare Analytics. Every number in this document is 2–3
months old. If name-page CTR has already moved, Feature 1 shrinks and the order may change.

---

## 7. Open decisions

These need a human call; none of them block starting Feature 1.

1. **Newsletter cadence.** Weekly is the editorial growth plan's assumption. Monthly is far more
   survivable for a solo project and probably the right answer.
2. **Does `/find/` target expectant parents explicitly?** That audience converts, but it pulls
   the brand toward the generic baby-name-site positioning the project has so far avoided. The
   current voice ("Is your name going extinct?") is a differentiator worth protecting.
3. **Is monetization in scope this cycle?** The x402 endpoint exists but is testnet-only
   (`base-sepolia`, `functions/api/premium/report/[name].ts`). The editorial growth plan ruled
   out paid subscriptions for its cycle. Feature 3 is the first thing that would plausibly
   support one.
