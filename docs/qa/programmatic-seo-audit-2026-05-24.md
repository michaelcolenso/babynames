# Programmatic SEO Audit — NobodyNamed
**Date:** 2026-05-24  
**Scope:** All programmatically generated page types  
**Site:** https://nobodynamed.com

---

## 1. Programmatic Page Inventory

| Page Type | URL Pattern | Count | In Sitemap? | Schema | Content Source |
|-----------|-------------|-------|:-----------:|--------|----------------|
| **Name profiles** | `/name/:name/` | ~17,010 | ✅ | WebPage + Dataset + FAQPage + BreadcrumbList | D1 (SSA data) |
| **Year rosters** | `/year/:year/` | ~145 | ✅ | WebPage + Dataset + BreadcrumbList | D1 |
| **Decade rosters** | `/names/:decade/` | ~15 | ✅ | CollectionPage + BreadcrumbList | D1 |
| **Initial rosters** | `/names/:letter/` | 26 | ✅ | CollectionPage + BreadcrumbList | D1 |
| **Ending rosters** | `/names/ending/:letter/` | 26 | ✅ | CollectionPage + BreadcrumbList | D1 |
| **Shadow comparisons** | `/shadow/:name/:year/` | Millions (potential) | ❌ | WebPage + BreadcrumbList + Dataset | D1 |
| **Twin matches** | `/name/:name/twin/` | ~85k (potential) | ❌ | WebPage + BreadcrumbList + ItemList | D1 |
| **Editorial aliases** | `/millennial-names`, etc. | 9 | ✅ | CollectionPage + BreadcrumbList | Hardcoded |
| **Status hubs** | `/extinct`, `/rising`, etc. | 5 | ✅ | CollectionPage | Static HTML + JS |
| **Blog posts** | `/blog/:slug/` | 1 | ✅ | BlogPosting + BreadcrumbList | D1 |
| **Viz pages** | `/viz/*` | 16 | ✅ | WebPage / CollectionPage | Static HTML |

**Total sitemap URLs:** ~17,250 (well under 50k limit)

---

## 2. Data Foundation

| Metric | Value | Assessment |
|--------|-------|------------|
| Total name/sex rows | 107,973 | Strong |
| Unique names | 97,310 | Strong |
| Names with both sexes | 10,663 | Handled correctly (canonical per name) |
| Names peaked ≥500 | 2,541 | High-cultural-signal cohort |
| Indexable names | 17,010 | Good threshold (quality_score ≥3) |
| Year range | 1880–2024 | 145 years |
| Year total rows | 276 | Both sexes per year |

**Data defensibility:** **Proprietary analysis of public-domain data.** The raw SSA data is public, but the classification (rising/stable/declining/endangered/extinct), sparkline encoding, similarity matching, and narrative generation are original. This sits at level 3-4 on the defensibility hierarchy (product-derived analysis of public data).

---

## 3. Page-Type Quality Assessment

### 3.1 Name Pages (`/name/:name/`) — STRONG

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ✅ Excellent | Every name has unique counts, peak year, sparkline, status, related names, discovery clusters, FAQ |
| Title quality | ✅ Good | Includes status, peak year, name |
| Meta description | ✅ Good | Custom per status type |
| Content depth | ✅ Good | ~800+ words equivalent with data viz, narrative, metrics, FAQ |
| Schema markup | ✅ Excellent | 4 schema types, recently enhanced |
| Internal linking | ✅ Good | Links to year, decade, initial, ending, twin, shadow, related names |
| Freshness | ⚠️ Moderate | Data date is proxy (`yM-05-15`), not actual ingest date |

**Risk:** Very low. These are the site's strongest pages.

**Issue:** ~80,300 names are NOT indexable (below quality threshold). Some of these may have legitimate search interest. Consider a lower threshold or tiered indexation (high-quality in sitemap, lower-quality noindex but crawlable).

---

### 3.2 Year Pages (`/year/:year/`) — STRONG

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ✅ Excellent | Top 25 girls + top 25 boys, unique per year |
| Title quality | ✅ Good | "Top baby names in {year}" |
| Content depth | ✅ Good | 50 ranked names with counts |
| Schema markup | ✅ Good | Recently enhanced with publisher, spatialCoverage, keywords |
| Internal linking | ⚠️ Moderate | Has prev/next year nav but no links to decade pages |

**Risk:** Low. Each year has genuinely unique rankings.

**Improvement:** Add a "See all names from the {decade}s" link to connect year → decade.

---

### 3.3 Decade Pages (`/names/:decade/`) — GOOD

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ✅ Good | Top names aggregated across 10 years |
| Title quality | ✅ Good | "{decade} Baby Names" |
| Content depth | ⚠️ Moderate | Paragraph + name list. Could use more narrative context. |
| Schema markup | ⚠️ Moderate | CollectionPage only, no ItemList for rankings |
| Internal linking | ✅ Good | Adjacent decade nav |

**Risk:** Low. Decade aggregation provides distinct value from year pages.

**Improvement:** Add decade-specific narrative ("The 1980s were defined by...") and ItemList schema for the ranked names.

---

### 3.4 Initial Pages (`/names/:letter/`) — MODERATE

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ⚠️ Moderate | Just a filtered view of names. The content is inherently a list. |
| Title quality | ✅ Good | "Baby Names That Start With {letter}" |
| Content depth | ⚠️ Thin | One paragraph + 50 names. No narrative about letter trends. |
| Schema markup | ⚠️ Moderate | CollectionPage only |
| Differentiation | ❌ Weak | Pages for adjacent letters (A vs B) have identical structure, just swapped names. |

**Risk:** Medium. 26 pages with nearly identical structure. Google may view these as "search results in disguise."

**Improvement needed:** Add letter-specific analysis — e.g., "A names peaked in the 1950s and have declined since" or "K names surged in the 1990s." Use actual data to make each page unique.

---

### 3.5 Ending Pages (`/names/ending/:letter/`) — MODERATE

Same issues as initial pages. Even thinner because final-letter patterns are less culturally meaningful than initial letters.

**Risk:** Medium. Same structural duplication concern.

**Improvement:** Same as initial pages — add data-driven narrative about ending-letter trends.

---

### 3.6 Shadow Pages (`/shadow/:name/:year/`) — STRONG (but invisible)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ✅ Excellent | Each page compares a specific name at a specific year to its 50-year shadow. Completely unique. |
| Title quality | ✅ Good | "{name} ↔ {shadow} — The Counterfactual You" |
| Content depth | ✅ Good | Side-by-side comparison with sparklines, narrative, metrics |
| Schema markup | ✅ Good | Recently enhanced with BreadcrumbList and Dataset |

**Critical Issue:** **NOT in sitemap. NOT linked from name pages** (the name page has a "Meet your shadow" link but it's to `/shadow/:name/:yM/` which is just one variant per name).

With 17k names × 145 years = ~2.4M potential combinations. Currently only accessible by clicking "Meet your shadow" which goes to the latest year only.

**Recommendation:** These are high-unique-value pages. Consider:
1. Adding `/shadow/:name/:yM/` (the default shadow for each name) to the sitemap
2. Or creating a hub page `/shadows/` that showcases interesting shadow pairs

---

### 3.7 Twin Pages (`/name/:name/twin/`) — GOOD (but invisible)

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ✅ Good | Cosine-similarity ranking is data-driven and unique per name |
| Title quality | ✅ Good | "Names like {name}" |
| Content depth | ⚠️ Moderate | 5 similar names. Thin but useful. |
| Schema markup | ✅ Good | Recently enhanced with ItemList |

**Issue:** NOT in sitemap. Only accessible from name pages. With 17k names, that's 17k potential pages.

**Risk:** Low — pages are useful and unique. But they're not getting indexed.

**Recommendation:** Add twin pages to sitemap (they'd use ~17k URLs, still well under 50k limit).

---

### 3.8 Editorial Alias Pages (`/millennial-names`, `/gen-z-names`, etc.) — MODERATE

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ⚠️ Moderate | 6 example names + 1 paragraph. Very thin unless `table` is specified. |
| Title quality | ✅ Good | "{topic} Baby Names \| NobodyNamed" |
| Content depth | ❌ Thin | Only `/comebacks` has a data table. Others are essentially landing pages with 6 name cards. |
| Schema markup | ⚠️ Moderate | CollectionPage but no ItemList |

**Risk:** Medium-thin. Pages like `/classic-names` have almost no content beyond 6 name cards and a sentence.

**Improvement:** Add data tables to all editorial aliases (not just `/comebacks`). Use the landing API to populate real lists.

---

### 3.9 Static Status Hubs (`/extinct`, `/endangered`, `/rising`, `/comeback`) — POOR

| Criterion | Rating | Notes |
|-----------|--------|-------|
| Unique value per page | ❌ Poor | Just a lede sentence + search box. The actual name list is **client-side rendered** via JavaScript. |
| Content depth | ❌ Very thin | Googlebot without JS sees: title, 1 sentence, search box, footer. |
| Schema markup | ⚠️ Moderate | CollectionPage but no items listed |
| Differentiation | ❌ Poor | All 4 pages have identical structure. Only the lede sentence and title differ. |

**This is the biggest programmatic SEO weakness on the site.**

These pages target high-volume queries ("extinct baby names", "rising baby names") but Google may see them as nearly empty. The name lists are fetched via `/api/landing/:kind` and rendered client-side.

**Risk:** HIGH. Thin content penalty risk. Doorway page risk.

**Fix required:** Server-render the top 20-50 names on each page. The `/api/landing/:kind` endpoint already returns the data — use it in the Pages Function to render HTML server-side.

---

### 3.10 `/year` (Birth Year Landing) — MODERATE

Same issue as status hubs — client-side rendered. The year input form is fine, but there's no pre-rendered content.

---

## 4. Duplicate Content & Cannibalization Analysis

### 4.1 Name Pages — Both Sexes
**Finding:** 10,663 names have both M and F entries in D1.  
**Handling:** The `/name/:name/` URL canonicalizes to one page per name, showing the dominant sex. The other sex is shown as an "also" section.  
**Risk:** ✅ LOW. Handled correctly.

### 4.2 Year vs Decade Overlap
**Finding:** `/year/1985/` and `/names/1980s/` both show names from the 1980s.  
**Differentiation:** Year pages show a single year's top 25. Decade pages show aggregate top 25 across 10 years.  
**Risk:** ✅ LOW. Different enough.

### 4.3 Initial vs Ending Overlap
**Finding:** `/names/a/` and `/names/ending/a/` could show some of the same names.  
**Differentiation:** Different sorting (total count vs. some other metric) and different user intent.  
**Risk:** ✅ LOW.

### 4.4 Editorial Alias vs Status Hub
**Finding:** `/comeback` and `/comebacks` both exist.  
**Status:** `/comeback` is a static HTML page. `/comebacks` is an editorial alias in `[slug].ts`.  
**Risk:** ⚠️ MEDIUM. Potential duplicate. The static page should 301 to the alias or vice versa.

### 4.5 Status Hub Identical Structure
**Finding:** `/extinct`, `/endangered`, `/rising` have identical HTML structure. Only title, meta, and lede differ.  
**Risk:** ⚠️ MEDIUM. Google may view these as template pages with minimal differentiation.

---

## 5. Internal Linking Architecture

### 5.1 Current State

```
Home
├── /extinct, /endangered, /rising, /comeback, /year (hubs)
├── /name/:name/ (profiles)
│   ├── /year/:peakYear/ (from name page)
│   ├── /names/:decade/ (from name page)
│   ├── /names/:initial/ (from name page)
│   ├── /names/ending/:ending/ (from name page)
│   ├── /name/:name/twin/ (from name page)
│   └── /shadow/:name/:yM/ (from name page)
├── /year/:year/ (rosters)
├── /names/:decade/ (rosters)
├── /names/:letter/ (rosters)
├── /names/ending/:letter/ (rosters)
├── /blog/:slug/ (posts)
└── /viz/* (visualizations)
```

### 5.2 Gaps

| Gap | Impact |
|-----|--------|
| Year pages don't link to decade pages | Missed hub-and-spoke signal |
| Decade pages don't link to individual year pages | Missed deep-link signal |
| Status hubs don't link to each other | Missed related-topic signal |
| No "names like this" cross-links between name pages | Missed similarity signal |
| Blog posts auto-link names → good, but no tag/category pages | Missed topical clustering |
| Shadow pages not linked from anywhere except name pages | Orphan risk |
| Twin pages not linked from anywhere except name pages | Orphan risk |

---

## 6. Indexation Strategy

### 6.1 Current Sitemap Coverage

| URL Type | Count | Priority | Notes |
|----------|-------|----------|-------|
| Name pages | ~17,010 | 0.8 | Quality-threshold gated |
| Year pages | ~145 | 0.6 | All years |
| Decade pages | ~15 | 0.5 | All decades |
| Initial pages | 26 | 0.4 | A-Z |
| Ending pages | 26 | 0.4 | A-Z |
| Blog posts | ~1 | 0.7 | Published only |
| Static hubs | ~30 | 0.5-0.7 | Editorial + viz |

### 6.2 Missing from Sitemap

| URL Type | Potential Count | Why Excluded | Recommendation |
|----------|-----------------|--------------|----------------|
| Twin pages | ~17,010 | Crawl budget | **Add to sitemap** — high unique value |
| Shadow pages (default) | ~17,010 | Crawl budget | **Add default shadow** (`/shadow/:name/:yM/`) |
| All shadow combinations | ~2.4M | Volume | Keep excluded |
| API endpoints | N/A | Not HTML | Correctly excluded |

### 6.3 Noindex Opportunities

| Page Type | Current Status | Recommendation |
|-----------|---------------|----------------|
| Very low-quality names | Not in sitemap, but crawlable | Consider `noindex` if they ever get traffic |
| Search result pages | N/A | None exist (good) |

---

## 7. Thin Content Assessment

### 7.1 Thin Content Scorecard

| Page Type | Word Count (approx) | Thin? | Action |
|-----------|---------------------|-------|--------|
| Name pages | ~500-800 words + data | ❌ No | — |
| Year pages | ~100 words + 50 names | ⚠️ Borderline | Add year narrative |
| Decade pages | ~80 words + 50 names | ⚠️ Borderline | Add decade narrative |
| Initial pages | ~60 words + 50 names | ✅ Yes | Add letter trend analysis |
| Ending pages | ~60 words + 50 names | ✅ Yes | Add letter trend analysis |
| Editorial aliases (no table) | ~40 words + 6 cards | ✅ Yes | Add data tables |
| Status hubs | ~20 words + JS table | ✅ Yes | **Server-render names** |
| Shadow pages | ~150 words + 2 sparklines | ❌ No | Add to sitemap |
| Twin pages | ~40 words + 5 cards | ⚠️ Borderline | Add to sitemap |

---

## 8. Competitive Positioning

| Competitor | Programmatic Pages | Strength |
|------------|-------------------|----------|
| **Behind the Name** | Name etymology pages | Has meaning data (NobodyNamed lacks) |
| **Nameberry** | Editorial lists, name pages | Strong brand, UGC (lists, polls) |
| **SSA.gov** | Raw data tables | Authoritative source, but poor UX |
| **BabyCenter** | Name pages, polls | High traffic, but generic/pastel UX |
| **NobodyNamed** | Data-driven profiles, comparisons | **Original analysis, sparklines, status classification** |

**NobodyNamed's differentiation:** Original classification + sparkline visualization + cultural narrative + comparison tools. No competitor has the "shadow" or "twin" concepts.

---

## 9. Prioritized Recommendations

### P0 — Critical (Fix Thin Content)

1. **Server-render status hub pages** (`/extinct`, `/endangered`, `/rising`, `/comeback`)
   - Current: Client-side JS renders table. Google sees ~20 words.
   - Fix: Use `listLandingWithSparks()` in the Pages Function to render the top 50 names server-side.
   - Impact: High — these target the highest-volume queries.

2. **Add data tables to all editorial alias pages**
   - Current: Only `/comebacks` has a table. Others have 6 name cards + 1 paragraph.
   - Fix: Use landing APIs to populate real name lists for `/millennial-names`, `/gen-z-names`, `/classic-names`, `/future-grandparent-names`.

### P1 — High Impact

3. **Add twin pages to sitemap**
   - ~17k unique pages. Add to sitemap.xml.ts.
   - Each page has unique cosine-similarity results.

4. **Add default shadow pages to sitemap**
   - `/shadow/:name/:yM/` — one per name (~17k pages).
   - Keep all other year combinations out of sitemap.

5. **Add letter-specific narrative to initial/ending pages**
   - Use D1 queries to compute: "X names peaked in the 1950s" or "Y names have risen 40% since 2000."
   - Makes each page genuinely unique.

6. **Add year narrative to year pages**
   - "1985 was the peak year for {name1}, {name2}, and {name3}."
   - "The top 3 names accounted for X% of all births."

### P2 — Medium Impact

7. **Add decade narrative to decade pages**
   - "The 1980s saw the rise of [name] and the decline of [name]."
   - Use actual peak/trough data from the decade.

8. **Add cross-links between year and decade pages**
   - Year page: "See all popular names from the {decade}s"
   - Decade page: "Top names from {year1}, {year2}, {year3}"

9. **Add status × sex pages** (`/boy-names/rising/`, `/girl-names/extinct/`)
   - 10 combinations. High search intent.
   - Can reuse landing API data.

10. **Add `/peaked-in/:year/` pages**
    - Names whose personal peak year was {year} (different from `/year/:year/` which shows top names).
    - ~138 unique years = 138 pages.
    - Targets "names that peaked in 1995" queries.

### P3 — Future Expansion

11. **Structured comparison pages** (`/compare/:name1/:name2/`)
    - Targets "Michael vs James" queries.
    - Side-by-side stats, winner by category.

12. **Names by length** (`/names/4-letters/`)
    - High search volume: "4 letter boy names", "5 letter girl names".
    - ~15 pages (2–16 letters).

13. **Status hub landing page** (`/status/`)
    - Overview of all 5 status types with definitions and example names.

---

## 10. Pre-Launch Checklist (for new page types)

Before creating any new programmatic pages:

- [ ] Each page provides unique value (not just swapped variables)
- [ ] Unique `<title>` and `<meta name="description">`
- [ ] Proper H1 + heading hierarchy
- [ ] Schema markup (BreadcrumbList + appropriate type)
- [ ] Included in XML sitemap
- [ ] Linked from at least one other page (no orphans)
- [ ] Mobile-responsive
- [ ] Canonical URL set
- [ ] No duplicate of existing page
