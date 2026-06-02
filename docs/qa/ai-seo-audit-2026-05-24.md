# AI SEO Audit — NobodyNamed
**Date:** 2026-05-24  
**Auditor:** AI SEO skill (v1.1.0)  
**Site:** https://nobodynamed.com  
**Scope:** Full site — static pages, SSR name pages, blog, programmatic SEO pages, viz pages

---

## Executive Summary

NobodyNamed has a **strong foundation** for AI search optimization. Schema markup is present on all major page types, robots.txt allows all AI crawlers, meta tags are comprehensive, and the site generates original data visualizations with clear SSA attribution. However, there are **meaningful gaps** in extractability, schema completeness, and freshness signals that reduce citation likelihood in AI-generated answers.

| Pillar | Score | Status |
|--------|-------|--------|
| Structure (extractability) | 6/10 | Good schema coverage, poor FAQ/definition blocks |
| Authority (citations) | 7/10 | Original data + SSA sourcing, weak author signals |
| Presence (distribution) | 4/10 | No Wikipedia, no Reddit, no review presence |
| **Overall** | **17/30** | **Solid base, needs targeted improvements** |

---

## 1. AI Bot Access — PASS

| Bot | Status |
|-----|--------|
| GPTBot / ChatGPT-User | ✅ Allowed |
| PerplexityBot | ✅ Allowed |
| ClaudeBot / anthropic-ai | ✅ Allowed |
| Google-Extended | ✅ Allowed |
| Bingbot | ✅ Allowed |
| CCBot (Common Crawl) | ✅ Allowed |

**Finding:** `robots.txt` uses `User-agent: * / Allow: /` — permissive but correct. No AI crawlers are blocked. No business need to restrict training crawlers since all content is public-domain data analysis.

**Recommendation:** None. Current state is optimal.

---

## 2. Schema Markup Audit

### 2.1 Home Page (`/`)
| Schema | Present | Quality |
|--------|---------|---------|
| WebSite | ✅ | Good — includes SearchAction for name search |
| BreadcrumbList | ❌ | Missing |

**Issue:** No BreadcrumbList on homepage. Minor — not critical for AI citation.

### 2.2 Name Pages (`/name/:name/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Home → Name dossier |
| WebPage | ✅ | Has title, URL, description |
| Dataset (mainEntity) | ✅ | Good — temporalCoverage, variableMeasured |
| Organization (publisher) | ❌ | Missing NobodyNamed as publisher |
| Organization (creator) | ✅ | SSA listed correctly |
| keywords | ❌ | Missing |
| datePublished | ❌ | Missing |
| dateModified | ❌ | Missing |
| spatialCoverage | ❌ | Missing (should be "United States") |
| distribution | ❌ | Missing link to raw data |

**Critical gap:** The Dataset schema cites SSA as creator but does not list NobodyNamed as publisher. AI systems may not associate the analysis with the brand. The Dataset also lacks `spatialCoverage` (United States), `datePublished`/`dateModified`, and `keywords`.

**P0 Fix:**
```json
{
  "@type": "WebPage",
  "publisher": {
    "@type": "Organization",
    "name": "NobodyNamed",
    "url": "https://nobodynamed.com/"
  },
  "datePublished": "2025-05-XX",
  "dateModified": "2025-05-XX",
  "mainEntity": {
    "@type": "Dataset",
    "spatialCoverage": { "@type": "Place", "name": "United States" },
    "keywords": ["baby names", "name popularity", "SSA", "..."],
    "distribution": {
      "@type": "DataDownload",
      "contentUrl": "https://www.ssa.gov/oact/babynames/names.zip",
      "encodingFormat": "application/zip"
    }
  }
}
```

### 2.3 Blog Index (`/blog/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Home → Namecalling |
| Blog | ✅ | Good — lists all BlogPosting entries |
| BlogPosting | ✅ | Per-post with headline, description, URL, date |

**Issue:** BlogPosting entries lack `author`, `image`, and `wordCount`.

### 2.4 Blog Posts (`/blog/:slug/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Home → Namecalling → Post |
| BlogPosting | ✅ | Good base |
| author | ⚠️ | Present only if DB has author; no URL/credentials |
| datePublished | ✅ | Present |
| dateModified | ⚠️ | Renders even when === datePublished |
| image | ✅ | Uses OG image |
| articleBody | ❌ | Missing |
| wordCount | ❌ | Missing |
| publisher | ❌ | Missing |
| inLanguage | ❌ | Missing |
| mainEntityOfPage | ❌ | Missing |
| articleSection | ❌ | Missing |
| about | ❌ | Missing (could reference name entities) |

**P1 Fix:** Add `wordCount`, `publisher`, `inLanguage: "en-US"`, and conditionally omit `dateModified` when equal to `datePublished`.

### 2.5 Year Pages (`/year/:year/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Home → By year → Year |
| WebPage | ✅ | Present |
| Dataset (mainEntity) | ✅ | Good |

**Same gaps as name pages:** No publisher, no datePublished/dateModified, no spatialCoverage.

### 2.6 Decade/Initial/Ending Pages (`/names/:segment/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Present |
| CollectionPage | ✅ | Present |
| ItemList | ❌ | Missing — should wrap the name rankings |

**P2 Fix:** Add `mainEntity` as `ItemList` with `ListItem` entries for the ranked names. This makes the comparison data extractable by AI.

### 2.7 Static Hub Pages (`/extinct`, `/endangered`, `/rising`, `/comeback`)
| Schema | Present | Quality |
|--------|---------|---------|
| CollectionPage | ✅ | Present |
| BreadcrumbList | ❌ | Missing on all four |
| ItemList | ❌ | Missing — names are not structured |

### 2.8 Shadow Pages (`/shadow/:name/:year/`)
| Schema | Present | Quality |
|--------|---------|---------|
| WebPage | ✅ | Minimal |
| BreadcrumbList | ❌ | Missing |
| Comparison structure | ❌ | This is literally a comparison page with no comparison schema |

**P1 Fix:** This is a high-value page type for AI citation ("names like X vs Y"). Add BreadcrumbList and consider a custom schema approach or at least rich `WebPage` with `mainEntity` describing the counterfactual comparison.

### 2.9 Twin Pages (`/name/:name/twin/`)
| Schema | Present | Quality |
|--------|---------|---------|
| BreadcrumbList | ✅ | Home → Dossier → Similar names |
| WebPage | ✅ | Minimal |
| ItemList | ❌ | Missing — the similar names should be an ItemList |

**P2 Fix:** Add `mainEntity` as `ItemList` with ranked `ListItem` entries.

### 2.10 Press Page (`/press`)
| Schema | Present | Quality |
|--------|---------|---------|
| Any schema | ❌ | **Completely missing** |

**P1 Fix:** Add WebPage + BreadcrumbList schema. This page targets journalists — high citation potential.

### 2.11 About Page (`/about`)
| Schema | Present | Quality |
|--------|---------|---------|
| AboutPage | ✅ | Good |
| BreadcrumbList | ✅ | Good |
| Organization | ❌ | Missing NobodyNamed org schema |

**P2 Fix:** Add Organization schema for NobodyNamed with logo, URL, sameAs links.

---

## 3. Content Extractability Audit

### 3.1 Definition Blocks
**Check:** Does the first paragraph directly answer "What is [name]?" or "How popular is [name]?"

| Page Type | Pass/Fail | Notes |
|-----------|-----------|-------|
| Name pages | ❌ FAIL | Opening paragraph is literary/narrative (e.g., "Michael has moved from ordinary use into the archive..."). No direct definitional answer. |
| Blog posts | ⚠️ PARTIAL | Kehlani post opens with a strong thesis but not a structured definition block. |
| About | ✅ PASS | Directly states what the site is. |

**P0 Fix for name pages:** Add a direct, extractable answer near the top — ideally in the first paragraph or as a visible "At a glance" block:
> "Kehlani is a feminine baby name that peaked in 2017 with 598 births and rose to 1,981 births in 2025. Its status: Rising."

This 40-60 word block should be self-contained and work without surrounding context.

### 3.2 FAQ Sections
**Check:** Are there FAQ sections with natural-language questions?

| Page Type | Pass/Fail |
|-----------|-----------|
| Name pages | ❌ FAIL — No FAQ section |
| Blog posts | ❌ FAIL — No FAQ section |
| About | ❌ FAIL — No FAQ section |
| Any page | ❌ FAIL — No FAQ anywhere |

**P1 Fix:** Add an FAQ section to name pages answering high-intent queries:
- "How popular is [name] right now?"
- "When did [name] peak?"
- "Is [name] becoming more or less popular?"
- "What generation is [name] associated with?"

Wrap in `FAQPage` schema.

### 3.3 Comparison Tables
**Check:** Are there structured comparisons for "X vs Y" queries?

| Page Type | Pass/Fail | Notes |
|-----------|-----------|-------|
| Shadow pages | ⚠️ PARTIAL | Side-by-side visual comparison exists but no semantic table structure. |
| Blog posts | ⚠️ PARTIAL | Kehlani post has metric cards (Kehlani vs Khaleesi vs Nevaeh) but no `<table>` or comparison schema. |
| Name pages | ❌ FAIL | No "vs similar names" comparison table. |

**P1 Fix:** The Kehlani blog post already has the visual structure. Wrap the metric cards in a semantic comparison block and add comparison-oriented headings: "Kehlani vs Khaleesi: celebrity name outcomes compared."

### 3.4 Step-by-Step / HowTo Content
**Check:** Are there numbered processes?

| Page Type | Pass/Fail |
|-----------|-----------|
| Any page | ❌ FAIL — No HowTo content anywhere |

**P3 Fix (lower priority):** Not critical for this site type, but a "How to read a name dossier" or "How the SSA collects name data" guide could earn citations.

### 3.5 Statistic Blocks
**Check:** Are statistics cited with sources and dates?

| Page Type | Pass/Fail | Notes |
|-----------|-----------|-------|
| Name pages | ✅ PASS | Peak counts, latest counts, decline % all present. SSA cited. |
| Blog posts | ✅ PASS | Specific numbers with years (e.g., "1,981 in 2025"). |
| Year pages | ✅ PASS | Rankings with counts. |

**Strength:** The site is data-forward. AI systems love specific, dated statistics.

---

## 4. Authority Signals

### 4.1 Expert Attribution
| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Named authors on blog | ⚠️ PARTIAL | "M. Colenso" is present but no bio, credentials, or URL. |
| Author schema with credentials | ❌ FAIL | No `jobTitle`, `affiliation`, or `sameAs`. |
| Expert quotes in content | ❌ FAIL | No external expert quotes. |
| "According to [Source]" framing | ⚠️ PARTIAL | SSA cited as source but not consistently with "According to..." framing. |

**P2 Fix:** Expand author schema:
```json
"author": {
  "@type": "Person",
  "name": "M. Colenso",
  "url": "https://nobodynamed.com/about",
  "jobTitle": "Data journalist",
  "sameAs": ["https://github.com/michaelcolenso"]
}
```

### 4.2 E-E-A-T Alignment
| Signal | Strength | Notes |
|--------|----------|-------|
| First-hand experience | ✅ Strong | Site is built from raw SSA data with original analysis. |
| Specific, detailed info | ✅ Strong | Per-name counts, peak years, generation mapping. |
| Transparent sourcing | ✅ Strong | SSA cited everywhere. Methodology page exists. |
| Clear author expertise | ⚠️ Weak | Author name present but no demonstrated expertise narrative. |

### 4.3 Third-Party Citations
**Critical finding:** NobodyNamed is essentially **invisible** on third-party platforms where AI systems look:

| Platform | Presence | Notes |
|----------|----------|-------|
| Wikipedia | ❌ No page | Wikipedia is 7.8% of ChatGPT citations. High value. |
| Reddit | ❌ No presence | 1.8% of ChatGPT citations. |
| Industry publications | ❌ No guest posts | |
| Review sites | N/A | Not a product — irrelevant. |
| YouTube | ❌ No content | Google AI Overviews cite YouTube frequently. |
| Quora | ❌ No answers | |

**P1 Recommendation:** Create a Wikipedia page for NobodyNamed. The site has original data analysis, clear methodology, press page, and cultural commentary — sufficient notability for a stub article. A Wikipedia page would dramatically increase AI citation likelihood.

---

## 5. Freshness Signals

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| "Last updated" visible on pages | ❌ FAIL | No freshness signal visible to users or AI. |
| dateModified in schema | ⚠️ PARTIAL | Present on blog posts only. |
| Current year references | ✅ PASS | Blog posts and viz pages reference 2025 data. |
| Regular content refreshes | ✅ PASS | SSA data ingested annually (cron-triggered Worker). |
| Stale content removed | N/A | Not applicable — historical data doesn't expire. |

**P1 Fix:** Add a visible "Data last updated: May 2025" (or similar) to the footer of name pages, year pages, and the homepage. Also add `dateModified` to all WebPage schemas.

---

## 6. Heading Structure & Query Matching

### 6.1 Name Pages
Current H1: `Kehlani`  
Current structure: `h1` → dossier metrics → chart → narrative

**Issue:** Headings do not match how people phrase queries. AI systems extract based on heading-to-content alignment.

| Query Pattern | Matching Heading? |
|---------------|-------------------|
| "How popular is Kehlani?" | ❌ No H2 for this |
| "Kehlani name meaning" | ❌ No meaning data at all |
| "Is Kehlani a popular name?" | ❌ No direct answer |
| "Kehlani peak year" | ⚠️ In metrics but not as a heading |
| "Names like Kehlani" | ✅ "Related names" H2 |

**P1 Fix:** Add H2s that mirror query patterns:
- `## How popular is [name] in [year]?`
- `## When did [name] peak?`
- `## Is [name] rising or falling?`
- `## [name] popularity by the numbers`

### 6.2 Blog Posts
The Kehlani post has good heading structure:
- H3: "The full trajectory through 2025"
- H3: "The sound family Kehlani arrived into"
- H3: "Three outcomes, one cycle"

**Issue:** No H2s — skips from H1 to H3. This breaks heading hierarchy for AI extraction.

**P2 Fix:** Use H2 for major sections, H3 for subsections.

### 6.3 Static Pages
Hub pages (`/extinct`, `/endangered`, etc.) have minimal content — just a lede and a grid of diagnosis cards. No H2s explaining what the user is seeing.

**P2 Fix:** Add descriptive H2s: "What makes a name extinct?", "How the SSA defines endangered names", etc.

---

## 7. Sitemap Quality

| Check | Pass/Fail | Notes |
|-------|-----------|-------|
| Sitemap present | ✅ PASS | `/sitemap.xml` dynamic, edge-cached |
| Under 50k URLs | ✅ PASS | Smartly excludes twin/shadow pages |
| Includes blog posts | ✅ PASS | |
| Includes names | ✅ PASS | Indexable cohort only |
| Includes year pages | ✅ PASS | |
| Includes decade pages | ✅ PASS | |
| Includes initial pages | ✅ PASS | |
| Includes ending pages | ✅ PASS | |
| `<lastmod>` tags | ❌ FAIL | No lastmod on any URL |
| `<priority>` tags | ❌ FAIL | No priority hints |
| `<changefreq>` tags | ❌ FAIL | No change frequency hints |

**P2 Fix:** Add `<lastmod>` based on `data_version` from meta table or `names.last_updated`. Add `priority` hints: homepage 1.0, name pages 0.8, blog posts 0.7, year pages 0.6.

---

## 8. Meta Tag Audit

| Tag | Coverage | Notes |
|-----|----------|-------|
| `<title>` | ✅ All pages | Good — includes status and peak year for names |
| `<meta name="description">` | ✅ All pages | Custom per page type |
| `og:title` | ✅ All pages | |
| `og:description` | ✅ All pages | |
| `og:type` | ⚠️ Most pages | Name pages use `article` — should be `website` or `profile`. Blog uses `article` — correct. |
| `og:image` | ✅ All pages | Dynamic for names, default for others |
| `og:image:alt` | ⚠️ Name pages only | Missing on blog index, static pages |
| `twitter:card` | ✅ All pages | |
| `twitter:title` | ✅ All pages | |
| `twitter:description` | ✅ All pages | |
| `twitter:image` | ✅ All pages | |
| `canonical` | ✅ All pages | |
| `theme-color` | ✅ All pages | |

**P3 Fix:** `og:type` for name pages should arguably be `profile` (for a name "profile") or remain `website`. `article` is acceptable but slightly misleading. Add `og:image:alt` everywhere.

---

## 9. Content Types That Get Cited

| Content Type | Site Coverage | Citation Potential |
|-------------|---------------|-------------------|
| Comparison articles | ⚠️ Partial (blog only) | Shadow pages could be comparison goldmines |
| Definitive guides | ⚠️ Partial (about page) | Could expand methodology into a guide |
| Original research/data | ✅ Strong | Core strength — SSA analysis is original |
| Best-of/listicles | ✅ Strong | Year pages, decade pages, status hubs |
| Product pages | N/A | Not applicable |
| How-to guides | ❌ None | Low priority for this domain |
| Opinion/analysis | ✅ Strong | Blog posts are analytical |

---

## 10. Prioritized Recommendations

### P0 — Critical (Do First)
1. **Add definitional answer block to name pages** — A 40-60 word self-contained answer at the top of each name page: "[Name] is a [sex] baby name that peaked in [year] with [count] births. In [latestYear], [count] babies were named [name]. Status: [status]." This is the #1 extractability improvement.
2. **Fix name page schema gaps** — Add `publisher` (NobodyNamed Organization), `spatialCoverage` (United States), `keywords`, `datePublished`, `dateModified`, and `distribution` to the Dataset schema.

### P1 — High Impact
3. **Add FAQ sections to name pages** — 4-5 natural-language Q&As with `FAQPage` schema. Targets high-intent queries.
4. **Add freshness signals** — Visible "Data updated: May 2025" footer + `dateModified` in all WebPage schemas.
5. **Fix blog post schema** — Add `wordCount`, `publisher`, `inLanguage`, `articleSection`. Omit `dateModified` when === `datePublished`.
6. **Add schema to press page** — Currently has zero structured data.
7. **Create Wikipedia page for NobodyNamed** — Highest-ROI third-party presence move. Wikipedia is 7.8% of ChatGPT citations.
8. **Add BreadcrumbList to shadow pages** — These are unique, high-engagement pages.

### P2 — Medium Impact
9. **Add ItemList schema to decade/initial/ending pages** — Makes ranked name lists extractable.
10. **Add ItemList schema to twin pages** — Makes "names like X" lists extractable.
11. **Add Organization schema to about page** — Logo, URL, sameAs links.
12. **Add sitemap `<lastmod>` and `<priority>`** — Helps crawlers prioritize.
13. **Fix blog heading hierarchy** — H1 → H2 → H3, no skips.
14. **Add author bios with credentials** — Strengthen E-E-A-T.

### P3 — Nice to Have
15. **Add `og:image:alt` to all pages** — Currently missing on some page types.
16. **Add `speakable` schema** — Mark up key passages for voice/AI extraction.
17. **Add HowTo schema to methodology content** — "How the SSA collects baby name data."
18. **Create YouTube content** — Short data visualizations for key names/trends. Google AI Overviews cite YouTube heavily.

---

## 11. Monitoring Plan

### DIY Monthly Check (No Tools Required)

| Query | Platform | Expected Result |
|-------|----------|----------------|
| "Kehlani baby name popularity" | ChatGPT | Should cite nobodynamed.com/name/Kehlani/ |
| "extinct baby names" | Google AI Overview | Should cite nobodynamed.com/extinct |
| "most popular baby names 2005" | Perplexity | Should cite nobodynamed.com/year/2005/ |
| "NobodyNamed" | ChatGPT | Should describe the site |
| "names like Michael" | Google AI Overview | Should cite nobodynamed.com/name/Michael/twin/ |

Track in a spreadsheet monthly. Note: AI citation is stochastic — run the same query 3 times and log consistency.

### Tool-Based Monitoring (If Budget Allows)
- **Otterly AI** — Track share of AI voice for "baby name" queries
- **Peec AI** — Multi-platform monitoring
- **ZipTie** — Brand mention + sentiment tracking

---

## Appendix: Page-Type Schema Matrix

| Page Type | BreadcrumbList | WebPage | CollectionPage | BlogPosting | Dataset | ItemList | FAQPage | Org | Full? |
|-----------|:------------:|:-------:|:--------------:|:-----------:|:-------:|:--------:|:-------:|:---:|:-----:|
| Home | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 12% |
| Name | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ⚠️ | 55% |
| Blog Index | ✅ | ❌ | ❌ | ✅* | ❌ | ❌ | ❌ | ❌ | 35% |
| Blog Post | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | 45% |
| Year | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | 55% |
| Decade | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 35% |
| Initial | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 35% |
| Ending | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 35% |
| Shadow | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 20% |
| Twin | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 30% |
| Static Hub | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | 25% |
| Press | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | 0% |
| About | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ⚠️ | 30% |
| Viz | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | 50% |

\* BlogPosting entries embedded in Blog schema
