import test from "node:test";
import assert from "node:assert";
import { getPhoneticKey } from "../packages/shared/src/phonetic";

test("Caitlin spelling variants map to KTLN", () => {
  const target = "KTLN";
  assert.strictEqual(getPhoneticKey("Caitlin"), target);
  assert.strictEqual(getPhoneticKey("Katelyn"), target);
  assert.strictEqual(getPhoneticKey("Catelyn"), target);
  assert.strictEqual(getPhoneticKey("Kaitlin"), target);
  assert.strictEqual(getPhoneticKey("Kaytlin"), target);
});

test("Sean spelling variants map to XN", () => {
  const target = "XN";
  assert.strictEqual(getPhoneticKey("Sean"), target);
  assert.strictEqual(getPhoneticKey("Shaun"), target);
  assert.strictEqual(getPhoneticKey("Shawn"), target);
  assert.strictEqual(getPhoneticKey("Shon"), target);
});

test("Aiden spelling variants map to ATN", () => {
  const target = "ATN";
  assert.strictEqual(getPhoneticKey("Aiden"), target);
  assert.strictEqual(getPhoneticKey("Ayden"), target);
  assert.strictEqual(getPhoneticKey("Adan"), target);
});

test("General Metaphone properties", () => {
  // Empty inputs
  assert.strictEqual(getPhoneticKey(""), "");
  assert.strictEqual(getPhoneticKey("   "), "");

  // Starts with vowel keep first vowel
  assert.strictEqual(getPhoneticKey("Olivia"), "OLF");
  assert.strictEqual(getPhoneticKey("Isabella"), "ISBL");
  assert.strictEqual(getPhoneticKey("Ethan"), "ETN");

  // Initial silent letters
  assert.strictEqual(getPhoneticKey("Knight"), "NT");
});
