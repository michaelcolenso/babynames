import assert from "node:assert/strict";
import test from "node:test";

import { variantBase, variantKey, VARIANT_STEPS, VARIANT_KEY_VERSION } from "../packages/shared/src/variant-key";

// Families that must share a key. These are the acceptance criteria for the
// "spelling relatives" rail on name pages — if one of these splits, the rail
// silently loses its most useful entries.
const FAMILIES: Record<string, string[]> = {
  aiden: ["Aiden", "Ayden", "Aidan", "Aden", "Aaden"],
  caitlin: ["Caitlin", "Kaitlyn", "Katelyn", "Katelynn", "Caitlyn"],
  sarah: ["Sarah", "Sara"],
  jaxon: ["Jaxon", "Jackson", "Jaxson"],
  sophia: ["Sophia", "Sofia"],
  hannah: ["Hannah", "Hanna", "Hana"],
  nicholas: ["Nicholas", "Nikolas"],
  chris: ["Chris", "Kris"],
};

test("variant families collapse to one key", () => {
  for (const [family, members] of Object.entries(FAMILIES)) {
    const keys = new Set(members.map(variantKey));
    assert.equal(
      keys.size,
      1,
      `${family} split into ${[...keys].join(", ")} (${members.map((m) => `${m}=${variantKey(m)}`).join(" ")})`,
    );
  }
});

// Pairs that sound similar enough to trip a phonetic algorithm but are
// genuinely different names. Soundex merges the first two; we must not.
const MUST_NOT_MERGE: [string, string][] = [
  ["Erin", "Aaron"],
  ["Jon", "John"],
  ["Alan", "Ellen"],
  ["Sara", "Sora"],
  ["Lee", "Leo"],
  ["Ella", "Ollie"],
  ["Ian", "Ann"],
];

test("distinct names keep distinct keys", () => {
  for (const [a, b] of MUST_NOT_MERGE) {
    assert.notEqual(variantKey(a), variantKey(b), `${a} and ${b} both keyed ${variantKey(a)}`);
  }
});

test("keys are stable across casing, spacing and punctuation", () => {
  assert.equal(variantKey("MARY-ANNE"), variantKey("mary anne"));
  assert.equal(variantKey("O'Brien"), variantKey("obrien"));
  assert.equal(variantKey("Aiden"), variantKey("  aiden  "));
});

test("short and empty names degrade safely", () => {
  assert.equal(variantKey(""), "");
  assert.equal(variantKey("123"), "");
  // Too short for a skeleton, so the vowel-bearing base is the key.
  assert.equal(variantKey("Lee"), variantBase("Lee"));
  assert.ok(variantKey("Bo").length > 0);
});

test("the pipeline is a pure ordered list of named steps", () => {
  assert.ok(VARIANT_STEPS.length > 0);
  assert.deepEqual(
    VARIANT_STEPS.map((s) => s.name),
    ["strip", "digraphs", "soft-c", "y-to-i", "trailing-h", "trailing-e", "doubles"],
  );
  // Each step must be idempotent on its own output, so a rebuild of name_facts
  // over already-normalized input cannot drift.
  for (const step of VARIANT_STEPS) {
    const once = step.apply("katelynn");
    assert.equal(step.apply(once), once, `step ${step.name} is not idempotent`);
  }
});

test("version constant is exported for meta.variant_key_version", () => {
  assert.equal(typeof VARIANT_KEY_VERSION, "number");
});
