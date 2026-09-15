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

**Two different rates, which must not be conflated:**

| Rate | Clicks | Per day | Basis |
|---|---:|---:|---|
| Non-**homepage** clicks | 14 | 0.15 | page-based |
| Clicks **not** from the query `nobodynamed` | 47 | 0.51 | query-based |

The export cannot join queries to pages, so these measure different things and neither is a
clean "non-brand" figure: non-brand searches can land on the homepage, and brand searches can
arrive via sitelinks. **0.51/day is the more appropriate figure for "is there an audience
here"** — 3.4× the non-homepage rate. Both are small; the distinction matters wherever the
number is used to justify a decision.

*Reconciliation note:* `Queries.csv` exposes 441 of the 2,832 impressions in `Pages.csv`. GSC
withholds rare and anonymized queries, so per-query totals systematically understate the long
tail. The two files are not expected to sum alike; both are reported as given.

*Correction:* the first pass at the family rollup counted `/name/:name/twin/` inside the name-page
family. Split out, plain name pages are 669 URLs / 1,037 impressions / 9 clicks / position 12.1,
and `/name/:name/twin/` is 97 / 128 / 0 / 26.4 — see §6, where the split turns out to matter.

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

## 4. CTR is bad — and the prize is small either way

> **Corrected.** The first version of this section binned each URL by its aggregate average
> position, assigned that URL's *entire* impression count to the bucket, and reported the
> result as "1,709 page-1 impressions → 14 clicks → 0.82% CTR." **That is not a measurement.**
> GSC's per-URL position is an average across all of that URL's impressions, so a URL averaging
> 8 may have had half its impressions on page 2. The buckets below are retained as a rough
> distribution, relabelled honestly; the page-one CTR figure and everything derived from it are
> withdrawn. *(Caught by Codex review on PR #163.)*

Non-homepage URLs grouped by **each URL's average position** (not by where individual
impressions landed):

| URL-average position | URLs | Their impressions | Clicks |
|---|---:|---:|---:|
| < 3 | 163 | 884 | 9 |
| 3–10 | 364 | 825 | 5 |
| 10–20 | 157 | 276 | 0 |
| 20–50 | 78 | 233 | 0 |
| 50+ | 71 | 174 | 0 |

Read as a distribution it still says something real: the URLs that average a strong position
hold most of the impressions and produced 14 clicks between them, and nothing averaging worse
than page 2 converted at all.

### The measured numbers, with no bucketing

| Metric | Value |
|---|---:|
| Non-homepage impressions | 2,392 |
| Non-homepage clicks | 14 |
| **Non-homepage CTR** | **0.59%** |
| Non-homepage impressions/day | 26.0 |
| Non-homepage clicks/day | 0.15 |

### The ceiling, re-derived

Multiplying the *measured* non-homepage CTR, which needs no assumption about where impressions
sat:

| Improvement | Resulting CTR | Clicks/day |
|---|---:|---:|
| 5× | 2.9% | 0.76 |
| **10×** | **5.9%** | **1.52** |
| 20× | 11.7% | 3.04 |

So the original conclusion survives its broken derivation: **even a tenfold CTR improvement is
worth about 1–2 clicks per day.** Snippet work is cheap and worth doing; it is not a growth
plan. That holds regardless of how the impressions were distributed across result pages.

*Composition caveat, unchanged and still inference:* the zero-click URLs that average position
~2 are `/about` (169 impressions), `/comeback` (136), `/viz/` (128) and `/blog/` (20) — almost
exactly the site's nav set, which is the signature of brand-query sitelinks rather than a
copywriting failure. And 581 of 766 name URLs have exactly one impression. This export cannot
join query to page, so neither point can be confirmed from it.

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

## 6. Diagnostic entry points

> **Corrected.** The first version of this section presented `/names/1930s/` (position 4.8)
> against `/names/1920s/` (85.1) as "the same generator, same template, ~80 positions apart,"
> and made it the gate for the whole roadmap. **That comparison does not hold**, on three
> independent counts, and is withdrawn:
>
> 1. **Not the same template.** Only the 1920s definition carries `searchSurface: true`
>    (`decade-hub-definitions.ts:70` — the sole occurrence in the file). That flag changes the
>    title, description and H1, adds a whole search-acquisition content section, and emits an
>    additional `ItemList` (`render-decade-hub-core.ts:584-600,609-675`).
> 2. **Not the same rollout state.** 1880s–1920s are `rolloutState: "seeded"`; 1930s–1970s and
>    1990s–2020s are `reviewed(...)` (`decade-hub-definitions.ts:55-92`).
> 3. **Not a clean window.** Commit 3982a95 shipped the 1920s surface on **2026-08-21**, so
>    only ~3 of this window's 13 weeks postdate it. The 85.1 average blends both versions of
>    the page.
>
> *(Caught by Codex review on PR #163; all three verified against the source.)*

There is also a volume problem that applies to every per-decade position in this export.
`/names/1960s/` shows position 1.2 on **4 impressions** and `/names/1910s/` 2.8 on **4**. Those
are not stable estimates. Only four decade hubs carry enough impressions to mean anything at
all — 1930s (95), 1920s (58), 1940s (41), 1880s (28) — and of those, 1920s is confounded as
above while 1930s and 1880s differ in rollout state. **This export cannot support a controlled
sibling comparison.** Getting one requires isolating post-2026-08-21 data for the 1920s page
and waiting for impression volume that makes a position average meaningful.

### The sounder entry point: a surface that exists, ranks, and converts nothing

Splitting `/name/:name/twin/` out from plain name pages (the first pass at §2's table folded
them together) gives a much cleaner signal:

| Family | URLs | Impressions | Clicks | CTR | Weighted avg position |
|---|---:|---:|---:|---:|---:|
| `/name/:name/` | 669 | 1,037 | 9 | 0.87% | 12.1 |
| `/name/:name/twin/` | **97** | **128** | **0** | **0%** | **26.4** |

`/name/:name/twin/` is the site's "names like X" surface — `render-twin.ts:18` titles it
literally *"Names like {name} — similar baby names"*, it emits an `ItemList`, and every name
page links to it (`render-name.ts:918`). It is indexed, and it is matching the right queries:

| Twin page | Impr | Pos | Matching query in the export | Impr | Pos |
|---|---:|---:|---|---:|---:|
| `/name/Clara/twin/` | 6 | 44.5 | "names like clara" / "ähnliche namen wie clara" | 2 / 3 | 48.0 / 43.7 |
| `/name/Rosie/twin/` | 3 | 34.0 | "names similar to rosie" | 2 | 41.5 |
| `/name/Zephyr/twin/` | 3 | 48.7 | "names like zephyr" | 2 | 51.0 |

So the "names like X" cluster is **not an unserved route**. It has a dedicated, indexed,
correctly-titled page that ranks around **page 3** and has converted **zero clicks in 92 days**.
That is a concrete, bounded thing to diagnose — why a purpose-built page matching its query
exactly sits at position 26 — and it is a far better first experiment than any of the
comparisons above.

Remaining candidates, unchanged in substance:

1. **Cannibalization** — `/millennial-names` (pos 43.8) vs `/names/2000s/` vs `/names/` vs the
   content-factory posts may be splitting signals for one intent.
2. **Markup validity for the types still eligible** — per §5. The FAQPage markup already
   shipped cannot help: Google deprecated FAQ rich results before this window.
3. **Off-site authority** — 17,000 URLs at ~17 impressions/day is the profile of a site with no
   inbound link equity. Most likely root cause, least tractable by code.

## 7. What this means for planning

Stated plainly, so it is not softened by the tables above:

- The site does not have a conversion problem sitting on top of good rankings. **It has almost
  no rankings for anything with intent**, and its traffic is its own brand name.
- Feature work that assumes an audience — retention loops, discovery tools, new content surfaces
  — is building for traffic that does not currently exist and is not currently growing.
- The binding constraint is discoverability and authority, and no feature in the product
  backlog addresses it.

See `docs/plans/2026-09-15-next-level-features.md` §0, revised against this export.
