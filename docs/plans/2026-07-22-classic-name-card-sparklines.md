# Classic Name Card Sparklines Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Render six accessible, normalized SSA popularity sparklines inside the `/classic-names` dossier cards without client-side data fetching.

**Architecture:** Add a pure shared mini-sparkline renderer and a single D1 query that returns the dominant record for each configured name. The editorial route fetches the six blobs and dataset year bounds, then injects each SSR SVG into the existing card renderer. Any D1 or record-level failure falls back to the current text-only card.

**Tech Stack:** TypeScript, Cloudflare Pages Functions, D1, inline SVG, Node test runner through `tsx`.

---

### Task 1: Add the normalized mini-sparkline renderer

**Objective:** Provide a pure, reusable renderer for a fixed-size accessible SVG generated from normalized spark values.

**Files:**
- Create: `packages/shared/src/mini-sparkline.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `scripts/mini-sparkline.test.ts`
- Modify: `package.json`

**Step 1: Write failing tests**

Create tests asserting:

```ts
assert.equal(buildMiniSparkline([], { name: "James", minYear: 1880, maxYear: 2025 }), "");
assert.match(svg, /role="img"/);
assert.match(svg, /Normalized popularity trend for James, 1880-2025/);
assert.match(svg, /<path class="mini-sparkline-line"/);
assert.match(svg, />1880<\/text>/);
assert.match(svg, />2025<\/text>/);
```

Also verify that two series with the same shape at different magnitudes produce the same path.

**Step 2: Verify RED**

Run: `npx tsx --test scripts/mini-sparkline.test.ts`

Expected: FAIL because `buildMiniSparkline` does not exist.

**Step 3: Implement the renderer**

Implement `buildMiniSparkline(values, options)` with:

- `viewBox="0 0 120 40"`
- Fixed internal padding for year labels
- Per-series normalization to its own maximum
- A line path and closed fill path
- Escaped accessible name text
- No animation or script
- Empty string for fewer than two values or an all-zero series

Export it from `packages/shared/src/index.ts`.

**Step 4: Register and run the test**

Add `test:mini-sparkline` to `package.json` and include it in `npm test`.

Run:

```bash
npm run test:mini-sparkline
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/mini-sparkline.ts packages/shared/src/index.ts scripts/mini-sparkline.test.ts package.json
git commit -m "feat: add accessible mini sparkline renderer"
```

---

### Task 2: Add one-query dominant-name spark retrieval

**Objective:** Fetch the six configured names and select the highest-lifetime-total sex record for each name in one D1 query.

**Files:**
- Modify: `packages/shared/src/d1-queries.ts`
- Test: `scripts/editorial-pages.test.ts`

**Step 1: Write a failing contract test**

Add a fake D1 prepared-statement test that verifies the helper:

- Executes one query
- Binds all requested lower-case names
- Returns at most one row per normalized name
- Prefers the row with the greatest `total_count`
- Preserves the caller’s requested order when results are mapped by the route

**Step 2: Verify RED**

Run: `npm run test:editorial`

Expected: FAIL because `listDominantNamesWithSparks` does not exist.

**Step 3: Implement the query**

Add `listDominantNamesWithSparks(db, names)` using a window function:

```sql
WITH ranked AS (
  SELECT name, name_lower, sex, total_count, spark_blob,
         ROW_NUMBER() OVER (
           PARTITION BY name_lower
           ORDER BY total_count DESC, peak_count DESC, sex
         ) AS rn
  FROM names
  WHERE name_lower IN (?, ...)
    AND spark_blob IS NOT NULL
)
SELECT name, name_lower, sex, total_count, spark_blob
FROM ranked
WHERE rn = 1
```

Return an empty array for an empty input list.

**Step 4: Verify GREEN**

Run:

```bash
npm run test:editorial
npm run typecheck
```

Expected: PASS.

**Step 5: Commit**

```bash
git add packages/shared/src/d1-queries.ts scripts/editorial-pages.test.ts
git commit -m "feat: query dominant classic-name spark data"
```

---

### Task 3: Render sparklines in the classic-name cards

**Objective:** Add six SSR sparklines to `/classic-names` while retaining graceful text-only fallback behavior.

**Files:**
- Modify: `apps/web/functions/[slug].ts`
- Modify: `apps/web/public/assets/style.css`
- Test: `scripts/editorial-pages.test.ts`

**Step 1: Write failing rendering tests**

Export a pure `renderEditorialCards` helper and test that:

- Configured order remains James, Elizabeth, William, Anna, John, Mary
- Six supplied spark records produce six `<svg>` elements
- Cards still contain dossier links and names
- A missing record leaves only that card without an SVG
- No records produce the existing six usable text-only cards

**Step 2: Verify RED**

Run: `npm run test:editorial`

Expected: FAIL because the card renderer does not accept spark records.

**Step 3: Implement route integration**

For `classic-names` only:

1. Fetch `META_KEYS.minYear`, `META_KEYS.maxYear`, and the dominant spark rows.
2. Decode each `spark_blob`.
3. Build a case-insensitive map keyed by `name_lower`.
4. Render each available SVG inside its matching card.
5. Catch D1 errors and render the current text-only cards.

Do not fetch spark data for other editorial routes.

**Step 4: Add scoped CSS**

Add styles for:

- `.diagnosis-card-with-spark`
- `.mini-sparkline`
- `.mini-sparkline-fill`
- `.mini-sparkline-line`
- `.mini-sparkline-year`

Reserve chart height, use existing color tokens, and keep the current responsive grid.

**Step 5: Verify GREEN and integration**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Start `npm run dev:web`, request `/classic-names`, and verify:

- HTTP 200
- Six SVGs in initial HTML
- No client-side fetch required
- Accessible labels contain each name and dataset year range
- Mobile and desktop screenshots show no overflow or broken cards
- Simulated D1 failure keeps all six dossier links visible

**Step 6: Commit**

```bash
git add apps/web/functions/[slug].ts apps/web/public/assets/style.css scripts/editorial-pages.test.ts
git commit -m "feat: show SSR sparklines on classic name cards"
```

---

### Task 4: Independent review and pull request

**Objective:** Ship only after fresh evidence and independent review.

**Files:** No planned source changes unless review finds a defect.

**Step 1: Run final verification**

```bash
npm test
npm run typecheck
npm run build
git diff --check master...HEAD
```

Expected: all commands exit 0.

**Step 2: Run independent review**

Review the net diff against `master` for:

- Specification compliance
- D1 query correctness and parameter safety
- SVG escaping and accessibility
- No-JavaScript rendering
- Fallback behavior
- Responsive visual regressions

**Step 3: Push and open a PR**

```bash
git push -u origin feature/classic-name-sparklines
gh pr create --base master --head feature/classic-name-sparklines
```

Include verification evidence and production-monitoring notes in the PR body.
