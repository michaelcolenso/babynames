# Debut of the Year: Design Specification

**Date:** 2026-06-12
**Status:** Approved for implementation planning
**Route:** `/blog/debut-of-the-year/`

## Purpose

Create an editorial blog post and interactive D3 almanac showing, for every
year from 1881 through 2025, the boy name that crossed the SSA reporting
threshold with the largest first-year birth count.

The post should read as a media history written in birth certificates. Every
year remains visible, including years whose cause is unclear. Explanations
should state a supported cause plainly, qualify a plausible cause naturally,
or say that the trigger remains a mystery. The interface must not expose an
editorial confidence taxonomy.

## Scope

The first release covers:

- Boys only.
- Every data year from 1881 through 2025.
- One corrected winner per year.
- A researched explanation for every winner.
- Source links for factual explanations.
- A D3 overview chart connected to a complete, scrollable almanac.
- Responsive, keyboard-accessible, reduced-motion-aware interaction.
- Publication through the existing Markdown-to-D1 blog workflow.

The first release does not include:

- Girls or an all-sexes toggle.
- 1880, because every name already present at the dataset boundary is
  left-censored and cannot be treated as a genuine debut.
- A public confidence score or confidence badge.
- A general-purpose debut explorer or new permanent API.
- Automated historical explanation generation.

## Data Definition

For a year `y`, a candidate is a row in `names` where:

- `sex = 'M'`
- `first_year = y`

The candidate's debut count is the matching `name_years.count` where:

- `name_years.name_id = names.id`
- `name_years.year = names.first_year`

The initial winner is the candidate with the highest debut count. Ties resolve
alphabetically by `name`, matching the supplied query:

```sql
WITH deb AS (
  SELECT n.name, n.first_year AS y, ny.count AS c
  FROM names n
  JOIN name_years ny
    ON ny.name_id = n.id
   AND ny.year = n.first_year
  WHERE n.sex = 'M'
),
ranked AS (
  SELECT
    y,
    name,
    c,
    ROW_NUMBER() OVER (
      PARTITION BY y
      ORDER BY c DESC, name
    ) AS rank
  FROM deb
)
SELECT y AS year, name, c AS debut_count
FROM ranked
WHERE rank = 1
  AND y >= 1881
ORDER BY y;
```

The existing `/api/debuts/:year` endpoint cannot be used as the source of
truth because it currently selects `latest_count`, not the historical count in
the debut year.

## Artifact Review And Exclusions

The raw winner list must be reviewed before publication. A candidate should be
excluded only when there is strong evidence that it is a database or import
artifact rather than a recorded SSA spelling.

Examples of exclusion evidence:

- A known fixed-width truncation, such as `Christop` produced from
  `Christopher`.
- A row that cannot be reconciled with the underlying SSA source file.
- A malformed value introduced by this project's ingest or legacy source
  conversion.

Unusual spellings, phonetic spellings, and apparent misspellings remain when
they occur in the SSA source. They are part of the naming record.

When a winner is excluded, choose the next valid candidate from that year's
ordered candidates. Store the exclusion and reason in a separate audit list so
the correction is reproducible and reviewable.

## Data Assets

Create two checked-in JSON assets.

### Almanac Data

`content/blog/data/debut-of-the-year.json`

```json
{
  "generatedAt": "2026-06-12",
  "sourceMaxYear": 2025,
  "entries": [
    {
      "year": 1918,
      "name": "Foch",
      "debutCount": 58,
      "explanation": "Marshal Ferdinand Foch became supreme Allied commander as World War I ended.",
      "sources": [
        {
          "label": "Encyclopaedia Britannica: Ferdinand Foch",
          "url": "https://www.britannica.com/biography/Ferdinand-Foch"
        }
      ]
    }
  ]
}
```

Every entry must contain `year`, `name`, `debutCount`, `explanation`, and
`sources`. A mystery uses direct prose such as:

> No clear national headline, performer, character, or public figure explains
> this debut. The trigger remains a mystery.

Mysteries may have an empty `sources` array. Explanations with factual claims
must include at least one relevant source.

### Exclusion Audit

`content/blog/data/debut-of-the-year-exclusions.json`

```json
{
  "exclusions": [
    {
      "year": 1989,
      "name": "Christop",
      "debutCount": 1082,
      "reason": "Known eight-character truncation of Christopher in a legacy source.",
      "replacement": "ReplacementName"
    }
  ]
}
```

The exclusion asset is an internal audit record and is not rendered as a
confidence system. The essay may discuss a notable excluded artifact when it
strengthens the data-methodology story.

## Generation Workflow

Add a script that queries D1, fetches all ranked male candidates for 1881
through the current maximum year, applies the checked-in exclusion list, and
writes the structural almanac entries without overwriting researched
explanations or sources.

The script must:

- Use the correct `name_years` debut count.
- Return enough candidates per year to replace excluded winners.
- Fail if any year from 1881 through the database maximum has no valid winner.
- Fail if years are duplicated or discontinuous.
- Preserve manually researched fields when refreshing counts.
- Print a clear diff summary when a winner or count changes after a new SSA
  release.

Research remains editorial work. The generator must not infer historical
causes.

## Editorial Structure

Create `content/blog/debut-of-the-year.md` with the house blog voice: a stark
opening, short declarative passages, a sociological read, and links to name
dossiers.

Suggested structure:

1. **Opening:** Explain the metric and why 1880 is excluded.
2. **Overview visualization:** All 145 winners in one view.
3. **War heroes and headlines:** Early decades.
4. **Broadcast America:** Radio, film, television, and sports.
5. **Music, Black popular culture, and reality television:** Later-century
   shifts.
6. **Spanish-language media and migration:** The 2000s and 2010s thread.
7. **The mysteries:** Honest examples where no trigger can be established.
8. **Complete almanac:** Every year, name, debut count, explanation, and source
   links.
9. **Methodology:** SSA threshold, left-censoring, winner selection, tie rule,
   and artifact review.

The prose should avoid implying that every correlation proves causation.
Specific cultural explanations should use language proportionate to the
evidence.

## Blog Markup

The Markdown post should include one root mount:

```html
<section
  class="debut-almanac"
  data-debut-almanac
  data-source="/assets/data/debut-of-the-year.json"
>
  <div class="debut-chart" data-debut-chart aria-label="Largest boy-name debut by year"></div>
  <div class="debut-list" data-debut-list></div>
</section>
<script
  src="https://d3js.org/d3.v7.min.js"
  data-cfasync="false"
></script>
<script
  src="/assets/blog-debut-almanac.js"
  data-cfasync="false"
></script>
```

The publishing step copies the reviewed JSON to
`apps/web/public/assets/data/debut-of-the-year.json`. The browser does not
query D1 when the post loads.

The almanac script owns only this component. Shared blog rendering and the
general site application remain unchanged unless a small reusable style hook
is required.

## Visualization

The overview chart plots:

- X-axis: year, 1881 through 2025.
- Y-axis: debut count on a logarithmic scale.
- Mark: one point per yearly winner.
- Labels: selected point only, plus a small number of editorially chosen
  landmarks where labels do not collide.
- Decade bands or guides: subtle visual grouping without assigning every
  decade a loud color.

A logarithmic scale is required because early winners often have fewer than 20
births while modern media-driven spikes can exceed 500. The axis must explain
that spacing is logarithmic.

Hover and keyboard focus show:

- Year.
- Name.
- Debut count.
- Explanation.

Touch uses tap to select. Tooltips must remain within the viewport.

The complete almanac appears below the chart. Entries are grouped by decade,
but every year is individually addressable with an ID such as
`debut-year-1918`. Names link to `/name/:name/`.

## Linked Scroll And Highlight Motion

The chart and almanac should feel like two views of one object.

### Chart To Almanac

Selecting a chart point:

1. Marks the point as active and dims nonselected marks slightly.
2. Draws a short-lived guide or traveling accent from the chart selection
   toward the viewport edge in the direction of the destination.
3. Smoothly scrolls the corresponding row near the vertical center.
4. Applies a warm highlight bloom to the destination row.
5. Settles into a persistent selected state after the bloom fades.

### Almanac To Chart

Selecting or focusing an almanac row:

1. Updates the active chart point.
2. Expands the point briefly.
3. Pulses it once.
4. Draws a subtle vertical guide to the year axis.
5. Updates the chart tooltip or selected label.

### Motion Rules

- Motion should feel continuous, warm, and precise.
- Do not use sparkles, particles, confetti, or novelty effects.
- Use transform and opacity where possible.
- A new selection cancels any previous in-progress animation and scroll.
- Avoid layout-dependent animation that becomes unstable after resize.
- Do not trap scroll or hijack normal wheel/touch behavior.
- Use restrained durations, approximately 180–280 ms for local emphasis and
  500–750 ms for the coordinated scroll.

For `prefers-reduced-motion: reduce`:

- Use immediate scrolling.
- Remove travel, pulse, bloom, and animated dimming.
- Preserve selected-point, guide-line, and selected-row states.

## Responsive Behavior

Desktop:

- Full-width chart within the blog article column.
- Tooltip may sit beside the selected point.
- Almanac entries show year, name, count, and explanation in aligned columns.

Mobile:

- Chart keeps a readable minimum height and reduces axis tick density.
- Point targets are at least 32 CSS pixels through invisible hit areas.
- Tooltip becomes a compact anchored detail panel when a floating tooltip
  would cover the chart.
- Almanac entries stack year/name/count above explanation.
- Linked scrolling must account for the sticky site header, if present.

## Accessibility

- The chart has an accessible name and concise description.
- Render a focusable hit target for every year, or provide an equivalent
  keyboard control synchronized with the visual points.
- Arrow keys move to the previous or next year while focus remains in the
  chart.
- Enter or Space activates linked scrolling.
- Almanac entries are semantic articles or list items with headings.
- Selected states use `aria-current` or `aria-selected` where appropriate.
- Color is not the sole indicator of selection.
- Source links have descriptive labels.
- The complete almanac remains readable if JavaScript or D3 fails.

To satisfy the no-JavaScript requirement, the post must contain server-rendered
or publisher-generated almanac markup. D3 progressively enhances it rather
than being the only way entries appear.

## Styling

Use the site's existing warm paper, ink, muted, rule, accent, serif, sans, and
mono variables. Add narrowly scoped classes for:

- Chart frame and axes.
- Decade guides.
- Marks and invisible hit targets.
- Tooltip/detail panel.
- Almanac decade headings and rows.
- Selected, dimmed, bloom, and guide states.

Styles should live in the dedicated component asset when feasible. If shared
CSS is necessary, prefix all selectors with `.debut-almanac` to prevent blog
or visualization regressions.

## Failure Handling

- If the JSON fetch fails, leave the complete static almanac visible and show
  a short chart-unavailable note.
- If D3 is unavailable, do not throw; preserve static content.
- If an entry is malformed, skip only its interactive mark and retain its
  static row.
- The generation script fails loudly on missing years, duplicate years,
  nonpositive counts, unknown exclusions, and exclusions without a valid
  replacement.

## Testing

### Data Tests

- The dataset contains exactly one entry for every year from 1881 through the
  current source maximum.
- The initial 2025 release contains 145 entries.
- Years are sorted, unique, and contiguous.
- Every count is a positive integer.
- Every name is nonempty.
- Every explanation is nonempty.
- Factual explanations have at least one valid HTTP(S) source URL.
- Excluded candidates never appear as winners.
- Each replacement equals the highest-ranked nonexcluded candidate.
- 1880 is absent.

### Publishing Tests

- Markdown compilation preserves the raw mount markup and scripts.
- The generated SQL contains the mount and dedicated asset paths.
- The post is idempotently upserted at `debut-of-the-year`.
- The complete static almanac is present in the compiled body.

### Browser Tests

- All 145 points render.
- All 145 almanac rows render.
- Selecting a point scrolls to and selects the correct row.
- Selecting a row updates the correct point.
- Rapid selections end with only the final target selected.
- Keyboard navigation traverses years in order.
- Mobile tooltip/detail behavior stays within the viewport.
- Resize preserves the active year.
- Reduced-motion mode performs no smooth scrolling or pulse animation.
- Missing JSON and missing D3 preserve readable static content.

### Repository Gates

- `npm run blog:test`
- Focused debut data and rendering tests.
- `npm run typecheck`
- Local browser validation at desktop and mobile widths.
- Production route and asset smoke checks after deployment.

## Publication And Verification

1. Generate and review the corrected winner dataset.
2. Research every explanation and review source quality.
3. Compile the Markdown post into a timestamped migration.
4. Review the generated SQL.
5. Apply the migration locally and verify the full rendered post.
6. Run tests and typecheck.
7. Apply the reviewed migration remotely.
8. Deploy Pages.
9. Verify `/blog/debut-of-the-year/`, the JSON asset, D3 rendering, keyboard
   interaction, mobile layout, and reduced-motion behavior on production.
10. Confirm the post appears on `/blog/` and its name links resolve.

## Success Criteria

The feature is complete when:

- The live post covers every year from 1881 through 2025.
- Winner counts are based on the actual debut-year `name_years` row.
- Demonstrable data artifacts are excluded through an auditable rule.
- Every year has a clear explanation or an explicit mystery.
- Every factual explanation is sourced.
- The chart and almanac remain useful independently.
- Their linked selection and scrolling feel polished without novelty effects.
- The experience is accessible, responsive, and respectful of reduced motion.
- The publication survives JavaScript failure and a clean Pages deployment.
