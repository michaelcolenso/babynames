import assert from "node:assert/strict";
import test from "node:test";

import {
  DECADE_HUB_DEFINITIONS,
  getDecadeHubDefinition,
} from "../packages/shared/src/content/decade-hub-definitions";

test("registry covers each decade from the 1880s through the 2020s exactly once", () => {
  assert.equal(DECADE_HUB_DEFINITIONS.length, 15);
  assert.deepEqual(
    DECADE_HUB_DEFINITIONS.map((definition) => definition.slug),
    [1880, 1890, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(
      (startYear) => `${startYear}s`,
    ),
  );
  assert.equal(new Set(DECADE_HUB_DEFINITIONS.map((definition) => definition.slug)).size, 15);
});

test("definitions expose honest coverage, midpoint classroom years, and unique family files", () => {
  const familyFiles = new Set<string>();

  for (const definition of DECADE_HUB_DEFINITIONS) {
    assert.equal(definition.nominalEndYear, definition.startYear + 9);
    assert.equal(definition.classroomYear, definition.startYear + 4);
    assert.ok(definition.classroomYear >= definition.startYear);
    assert.ok(definition.classroomYear <= definition.nominalEndYear);
    assert.match(definition.familyFile, /\.csv$/);
    assert.equal(familyFiles.has(definition.familyFile), false, `duplicate family file: ${definition.familyFile}`);
    familyFiles.add(definition.familyFile);

    if (definition.rolloutState === "reviewed" || definition.rolloutState === "seeded") {
      assert.equal(definition.thesisSourceVersion, "ssa-national-2025");
    } else {
      assert.equal(definition.thesisSourceVersion, "");
    }
  }
});

test("pilot definitions retain declarative sanity anchors and source coverage", () => {
  const twenties = getDecadeHubDefinition("1920s");
  const eighties = getDecadeHubDefinition("1980s");

  assert.ok(twenties);
  assert.ok(eighties);
  assert.equal(twenties.startYear, 1920);
  assert.equal(twenties.nominalEndYear, 1929);
  assert.equal(eighties.startYear, 1980);
  assert.equal(eighties.nominalEndYear, 1989);
  assert.ok(eighties.sanityAnchors.length > 0);
  assert.ok(eighties.sanityAnchors.every((anchor) => typeof anchor.kind === "string"));
});

test("definition lookup returns null for an unconfigured or malformed slug", () => {
  assert.equal(getDecadeHubDefinition("1930s")?.startYear, 1930);
  assert.equal(getDecadeHubDefinition("2020"), null);
  assert.equal(getDecadeHubDefinition("9990s"), null);
});
