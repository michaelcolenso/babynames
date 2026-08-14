import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { parseSpellingFamiliesCsv } from "../packages/shared/src/decade-hub-compute-core";
import { DECADE_HUB_DEFINITIONS } from "../packages/shared/src/content/decade-hub-definitions";
import { DECADE_THESES } from "../packages/shared/src/content/decade-theses";

// Independently reviewed against the live-D1 Task 9 profiles. These strings
// keep key numeric claims tied to an explicit assertion table without making
// runtime behavior depend on generated profile artifacts.
const REVIEWED_CLAIMS: Readonly<Record<string, readonly string[]>> = {
  "1880s": ["2,408,091", "91,668", "89,949", "70.8837", "1884", "No spelling family"],
  "1890s": ["3,362,508", "131,138", "80,664", "71.4206", "1894", "30,860"],
  "1900s": ["4,285,123", "161,504", "84,590", "71.1213", "1904", "43,690"],
  "1910s": ["14,831,446", "478,636", "376,311", "66.1716", "1914", "134,796"],
  "1930s": ["21,229,562", "573,000", "590,810", "65.2624", "1934", "99,527"],
  "1940s": ["29,371,705", "640,080", "795,775", "63.74", "1944", "188,016"],
  "1950s": ["39,451,567", "625,606", "843,768", "63.60", "1954", "540,942"],
  "1960s": ["37,527,873", "496,987", "833,092", "64.83", "1964", "442,847"],
  "1970s": ["31,968,373", "581,729", "707,327", "65.56", "1974", "393,998"],
  "1990s": ["37,485,138", "303,136", "462,466", "67.733", "1994", "340,029"],
  "2000s": ["38,437,096", "223,768", "274,077", "70.9224", "2004", "196,039"],
  "2010s": ["36,304,973", "195,070", "183,378", "73.1153", "2014", "263,576"],
  "2020s": ["2020–2025", "20,092,648", "95,853", "124,842", "75.3979", "2024", "120,046"],
};

test("every decade has an explicit, internally consistent family review file", () => {
  for (const definition of DECADE_HUB_DEFINITIONS) {
    const csv = readFileSync(new URL(`../${definition.familyFile}`, import.meta.url), "utf8");
    const rows = parseSpellingFamiliesCsv(csv);
    const owners = new Map<string, string>();
    const familySizes = new Map<string, number>();
    for (const row of rows) {
      assert.equal(row.reviewStatus, "approved", `${definition.slug}/${row.familyId}`);
      assert.ok(row.rationale.trim().length >= 40, `${definition.slug}/${row.familyId} needs a substantive rationale`);
      const variant = row.variant.toLowerCase();
      assert.equal(owners.has(variant), false, `${definition.slug}: ${row.variant} appears in multiple families`);
      owners.set(variant, row.familyId);
      familySizes.set(row.familyId, (familySizes.get(row.familyId) ?? 0) + 1);
    }
    for (const [familyId, size] of familySizes) assert.ok(size >= 2, `${definition.slug}/${familyId} has ${size} variant(s)`);
  }
});

test("every decade leaves draft only with reviewed source, anchors, and unique thesis", () => {
  const headings = new Set<string>();
  for (const definition of DECADE_HUB_DEFINITIONS) {
    assert.notEqual(definition.rolloutState, "draft", definition.slug);
    assert.equal(definition.thesisSourceVersion, "ssa-national-2025", definition.slug);
    assert.ok(definition.sanityAnchors.length >= 2, `${definition.slug} needs independent sanity anchors`);
    const thesis = DECADE_THESES[definition.slug];
    assert.ok(thesis, `${definition.slug} thesis missing`);
    assert.equal(thesis.sourceVersion, definition.thesisSourceVersion, definition.slug);
    assert.ok(thesis.paragraphs.length >= 6, `${definition.slug} thesis is incomplete`);
    assert.equal(headings.has(thesis.heading), false, `duplicate thesis heading: ${thesis.heading}`);
    headings.add(thesis.heading);
  }
});

test("reviewed thesis claims map to the independent Task 9 assertion table", () => {
  for (const [slug, claims] of Object.entries(REVIEWED_CLAIMS)) {
    const copy = DECADE_THESES[slug]!.paragraphs.join(" ");
    for (const claim of claims) assert.ok(copy.includes(claim), `${slug} is missing reviewed claim ${claim}`);
  }
});