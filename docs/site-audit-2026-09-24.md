# NobodyNamed site audit — 2026-09-24

**Scope:** performance, SEO, design, content. **Method:** a live crawl of `nobodynamed.com` (47 URLs across every template), Lighthouse 12 mobile runs on 10 templates, Playwright screenshots at 390px and 1366px in light and dark mode, 30 days of Cloudflare zone analytics (GraphQL), and a code read of the renderers behind each finding. Each finding lists its evidence and the file to change.

**Scope limits:** I had no Google Search Console access, so ranking and CTR claims come from `docs/seo/2026-06-09-gsc-blog-demand.md` (June data, now stale). Lighthouse ran through an egress proxy that downgrades to HTTP/1.1 and adds latency. Treat its FCP/LCP as pessimistic, and ignore its `uses-http2` failure. Cloudflare "uniques" and "pageViews" include bots.

---

## Verdict

Performance and technical SEO are in good shape. The biggest problems are **content correctness** and **thin templates**, and several of them sit on the pages and questions that GSC showed are this site's moat:

- The "how many people are named X" answer appears twice on each name page, with two different numbers.
- Every year page carries a templated factual error.
- The geography claim in every name page's meta description can come from 80-year-old data.
- Four editorial pages and all compare, twin and story pages are thin.

None of this is structural. Most fixes take an hour or less.

## Priority list

| # | Severity | Area | Finding | Effort |
|---|---|---|---|---|
| 1 | **P0** | SEO/bug | `/state/CA/` (any uppercase unknown slug) is an infinite 301 loop | 10 min |
| 2 | **P0** | Content | Name pages show two different living-population figures side by side | 1 hr |
| 3 | **P0** | Content | All 146 year pages call their year "mid-century America" | 30 min |
| 4 | **P1** | Content | "Strongest in {state}" can come from a 1930s/40s small-numbers artifact (Olivia → Arizona, 1940s) | 1 hr |
| 5 | **P1** | SEO | Four editorial hubs have `\| NobodyNamed` inside the `<h1>`; three of them have ~65 words and no sparklines | 30 min |
| 6 | **P1** | Content | Blog auto-linker links common words (Baby, Add, God) and states (Texas, California, Arizona) to name pages | 1 hr |
| 7 | **P1** | Trust | Homepage says "No tracking", but a persistent `localStorage` visitor ID is set; the site has no privacy page despite collecting newsletter emails | 1 hr |
| 8 | **P1** | Design | The name-page chart (the core content) sits about 1,050px down on mobile, below 4 stacked stat tiles and 5 FAQs | half day |
| 9 | **P1** | Content/SEO | Year pages list only the top 25; ranking intent wants the top 100+ (the data is already precomputed to 200) | 1–2 hr |
| 10 | **P1** | Content | Karen flagship post still `draft`; `glaciers.md` is marked `published` in source but returns 404 live | 30 min |
| 11 | P2 | SEO | About 80k low-data name pages are left out of the sitemap but still indexable and linked; `/name/:name/twin/` (52 words) is indexable on every name | decision |
| 12 | P2 | SEO | `/compare/` pages: 44 words, no JSON-LD, not in sitemap, and the common `emma-vs-olivia` URL form 302s to a 404 | 2 hr |
| 13 | P2 | Design | Compare H1's "vs." is nearly invisible; homepage "Popular right now" renders "OliviaFemale" | 15 min |
| 14 | P2 | A11y | Status-tag contrast 3.4–4.1:1 on the homepage; viz tags 2.78:1; `aria-expanded` not allowed on the homepage search input; unnamed `role="tooltip"` on name pages | 1 hr |
| 15 | P2 | IA | Nav omits States, Browse and Compare; nav label "Namecalling" hides the blog; `/viz` nav link 308s on every page | 30 min |
| 16 | P2 | Content | Viz gallery and homepage claim "Thirty" visualizations; 24 exist | 5 min |
| 17 | P3 | Perf | Minor: `app.js` unversioned; landing pages 100–115 KB HTML / 25k px tall on mobile; no `favicon.ico` / `apple-touch-icon` | 1 hr |
| 18 | P3 | SEO | Long titles/descriptions on state and year pages; `robots.txt` `Content-Signal` line costs Lighthouse SEO 8 points (not Google) | 15 min |
| 19 | watch | Ops | Functions request volume vs the free-plan daily cap | check |

---

## P0 — fix now

### 1. State redirect loop
`apps/web/functions/state/[state]/index.ts:26-29`. The redirect target falls back to `raw` when the slug is not a known state, so any uppercase miss redirects to itself.

- **Evidence:** `curl -L https://nobodynamed.com/state/CA/` → `Maximum (5) redirects followed`. `/state/ca/` → 404.
- **Why it matters:** postal codes are the most natural thing to type. Crawlers treat loops as hard errors.
- **Fix:** resolve postal abbreviations first (`CA` → `/state/california/`, 301). Only then lowercase. If the state is still unknown, return the 404 directly and never redirect. While you're there, route the three bare `<html><body><h1>` 404/No-data responses in that file through `pageShell()` so they get site chrome, `noindex` and nav.

### 2. Two different "living Americans" numbers on every name page
The **Quick answers** FAQ comes from `computeAgeStats()` at request time (`packages/shared/src/generate-narrative.ts:76-129, 253`). The **Living profile** card reads the precomputed `profile.total_living_est` (`packages/shared/src/render-name.ts:667-670`). They disagree:

- **Olivia:** "An estimated **535,987** living Americans" vs the "Living profile **541,507**" card. Both are visible in the first desktop viewport.
- **Why it's P0:** "How many people are named X" is the site's highest-moat query cluster, per the June GSC analysis. It's also the answer in the FAQPage JSON-LD. Showing two answers undermines the one question nobody else answers.
- **Fix:** pick one source of truth. The enrichment profile is precomputed, so prefer it and fall back to `computeAgeStats` only when no profile exists. Apply the same rule to median age and the age range. Add a test that renders a name and asserts that the FAQ number equals the card number.

### 3. Year-page intro is wrong on all 146 pages
`packages/shared/src/render-year.ts:105` hard-codes: "`{girl} and {boy} led the {year} baby-name charts, a pair that captures the naming culture of **mid-century America**`". This ships on `/year/1880/`, `/year/1985/` and `/year/2025/` alike. The boy-name branch also says "a perennial powerhouse that would anchor the decade" for five hard-coded names, whatever the year.

- **Fix:** either derive the era phrase from the year (for example "Gilded Age", "postwar boom", "Gen X", "millennial", "Gen Alpha") or drop the era clause entirely. Replace the fixed name list with a data-backed clause: years at #1, from `name_rankings_by_year`.

---

## P1 — content & SEO correctness

### 4. Geography claim built on stale eras
`generate-narrative.ts:314-328` chooses `topAnomaly` across **all eras**. That value feeds the meta description ("Strongest in Arizona."), the FAQ answer and the Geographic heartland card.

- **Olivia:** the claim is Arizona 7.2×, from the **1940s**, when Olivia was rare and any small cluster produced a large location quotient.
- **Inconsistency:** the strongholds map on the same page already prefers the latest era (`render-name.ts:593-596`), so the page contradicts itself.
- **Fix:** use the same latest-era-first selection everywhere, and put the era in any text that stays. Consider a minimum-count floor (for example, at least 50 births in the state-era cell) before a location quotient can headline.

Related copy nits in the same function:
- **Redundant description:** when the peak year is the latest year, the description reads "Selene peaked in 2025 with 469 births; 469 in 2025." Detect `peakYear === yM` and phrase it as "hit a new high in 2025 (469 births)".
- **Wrong tone for the #1 name:** "In 2025, **only** 13,544 girls were given the name" on the #1 girls' name.
- **Repeated sentence:** the right-rail narrative states the peak three times.
- **Missing rank:** the name page never states the name's **rank**, the most basic popularity fact. `name_rankings_by_year` already holds the top 200. Show "#1 girls' name in 2025" wherever a rank exists.

### 5. Editorial hub H1s and thin pages
`apps/web/functions/[slug].ts:296` strips `" — NobodyNamed"` but not `" | NobodyNamed"`. As a result, `/millennial-names`, `/gen-z-names` and `/future-grandparent-names` all render `<h1>… | NobodyNamed</h1>` (verified live). The comeback config has the same title and would hit the same bug, but `/comebacks` 301s to the static `/comeback`.

- **Fix:** store plain titles, with no brand suffix, in `PAGES`.
- **Thin content:** these three pages carry about 65 words: six name cards whose only text is "Open dossier", and one sentence of body copy. `classic-names` got sparklines and three editorial sections under the classic-names CTR plan. The others didn't, because sparks are gated on `slug === "classic-names"` (line 220). Remove that gate, and give each page the same three-section treatment. "Millennial names" is a recurring GSC query.

### 6. Blog auto-linker over-links
`packages/shared/src/render-blog.ts:31,244-282` links the first occurrence of **any capitalized word** that exists in `names`, filtered only by a function-word blocklist. On `/blog/eithan-and-ailany/` this links:

- "**Baby**-name consultant"
- "**Colleen** Slagen", a person, linked as a name
- "**Add** every spelling"
- "meaning "**God** has answered""
- **Texas**, **California** and **Arizona**, which point to `/name/Texas/` rather than the state hubs

**Fix, in order of preference:**
1. Link only names the author marked explicitly, or names that appear in a table or list context.
2. Otherwise, add the 51 state names to a state-link pass (`/state/{slug}/`), add a common-English-word stoplist (for example the `dicts/2of12.txt` already in the repo), and require `total_count ≥ 1000` for auto-links.

Separately, the blog's markdown tables render unstyled and cramped on mobile (see the Spelling and Year/Eithan/Neithan tables). Give `.post-body table` cell padding, a header rule and tabular numerals.

### 7. "No tracking" claim vs. what ships
- **The claim:** `apps/web/public/index.html:97`: "No account. No tracking."
- **What ships:** `assets/analytics.js:14-31` writes a persistent `nv_sid` UUID to `localStorage`, never rotates it, and sends it with every event. It also sets `nv_seen` to detect return visits.
- **What's missing:** there is no `/privacy` page, even though `/newsletter` collects email addresses.
- **Risk:** this is a truthfulness and trust problem. It also creates exposure for EU visitors, who are in the traffic long tail. This is a flag, not legal advice.
- **Fix, either route:**
  - Change the line to "No account. No ads. No third-party trackers."
  - Or make `nv_sid` session-scoped (`sessionStorage`) and drop return-visit tracking.
- **Either way:** add a short privacy page that covers analytics events, the newsletter and Cloudflare Web Analytics, and link it from the footer.

### 8. Name page: the chart is buried
**Mobile (390px) order:** H1, badge, then four single-column stat tiles (about 75px each), then five FAQs, then the chart at about 1,050px down. **Desktop:** the chart sits below the fold. The house design principle is "Let the data speak. Charts … are primary content."

**Recommended order:**
1. H1 + status + one-sentence summary that includes the rank.
2. The chart.
3. Stat tiles in a **2×2 grid** on mobile (they are already 2-up lower on the page).
4. Quick answers.
5. Enrichment.
6. Related names.

**Chart legibility:**
- The 1880–2020 axis labels render at about 6px on mobile.
- The overlay labels "1880 / PEAK 2014 / 2025" stack vertically above the chart and repeat the axis.
- The "peak 2014" annotation collides with the line.
- **Fix:** set a minimum 11px for SVG text (scale with `vector-effect`/viewBox or render labels in HTML) and remove the duplicate overlay.

**Related-names quality:** "Related names" and "From the same era" both reduce to "same peak year" (Lydia, Sadie, Callie, Hadley… all "peak 2014"). For the 70-query "names like X" cluster, trajectory twins (`/twin/`) or sound and spelling neighbours are more useful. Surface 3 twins inline instead of 6 same-year names.

### 9. Year pages stop at #25
`/year/1985/` shows 25 names per sex, 238 words in all. The June GSC data had year pages ranking at positions 1–4 with **0 clicks**. A top-25 list loses the click to SSA's top-1000 table and to competitors' top-100 pages.

- **Fix:** show the top 100 per sex from `name_rankings_by_year`, which already holds 200. Add a status chip per name so the page delivers the "how many have since faded" promise its own intro makes.
- **Title:** update to "Top 100 Baby Names of 1985: Jessica & Michael …", and trim to 60 characters or fewer.

### 10. Blog pipeline drift
- **Karen is still in draft:** `content/blog/how-many-karens-are-left.md` is `status: "draft"`. The June demand analysis named it the flagship of the "How Many ___ Are Left?" franchise. The post exists and is still unpublished three months later.
- **Glaciers doesn't exist live:** `content/blog/glaciers.md` says `status: "published"`, but `/blog/glaciers/` returns **404** and the post isn't in the sitemap. Either no migration was generated or none was applied.
- **Fix:** for Karen, first change the frontmatter to `status: "published"` and review it; `blog:publish` keeps the source status as-is, and the site serves only `published` rows. Then run `npm run blog:publish -- <file>` for each post and apply the generated migrations. This needs your go-ahead, since it writes to production D1. Add a CI check that fails when a `published` source file has no matching migration.

All blog posts except one use `/api/og/default` as their social image. Per-post OG images, even the existing `/api/og/*` renderer parameterized by title, would lift social CTR on the only content type built to be shared.

---

## P2 — SEO structure

### 11. Index scope: sitemap and robots disagree
- **The mismatch:** the sitemap lists 16,734 of about 100k names, filtered by the `listIndexableNames` quality score. The remaining ~83k name pages (for example `/name/Aaban/`, `/name/Aabriella/`) return 200 with no `noindex` and are linked from letter hubs and neighbour modules.
- **Twin pages:** `/name/:name/twin/` exists for every name, is linked from every name page, is indexable, has 52 words and isn't in the sitemap.
- **Risk:** index bloat. Google spends crawl on pages you've already judged low quality, and "Crawled – not indexed" dilutes the site's quality signals.
- **Your decision:** either emit `<meta name="robots" content="noindex,follow">` on names that fail the sitemap score, and on twin pages until they have real content, or deliberately keep them open. I recommend `noindex` for twins now and for low-score names after checking GSC's Pages report for how many are indexed today.

### 12. Compare pages
`/compare/Emma,Olivia/` renders a good chart but has **44 words**, no JSON-LD and no sitemap entry. The natural query form `/compare/emma-vs-olivia/` returns **302 to `/name/emma-vs-olivia/`, a 404** (`functions/compare/[names]/index.ts:18-25` splits only on `,+/`), and `/compare/Emma/Olivia/` 404s despite the header comment advertising that form.

- **Fix:** accept `-vs-`, and 301 all forms to one canonical, for example `/compare/emma-vs-olivia/`. Add a generated paragraph (who peaked when, crossover year, ratio today), plus `WebPage` + `BreadcrumbList` JSON-LD.
- **Sitemap:** only then add a curated set of high-demand pairs, such as sibling and alternative pairs from the "popular alternatives" module.

### 13. Visible design bugs
- **Compare H1:** `.compare-report .compare-vs` uses `rgba(247,239,225,0.55)`, a colour meant for the dark report card, but the H1 sits on paper. "vs." is effectively invisible (`style.css:1509`).
- **Homepage "Popular right now":** `<strong>Olivia</strong><span class="suffix">Female</span>` has no gap, so it renders "OliviaFemale". Add `margin-left` or a separator to `.featured-grid .suffix`.
- **Dark mode:** the "Download share card" button is near-black on the dark background. Give it the inverted primary style.

### 14. Accessibility (Lighthouse + manual)
- **Homepage tag contrast:** `.inline-tag.tag-endangered` is 3.41:1 and `.tag-rising` is 4.14:1 at 12.6px. Both fail AA.
- **`/viz/` tags:** `.tag` is **2.78:1**. This is the same `--brand-faded-contrast` token the August audit fixed for `.tapestry-meta`, so audit its other uses.
- **Homepage search input:** `#q` has `aria-expanded` but no `role="combobox"`. Add the role.
- **Sparkline tooltip:** `.sparkline-tooltip[role=tooltip]` is empty until hover. Give it an `aria-label` or populate it.
- **Year pages:** heading order skips from h1 to h3.
- **`/extinct`:** the table has data cells without headers (`td-has-header`).

Scores after this: accessibility 90–100 across templates. Everything else passes.

### 15. Navigation / IA
**Current nav:** Discover (6 statuses), Birth year, Visualizations, Namecalling, Newsletter, About (`render-shell.ts:27-41`).

- **Missing hubs:** **States** (`/state/`, high-intent "baby names in {state}"), **Browse** (`/names/`: letters, decades, generations) and **Compare**. Those hubs currently depend on in-page links.
- **Blog label:** "Namecalling" is a nice brand but tells a first-time visitor nothing. Use "Blog" or "Stories", or at least retitle the page "Namecalling — Baby Name Data Stories". The current 25-character title has no keyword.
- **Redirecting nav link:** `/viz` 308s to `/viz/` from every page. Link to `/viz/` directly.
- **Status vocabulary:** the site uses **rising, stable, declining, endangered, extinct, comeback, emerging, fading, resurgent, critically endangered**, and "Rising" means two things. The badge means ≥1.2× over the prior five years (`classify.ts:68`); the `/rising` page means ≥5× over the prior decade. So a name can carry a "Rising" badge and not appear on `/rising`. Rename one of them. "Surging" for the page is the obvious candidate.

### 16. "Thirty" visualizations
`index.html:192` and `viz/index.html:8,11,33,188` say thirty. The gallery links and the sitemap both have **24**. Change the copy, or make the number computed.

---

## P3 — performance polish

Lab results (mobile, throttled, through the proxy):

| Template | Perf | A11y | BP | SEO | LCP | CLS | Weight |
|---|---|---|---|---|---|---|---|
| `/` | 99 | 90 | 100 | 92 | 1.6 s | 0 | 210 KB |
| `/name/Olivia/` | 93 | 96 | 100 | 92 | 2.4 s | 0 | 79 KB |
| `/name/Selene/` | 94 | 96 | 100 | 92 | 2.3 s | 0 | 78 KB |
| `/names/1980s/` | 94 | 100 | 100 | 92 | 2.4 s | 0 | 88 KB |
| `/year/1985/` | 97 | 98 | 100 | 92 | 2.3 s | 0 | 80 KB |
| `/extinct` | 93 | 100 | 100 | 92 | 2.5 s | 0 | 125 KB |
| `/blog/` | 95 | 100 | 100 | 92 | 2.2 s | 0 | 64 KB |
| `/viz/` | 97 | 95 | 100 | 92 | 2.1 s | 0 | 133 KB |
| `/state/` | 97 | 100 | 96 | 92 | 2.1 s | 0 | 79 KB |

Warm TTFB is about 200 ms for SSR routes, measured through the proxy; cold name-page renders run about 500 ms. The August CLS fix held: CLS is 0 everywhere. The SEO score of 92 on every page comes entirely from `robots.txt` line 7 (`Content-Signal:`), which Lighthouse calls an unknown directive and Google ignores. Keep the line if you want the signal; the score is not a ranking factor.

Remaining items, all small:
- **`app.js`:** `render-name.ts:405` loads `/assets/app.js` without `?v=` and without `defer`, and `/assets/*` has a 1-day browser TTL. After a deploy, returning visitors can run stale JS against new HTML for up to a day. Version it like `style.css?v=26`. Don't add `defer` on its own: the inline initializer that `pageShell()` emits after it (`render-name.ts:407-415`) reads `window.NameVitals` synchronously and returns early if `app.js` hasn't run, which would leave share, tooltip, compare and enrichment controls uninitialized. Deferring is only safe if that initializer moves into `app.js` behind `DOMContentLoaded`.
- **Landing pages:** `/extinct`, `/endangered` and `/rising` weigh 100–115 KB of HTML and run 25,700px tall on mobile, with about 2,000 DOM nodes. The per-row sparkline `<path>`s cause most of that. Paginate at 50 rows with "show more", or use the 60-byte spark blob + client draw the homepage already uses.
- **`/viz/` thumbnails:** the first thumbnail is the LCP element and is `loading="lazy"`. Make the first two eager, and serve WebP. Lighthouse estimates about 23 KB saved.
- **Static HTML caching:** `/viz/*`, `/press` and `/developers` return `max-age=0, must-revalidate`. They have no `_headers` rule, unlike `/index.html`. Add the same `s-maxage` rule.
- **Missing icons:** add `favicon.ico` (77 404s in 3 days) and `apple-touch-icon.png`. The SVG favicon doesn't cover iOS home screens or legacy fetchers.
- **Fonts, still open from the August audit:** the site's identity depends on Iowan Old Style and Avenir Next, which ship only on Apple devices. Windows gets Palatino Linotype, which is close. Android and Linux get Noto/DejaVu fallbacks, which is what the screenshots in this audit show. This is still a brand decision; I'm not recommending an action beyond deciding it deliberately.

---

## Operations watch-item

Cloudflare zone analytics for 2026-08-25 → 09-23 (bots included):

| Metric | Value |
|---|---|
| Requests | 22k–76k/day (median about 33k) |
| Uniques | 2.5k/day → 9–12k/day |
| Edge `cachedRequests` | 0–1.7k/day, 2–4% of requests |
| 503s | 0–170/day; about 0.2% of requests on the worst days, below the 0.5% target in `docs/crawl-reliability-audit.md` |
| Top 404s | mostly scanner noise (`/.env*`, `/go.mod`); plus `/mcp` (309 in 3 days) and `/favicon.ico` |
| 301 spikes | up to 14k/day around Sept 14–17 |

Notes on these numbers:
- **Cache hits:** SSR HTML is cached in `caches.default` from inside the Function, so almost every HTML hit still invokes a Pages Function. That design is deliberate, per the content-negotiation note in `_middleware.ts`. The trade-off is that Function invocations scale 1:1 with page traffic. **Unverified:** I didn't check your Workers plan. If it's the free plan, its daily request cap is the ceiling to watch as traffic grows. Check the current limit in the Cloudflare dashboard before relying on it.
- **503s:** they still hit core name pages (`/name/Paul/`, `/name/Margaret/`) sporadically. Group the `pages_function_unhandled_error` logs as the crawl-reliability doc prescribes.
- **`/mcp` 404s:** if the MCP endpoint answers only POST, a GET returning 405 with an `Allow` header is more correct and quieter than a 404.
- **301 spikes:** I didn't break these down. They're consistent with crawlers re-walking lowercase or no-slash name URLs after the August canonicalization change. Worth one look in GSC's redirect report.

---

## What's working (keep)

- SSR on every high-value template, 0 CLS everywhere, and no console errors or horizontal overflow on any template at 390px.
- Canonicalization is consistent: `/name/olivia` → `/name/Olivia/` in one hop. Status and editorial pages normalize to no trailing slash; name, year and state pages to a trailing slash.
- Structured data is present on almost every template: BreadcrumbList, WebPage/CollectionPage, BlogPosting, ItemList. On FAQPage, per my understanding of Google's August 2023 change, FAQ rich results now show only for authoritative government and health sites, so treat the FAQ markup as harmless rather than a CTR lever (not re-verified here).
- The 1980s decade hub has about 2,450 words of specific, data-backed copy. It's the model the thin hubs should copy.
- The editorial voice in the recent blog posts is distinctive and sourced (Eithan/Ailany, Jessica). That voice is the differentiator; the remaining problems are pipeline and presentation, not writing.

---

## Suggested sequence

1. **One PR, all small, no data changes:** #1, #3, #5, #13, #15 (nav link), #16, the `app.js` versioning, and the icons. About half a day.
2. **Name page PR:** #2, #4, the rank line, #8. This touches the highest-traffic template; screenshot-diff before and after.
3. **Year and compare pages:** #9, #12.
4. **Blog:** #6, #10. Publishing needs your approval for the remote D1 writes.
5. **Decisions for you:** #7 (copy vs. behaviour), #11 (noindex scope), fonts.

Re-run against: `npm run audit:site`, Lighthouse on the same 10 URLs, and the GSC Pages report 4 weeks after #11.
