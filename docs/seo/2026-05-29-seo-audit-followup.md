# SEO Audit — Follow-up Pass (off-page intent + deep technical + live data)

**Date:** 2026-05-29
**Companion to:** `docs/seo/2026-05-29-seo-audit.md`
**Goal:** Cover what the first pass deferred — competitor/keyword landscape, plus a deeper technical crawl backed by live production data.

## Data-source note (important)

The intended source for off-page metrics was **Google Search Console**. The only GSC interface available in this environment is bundled inside the Ahrefs MCP server, and **every Ahrefs/GSC endpoint returns `Insufficient plan`** (`gsc-keywords`, `gsc-pages`, `gsc-performance-history`, `management-projects`, even the free `subscription-info`). There is no standalone GSC connector, and direct Google Search Console API access requires OAuth credentials for the verified property, which this environment does not hold.

So **real ranking/impression/click data is still unavailable.** To compensate, this pass used every other means available:

- **Cloudflare MCP** → queried the live `name-vitals` D1 database directly for true content/coverage figures, and confirmed deployment/runtime facts.
- **Live HTTP crawl** → headers, compression, render path, internal-link graph, structured-data integrity, sitemap liveness.
- **Web research** → reconstructed the competitor and keyword landscape (see §3).

Where a number comes from live data it is marked **[D1]**; from the live crawl, **[crawl]**.

---

## 1. Live content & coverage data [D1]

Queried directly against the production D1 (`name-vitals`, 779 MB):

| Metric | Value |
|---|---|
| Data freshness (`max_year` in `meta`) | **2025** — current; SSA's latest release is ingested |
| `min_year` | 1880 |
| Total name/sex rows | **117,826** |
| Distinct names | **105,972** |
| Yearly observations (`name_years`) | **2,181,073** |
| Names with births in the latest year | **31,227** |
| Names with all-time total ≥ 1,000 | **12,657** |
| Names with peak ≥ 500 | **2,786** |
| **URLs in live sitemap** [crawl] | **16,961** |

**Status distribution** (pre-computed by `classify()`):

| Status | Count | Share |
|---|---:|---:|
| extinct | 59,765 | 50.7% |
| declining | 34,145 | 29.0% |
| stable | 12,065 | 10.2% |
| rising | 10,311 | 8.8% |
| endangered | 1,540 | 1.3% |

**Takeaways:**

- **Data is fresh (through 2025).** No staleness problem — the ingest pipeline is current.
- **Coverage is healthier than the first pass implied.** The sitemap holds **16,961** URLs (the first report's "~2k" was a truncated WebFetch sample — corrected here). That comfortably covers every name with meaningful volume (12,657 names ≥1,000 all-time births; 2,786 with peak ≥500).
- **The "extinct" catalog is the single biggest asset and the clearest moat.** Over **59,000** name/sex records are classified extinct — a category essentially no competitor covers at this depth (see §3). Most are *not* in the sitemap today. This is the highest-leverage expansion target (§4).

---

## 2. Deep technical crawl — new findings

These extend (don't replace) the first report. Severity uses the same scale.

### 2.1 🟠 P1 (re-confirmed) — Homepage still serving the stuck Markdown variant [crawl]
Re-checked during this pass: `GET /` returned `content-type: text/markdown` with `age: 1391`s (~23 min) across repeated requests on the ORD PoP — the sticky edge-cache variant documented in the first report (§1 there). Still live. The fix and mechanism are unchanged; this just confirms it persists.

### 2.2 🟡 P2 (new) — High-intent hub pages have no server-rendered internal links [crawl]
The primary topical hubs are static shells that build their tables **client-side** (`renderLandingTable()` → `fetch('/api/landing/…')`). The server HTML contains **zero** links to the name/year pages they feature:

| Hub | Server-rendered `/name/` links |
|---|---:|
| `/extinct` | 0 |
| `/endangered` | 0 |
| `/rising` | 0 |
| `/comeback` | 0 |
| `/year` (→ individual year pages) | 0 |

By contrast, the editorial `[slug].ts` hubs render links server-side correctly — `/millennial-names`, `/classic-names`, `/gen-z-names` each ship 6 `/name/` links in HTML.

**Why it matters:** these five hubs target the site's most distinctive head terms ("extinct baby names", "rising baby names", "endangered names", "comeback names", "popular names by year"). Because their name/year links exist only after client-side JS runs, Googlebot must render to discover them — which is slower and less reliable than HTML links, and weakens the topical internal-link equity flowing from each hub to the name pages it should be endorsing. The `/year` hub exposes **none** of the 146 year pages as crawlable links.

**Fix:** server-render the top ~25–50 entries (and, for `/year`, the full 1880–2025 list) into each hub as real `<a href="/name/…">` / `<a href="/year/…">` links — exactly the pattern `[slug].ts` already uses. The data is a single edge query/`/api/landing` call that can run in the Function instead of the browser. Keep the interactive client table on top; just ensure a crawlable HTML list exists underneath (progressive enhancement).

### 2.3 🟢 P3 (new) — Cloudflare Rocket Loader rewrites `app.js` [crawl]
Name pages ship `<script src="/assets/app.js" type="…-text/javascript">` plus the injected `rocket-loader.min.js` — i.e. **Rocket Loader is enabled** and defers/rewrites the app script. Upsides aside, Rocket Loader can delay interactivity (INP/LCP) and has a history of subtle hydration breakage. Verified the **JSON-LD survived** (`type="application/ld+json"` intact), so structured data is safe. Recommendation: confirm Core Web Vitals (esp. INP) in PageSpeed Insights/CrUX; if Rocket Loader isn't earning its keep, disabling it for this app (which already loads little JS) removes a variable.

### 2.4 🟢 P3 (new) — Security headers are inconsistent / HSTS absent [crawl]
- The homepage carries `x-content-type-options: nosniff` and `referrer-policy: strict-origin-when-cross-origin`, but **Function-rendered pages (e.g. `/name/Emma/`) carry neither.**
- **No `Strict-Transport-Security` (HSTS) header anywhere.**

Not a direct ranking factor, but HSTS is a baseline best practice (and an SEO/"page experience" hygiene signal). Set HSTS + the two headers globally in `_headers` / middleware so every response (assets *and* Functions) is consistent.

### 2.5 ✅ Verified healthy [crawl]
- **Brotli compression + HTTP/2** on all page types.
- **Sitemap liveness:** a random sample of 12 name URLs all returned `200` — no dead entries.
- **Parameter handling:** `/name/Emma/?sex=F` correctly self-canonicalizes to `/name/Emma/` (no parameter-duplication risk).
- **404s are real** (`/name/Zzqfake/` → `404` with a useful titled page), not soft-200s.
- **Titles/descriptions are well-sized:** name title ~60 chars; descriptions 121–137 chars (ideal 120–160 band). `/year/1990/` title is 69 chars — mildly long but acceptable.
- **Heading hierarchy** on name pages is clean (1×h1, 2×h2, 3×h3); the single `<img>` (wordmark) has alt text; charts are inline accessible SVG.

---

## 3. Competitor & keyword landscape (web research)

> Reconstructed via web research in lieu of GSC/Ahrefs ranking data. Traffic/authority figures are SimilarWeb-derived estimates and qualitative SERP observations — directional, not exact.

### 3.0 🔴 Indexation alert — the site appears effectively *unindexed*
Across multiple searches, **`site:nobodynamed.com` returned no nobodynamed.com pages**, and brand/topic queries surfaced only competitors. As of this audit the site is **not visibly present in Google's index.**

This is the most consequential off-page finding, and it reframes everything else: there is no ranking data to retrieve because there is little/nothing indexed yet. Likely contributors, in order of suspicion:
1. **Newness** — if the domain/site is recently launched, indexing simply lags (weeks). This alone could explain it.
2. **The homepage Markdown bug (§2.1 / first report §1)** — the root URL, the page that anchors crawl discovery and accrues the most external links, intermittently serves link-less plain-text Markdown. That actively suppresses discovery of everything it should link to.
3. **No verified Google Search Console property / no manual sitemap submission** (inferred from the GSC access failure).

The good news: the fundamentals that *enable* indexing are sound — `robots.txt` allows all, the sitemap is live with 16,961 healthy URLs, and per-name/per-year pages return **real server-rendered HTML** (verified in §2, not empty shells). So this is a discovery/freshness problem, not a "Google can't read the pages" problem.

**Do first:** (a) verify the property in Google Search Console; (b) submit `https://nobodynamed.com/sitemap.xml`; (c) fix the homepage Markdown variant so the root indexes as HTML; (d) URL-Inspect + Request Indexing for the homepage and a handful of priority hubs/name pages; (e) then watch the Pages/Coverage report. Until the site is indexed, all the on-page work in these reports can't earn traffic.

### 3.1 Competitors — three tiers
- **Tier 1 — authoritative source:** **ssa.gov/oact/babynames** owns the underlying data and a `.gov` domain; wins head terms and is cited by nearly every news story. Weakness: dated UX, no per-name narrative, no interpretation.
- **Tier 2 — high-authority content/community brands:** **nameberry.com** (category leader, ~3M visits/mo, forums + lists + trend editorial), **behindthename.com** (the etymology/meaning + popularity-by-country authority), **babycenter.com** (parenting traffic giant, ~25M visits/mo — *the* brand the press cites for "endangered/extinct names" stories), **thebump.com** (~9M/mo, strong A-Z lists), **babynames.com** (long-running but now small).
- **Tier 3 — data-tool sites (nobodynamed's true peer group, far weaker authority):** **namecensus.com** is the closest direct competitor — same SSA files plus Census surnames + CDC life tables, with per-name history, geographic spread, decade sparklines, and a **mortality-adjusted living-bearer estimate**. Others: **engaging-data.com** (Baby Name Voyager revival), **namerology.com / NameGrapher** (Laura Wattenberg — strong expert-author signal), **datayze.com**, **nametrends.net**.

**Strategic read:** don't fight Tier 1/2 on head terms or on *meaning/etymology*. Win in Tier 3 on **data + trajectory**, where authority is low and nobodynamed's pre-classified status (rising/stable/declining/endangered/extinct) is a genuine differentiator. The site to out-execute is **namecensus.com**.

### 3.2 Query landscape & SERP features
- **Head terms** ("baby names", "popular baby names 2025/2026") — dominated by SSA + Tier 2; hard to win; news pack fires each May at the SSA release.
- **Mid-tail (winnable):** "popular baby names by year", "popular baby names 1990/1990s" (recurring per-decade demand), "names that start with [letter]" (26 letters × gender = large repeatable surface), "old fashioned / vintage comeback / gen-z / gender-neutral names".
- **Long-tail (lowest competition, biggest opportunity):** **"[name] name popularity"**, **"is [name] still popular"**, "how rare is my name", "[name] popularity by year" — exactly the per-name layer nobodynamed already generates at scale.
- **SERP features to target:** featured snippets/answer boxes (top names by year — formattable from the data), heavy **People Also Ask** ("Is [name] popular?", "What's the rarest name?"), seasonal **news pack**, and entity **knowledge panels** for some names. Clean, directly-answering name/year pages are well positioned for snippets + PAA.

### 3.3 Content gaps & differentiation
1. **Per-name "is it still popular / trajectory" intent** — SSA has tables but no interpretation; Tier 2 has vibes but thin stats. nobodynamed's classified status answers this directly.
2. **Comprehensive long-tail name + year coverage** — big brands don't build this out exhaustively; nobodynamed's ~100k name pages + per-year pages are a structural advantage (tie to §1 / §4 coverage expansion).
3. **Own the "extinct / endangered / comeback" data niche** — journalists (Newsweek, HuffPost, Fox, ABC) keep running these stories and **all cite BabyCenter** as the data source. nobodynamed already *computes* these classifications (59,765 extinct records, §1). Becoming the canonical, transparent, always-updated, **citable** source here is both a content moat and a **link-building/PR magnet**.
4. **"Names starting with [letter]" + popularity data** — competitors do bare A-Z lists; adding sparklines + rising/declining tags differentiates.
5. **Gaps to close vs. namecensus:** consider a **living-bearer/mortality-adjusted estimate** (the codebase already has actuarial enrichment) and **state-level data** (SSA publishes state files since 1910) — both pull traffic and aid the long-tail.

### 3.4 Timely 2025–2026 hooks (SSA data dropped May 8, 2026)
- **2025 results:** Olivia & Liam top for the 7th year; **Charlotte overtook Emma** for #2 girls; **Ava fell out of the top 10**, replaced by **Eliana**. → refresh the 2025 year page + a "what changed in 2025" piece now.
- **Fastest risers:** **Kasai** (boys) and **Klarity** (girls) — feed the `/rising` hub.
- **Vintage comebacks:** Vivian (#99, last in top 100 in 1934), Josephine (#96, since 1943), Arthur (#95, since 1970) — feed `/comeback` with real re-entry data.
- **Endangered 2026 cycle:** Catherine, Jamie, Danielle, Dylan (girls); Jaden, Phillip, Albert (boys) — currently all credited to BabyCenter; opportunity to be the alternative source.

**Sources:** ssa.gov/oact/babynames (+ /decades/, 2026-05-08 press release & blog), nameberry.com (+ /baby-names-a-z, /blog/baby-name-trends-2025), behindthename.com/top/lists/united-states/1990, similarweb.com profiles (babycenter, thebump, babynames), namecensus.com, engaging-data.com/baby-name-visualizer, namerology.com/baby-name-grapher, today.com baby-name tool & 1990s list, newsweek.com & huffpost.com "going extinct 2026", rd.com baby-name-trends, backlinko.com/hub/seo/serp-features.

---

## 4. Prioritized recommendations from this pass

1. **(🔴 Do first) Get the site indexed** (§3.0). Verify the Google Search Console property, submit the sitemap, fix the homepage Markdown variant, and Request Indexing for the homepage + priority pages. Nothing else in either report can earn traffic until the site is in the index — and right now it appears not to be.
2. **(Carry-over, P1)** Ship the homepage cache-variant fix from the first report — still live, and a direct contributor to #1.
3. **(P2) Server-render internal links on the five client-rendered hubs** (§2.2). Highest new-found on-page leverage: it strengthens crawl + topical relevance for the site's most differentiated head terms and exposes the year pages.
4. **(P2) Expand indexable coverage into the extinct catalog** (§1, §3.3). With 59k+ extinct records and near-zero competition for "extinct/forgotten/disappeared names," gate on content quality (e.g. peak ≥ 100 → 8,326 names) and grow the sitemap via a **sitemap index** of ≤50k-URL child files. Pair with a citable, always-updated extinct/endangered data hub as a PR/link magnet (journalists currently cite BabyCenter).
5. **(P2, timely) Publish/refresh the 2025-release content now** (§3.4) — "what changed in 2025", fastest risers, vintage comebacks — while the May SSA-release news cycle is live.
6. **(P3)** Add HSTS + consistent security headers (§2.4); validate Rocket Loader against Core Web Vitals (§2.3); consider state-level data + a living-bearer estimate to match namecensus (§3.3).
7. **(Ongoing)** Connect a working GSC export (or an Ahrefs plan with Site Audit + GSC) so the next pass can ground these hypotheses in real impression/click/position data and a backlink profile.
