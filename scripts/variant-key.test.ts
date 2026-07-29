import assert from "node:assert/strict";
import test from "node:test";

import { variantBase, variantKey, VARIANT_STEPS, VARIANT_KEY_VERSION } from "../packages/shared/src/variant-key";

// Families that must share a key: the acceptance criteria for the "spelling
// relatives" rail. These are pure orthographic variants — one sound spelled two
// ways. Families that differ by an INSERTED vowel (Caitlin/Katelyn, Aiden/Aidan)
// are deliberately absent: no deterministic rule merges those without also
// merging Colleen with Kaylin, and a wrong relative is worse than a missing one.
const FAMILIES: Record<string, string[]> = {
  sarah: ["Sarah", "Sara"],
  jaxon: ["Jaxon", "Jackson", "Jaxson"],
  sophia: ["Sophia", "Sofia"],
  hannah: ["Hannah", "Hanna", "Hana"],
  chris: ["Chris", "Kris"],
  christina: ["Christina", "Kristina"],
  aiden: ["Aiden", "Ayden"],
  addilyn: ["Addilyn", "Adilyn", "Addilynn"],
  caitlin: ["Caitlin", "Kaitlyn", "Caitlyn"],
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
  // Every one of these was merged by the consonant-skeleton key this replaced,
  // measured against the real SSA corpus. They are the reason it was replaced.
  ["Colleen", "Kaylin"],
  ["Michelle", "Makayla"],
  ["Michelle", "Michaela"],
  ["Barney", "Berania"],
  ["Caelan", "Colleen"],
  ["Kailani", "Colleen"],
  // `ch` is soft before a vowel far more often than hard in English given
  // names. Treating it as hard merged every one of these; both members of the
  // first pair have well over thirty thousand lifetime births.
  ["Cheri", "Keri"],
  ["Charlotte", "Karlotte"],
  ["Rachel", "Rakel"],
  ["Michelle", "Mikelle"],
  ["Chaya", "Kaya"],
  // The terminal h in "-iah" is pronounced. Maria and Mariah between them have
  // over 680,000 lifetime female births, so this was the loudest wrong relative
  // the key could possibly produce.
  ["Maria", "Mariah"],
  ["Aria", "Ariah"],
  ["Amia", "Amiah"],
  ["Nya", "Nyah"],
  // Terminal e is phonemic in two shapes. Magic e (consonant-vowel-consonant-e)
  // is what lengthens the vowel before it, so dropping it turns Jake into Jack;
  // a vowel before the e makes it its own syllable, so dropping it turns Marie
  // into Mary — 540k Maries against 4.1M Marys.
  ["Mary", "Marie"],
  ["Jack", "Jake"],
  ["Kate", "Kat"],
  ["Jane", "Jan"],
  ["Cole", "Col"],
  ["Pete", "Pet"],
  ["Rose", "Ros"],
];

test("distinct names keep distinct keys", () => {
  for (const [a, b] of MUST_NOT_MERGE) {
    assert.notEqual(variantKey(a), variantKey(b), `${a} and ${b} both keyed ${variantKey(a)}`);
  }
});

// The "-iah" exclusion is narrow on purpose: every other silent terminal h
// still goes. If this ever regresses to dropping h unconditionally, the
// must-not-merge list above catches it; if it over-corrects into keeping every
// terminal h, this catches that instead.
test("silent terminal h still collapses everywhere it is silent", () => {
  const SILENT: [string, string][] = [
    ["Sarah", "Sara"],
    ["Hannah", "Hanna"],
    ["Leah", "Lea"],
    ["Norah", "Nora"],
    ["Micah", "Mica"],
    ["Noah", "Noa"],
    ["Selah", "Sela"],
    ["Dinah", "Dina"],
  ];
  for (const [a, b] of SILENT) {
    assert.equal(variantKey(a), variantKey(b), `${a} and ${b} should still group`);
  }
});

// The stated cost of the rule, pinned so it is a decision on the record rather
// than a surprise: -iah respellings no longer reach their -ia forms.
test("the -iah exclusion costs the -ia links it is documented to cost", () => {
  for (const [a, b] of [
    ["Aaliyah", "Aaliya"],
    ["Josiah", "Josia"],
  ] as [string, string][]) {
    assert.notEqual(variantKey(a), variantKey(b));
  }
  // Within the -iah cluster, respellings of each other still group: the rule
  // separates the two endings, it does not shatter either one.
  assert.equal(variantKey("Mariah"), variantKey("Maryah"));
  assert.equal(variantKey("Aaliyah"), variantKey("Aliyah"));
});

// The e exclusions are as narrow as the h one: where the letter really is
// inert — a doubled consonant, a two-vowel nucleus, a consonant cluster — it
// still goes.
test("silent terminal e still collapses everywhere it is inert", () => {
  const INERT: [string, string][] = [
    ["Anne", "Ann"],
    ["Brooke", "Brook"],
    ["Claire", "Clair"],
    ["Elle", "Ell"],
    ["Lynne", "Lynn"],
    ["Jayne", "Jayn"],
  ];
  for (const [a, b] of INERT) {
    assert.equal(variantKey(a), variantKey(b), `${a} and ${b} should still group`);
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
  assert.equal(variantKey("Lee"), variantBase("Lee"));
  assert.ok(variantKey("Bo").length > 0);
});

// A sample of the real corpus drawn from the clusters the previous key handled
// worst. Whatever the rule, a "spelling relatives" group has to stay small
// enough that a reader recognises every member as their own name.
const REAL_SAMPLE = [
  "Caelainn", "Caelan", "Caelani", "Caelen", "Caelin", "Caelyn", "Cailan", "Cailani",
  "Caileen", "Cailen", "Colleen", "Collene", "Kaylin", "Kaylyn", "Kailani", "Kalani",
  "Kaylan", "Kellen", "Kellan", "Killian", "Cullen", "Coleen", "Calan", "Chalon",
  "Bareen", "Barin", "Barney", "Barnie", "Berania", "Beren", "Berina", "Berna",
  "Bernie", "Brian", "Bryan", "Brianne", "Brynn", "Braun", "Brenna", "Brianna",
  "Michelle", "Makayla", "Michaela", "Mikayla", "Micaela", "Michael", "Mikael",
  "Eileen", "Eilene", "Elena", "Ellen", "Elaine", "Alana", "Aileen", "Ilene",
];

test("no spelling family grows large enough to contain strangers", () => {
  const groups = new Map<string, string[]>();
  for (const name of REAL_SAMPLE) {
    const k = variantKey(name);
    const list = groups.get(k);
    if (list) list.push(name);
    else groups.set(k, [name]);
  }
  const largest = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0]!;
  assert.ok(
    largest[1].length <= 4,
    `group ${largest[0]} holds ${largest[1].length}: ${largest[1].join(", ")}`,
  );
  // The specific collapse that motivated the rewrite.
  assert.notEqual(variantKey("Colleen"), variantKey("Kailani"));
  assert.notEqual(variantKey("Barney"), variantKey("Berania"));
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
