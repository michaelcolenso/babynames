# GSC three-month review — June 13 to September 12, 2026

Source: Google Search Console export for **nobodynamed.com**, Search type = Web, "Last 3 months"
(`Filters.csv`). 92 days. All figures below are computed directly from the export's
`Chart.csv`, `Queries.csv`, `Pages.csv`, `Devices.csv`, `Countries.csv`, and
`Search appearance.csv`.

This supersedes `docs/seo/2026-06-09-gsc-blog-demand.md` as the current read. **Its central
finding no longer holds, and the conclusion has inverted** — see §3.

---

## 1. Totals

| Metric | Value |
|---|---|
| Clicks | 175 |
| Impressions | 1,598 |
| CTR | 10.95% |
| Days | 92 |
| Impressions/day | ~17.4 |

Monthly, from `Chart.csv`:

| Month | Days | Clicks | Impressions | Impr/day | CTR |
|---|---:|---:|---:|---:|---:|
| 2026-06 (from 13th) | 18 | 35 | 403 | 22.4 | 8.68% |
| 2026-07 | 31 | 74 | 508 | 16.4 | 14.57% |
| 2026-08 | 31 | 49 | 574 | 18.5 | 8.54% |
| 2026-09 (to 12th) | 12 | 17 | 113 | 9.4 | 15.04% |

**Impressions are flat, not growing** — ~16–22/day across three months. The June 9 document
recorded a ramp to ~700 impressions/day in early June; nothing in this window is within an order
of magnitude of that. Whatever produced that spike (most likely the initial indexing burst) did
not persist. The September figure is partly subject to GSC's reporting lag, but 12 days exceeds
the usual 2–3 day lag, so treat the dip as a watch item rather than pure artifact.

Devices: Desktop 118 clicks / 1,112 impr / pos **33.11**; Mobile 57 / 472 / pos **8.47**;
Tablet 0 / 14. Mobile ranks dramatically better than desktop.
Countries: US 152 clicks / 963 impr; UK 11 / 152; everything else in single digits.

---

## 2. Where the clicks actually come from

| Segment | Clicks | Share |
|---|---:|---:|
| Query `nobodynamed` (brand, position 1.01, 95.5% CTR) | 128 | 73% |
| Homepage, all queries | 162 | 93% |
| **All 833 other URLs combined** | **14** | **8%** |

That last row is the number to sit with: **833 URLs earned 14 clicks in 92 days — 0.15
clicks/day.** The site's measurable search performance is almost entirely people typing its
name into Google.

*Reconciliation note:* `Queries.csv` exposes 441 of the 2,832 impressions in `Pages.csv`. GSC
withholds rare and anonymized queries, so per-query totals systematically understate the long
tail. The two files are not expected to sum alike; both are reported as given.

---

## 3. The finding that overturns the June read

The June 9 document's headline was *"we rank, we don't get clicked"* — page-1 positions
returning zero clicks, with the fix framed as a snippet/CTR problem. **That is no longer an
accurate description of the site's position.**

Of the 190 non-brand queries named in the export, 6 are grammatical fragments that match the
brand name rather than any name-research intent ("been named" 31 impr, "was named" 8, "once
named" 3, "not named" 2, "name missing" 2, "who named" 1) — 47 impressions, **15% of non-brand
impressions**, structurally unwinnable and worth excluding from any demand estimate.

Excluding those, the remaining **184 genuine name-research queries** carry 260 impressions at a
**weighted average position of 78.6 — page 9 of Google.**

> **Exactly one of those 184 queries ranks on page 1, with one impression.**

Representative, with positions:

| Query | Impr | Position |
|---|---:|---:|
| millennial names | 11 | 85.3 |
| 1920s names | 6 | 97.0 |
| names 1920s | 5 | 92.8 |
| popular names in 1880 | 4 | 80.8 |
| name uniqueness | 4 | 93.0 |
| popular names 1880s | 3 | 72.0 |
| american name database | 3 | 84.3 |
| millennial baby names | 3 | 94.3 |
| names like reuben | 2 | 31.0 |
| names similar to rosie | 2 | 41.5 |
| how many people in the us are named | 2 | 74.5 |

These are precisely the clusters the June document identified as the editorial targets. The site
has purpose-built pages for them. **They rank on page 8–9.**

So the diagnosis has changed: in June the problem was framed as converting rankings into clicks.
The current data says the rankings, for anything with identifiable query intent, **are not
there.**

---

## 4. CTR is still bad — but it is a smaller prize than it looks

Non-homepage impressions by SERP position bucket:

| Bucket | URLs | Impressions | Clicks | CTR |
|---|---:|---:|---:|---:|
| Top 3 | 163 | 884 | 9 | 1.02% |
| Rest of page 1 | 364 | 825 | 5 | 0.61% |
| Page 2 | 157 | 276 | 0 | 0% |
| Pages 3–5 | 78 | 233 | 0 | 0% |
| Page 6+ | 71 | 174 | 0 | 0% |

Page 1 overall: **1,709 impressions → 14 clicks → 0.82% CTR**, roughly 15–25× below a normal
position-1-to-10 curve. Real, and severe.

But the composition matters, and this export cannot join query to page, so attribution below is
**inference, not measurement**:

- The page-1, zero-click set is `/about` (169 impr, pos 1.9), `/comeback` (136, 2.7), `/viz/`
  (128, 2.8), `/blog/` (20, 1.9) — i.e. almost exactly the site's nav link set. That is the
  signature of **brand-query sitelinks**, which accrue impressions and are rarely clicked
  because the searcher clicks the main result. Their 0% CTR is probably benign and not fixable
  by copywriting.
- **581 of 766 name URLs have exactly 1 impression.** The name-page top-3 impressions are
  ultra-long-tail individual name lookups, not a reachable content market.

The ceiling arithmetic: at ~17 impressions/day, **even a 10× CTR improvement across every
page-1 impression yields on the order of 1–2 clicks/day.** Snippet work is cheap and worth
doing, but it cannot be the growth plan.

---

## 5. Zero rich results

`Search appearance.csv` contains **a header row and no data**. Over 92 days the site earned no
enhanced search appearance of any kind.

Every template in `packages/shared/` emits JSON-LD (`render-name.ts`, `render-year.ts`,
`render-decade-hub-core.ts`, and others), including a full `FAQPage` on every name page —
`buildFaqStructuredData()` at `render-name.ts:1078`, wired in at `:377-380`.

**This is mostly explained, and it is not the actionable item it first appears to be.** Google
restricted FAQ rich results to authoritative government and health sites in August 2023, and
**fully deprecated them on May 7, 2026** — five weeks before this reporting window opens. The
site's FAQPage markup therefore cannot produce a rich result for anyone, and its absence from
`Search appearance.csv` is expected behavior, not a defect. HowTo rich results were deprecated
on the same trajectory (mobile 2023, desktop September 2023).

Sources: [Search Engine Journal](https://www.searchenginejournal.com/google-drops-faq-rich-results-from-search/574429/) ·
[Search Engine Land](https://searchengineland.com/faq-schema-rise-fall-seo-today-463993)

What remains worth checking is narrower: whether `BreadcrumbList` is valid and rendering (it is
one of the few enhancements Google still shows), and whether any other emitted type is eligible
at all. Run the pages through Google's Rich Results Test rather than assuming the JSON-LD is
doing work. Leave the FAQPage markup in place — it is harmless and still machine-readable to
non-Google consumers — but do not attribute SEO value to it.

*(The FAQ deprecation was surfaced by a Codex review finding on PR #163, which correctly noted
the markup was already shipped; the deprecation dates were verified separately against the
sources above.)*

---

## 6. The signal worth pulling on

Sibling decade hubs, generated by the same code path from the same template, rank 80 positions
apart:

| Page | Impr | Position |
|---|---:|---:|
| `/names/1930s/` | 95 | **4.8** |
| `/names/1940s/` | 41 | 14.0 |
| `/names/1970s/` | 16 | 22.6 |
| `/names/1880s/` | 28 | **68.1** |
| `/names/1920s/` | 58 | **85.1** |

`/names/1920s/` is the page shipped as a dedicated "1920s search acquisition surface"
(commit 3982a95, PR #150), built specifically to capture the 1920s query cluster. It ranks at
**85.1** — while `/names/1930s/`, same generator, ranks at **4.8**.

That variance is the single most informative thing in this export. Same template, same data
source, same internal link structure, ~80 positions of difference. Whatever explains it is
probably the thing standing between 17,000 URLs and any search traffic at all. Candidates worth
testing, in rough order of cheapness:

1. **Cannibalization** — `/names/1920s/`, `/millennial-names` (pos 43.8), `/names/`, and the
   1920s content-factory posts may be competing for the same intent, splitting signals.
2. **Markup validity for the types still eligible** — per §5. Note that the FAQPage markup
   already shipped cannot help: Google deprecated FAQ rich results before this window.
3. **Content differentiation** — whether a programmatic hub reads as distinct enough per decade.
4. **Off-site authority** — 17,000 URLs at ~17 impressions/day is the profile of a site with no
   inbound link equity. This is the most likely root cause and the least tractable by code.

---

## 7. What this means for planning

Stated plainly, so it is not softened by the tables above:

- The site does not have a conversion problem sitting on top of good rankings. **It has almost
  no rankings for anything with intent**, and its traffic is its own brand name.
- Feature work that assumes an audience — retention loops, discovery tools, new content surfaces
  — is building for traffic that does not currently exist and is not currently growing.
- The binding constraint is discoverability and authority, and no feature in the product
  backlog addresses it.

See `docs/plans/2026-09-15-next-level-features.md` §0, revised against this export.
