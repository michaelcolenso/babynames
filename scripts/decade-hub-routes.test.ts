// Route-contract tests for the 1980s decade hub flagship (SPEC §13).
// Renders from the synthetic fixture payload — no D1, no network.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { getEditorialPageConfig } from "../apps/web/functions/[slug]";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import {
  ClassroomRoster,
  ClassroomStats,
  ClassroomSummary,
  renderDecadeClassroom,
  renderDecadeHub,
  renderDecadeMethodology,
  renderDecadeSpellingFamilies,
} from "../packages/shared/src/render-decade-hub";

const fixture = JSON.parse(
  readFileSync(path.join(import.meta.dirname, "fixtures/decade-hub-1980.fixture.json"), "utf8"),
) as DecadeProfile;

const ORIGIN = "https://nobodynamed.com";

function renderHub(): string {
  return renderDecadeHub(fixture, { origin: ORIGIN });
}

test("hub HTML contains the hub marker, routes, and ownership tables", () => {
  const html = renderHub();
  assert.match(html, /data-dh-route="\/names\/1980s\/"/);
  assert.match(html, /data-content-type="decade-hub"/);
  assert.match(html, /data-dh-module="ownership"/);
  assert.match(html, /Ownership score/);
  // all six ranking views render as panels
  for (const id of ["girls", "boys", "most-owned", "most-popular", "timeless", "unexpected"]) {
    assert.match(html, new RegExp(`data-dh-panel="${id}"`), `panel ${id}`);
  }
  // fixture names appear as links to dossiers
  assert.match(html, /href="\/name\/Tiffany\/"/);
  assert.match(html, /href="\/name\/Michael\/"/);
});

test("hub embeds canonical, hreflang-free head, and structured data", () => {
  const html = renderHub();
  assert.match(html, /<link rel="canonical" href="https:\/\/nobodynamed\.com\/names\/1980s\/">/);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /BreadcrumbList/);
  assert.match(html, /ItemList/);
  assert.match(html, /style\.css\?v=18/);
  assert.match(html, /\/assets\/decade-hub\.js/);
});

test("hub cross-links to child routes, adjacent decades, and year pages", () => {
  const html = renderHub();
  assert.match(html, /href="\/names\/1980s\/methodology\/"/);
  assert.match(html, /href="\/names\/1980s\/classroom\/"/);
  assert.match(html, /href="\/names\/1980s\/spelling-families\/"/);
  assert.match(html, /href="\/names\/1970s\//);
  assert.match(html, /href="\/names\/1990s\//);
  for (let y = 1980; y <= 1989; y++) {
    assert.match(html, new RegExp(`href="/year/${y}/"`), `year ${y} link`);
  }
  // editorial cross-link to the millennial-names page
  assert.match(html, /href="\/millennial-names"/);
});

test("hub scorecard shows diversity/concentration and champions", () => {
  const html = renderHub();
  assert.match(html, /Diversity score/);
  assert.match(html, /Concentration score/);
  assert.match(html, /87\.3/);
  assert.match(html, /Jessica/);
  assert.match(html, /469,439/);
});

test("classroom summary names the reconstruction label and the no-duplicate outcome", () => {
  const html = renderHub();
  assert.match(html, /statistical reconstruction of an average classroom/i);
  // fixture has repeats (uniqueNames 22 of 30), so the repeats sentence renders
  assert.match(html, /Jennifer appears 3 times/);
});

test("spelling family summary cards link to anchored family details", () => {
  const html = renderHub();
  assert.match(html, /href="\/names\/1980s\/spelling-families\/#dh-family-brittany"/);
  assert.match(html, /134,541 births across 3 spellings/);
});

test("ownership table cells carry machine-sortable values", () => {
  const html = renderHub();
  assert.match(html, /data-dh-sort-value="80\.2525"/);
  assert.match(html, /data-dh-sort-value="0\.941397"/);
  // sex column appears in pooled views only
  assert.match(html, /<td>M<\/td>/);
});

// ── classroom child route ────────────────────────────────────────────────

test("classroom page renders the 30-seat roster with repeat badges", () => {
  const html = renderDecadeClassroom(fixture, { origin: ORIGIN });
  assert.match(html, /data-dh-route="\/names\/1980s\/classroom\/"/);
  assert.match(html, /data-dh-roster/);
  // Jennifer holds 3 seats in the fixture → ×3 badge present
  assert.match(html, /dh-seat-badge/);
  assert.match(html, /×3/);
  assert.match(html, /data-dh-sentinel="classroom-bottom"/);
  // method section documents the apportionment formulas
  assert.match(html, /femaleSeats = round\(30 × F_total \/ \(F_total \+ M_total\)\)/);
  assert.match(html, /statistical reconstruction of an average classroom/i);
});

test("classroom normalizeRoster honors the expanded 30-entry payload contract", () => {
  // The fixture stores one entry PER SEAT (30 entries, seats field = per-name
  // seat count on each). The renderer must aggregate them into per-name rows.
  const rosterHtml = ClassroomRoster(fixture.classroomDefaults);
  const cards = rosterHtml.match(/<li class="dh-student/g) ?? [];
  assert.equal(cards.length, 30, "30 seat cards render");
  const statsHtml = ClassroomStats(fixture.classroomDefaults);
  assert.match(statsHtml, /<dt>Unique names<\/dt><dd>22<\/dd>/);
  const summaryHtml = ClassroomSummary(fixture.classroomDefaults);
  assert.match(summaryHtml, /Jennifer appears 3 times/);
});

// ── spelling-families child route ────────────────────────────────────────

test("spelling-families page renders all fixture families with charts and tables", () => {
  const html = renderDecadeSpellingFamilies(fixture, { origin: ORIGIN });
  assert.match(html, /data-dh-route="\/names\/1980s\/spelling-families\/"/);
  assert.match(html, /id="dh-family-brittany"/);
  assert.match(html, /id="dh-family-caitlin"/);
  assert.match(html, /data-dh-chart="brittany"/);
  // combined-rank callout
  assert.match(html, /would rank <strong>#9<\/strong>/);
  // variant rows link to dossiers
  assert.match(html, /href="\/name\/Brittney\/"/);
  // chart has an accessible fallback data table with yearly numbers
  assert.match(html, /<summary>Yearly data for the Brittany family<\/summary>/);
  assert.match(html, /<th scope="row">1984<\/th>/);
  assert.match(html, /27,452/); // 1989 combined total
  // curation copy rule, verbatim
  assert.match(
    html,
    /Conventional rankings separate spelling variants\. This view groups manually reviewed variants to show their combined demographic footprint\./,
  );
});

// ── methodology child route ──────────────────────────────────────────────

test("methodology page documents source, eligibility, formulas, and limitations", () => {
  const html = renderDecadeMethodology(fixture, { origin: ORIGIN });
  assert.match(html, /data-dh-route="\/names\/1980s\/methodology\/"/);
  assert.match(html, /ssa-national-2017/);
  assert.match(html, /decade-hub\/v1\.0\.0/);
  assert.match(html, /fixture0000000/);
  assert.match(html, /ownership_score = 100 × \(0\.70 × normalized_concentration \+ 0\.30 × normalized_prominence\)/);
  assert.match(html, /adjusted_concentration = \(births_in_decade \+ α × prior_decade_share\) \/ \(lifetime_births \+ α\), α = 1,000/);
  assert.match(html, /5,000 recorded births/);
  assert.match(html, /top-1,000 national rank/);
  assert.match(html, /suppresses name-and-sex counts below 5/);
  // per-sex priors disclosed
  assert.match(html, /30\.39% for girls/);
  assert.match(html, /13\.74% for boys/);
  // Dataset JSON-LD with temporal coverage
  assert.match(html, /"@type":"Dataset"/);
  assert.match(html, /1980\/1989/);
});

// ── editorial cross-link (millennial-names → hub) ────────────────────────

test("millennial-names editorial page links to the 1980s decade hub", () => {
  const page = getEditorialPageConfig("millennial-names");
  assert.ok(page);
  assert.match(page.body, /href="\/names\/1980s\/"/);
});

// ── shared-shell invariants ──────────────────────────────────────────────

test("all four hub pages share the shell, analytics beacon, and footer vintage", () => {
  const pages = [
    renderDecadeHub(fixture, { origin: ORIGIN }),
    renderDecadeClassroom(fixture, { origin: ORIGIN }),
    renderDecadeSpellingFamilies(fixture, { origin: ORIGIN }),
    renderDecadeMethodology(fixture, { origin: ORIGIN }),
  ];
  for (const html of pages) {
    assert.match(html, /<html lang="en">/);
    assert.match(html, /\/assets\/analytics\.js/);
    assert.match(html, /\/assets\/decade-hub\.js/);
    assert.match(html, /Based on SSA records 1880–2017\./);
    assert.match(html, /aria-label="Main navigation"/);
  }
});
