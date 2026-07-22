import assert from "node:assert/strict";
import test from "node:test";

import { buildMiniSparkline } from "../packages/shared/src/index";

const options = { name: "James", minYear: 1880, maxYear: 2025 };

function linePath(svg: string): string {
  const match = svg.match(/<path class="mini-sparkline-line" d="([^"]+)"/);
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

test("returns no markup for non-finite years", () => {
  for (const invalidYear of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.equal(buildMiniSparkline([0, 5, 10], { ...options, minYear: invalidYear }), "");
    assert.equal(buildMiniSparkline([0, 5, 10], { ...options, maxYear: invalidYear }), "");
  }
});

test("returns no markup for an all-zero series", () => {
  assert.equal(buildMiniSparkline([0, 0, 0], options), "");
});

test("renders a fixed, accessible SVG with line, closed fill, and year labels", () => {
  const svg = buildMiniSparkline([0, 5, 10, 5], options);

  assert.match(svg, /^<svg class="mini-sparkline" viewBox="0 0 120 40"/);
  assert.match(svg, /role="img"/);
  assert.match(svg, /aria-label="Normalized popularity trend for James, 1880-2025"/);
  assert.match(svg, /<path class="mini-sparkline-fill" aria-hidden="true" d="[^"]+Z"\/>/);
  assert.match(svg, /<path class="mini-sparkline-line" d="[^"]+"\/>/);
  assert.match(svg, /<text class="mini-sparkline-year"[^>]*>1880<\/text>/);
  assert.match(svg, /<text class="mini-sparkline-year"[^>]*>2025<\/text>/);
  assert.doesNotMatch(svg, /<(?:script|style|animate)\b/i);
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
