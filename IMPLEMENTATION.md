# nobodynamed — Implementation Spec

**For:** Claude Code, working on the local repo for nobodynamed.com
**Authored:** 2026-05-05
**Scope:** Brand rename (Name Vitals → nobodynamed, Option B positioning) + the full set of UX, copy, and feature improvements from the UX review.
**Estimated effort:** 1–2 focused sessions. The work is mostly tactical edits with two larger features (compare-two-names, OG images) that can be deferred to a follow-up branch.

-----

## Read this first: voice, brand, and ground rules

The brand is **nobodynamed** — always lowercase, one word, no space. Lock this everywhere including title tags, meta tags, headings, body prose, comments in code, README files, and commit messages. Never capitalize at sentence start. Never write “Nobody Named,” “NobodyNamed,” or “nobody named.” The literal string is `nobodynamed` and it appears in lowercase even when it’s the first word of a sentence.

**Voice principle:** quiet, observational, a little wistful, never sentimental, never SaaS-landing-page. The test for any string: *would a thoughtful obituarist or census archivist write this?* If yes, ship it. If it sounds like product marketing, rewrite. Examples of what to avoid: “Discover the fascinating story of your name!” “Unlock the history hidden in baby name data!” “Join thousands exploring American naming trends!” Examples of what to aim for: “Every name has an arc.” “Some names left the country quietly.” “1924 was Dorothy’s year.”

**Internal vs. external strings:** The JavaScript global namespace `NameVitals` (referenced as `NameVitals.setupSearch`, `NameVitals.fetchMeta`, etc. in `assets/app.js`) is an internal identifier and **stays as `NameVitals`** throughout this rebrand. Renaming it adds risk without user-visible benefit. Only change strings that a user can see in the browser, in the page source, in social previews, or in shared links.

**Don’t break things:** URL structure, route names, API endpoints (`/api/year/:year`, `/name/:name/`), data contracts, query-string parameter names (`?name=`, `?sex=F`), and the SSA data layer all stay exactly as-is. This is a surface-level rebrand plus UX polish, not a re-architecture.

**Branching:** Create branch `rebrand-nobodynamed` off main. Do not push or merge. End each phase by reporting status and waiting for human review before proceeding to the next phase. If something is ambiguous, stop and ask rather than guess.

-----

## Phase 0 — Discovery

Before any edits, do this and report back:

1. Run `git status` and confirm a clean tree. Create branch `rebrand-nobodynamed`.
1. Catalog every file in the repo. Specifically note: every `.html` file (likely `index.html`, `extinct.html`, `endangered.html`, `comeback.html`, `rising.html`, `year.html`, `about.html`, plus any name-page template), every `.css` file, every `.js` file, and any deployment config (`wrangler.toml`, `_redirects`, `_headers`, `package.json`).
1. Run `grep -rni "name vitals" .` and `grep -rn "NameVitals" .` and produce a checklist split into:
- **User-visible strings** (HTML body, meta tags, button labels, alt text, comments shown to users) — these will all be replaced.
- **Internal identifiers** (JS namespace, function names, internal comments) — these stay.
1. Identify the dev/preview command (likely `npx wrangler pages dev .` or `npx serve` — check `package.json` and `wrangler.toml`).
1. Identify how name detail pages are rendered. Possibilities: pre-rendered static HTML per name, server-rendered via Workers/Functions, or client-rendered from a JSON blob fetched at load time. The implementation strategy for some fixes (especially OG images and narrative copy) depends on this. Determine and report which it is.
1. Check if a `404.html` exists at the root.
1. Report the discovery output before starting Phase 1.

-----

## Phase 1 — Brand string replacements

These are the literal copy changes. Apply them everywhere they appear. Where a string appears in multiple files (e.g., the header wordmark is on every page), update all instances.

### Header wordmark (every page)

```
OLD: <a class="brand" href="/">Name Vitals</a>
NEW: <a class="brand" href="/">nobodynamed</a>
```

### Title tags (every page, customize the suffix)

```
home:        <title>nobodynamed — is your name going extinct?</title>
extinct:     <title>nobodynamed — extinct American names</title>
endangered:  <title>nobodynamed — endangered American names</title>
comebacks:   <title>nobodynamed — name comebacks</title>
rising:      <title>nobodynamed — fastest-rising American names</title>
year:        <title>nobodynamed — top names by birth year</title>
about:       <title>nobodynamed — about</title>
name page:   <title>nobodynamed — [Name]</title>
404:         <title>nobodynamed — nobody named that</title>
```

### Meta description (home page)

```
OLD: Look up the popularity, trajectory, and vital status of any American name since 1880. Based on Social Security Administration data.
NEW: 144 years of American baby names. See which ones are rising, falling, or already gone — drawn from public Social Security records.
```

For other pages, write descriptions in the same voice. Suggested:

- **extinct:** `American names that were popular once and are given to no one now. Sourced from 144 years of Social Security records.`
- **endangered:** `Names down 90 percent or more from their peak. The slow disappearances, charted from 1880 onward.`
- **comebacks:** `Names that flatlined for decades, then came roaring back. Tracked across 144 years of American birth records.`
- **rising:** `The fastest-rising American baby names, drawn from the latest Social Security data.`
- **year:** `Look up the most popular American baby names from any year between 1880 and the latest available.`
- **about:** `What nobodynamed is, where the data comes from, and how the trajectories are calculated.`

### OG and Twitter meta (every page)

Update `og:title`, `og:description`, `twitter:title`, and `twitter:description` to mirror the new title and meta description on the same page. Keep `og:type`, `og:url`, and `twitter:card` values as-is. If `og:image` is missing on any page, leave a placeholder pointing to a future endpoint — Phase 5 covers per-name OG images.

### Home page hero

```
OLD H1:    Is your name going extinct?
NEW H1:    Is your name going extinct?     [UNCHANGED — strongest hook on the site]

OLD lede:  A vital-signs report for any American name since 1880, drawn from 144 years of Social Security Administration records.
NEW lede:  Every American name has an arc — peak, plateau, decline, sometimes a return. We chart all of them, from 1880 to last year.
```

### Search button label

```
OLD: Check
NEW: Look it up
```

### Search hint (privacy line)

```
OLD: Your search stays in your browser — no account, no tracking.
NEW: Your search stays in your browser. No account, no tracking.
```

### Landing CTA cards

Tighten the sublines:

```
Extinct names →     Popular once. Now given to no one.
Endangered names →  Down 90 percent or more from their peak.
Comeback Kids →     Flatlined, then came roaring back.
Rising names →      Growing faster than anything else.
```

### Year-of-birth widget

```
H2 (UNCHANGED):     What were the top names the year you were born?
Button (UNCHANGED): Look up
Placeholder OLD:    Enter birth year — e.g. 1987
Placeholder NEW:    Birth year — e.g. 1987
```

### “Popular right now”

```
H2 (UNCHANGED): Popular right now
Lede OLD:       Top ten girls and boys names from the latest year on record.
Lede NEW:       The ten most-given girls' and boys' names from the latest year on record.
```

### Footer (every page)

```
Line 1 (UNCHANGED): Built on public-domain data from the Social Security Administration.
Line 2 (existing):  About · SSA source

ADD a new line above existing line 1:
                    nobodynamed is a small data project. Names are forever. Mostly.
```

If the user later asks to remove the new line, make it easy to delete in one place. Keep the SSA attribution intact.

### Name result page — collision box

```
OLD: <span class="collision-year">In 1924:</span><strong>39,996</strong> girls named Dorothy
     <span class="collision-year">In 2024:</span><strong>714</strong> girls named Dorothy

NEW: <span class="collision-year">1924</span><strong>39,996</strong> girls named Dorothy
     <span class="collision-year">2024</span><strong>714</strong> girls named Dorothy
```

(Drop the “In “ prefix and trailing colon. The year is the implicit subject.)

### Name result page — narrative copy

The narrative-rendering function in `assets/app.js` currently restates the same numbers shown in the collision box. Replace the second paragraph with context the data alone can’t deliver. Use whichever pattern is computable from existing data:

```
Pattern A (preferred — peer-name comparison):
"When [Name] peaked in [PeakYear], the most popular girls' name was [Top1F] and the most popular boys' name was [Top1M]."

Pattern B (share of births):
"In [PeakYear], roughly 1 in [N] girls born that year was named [Name]. In [LatestYear], it's 1 in [M]."

Pattern C (top-1000 exit, only if applicable):
"[Name] last appeared in the top 1,000 in [Year]."

Pattern D (rising names):
"In [LatestYear], more babies were named [Name] than in any year since [HistoricalYear]." (Only if true.)
```

Determine which patterns are feasible given the data layer. If A is feasible (top-name-per-year data already powers the home page “Popular right now” widget, and the year widget — so it almost certainly is), implement A as the default. Add Pattern D for rising/comeback names. Leave the first narrative paragraph (the headline statistic) intact.

If a pattern can’t be computed from existing data, leave that case’s narrative as-is and add a `// TODO: narrative pattern X requires data layer Y` comment. Do not invent stats.

### Name result page — affiliate row

```
OLD: Curious about the history of [Name]? Browse <a>books about the name [Name] on Amazon</a>.
NEW: Further reading: <a>books about the name [Name]</a>.
```

Keep `rel="nofollow sponsored"` and `target="_blank"`. The point is to make it look intentional rather than salesy. Same Amazon search URL — no tracking changes.

### 404 page

If `404.html` exists, replace its body with:

```html
<h1>nobody named that.</h1>
<p class="lede">Or at least not five or more babies in any year — the SSA's reporting threshold.</p>
<p><a href="/">← back to the search</a></p>
```

If `404.html` does not exist, create one at the repo root with the standard site chrome (header, footer, page wrapper) and the body above. Make sure Cloudflare Pages serves it for unmatched routes — check the existing config.

### Comments in code

Search `assets/app.js`, `assets/landing.js`, and `assets/style.css` for any comments that say “Name Vitals” and replace with “nobodynamed”. Section divider comments like `/* ── nav active state ── */` stay as-is.

### README, package.json, wrangler.toml

Update any user-visible name references. Specifically:

- `package.json` `name` field: change to `nobodynamed` if it currently reads `name-vitals` or similar. Check that this doesn’t break npm scripts.
- `wrangler.toml` `name` field: this is the Cloudflare Pages project name. **Do not change** without confirming with the user — it could break the deployment. Leave a TODO note instead.
- README: update title, description, any badges or mentions.

-----

## Phase 2 — Critical UX fixes (highest leverage)

### Fix 1: Hero shows an example report

The hero currently goes headline → search → CTA grid → year widget → popular grid. Five competing blocks before any payoff. Insert a static example report card directly under the search input, above the four landing CTA cards.

The example card should be a smaller version of the actual name-result card, hard-coded to a memorable name (suggested: **Dorothy** — the canonical “your grandmother’s name” for the target audience). Show:

- Name as H3 (smaller than the H1 of an actual report).
- Status pill (`status-endangered`).
- One-line summary: “Peaked 1924. Down 98 percent.”
- A small sparkline (use the existing `.sparkline` style at half-height — 85px).
- A muted “see full report →” link to `/name/Dorothy/`.

Wrap the example in a container `<div class="hero-example">` and style it to feel like a preview, not the main event. Border, slightly inset, faded:

```css
.hero-example {
  margin: 1.5rem 0 2rem;
  padding: 1rem 1.25rem;
  border: 1px dashed var(--rule);
  border-radius: var(--radius);
  background: var(--bg-card);
  opacity: 0.95;
}
.hero-example h3 { margin: 0; font-size: 1.4rem; }
.hero-example .status-pill { margin-top: 0.25rem; }
.hero-example .summary { color: var(--muted); margin: 0.5rem 0; font-size: 0.95rem; }
.hero-example .preview-link { font-size: 0.85rem; color: var(--muted); }
.hero-example .preview-link:hover { color: var(--accent); }
```

The example sparkline can be hard-coded SVG with Dorothy’s actual data, or fetched lazily on page load. Lazy-load is cleaner — reuse the existing `NameVitals.fetchMeta` plus a `/api/name/Dorothy` call if available, or whatever data path the report page uses. If lazy-loading, render a static placeholder sparkline first to avoid layout shift.

### Fix 2: Demote the four landing CTA cards

These are navigation, not conversion. Move them below the year widget and the “Popular right now” grid — i.e., make them the *last* element before the footer. Keep the cards but reduce their visual weight: drop the bordered card treatment, render as a simple text list:

```html
<section class="landing-secondary">
  <h2>Browse the archive</h2>
  <ul class="cta-list">
    <li><a href="/extinct.html"><strong>Extinct names</strong> — popular once, now given to no one.</a></li>
    <li><a href="/endangered.html"><strong>Endangered names</strong> — down 90 percent or more from their peak.</a></li>
    <li><a href="/comeback.html"><strong>Comeback Kids</strong> — flatlined, then came roaring back.</a></li>
    <li><a href="/rising.html"><strong>Rising names</strong> — growing faster than anything else.</a></li>
  </ul>
</section>
```

```css
.landing-secondary { margin: 3rem 0 2rem; }
.cta-list { list-style: none; margin: 0; padding: 0; }
.cta-list li { padding: 0.5rem 0; border-bottom: 1px solid var(--rule); }
.cta-list li:last-child { border-bottom: 0; }
.cta-list li a { color: var(--fg); }
.cta-list li a strong { font-weight: 600; }
.cta-list li a:hover { color: var(--accent); }
```

Remove the old `.landing-ctas` section and its CSS (or leave the CSS as orphan rules — they won’t conflict). Remove the old four-card grid from `index.html`.

### Fix 3: Promote and enlarge the sparkline on the result page

Current: 170px tall, single accent line, faint blue fill. Make it the centerpiece:

- Change `.sparkline` height from `170px` to `280px` in `style.css`.
- In the SVG render in `assets/app.js`, add inline year labels:
  - Peak year label positioned just above the peak point (`<text>` element, small, dark).
  - Latest year label at the right edge, baseline-aligned with the rightmost data point.
- Make the fill color status-aware. The render function knows the status (Rising / Stable / Declining / Endangered / Extinct). Set the fill class accordingly:

```js
const fillColor = {
  rising: "rgba(6, 125, 74, 0.12)",
  stable: "rgba(59, 91, 219, 0.10)",
  declining: "rgba(183, 121, 31, 0.12)",
  endangered: "rgba(180, 35, 24, 0.10)",
  extinct: "rgba(42, 42, 42, 0.10)"
}[status];
```

Make the line color match in a darker shade (use the existing `--rising`, `--declining`, `--endangered`, `--extinct` variables — these are already defined). Add a CSS variable `--line-color` to the SVG inline style and update the `.line` stroke to use it.

### Fix 4: F/M dropdown → segmented control

Replace:

```html
<select id="sex" title="Limit to masculine or feminine">
  <option value="">Either</option>
  <option value="F">F</option>
  <option value="M">M</option>
</select>
```

With:

```html
<div class="sex-toggle" role="group" aria-label="Filter by gender">
  <button type="button" data-sex="" aria-pressed="true">Either</button>
  <button type="button" data-sex="F" aria-pressed="false">Girls</button>
  <button type="button" data-sex="M" aria-pressed="false">Boys</button>
</div>
```

CSS:

```css
.sex-toggle {
  display: inline-flex;
  border: 1px solid var(--rule);
  border-radius: var(--radius);
  overflow: hidden;
  background: var(--bg-card);
}
.sex-toggle button {
  padding: 0.6rem 1rem;
  font: inherit;
  font-size: 0.95rem;
  background: transparent;
  color: var(--fg);
  border: 0;
  border-right: 1px solid var(--rule);
  cursor: pointer;
}
.sex-toggle button:last-child { border-right: 0; }
.sex-toggle button[aria-pressed="true"] { background: var(--fg); color: var(--bg-card); }
.sex-toggle button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
```

JS: Add a small handler that updates `aria-pressed` on click and exposes the current value to the existing `NameVitals.setupSearch` flow. Provide a `getSelectedSex()` helper that returns `""`, `"F"`, or `"M"` and update the search/submit code to call it. Wire keyboard support (arrow left/right to move focus and toggle, Enter to submit).

The existing `<select id="sex">` is read by `NameVitals.setupSearch` in `assets/app.js`. Either: (a) keep a hidden `<input type="hidden" id="sex" value="">` that the toggle updates so `setupSearch` doesn’t change, or (b) update `setupSearch` to take an explicit value-getter. Option (a) is the smaller diff.

### Fix 5: Mobile header collapse

Below 600px, replace the wrapping nav with a hamburger menu using a native `<details>`/`<summary>` element so it works without JavaScript:

```html
<header class="site">
  <a class="brand" href="/">nobodynamed</a>

  <details class="nav-mobile">
    <summary aria-label="Menu">
      <span aria-hidden="true">≡</span>
      <span class="visually-hidden">Menu</span>
    </summary>
    <nav>
      <a href="/extinct.html">Extinct</a>
      <a href="/endangered.html">Endangered</a>
      <a href="/comeback.html">Comebacks</a>
      <a href="/year.html">Birth year</a>
      <a href="/rising.html">Rising</a>
      <a href="/about.html">About</a>
    </nav>
  </details>

  <nav class="nav-desktop">
    <a href="/extinct.html">Extinct</a>
    <a href="/endangered.html">Endangered</a>
    <a href="/comeback.html">Comebacks</a>
    <a href="/year.html">Birth year</a>
    <a href="/rising.html">Rising</a>
    <a href="/about.html">About</a>
  </nav>
</header>
```

CSS:

```css
.nav-mobile { display: none; }

@media (max-width: 600px) {
  .nav-desktop { display: none; }
  .nav-mobile { display: block; position: relative; }
  .nav-mobile summary {
    list-style: none;
    cursor: pointer;
    padding: 0.4rem 0.6rem;
    font-size: 1.4rem;
    line-height: 1;
    color: var(--muted);
  }
  .nav-mobile summary::-webkit-details-marker { display: none; }
  .nav-mobile[open] summary { color: var(--fg); }
  .nav-mobile nav {
    position: absolute;
    right: 0;
    top: calc(100% + 0.5rem);
    background: var(--bg-card);
    border: 1px solid var(--rule);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 0.5rem 0;
    min-width: 160px;
    z-index: 20;
  }
  .nav-mobile nav a {
    display: block;
    padding: 0.6rem 1rem;
    color: var(--fg);
    margin: 0;
    font-size: 1rem;
  }
  .nav-mobile nav a:hover { background: #f4f1eb; }
}
.visually-hidden {
  position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
  overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
}
```

Remove or revise the existing `@media (max-width: 480px)` rule that does `header.site { flex-direction: column; ... }` — it’s no longer needed and will conflict.

### Fix 6: `inputmode="numeric"` on year inputs

Add `inputmode="numeric"` to the birth-year input on the home page and any other year inputs in the codebase (likely on `/year.html`). Single attribute change, much better mobile keyboard.

```html
<input id="yr-home" type="number" inputmode="numeric" min="1880" max="2030" placeholder="Birth year — e.g. 1987">
```

### Fix 7: Subordinate the year-of-birth widget on the home page

Currently the year widget has an H2 of equal weight to the main hero, splitting attention. Reduce its prominence:

- Change the wrapping H2 to H3.
- Reduce the widget’s visual chrome — remove the box-shadow, soften the background to match the page bg (no card treatment), keep a subtle top border.

```css
.year-widget {
  margin: 3rem 0 2rem;
  padding: 1.25rem 0 0;
  background: transparent;
  border: 0;
  border-top: 1px solid var(--rule);
  border-radius: 0;
  box-shadow: none;
}
.year-widget h3 { margin: 0 0 0.75rem; font-size: 1.15rem; }
```

(Update the HTML tag from `<h2>` to `<h3>` to match.)

### Fix 8: Suggestions dropdown keyboard feedback

The CSS already has `.suggestions div.active` styling. Verify the JS in `NameVitals.setupSearch` actually toggles `.active` on arrow-key navigation — if not, fix it. The user should see a visible highlight as they arrow up/down through suggestions, and Enter should commit the highlighted suggestion.

### Fix 9: Loading state on search

When the user submits a search, briefly show a loading indicator before the route changes (or before suggestions populate on first keystroke). Add a small spinner or skeleton — keep it minimal. A simple approach: add `.search.loading` class with a subtle right-edge animated bar inside the input. Don’t overengineer.

### Fix 10: Footer character — live count

Add a quietly impressive stat to the footer. Compute total names tracked or total babies-named-in-the-dataset. Suggested:

```
Tracking 1.1 million Dorothys, 4.6 million Johns, and 100,000+ other names since 1880.
```

If the exact numbers aren’t computable without a backend pass, hard-code a reasonable approximation and add a `// TODO` comment to compute it from the data once. Do not invent numbers — round-down conservative estimates only.

### Fix 11: Dark mode

Add `prefers-color-scheme: dark` support. Define dark-mode versions of the CSS variables:

```css
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #15140f;
    --bg-card: #1c1b16;
    --fg: #e8e4d8;
    --muted: #9a958a;
    --rule: #2c2a23;
    --accent: #8aa1ff;
    --accent-fg: #15140f;
    /* status colors stay or get tweaked for contrast */
    --rising: #34d399;
    --declining: #d4a056;
    --endangered: #f87171;
    --extinct: #6b6b76;
  }
  .suggestions div:hover, .suggestions div.active { background: #25231d; }
  .table tr:hover td { background: #1f1d18; }
  .collision-box { background: #25201a; border-color: #3a3127; }
  .twin-list li a { background: var(--bg); }
}
```

Test carefully — the cream-on-charcoal aesthetic should feel intentional, not auto-inverted. Status pill text contrast must remain readable.

-----

## Phase 3 — Visual signature (the “what makes this site distinctive” pass)

The original review flagged that the visual system has no signature. This phase introduces a **document/ledger motif** that runs through every page. The goal is for someone to recognize a nobodynamed page from a screenshot.

### Signature element 1: Report number on name pages

Every name page gets a small uppercase tracking-letter label above the H1, styled like a document serial number:

```html
<article class="report" data-name="Dorothy" data-sex="F">
  <div class="report-meta">VITAL REPORT №00214 · F</div>
  <h1>Dorothy</h1>
  ...
</article>
```

The number can be deterministically derived from the name (e.g., a hash mod 99999, zero-padded to 5 digits) so it’s stable per name without needing storage. Implement in JS during render.

```css
.report-meta {
  font-family: "SF Mono", ui-monospace, Menlo, monospace;
  font-size: 0.7rem;
  letter-spacing: 0.15em;
  color: var(--muted);
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
```

### Signature element 2: Editorial section dividers

Replace the default `<hr>` with a custom divider using a centered ornament. Add to CSS:

```css
hr.editorial {
  border: 0;
  text-align: center;
  margin: 2.5rem 0;
  position: relative;
}
hr.editorial::before {
  content: "· · ·";
  letter-spacing: 0.5em;
  color: var(--muted);
  font-size: 1rem;
}
```

Use `<hr class="editorial">` between major sections on the home page and about page.

### Signature element 3: Small caps section labels

Many sections currently use H2/H3 in regular type. Convert structural labels (not headlines) to small-caps tracking:

```css
.section-label {
  font-size: 0.75rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--muted);
  font-weight: 500;
  margin: 0 0 0.5rem;
}
```

Apply to: “Popular right now” lede, “Browse the archive” heading on the home page, and the year-widget heading. Keeps the H1/main-H2 weight reserved for actual content.

### Signature element 4: Top rule on cards

Add a thin dark rule across the top of every `.report` and `.year-widget` card, like the top of a death certificate:

```css
.report, .year-widget {
  border-top: 3px solid var(--fg);
}
```

(Override the default border-top from the existing `border: 1px solid var(--rule)` — keep the other three sides at 1px rule.)

### Signature element 5: Lock the wordmark style

In the header, the brand wordmark should feel like a masthead. Adjust:

```css
header.site .brand {
  font-weight: 700;
  font-size: 1.25rem;
  letter-spacing: -0.02em;
  color: var(--fg);
  font-style: italic;  /* New — italic Iowan reads as editorial */
}
```

Test the italic — if it fights the rest of the site, drop it. Keep the size and letter-spacing changes.

-----

## Phase 4 — Quick-win polish

These are sub-30-minute cleanups that compound:

- Verify focus-visible styles on every interactive element. Add a single rule: `*:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }` and remove any element-specific focus styles that conflict.
- Ensure all external links (SSA source, Amazon affiliate) have `rel="noopener"` on `target="_blank"`.
- Add `loading="lazy"` to any images on lower viewport pages (likely none on this text-first site, but check).
- Audit color contrast: muted text (`#6b6b76`) on cream (`#f7f5f2`) is 4.7:1 — passes AA for body but is borderline for small text. Bump muted to `#5a5a64` if you can do it without disrupting the visual feel. Test before committing.
- Add a meta theme-color: `<meta name="theme-color" content="#f7f5f2">` and a dark-mode variant: `<meta name="theme-color" content="#15140f" media="(prefers-color-scheme: dark)">`.
- Add `<link rel="preconnect" href="https://static.cloudflareinsights.com">` if Cloudflare Pages Analytics stays — minor perf win.

-----

## Phase 5 — New features (optional, ship in a follow-up branch)

These are larger and explicitly **out of scope for the rebrand branch**. Implement only if the user requests, and on a separate branch.

### Feature A: Per-name OG image generation

The single highest-leverage growth lever. Every name shared to Twitter/iMessage/Slack should render with a custom card showing the name, status, and sparkline.

Build as a Cloudflare Worker route at `/og/:name.png` that:

- Reads the name and sex from the URL.
- Fetches the same data the report page uses.
- Renders an SVG card (1200×630) with the name, status pill, headline stat, and sparkline using inline SVG.
- Returns the SVG as PNG using `@vercel/og` or `satori` + `resvg-wasm` (works on Workers).
- Caches with `Cache-Control: public, max-age=31536000, immutable` and a versioned URL.

Update every name page’s `og:image` to `https://nobodynamed.com/og/[Name]-[Sex].png`.

This is a larger build — spec it separately when ready.

### Feature B: Compare two names

Hero-tier viral feature. Route: `/compare/:name1/:name2/`. Overlays two sparklines, shows side-by-side stats, generates a shareable card. Specs as a separate doc.

### Feature C: Generational lineage

“Enter your name and your kid’s name.” Shows the cross-generational arc. Specs as a separate doc.

-----

## Phase 6 — Verification

After all in-scope phases, run through this checklist before opening the PR:

1. `grep -rn "Name Vitals" .` — should return zero hits in user-visible files. (May still appear in `assets/app.js` as `NameVitals` namespace — that’s fine.)
1. `grep -rni "name vitals" .` (case-insensitive) — same.
1. Build/preview locally. Click through every page in the nav. Verify:
- Browser tab title starts with `nobodynamed —`
- Header wordmark reads `nobodynamed`
- Footer has the new “small data project” line + SSA attribution
- View-source meta tags are updated for `og:title`, `og:description`, `twitter:title`, `twitter:description`
- The hero example card renders below the search input
- The four landing CTAs are now a text list at the bottom of the home page, not a card grid
- The year widget is visually subordinate (no card chrome, smaller heading)
1. Resize to 390px (DevTools iPhone 14 Pro). Verify:
- Hamburger menu appears and opens
- Tapping a nav link navigates correctly
- Form inputs are usable, no horizontal scroll
- Year input opens the numeric keyboard (test on real device if possible)
1. Test the segmented sex control: click through Either / Girls / Boys, submit each, verify route includes correct `?sex=` value (or empty for Either).
1. Test result pages:
- `/name/Dorothy/` (endangered) — sparkline 280px, fill is red-tinted, peak/latest year labels visible, narrative includes peer-name comparison
- `/name/Khaleesi/` (rising) — fill is green-tinted, narrative reflects rising status
- `/name/Mildred/` (declining or endangered) — appropriate fill color
- Each shows the `VITAL REPORT №NNNNN` line above the H1
- Collision box shows `1924` not `In 1924:`
- Affiliate row reads “Further reading: …”
1. Hit a deliberately bad URL (`/name/Zzzzzzzzz/`) — confirm 404 page renders the new copy.
1. Toggle OS dark mode — confirm the site adapts gracefully. No invisible text. No broken status pills.
1. Run Lighthouse on `/` and `/name/Dorothy/`:
- Performance: should not regress (target ≥95)
- Accessibility: should improve (target ≥98 — the segmented control with `aria-pressed` and the native `<details>` mobile nav both help)
- SEO: should remain ≥95
1. Validate HTML on home and a name page using `https://validator.w3.org/nu/` — fix any new errors introduced.
1. Test on Twitter card validator (`https://cards-dev.twitter.com/validator`) — confirm the new title/description show up. (Per-name OG images are Phase 5.)

-----

## Phase 7 — Hand back

When complete, produce:

1. **Summary diff:** file-by-file changes with line counts.
1. **Decision log:** any judgment calls made (e.g., the optional second footer line — kept or cut, the narrative pattern selected, the wrangler.toml deferral). Include the reasoning.
1. **Open TODOs:** any `// TODO` comments added in code, with context.
1. **Screenshots:** before/after of the home page (desktop + mobile) and a name detail page (desktop + mobile, light + dark).
1. **Suggested commit structure:** one squashed commit on `rebrand-nobodynamed` is fine for review; if the diff is large, split into:
- `rebrand: Name Vitals → nobodynamed (copy, meta, brand strings)`
- `ux: hero example, segmented sex toggle, mobile nav, sparkline promotion`
- `style: visual signature (report number, top rule, dividers, dark mode)`
- `polish: a11y, contrast, theme-color, focus-visible`

Do not push or merge. Leave the branch ready for human review.

-----

## Explicit non-goals

Do not do any of the following on this branch:

- Do not generate per-name OG images. (Phase 5, separate branch.)
- Do not build compare-two-names or lineage features. (Phase 5, separate branches.)
- Do not rename the JavaScript namespace `NameVitals`.
- Do not change URL structure, route names, API endpoints, or query-string parameter names.
- Do not change the font stack, the page max-width, or the base radius/shadow values beyond what’s specified.
- Do not add analytics, tracking, or third-party scripts beyond what already exists (Cloudflare Pages Analytics).
- Do not rewrite the about page in detail. Update only brand strings on it. Full about-page copy rewrite is a separate session.
- Do not change the SSA data fetching or methodology. The data layer is correct.
- Do not change the Cloudflare Pages project name in `wrangler.toml` without explicit user confirmation — this could break the deployment.

-----

## If you get stuck

If at any point a step is ambiguous, the data isn’t where you expected, a fix would require a much larger refactor than implied above, or a copy choice feels wrong in context — **stop and ask**. Don’t guess. The voice and brand consistency matter more than getting through the spec quickly.

Specifically pause and ask if:

- The narrative copy patterns can’t be computed from existing data and you need to add a new endpoint or data field.
- The hero example card requires new data the report page doesn’t already use.
- The visual signature changes (Phase 3) feel discordant when actually rendered — flag with a screenshot rather than committing.
- Any change might break a deployed URL or break inbound links.
- A copy string sounds wrong in context once you see it on the page — flag for human rewrite rather than improvising.

Good luck. The bar is “best site on the internet.”