# Classic Name Card Sparklines Design

## Goal

Show the historical popularity shape for James, Elizabeth, William, Anna, John, and Mary directly on `/classic-names` without adding client-side data fetching or visual clutter.

## Chosen approach

Render normalized sparklines on the server from the existing 60-byte `names.spark_blob` values stored in D1. Each name uses its own vertical scale, so the chart communicates trajectory rather than absolute volume.

For names with male and female records, select the record with the greatest lifetime birth total. Preserve the configured card order.

## Card design

Each current name card retains its name and `OPEN DOSSIER` action, with a compact chart between them:

- Inline SVG approximately 120 by 40 CSS pixels
- Thin line with a restrained translucent fill
- Left and right labels for the dataset minimum and maximum years
- No axis ticks, tooltip, animation, or numeric labels
- Fixed chart dimensions to prevent layout shift
- Whole card remains linked to the relevant name dossier
- Existing responsive grid remains unchanged

The SVG receives an accessible label such as `Normalized popularity trend for James, 1880-2025`. Decorative fill elements are hidden from assistive technology.

## Data flow

1. The root editorial route recognizes `/classic-names`.
2. It queries D1 once for the six configured names, including `spark_blob`, sex, and lifetime total.
3. It selects the dominant record for each name and decodes each 60-byte sparkline.
4. A pure renderer converts normalized points into an inline SVG path.
5. The server inserts each SVG into the matching card before returning HTML.

No new API endpoint or client-side request is introduced.

## Failure behavior

D1 access is best-effort. If the query fails, a record lacks a sparkline, or a configured name is absent, the page still returns its existing linked cards without a chart. One missing name does not suppress the other five charts.

## Testing

- Unit-test normalized path generation, empty-series handling, and accessible SVG output.
- Route-level test that verifies six configured cards retain their order and receive sparklines when D1 data is available.
- Verify `npm test`, typecheck, and build.
- Serve the page over HTTP and inspect desktop and mobile rendering.
- Confirm initial HTML contains six SVGs without JavaScript execution.
- Confirm the no-data fallback returns a usable page with no broken placeholders.

## Scope boundaries

This change applies only to the six cards on `/classic-names`. It does not add tooltips, comparison controls, animation, shared-scale charts, or sparklines to other editorial pages.
