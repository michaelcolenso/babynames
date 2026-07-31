import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";

const profile = JSON.parse(readFileSync("data/dist/decade-hub-1920.json", "utf8")) as DecadeProfile;

test("1920s artifact contains deterministic flagship modules", () => {
  assert.equal(profile.decade, 1920);
  assert.equal(profile.startYear, 1920);
  assert.equal(profile.endYear, 1929);
  assert.equal(profile.classroomDefaults.year, 1924);
  assert.equal(profile.classroomDefaults.students.length, 30);
  assert.equal(profile.classroomDefaults.femaleSeats + profile.classroomDefaults.maleSeats, 30);
  assert.ok(profile.ownershipRankings.female.length > 100);
  assert.ok(profile.ownershipRankings.male.length > 100);
  assert.ok(profile.spellingFamilies.every((family) => family.reviewStatus === "approved"));
  assert.deepEqual([...profile.spellingFamilies.map((family) => family.id)].sort(), profile.spellingFamilies.map((family) => family.id).sort());
});

import {
  renderDecadeHub1920,
  renderDecadeClassroom1920,
  renderDecadeMethodology1920,
  renderDecadeSpellingFamilies1920,
} from "../packages/shared/src/render-decade-hub-1920";

test("all four 1920s routes have indexable HTML, metadata, and formulas", () => {
  const origin = "https://nobodynamed.com";
  const pages = [
    renderDecadeHub1920(profile, { origin }),
    renderDecadeClassroom1920(profile, { origin }),
    renderDecadeMethodology1920(profile, { origin }),
    renderDecadeSpellingFamilies1920(profile, { origin }),
  ];
  assert.ok(pages.every((html) => html.includes('<link rel="canonical"')));
  assert.match(pages[0]!, /1920s baby names/i);
  assert.match(pages[1]!, /statistical reconstruction/i);
  assert.match(pages[2]!, /adjusted_concentration/);
  assert.match(pages[3]!, /Katherine family/);
});
