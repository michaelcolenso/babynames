# nobodynamed.com — Competitor Spec Implementation Guide
## Rewritten for the existing Cloudflare Pages + D1 + Workers codebase

**Version:** 2.0 (codebase-aligned)  
**Target:** https://nobodynamed.com  
**Repo:** `/Users/michaelcolenso/Projects/babynames`  
**Stack:** Cloudflare Pages Functions, D1 (`name-vitals`), TypeScript (`@nv/shared`), vanilla JS frontend.

---

## 0. Reality Check: What the Codebase Already Has

The original spec assumed a vanilla static site with JSON files. The actual codebase is a server-rendered application with a robust data pipeline. Before implementing anything, use what already exists:

| Original Spec Feature | Already Built? | Where It Lives |
|---|---|---|
| Shareable permalinks | ✅ Yes | `functions/name/[name]/index.ts`, canonical URLs, OG images at `/api/og/:name` |
| Name pages + SEO | ✅ Yes | SSR via `packages/shared/src/render-name.ts` |
| Exact counts / rankings | ✅ Data exists | D1 `name_years.count`, `names.peak_count`, `names.peak_year` |
| State-level data | ✅ Partial | `name_states` table, `/api/diaspora/:name`, regional maps on name pages |
| Search/autocomplete | ✅ Yes | `/api/search.ts` |
| Name similarity | ✅ Partial | `/api/twin/:name`, `/name/:name/twin/` |
| Open Graph images | ✅ Yes | `/api/og/:name` |
| Classification (rising/declining/etc.) | ✅ Yes | `packages/shared/src/classify.ts` |
| International data | ❌ No | Not present |
| Multi-name comparison | ❌ No | Not present |
| Interactive hover tooltips on name chart | ❌ No | `pulse.js` has them; name page sparkline does not |
| Name meanings / etymology | ❌ No | Intentionally avoided in `generate-narrative.ts` |
| Embeddable widget | ❌ No | Not present |
| Newsletter | ❌ No | Not present |
| Monetization | ❌ No | Not present |

**Therefore, this rewritten spec treats Phases 1, 2, 5, and 9 as mostly complete, and focuses implementation effort on Phases 3, 4, 6, 7, 8, 10, and 11.**

---

## 1. Project Architecture (Actual)

### 1.1 Deployment Units

```
/apps/web                 Cloudflare Pages (functions + static public assets)
  /functions              Pages Functions (file-based routing)
  /public                 Static assets (HTML, JS, CSS, images)
/apps/ingest-worker       Cloudflare Worker (cron ingestion)
/apps/search-worker       Cloudflare Worker (search indexing)
/packages/shared          Shared TypeScript library
  /src/schema.ts          D1 schema types
  /src/d1-queries.ts      Typed query helpers
  /src/classify.ts        Status classifier
  /src/render-name.ts     SSR for /name/:name
  /src/render-shell.ts    Page shell + head tags
  /src/spark-blob.ts      60-byte sparkline encoding
/migrations               D1 schema migrations
/scripts                  One-off and recurring data scripts
```

### 1.2 Data Flow

1. **Ingestion:** `apps/ingest-worker` fetches SSA zip, parses `yob*.txt`, writes to D1 staging tables, then swaps live in a transaction.
2. **Classification:** `classify()` runs at ingest time; `names.status`, `names.peak_year`, etc. are precomputed.
3. **SSR:** Pages Functions query D1 via `@nv/shared` helpers and return HTML.
4. **Hydration:** `public/assets/app.js` progressively enhances SSR pages (share buttons, diaspora slider, search autocomplete).
5. **API:** JSON endpoints under `/api/*` power the homepage, landing pages, visualizations, and third-party embeds.

### 1.3 Relevant Existing Files

| Concern | File(s) |
|---|---|
| Name page SSR | `packages/shared/src/render-name.ts` |
| Name page function | `apps/web/functions/name/[name]/index.ts` |
| Name API | `apps/web/functions/api/name/[name].ts` |
| Search API | `apps/web/functions/api/search.ts` |
| State/diaspora API | `apps/web/functions/api/diaspora/[name].ts` |
| Twin/similarity API | `apps/web/functions/api/twin/[name].ts` |
| Client JS | `apps/web/public/assets/app.js` |
| Styles | `apps/web/public/assets/style.css`, `viz-theme.css` |
| D1 queries | `packages/shared/src/d1-queries.ts` |
| Schema types | `packages/shared/src/schema.ts` |
| Ingest | `scripts/ingest-ssa.ts`, `apps/ingest-worker/src/index.ts` |

---

## 2. Phase 1: Core Infrastructure — ADAPTED

### 2.1 Data Normalization — ALREADY DONE

The D1 schema is the single source of truth. Do **not** create a `names.json` static file.

**Existing schema highlights (`migrations/0001_init.sql`):**

```sql
CREATE TABLE names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL,
  first_year INTEGER,
  last_year INTEGER,
  peak_year INTEGER,
  peak_count INTEGER,
  total_count INTEGER,
  status TEXT,
  decline_pct REAL,
  latest_count INTEGER,
  prev_decade REAL,
  curr_decade REAL,
  growth_x REAL,
  spark_blob BLOB
);

CREATE TABLE name_years (
  name_id INTEGER REFERENCES names(id),
  year INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (name_id, year)
);

CREATE TABLE year_totals (
  year INTEGER NOT NULL,
  sex TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (year, sex)
);

CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
```

**Slug/normalization rules already exist:**
- URLs use the raw name (e.g., `/name/Michael/`).
- `name_lower` is the indexed canonical form.
- Canonicalization redirects wrong casing in `functions/name/[name]/index.ts`.

### 2.2 State Management — USE EXISTING PATTERN

There is no SPA router, so no global `AppState` object is needed yet. The server owns state for SSR pages; client-side state is scoped per page in `app.js`.

For new interactive features (comparison, state toggle), add lightweight module-scoped state in `app.js` or create small modules under `public/assets/`.

### 2.3 Event Bus — NOT NEEDED

Use native DOM events or small pub/sub only if a feature genuinely needs decoupling. The current codebase keeps JS simple and direct.

---

## 3. Phase 2: Shareable Permalinks — ALREADY BUILT, ENHANCE

### 3.1 Current Implementation

- `/name/:name/` exists and is fully SSR.
- Canonical URL, `<title>`, `<meta description>`, OG/Twitter tags are rendered by `render-name.ts`.
- `/api/og/:name` generates dynamic share images.
- `app.js` already has: copy link, Twitter intent, download share card.

### 3.2 Enhancements to Make

#### A. Add native Web Share API

In `apps/web/public/assets/app.js`, extend the existing share handler:

```javascript
async function shareNamePage(name) {
  const url = location.href;
  const title = document.title;
  const text = `See the history of the name ${name} on nobodynamed.com`;

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
    } catch (err) {
      if (err.name !== 'AbortError') console.error(err);
    }
  } else {
    await navigator.clipboard.writeText(url);
    showToast('Link copied to clipboard');
  }
}
```

#### B. Add more share destinations

Add Bluesky, Facebook, LinkedIn, Reddit, and email fallback links alongside the existing Twitter button:

```javascript
const shareTargets = {
  twitter:  (u, t) => `https://twitter.com/intent/tweet?url=${e(u)}&text=${e(t)}`,
  facebook: (u)     => `https://www.facebook.com/sharer/sharer.php?u=${e(u)}`,
  bluesky:  (u, t) => `https://bsky.app/intent/compose?text=${e(t + ' ' + u)}`,
  linkedin: (u, t) => `https://www.linkedin.com/sharing/share-offsite/?url=${e(u)}`,
  reddit:   (u, t) => `https://www.reddit.com/submit?url=${e(u)}&title=${e(t)}`,
  email:    (u, t) => `mailto:?subject=${e(t)}&body=${e(u)}`
};
```

#### C. Comparison URL support

When comparison mode is implemented (Phase 3), update `app.js` and the router in `_middleware.ts` to support:

```
/name/Michael/?compare=James,David
```

The existing `_middleware.ts` already normalizes trailing slashes and query strings; ensure it preserves `?compare=...` when canonicalizing.

---

## 4. Phase 3: Name Comparison Overlay — NEW

### 4.1 Goal

Allow users to compare 2–3 names on one chart, with a shareable URL.

### 4.2 Data Layer

#### Option A: Reuse existing `/api/name/:name` (simpler)

For each compared name, fetch `/api/name/:name` in parallel. The API already returns the full timeseries for the dominant sex plus optional `other` sex.

#### Option B: New bulk endpoint (recommended)

Create `apps/web/functions/api/compare.ts`:

```typescript
import { getNameWithSeries } from '@nv/shared';

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const names = url.searchParams.get('names')?.split(',').slice(0, 3) ?? [];
  if (names.length < 2) {
    return new Response(JSON.stringify({ error: 'Provide at least 2 names' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const records = await Promise.all(
    names.map(n => getNameWithSeries(ctx.env.DB, n.toLowerCase()))
  );

  const result = records.map((r, i) => ({
    name: names[i],
    sex: r?.sex ?? null,
    series: r?.series ?? []
  }));

  return new Response(JSON.stringify(result), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
};
```

Usage: `GET /api/compare?names=Michael,James,David`

### 4.3 Page Route

Create `apps/web/functions/compare/[names]/index.ts`:

```typescript
// /compare/Michael/James/ or /compare/Michael,James/
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const raw = ctx.params.names as string;
  const names = raw.includes(',') ? raw.split(',') : raw.split('/');
  // Validate, fetch via getNameWithSeries, render comparison page
};
```

Also support the query-string form on the existing name page so no new route is strictly required:

```
/name/Michael/?compare=James,David
```

### 4.4 SSR Renderer

Add `packages/shared/src/render-compare.ts`:

- Accept `names: string[]`, `records: NameRecord[]`.
- Render a shell with OG tags for the comparison.
- Embed JSON data for hydration.
- Reuse `render-shell.ts` for head/foot.

### 4.5 Frontend Chart

Add `apps/web/public/assets/compare.js`:

- Load comparison data from embedded JSON or fetch `/api/compare?names=...`.
- Render multi-series SVG line chart using the existing cardinal-spline helper in `app.js` (extract it to a shared helper if it isn’t already).
- Show legend with remove buttons.
- Limit to 3 names.
- Update URL with `?compare=...` via `history.replaceState`.

### 4.6 UI Integration

On `/name/:name/`:

1. Add a "Compare" button next to the search box.
2. When clicked, open a small panel with search to add a second/third name.
3. Render the comparison inline below the main chart, or navigate to `/compare/:names/`.

---

## 5. Phase 4: Exact Birth Counts on Hover — ENHANCE EXISTING CHARTS

### 5.1 Name Page Sparkline

The SSR name page renders a static SVG sparkline. Add hover interactivity in `app.js`.

Implementation sketch:

```javascript
function attachSparklineTooltip(svgContainer, series) {
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  document.body.appendChild(tooltip);

  svgContainer.addEventListener('mousemove', (e) => {
    const rect = svgContainer.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const year = Math.round(yearFromX(x)); // map x back to year
    const point = series.find(d => d.year === year);
    if (!point) return;

    tooltip.innerHTML = `
      <strong>${point.year}</strong><br>
      Births: ${point.count.toLocaleString()}<br>
      Rank: ${point.rank ? `#${point.rank}` : 'Outside top 1000'}
    `;
    tooltip.style.left = `${e.pageX + 12}px`;
    tooltip.style.top = `${e.pageY - 12}px`;
    tooltip.style.opacity = '1';
  });

  svgContainer.addEventListener('mouseleave', () => {
    tooltip.style.opacity = '0';
  });
}
```

Add corresponding CSS in `style.css`:

```css
.chart-tooltip {
  position: absolute;
  background: rgba(244, 240, 231, 0.96);
  border: 1px solid var(--ink);
  border-radius: 6px;
  padding: 8px 12px;
  pointer-events: none;
  font-size: 13px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  opacity: 0;
  transition: opacity 0.1s ease;
  z-index: 1000;
}
```

### 5.2 River.js Tooltip

`river.js` already has hover; extend it to show the exact count for the hovered year by indexing the series at the hovered x-position.

### 5.3 Data Availability

`NameRecord.series` already contains `{ year, count }`. If rank is needed at each year, extend `getNameWithSeries()` in `d1-queries.ts` to compute rank per year using `name_years` and `year_totals`, or add a precomputed `rank` column to `name_years`.

---

## 6. Phase 5: State-Level Data Toggle — ENHANCE EXISTING STATE DATA

### 6.1 Current State

- `name_states` table holds raw SSA state counts: `(name, sex, year, state, count)`.
- `/api/diaspora/:name` returns diffusion summary and map data.
- Name pages render geographic maps but not state-specific time-series.

### 6.2 New API Endpoint

Create `apps/web/functions/api/state-series/[name].ts`:

```typescript
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const name = (ctx.params.name as string).toLowerCase();
  const url = new URL(ctx.request.url);
  const state = url.searchParams.get('state');
  const sex = url.searchParams.get('sex') as Sex | null;

  if (!state || state.length !== 2) {
    return new Response(JSON.stringify({ error: 'state required' }), { status: 400 });
  }

  const rows = await ctx.env.DB
    .prepare(`SELECT year, count FROM name_states WHERE name = ? AND state = ? ${sex ? 'AND sex = ?' : ''} ORDER BY year`)
    .bind(sex ? [name, state, sex] : [name, state])
    .all();

  return new Response(JSON.stringify({ state, series: rows.results }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
    }
  });
};
```

### 6.3 UI: State Selector on Name Page

In `render-name.ts` and `app.js`:

1. Add a state `<select>` near the sex toggle.
2. When a state is selected, fetch `/api/state-series/:name?state=CA`.
3. Replace the national sparkline with the state-specific series.
4. Update URL: `/name/Michael/?state=CA`.

### 6.4 Build-Time State Aggregates

For performance, precompute per-state top names and per-name state rankings in the enrichment pipeline (`scripts/build-enrichment.ts`). This avoids expensive per-request rank calculations.

---

## 7. Phase 6: Name Meaning Tooltip — DECISION REQUIRED

### 7.1 Important Constraint

The codebase explicitly avoids fabricated etymology (`generate-narrative.ts` comment: *“No hallucinated etymology or made-up origin/meaning.”*). Do not add meanings unless you have a vetted source.

### 7.2 Recommended Approach: Manual Curated Cache

1. Create a new table:

```sql
-- migrations/0020_name_meanings.sql
CREATE TABLE name_meanings (
  name_lower TEXT PRIMARY KEY,
  meaning TEXT,
  origin TEXT,
  source TEXT,
  updated_at TEXT
);
```

2. Create `scripts/build-meanings.ts` that reads a hand-curated CSV/JSON file (`data/manual/name-meanings.csv`) and upserts into D1.

3. Add `getNameMeaning(db, nameLower)` to `d1-queries.ts`.

4. Add a small "Meaning" panel to `render-name.ts`, rendered only when a meaning exists.

### 7.3 Alternative: Skip This Phase

If no vetted meaning dataset is available, **skip Phase 6 entirely**. nobodynamed.com’s positioning is pure data; adding low-quality meanings would hurt trust.

---

## 8. Phase 7: Embeddable Widget — NEW

### 8.1 Widget Page

Create `apps/web/functions/embed/[name]/index.ts`:

```typescript
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const name = ctx.params.name as string;
  const record = await getNameWithSeries(ctx.env.DB, name.toLowerCase());
  if (!record) return new Response('Not found', { status: 404 });

  const html = renderEmbedWidget(record); // minimal HTML + JS
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*'
    }
  });
};
```

Create `packages/shared/src/render-embed.ts` for the widget markup.

### 8.2 Widget Endpoint

Also support `/embed/?name=Michael&compare=James` for query-string usage.

### 8.3 Embed Script

Add `apps/web/public/assets/embed.js`:

- Renders a simplified SVG sparkline.
- No interactivity (or minimal hover).
- Includes a "via nobodynamed.com" footer link.
- Respects `?theme=dark|light` and `?height=` params.

### 8.4 Copy Embed Code UI

On `/name/:name/`, add:

```html
<div class="embed-section">
  <h4>Embed this chart</h4>
  <textarea readonly><iframe src="https://nobodynamed.com/embed/Michael/" width="100%" height="400" frameborder="0"></iframe></textarea>
  <button class="copy-embed">Copy embed code</button>
</div>
```

### 8.5 CORS

Add `Access-Control-Allow-Origin: *` to all `/embed/*` responses so third-party sites can iframe it without issues.

---

## 9. Phase 8: International Data Layers — NEW DATA PIPELINE

### 9.1 Data Sources

| Country | Source |
|---|---|
| UK | ONS Baby Names (England & Wales) |
| Canada | Ontario / federal open data |
| Australia | NSW / federal open data |

### 9.2 Schema Additions

```sql
-- migrations/0021_international_names.sql
CREATE TABLE international_names (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_lower TEXT NOT NULL,
  sex TEXT NOT NULL,
  country TEXT NOT NULL,
  first_year INTEGER,
  last_year INTEGER,
  peak_year INTEGER,
  peak_count INTEGER,
  total_count INTEGER,
  spark_blob BLOB,
  UNIQUE(name_lower, sex, country)
);

CREATE TABLE international_name_years (
  name_id INTEGER REFERENCES international_names(id),
  year INTEGER NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (name_id, year)
);

CREATE TABLE international_year_totals (
  country TEXT NOT NULL,
  year INTEGER NOT NULL,
  sex TEXT NOT NULL,
  total INTEGER NOT NULL,
  PRIMARY KEY (country, year, sex)
);
```

### 9.3 Ingestion Script

Create `scripts/ingest-international.ts`:

- Download/format-specific parsers for each country.
- Normalize to the same schema as US data.
- Run `classify()` on each country series.
- Insert into `international_names` / `international_name_years`.

### 9.4 API Endpoints

Create `apps/web/functions/api/international/[country]/[name].ts`:

```typescript
// /api/international/uk/olivia
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { country, name } = ctx.params;
  // query international_names + international_name_years
};
```

### 9.5 UI: Country Selector

Add a country pill selector on name pages:

```html
<div class="country-toggle">
  <button class="active" data-country="US">🇺🇸 US</button>
  <button data-country="UK">🇬🇧 UK</button>
  <button data-country="CA">🇨🇦 Canada</button>
  <button data-country="AU">🇦🇺 Australia</button>
</div>
```

When a non-US country is selected, fetch the international API and re-render the chart.

---

## 10. Phase 9: Name Similarity Engine — ENHANCE EXISTING TWIN FEATURE

### 10.1 Current Implementation

- `/api/twin/:name` uses cosine similarity of spark blobs.
- `/name/:name/twin/` renders a dedicated page.

### 10.2 Enhancements

#### A. Add "Names Like This" section to `/name/:name/`

In `render-name.ts`, fetch `/api/twin/:name` and render a small module:

```html
<section class="names-like-this">
  <h3>Names with a similar arc</h3>
  <div class="name-pills">
    <a href="/name/James/">James <span>94% match</span></a>
    <a href="/name/David/">David <span>89% match</span></a>
  </div>
</section>
```

#### B. Add phonetic similarity

Use a lightweight phonetic encoder (e.g., `double-metaphone` or a custom algorithm) in a build script. Store the primary/secondary codes in `names` table or a side table.

```sql
CREATE TABLE name_phonetics (
  name_lower TEXT PRIMARY KEY,
  primary_code TEXT,
  secondary_code TEXT
);
```

Add `/api/sounds-like/:name` endpoint.

#### C. Trend pattern similarity

The spark-blob cosine approach already captures trend shape. Expose it more prominently in the UI.

---

## 11. Phase 10: Newsletter / Content Marketing — NEW

### 11.1 "Name of the Week" Newsletter

Create `scripts/generate-newsletter.ts`:

- Pick a name with interesting recent movement using existing `classify()` data.
- Generate a short narrative using `generate-narrative.ts`.
- Output Markdown ready for Buttondown/ConvertKit.

### 11.2 Signup UI

Add a small signup form to `public/index.html` and the name page footer:

```html
<form class="newsletter" action="https://buttondown.email/api/emails/embed-subscribe/nobodynamed" method="post">
  <label>One name story per week</label>
  <input type="email" name="email" placeholder="you@example.com" required>
  <button type="submit">Subscribe</button>
  <p>No spam. Unsubscribe anytime.</p>
</form>
```

### 11.3 RSS Feed

Create `apps/web/functions/rss.xml.ts`:

- Query `blog_posts` for published posts.
- Return RSS 2.0 XML.
- Link from `public/index.html` head.

---

## 12. Phase 11: Ethical Monetization — NEW

### 12.1 Affiliate Links (Non-Intrusive)

Add a "Related" section at the bottom of `/name/:name/`:

```html
<div class="related-products">
  <h4>Related</h4>
  <ul>
    <li><a href="https://bookshop.org/..." rel="nofollow sponsored">Books about name history</a></li>
    <li><a href="https://www.etsy.com/search?q=personalized+name+art+Michael" rel="nofollow sponsored">Personalized name art</a></li>
  </ul>
</div>
```

Rules:
- Only on name pages.
- Clearly labeled.
- No tracking pixels; use direct links.
- Genuinely name-related products.

### 12.2 Support / Donation

Add a small footer link:

```html
<p><a href="https://buymeacoffee.com/nobodynamed" class="support-link">☕ Support nobodynamed.com</a></p>
```

### 12.3 API Access (Future)

If traffic grows, offer a paid API tier via Cloudflare API Gateway or a separate Worker. Document rate limits in `public/.well-known/api-catalog`.

---

## 13. Data Pipeline & Build Process — ADAPTED

### 13.1 Existing Pipeline

The ingest pipeline is in `scripts/ingest-ssa.ts` and `apps/ingest-worker/src/index.ts`. It already handles:

1. ETag check against SSA.
2. Zip download.
3. Parsing national files.
4. Bulk insert to staging.
5. Transactional swap.
6. Index rebuild.
7. `data_version` update in `meta`.

### 13.2 Extended Pipeline (with new features)

```bash
# Existing
npm run ingest-ssa              # National data
npm run build-enrichment        # Enrichment profiles
npm run seed-enrichment         # Write enrichment to D1

# New scripts to add
npm run ingest-states           # Update name_states from SSA state zip
npm run build-diaspora          # Compute name_diaspora (already exists? verify)
npm run ingest-international    # UK/Canada/Australia data
npm run build-meanings          # Curated meanings CSV -> D1
npm run build-phonetics         # Phonetic codes for sounds-like
npm run generate-newsletter     # Weekly newsletter Markdown
```

### 13.3 CI/CD

The repo already has GitHub Actions under `.github/workflows/`. Extend them to:

- Run `npm run typecheck`.
- Run `npm run test`.
- Deploy Pages via `wrangler pages deploy public --project-name=nobodynamed`.
- Deploy Workers via `wrangler deploy` in each app directory.
- Scheduled SSA ingest in `apps/ingest-worker`.

---

## 14. Testing Checklist — ADAPTED

### 14.1 Functional Tests

| Test | How to Verify |
|---|---|
| `/name/Michael/` loads | `curl -I http://localhost:8788/name/Michael/` |
| `/name/Michael/?compare=James` shows comparison | Browser + network tab |
| `/api/compare?names=Michael,James` returns JSON | `curl` |
| Hover on name sparkline shows tooltip | Browser |
| State selector loads `/api/state-series/Michael?state=CA` | Browser + `curl` |
| Embed page loads in iframe | `curl http://localhost:8788/embed/Michael/` |
| OG image generates | `curl http://localhost:8788/api/og/Michael` |
| Search autocomplete works | Homepage typing |
| International selector fetches non-US data | After Phase 8 |
| Newsletter signup form posts | After Phase 10 |

### 14.2 Type Checking

```bash
npm run typecheck
```

Must pass before any deploy.

### 14.3 Performance Tests

| Metric | Target |
|---|---|
| TTFB on `/name/:name/` | < 300ms |
| `/api/name/:name` response | < 100ms |
| `/api/compare?names=a,b,c` | < 200ms |
| `/api/state-series/:name?state=CA` | < 150ms |
| Embed page size | < 50KB |

### 14.4 Accessibility

- [ ] Tooltip content is screen-reader friendly (`aria-label` on chart regions).
- [ ] State selector and country selector are keyboard-navigable.
- [ ] Comparison legend uses more than color (line dashes/patterns).
- [ ] Focus states visible.

---

## 15. Deployment & Performance — ADAPTED

### 15.1 Hosting

Already on Cloudflare Pages (`apps/web/wrangler.toml`):

```toml
name = "nobodynamed"
compatibility_date = "2026-05-03"
pages_build_output_dir = "public"

[[d1_databases]]
binding = "DB"
database_name = "name-vitals"
database_id = "fc4741db-1f6d-457c-b4e4-675a4ea3ebc2"
migrations_dir = "../../migrations"
```

Deploy:

```bash
npm run deploy:web       # Pages
npm run deploy:ingest    # Ingest worker
```

### 15.2 Caching

Caching is already handled by `functions/_middleware.ts`. Ensure new endpoints return appropriate `Cache-Control` headers:

```
public, s-maxage=86400, stale-while-revalidate=604800
```

### 15.3 Data Compression

Cloudflare automatically gzip/brotli responses. No extra build step needed.

### 15.4 Lazy Loading

State and international data should be fetched only when the user selects them, keeping initial page loads small.

---

## Appendix A: New Files to Create

```
apps/web/functions/
  api/compare.ts
  api/state-series/[name].ts
  api/international/[country]/[name].ts
  api/sounds-like/[name].ts
  embed/[name]/index.ts
  compare/[names]/index.ts
  rss.xml.ts

packages/shared/src/
  render-compare.ts
  render-embed.ts
  render-newsletter.ts       # optional

apps/web/public/assets/
  compare.js
  embed.js
  state-chart.js             # optional, or fold into app.js

scripts/
  ingest-international.ts
  build-meanings.ts
  build-phonetics.ts
  generate-newsletter.ts
  update-state-data.ts       # if not already present

migrations/
  0020_name_meanings.sql     # optional
  0021_international_names.sql
  0022_name_phonetics.sql    # optional
```

## Appendix B: Files to Modify

```
apps/web/public/assets/app.js          — add comparison, state toggle, tooltip, share, embed
apps/web/public/assets/style.css       — new components
apps/web/public/assets/viz-theme.css   — tooltip/legend styles
apps/web/public/index.html             — newsletter signup
apps/web/functions/_middleware.ts      — preserve comparison/state query params
apps/web/functions/name/[name]/index.ts — pass state/international flags if needed
packages/shared/src/render-name.ts     — add comparison, state selector, meaning, related products
packages/shared/src/d1-queries.ts      — add getNameMeaning, getStateSeries, getInternationalName, etc.
packages/shared/src/schema.ts          — add types for comparison, meaning, international
packages/shared/src/index.ts           — export new modules
scripts/ingest-ssa.ts                  — ensure state data is populated
.github/workflows/                     — add new build steps
```

## Appendix C: Privacy Compliance

Maintain nobodynamed.com’s no-tracking philosophy:

- ❌ No Google Analytics, Facebook Pixel, or third-party cookies.
- ✅ Use privacy-focused analytics if needed: Plausible or Fathom.
- ✅ All data processing stays on Cloudflare edge / D1.
- ✅ Newsletter emails stored in Buttondown/ConvertKit, not D1.
- ✅ Affiliate links are direct, no redirect trackers.

---

*End of codebase-aligned implementation spec.*
