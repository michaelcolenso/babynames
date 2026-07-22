import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildMiniSparkline } from "../packages/shared/src/index";

const options = { name: "James", minYear: 1880, maxYear: 2025 };

function linePath(svg: string): string {
  const match = svg.match(/<path class="mini-sparkline-line(?: line)?" d="([^"]+)"/);
  assert.ok(match, "expected a mini-sparkline line path");
  return match[1]!;
}

test("returns no markup for fewer than two values", () => {
  assert.equal(buildMiniSparkline([], options), "");
  assert.equal(buildMiniSparkline([12], options), "");
});

test("returns no markup for non-finite series values", () => {
  assert.equal(buildMiniSparkline([0, Number.NaN, 10], options), "");
  assert.equal(buildMiniSparkline([0, Number.POSITIVE_INFINITY, 10], options), "");
  assert.equal(buildMiniSparkline([0, Number.NEGATIVE_INFINITY, 10], options), "");
});

test("returns no markup for negative series values", () => {
  assert.equal(buildMiniSparkline([0, -1, 10], options), "");
});

test("returns no markup for a sparse series", () => {
  const sparse = [0, , 10] as number[];
  assert.equal(buildMiniSparkline(sparse, options), "");
});

test("returns no markup for non-finite years", () => {
  for (const invalidYear of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(buildMiniSparkline([0, 5, 10], { ...options, minYear: invalidYear }), "");
    assert.equal(buildMiniSparkline([0, 5, 10], { ...options, maxYear: invalidYear }), "");
  }
});

test("returns no markup for an all-zero series", () => {
  assert.equal(buildMiniSparkline([0, 0, 0], options), "");
});

test("renders a fixed, accessible SVG with a responsive plot and self-contained year labels", () => {
  const svg = buildMiniSparkline([0, 5, 10, 5], options);

  assert.match(svg, /^<svg class="mini-sparkline" width="100%" height="40"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Normalized popularity trend for James, 1880-2025"/);
  assert.match(svg, /<svg class="mini-sparkline-plot spark" x="0" y="0" width="100%" height="30" viewBox="0 0 120 30" preserveAspectRatio="none" aria-hidden="true">/);
  assert.match(svg, /<path class="mini-sparkline-line line" d="[^"]+"\/>/);
  assert.doesNotMatch(svg, /mini-sparkline-fill/);
  assert.match(svg, /<text class="mini-sparkline-year" x="2" y="39" text-anchor="start" font-size="10"[^>]*>1880<\/text>/);
  assert.match(svg, /<text class="mini-sparkline-year" x="100%" dx="-2" y="39" text-anchor="end" font-size="10"[^>]*>2025<\/text>/);
  assert.doesNotMatch(svg, /<(?:script|style|animate)\b/i);
});

test("uses the same line-only visual treatment as the site's compact sparklines", () => {
  const css = readFileSync(new URL("../apps/web/public/assets/style.css", import.meta.url), "utf8");

  assert.match(css, /\.spark \.line \{ fill: none; stroke: var\(--accent\); stroke-width: 1\.35; \}/);
});

test("keeps previous-release sparkline markup safe during edge-cache rollout", () => {
  const css = readFileSync(new URL("../apps/web/public/assets/style.css", import.meta.url), "utf8");

  assert.match(css, /\.diagnosis-card-with-spark \.mini-sparkline-fill \{ display: none; \}/);
  assert.match(
    css,
    /\.diagnosis-card-with-spark \.mini-sparkline-line \{ fill: none; stroke: var\(--accent\); stroke-width: 1\.35; \}/,
  );
});

test("keeps year labels inside the SVG without a stylesheet-dependent HTML row", () => {
  const markup = buildMiniSparkline([0, 5, 10, 5], options);

  assert.match(markup, /<text class="mini-sparkline-year"[^>]*>1880<\/text>/);
  assert.match(markup, /<text class="mini-sparkline-year"[^>]*>2025<\/text>/);
  assert.doesNotMatch(markup, /mini-sparkline-years|<span\b/);
  assert.match(markup, /<\/svg>$/);
});

test("escapes the name used in the accessible SVG attribute", () => {
  const svg = buildMiniSparkline([1, 2], {
    name: `A&B <Baby> "Name" 'Test'`,
    minYear: 1880,
    maxYear: 2025,
  });

  assert.match(
    svg,
    /aria-label="Normalized popularity trend for A&amp;B &lt;Baby&gt; &quot;Name&quot; &#39;Test&#39;, 1880-2025"/,
  );
  assert.doesNotMatch(svg, /A&B|<Baby>|"Name"|'Test'/);
});

test("normalizes each series so equivalent shapes share the same line path", () => {
  const small = buildMiniSparkline([0, 2, 4, 1], options);
  const large = buildMiniSparkline([0, 200, 400, 100], options);

  assert.equal(linePath(small), linePath(large));
});
