// Spelling-variant grouping key.
//
// Two names share a `variantKey` when they are plausibly the same name spelled
// differently: Aiden/Ayden/Aidan, Caitlin/Kaitlyn/Katelyn, Sophia/Sofia. The key
// is stored on `name_facts.variant_key` and indexed, so "spelling relatives" on a
// name page is a single equality lookup rather than a fuzzy scan.
//
// This is deliberately NOT Soundex or Metaphone. Those were built for surnames
// heard over a telephone and merge far too aggressively for given names (Soundex
// puts Erin and Aaron in the same bucket). The pipeline below is tuned against a
// fixed set of American given-name variant families; see scripts/variant-key.test.ts,
// which pins both the families that must merge and the pairs that must not.
//
// Bump `VARIANT_KEY_VERSION` whenever the pipeline changes — it is written to
// `meta.variant_key_version` and a mismatch means name_facts must be rebuilt.

export const VARIANT_KEY_VERSION = 1;

/** Minimum consonant-skeleton length. Below this the skeleton is too lossy
 *  (Lee, Leo, Lia would all collapse to "l"), so we keep the vowel form. */
export const SKELETON_MIN_LENGTH = 3;

/** Minimum length before a trailing "e" is treated as silent. */
export const TRAILING_E_MIN_LENGTH = 4;

const VOWELS = "aeiou";

function stripNonLetters(s: string): string {
  return s.replace(/[^a-z]/g, "");
}

// Digraphs first, in an order where each rule's input cannot be produced by a
// later rule. `ck` must run before the general `c` rule, `ch` before both.
function normalizeDigraphs(s: string): string {
  return s
    .replace(/ph/g, "f")
    .replace(/ch/g, "k")
    .replace(/gh$/, "")
    .replace(/ck/g, "k")
    .replace(/qu/g, "kw")
    .replace(/x/g, "ks");
}

// Hard vs soft c. "Caitlin" -> k, "Cecilia" -> s.
function normalizeC(s: string): string {
  return s.replace(/c/g, (_m, offset: number) => {
    const next = s[offset + 1];
    return next === "e" || next === "i" || next === "y" ? "s" : "k";
  });
}

function yToI(s: string): string {
  return s.replace(/y/g, "i");
}

// Silent terminal h, but only after a vowel: Sarah -> sara, Leah -> lea.
// "Josh" and "Deborah"'s internal h are untouched.
function dropTrailingH(s: string): string {
  if (s.length < 3 || !s.endsWith("h")) return s;
  return VOWELS.includes(s[s.length - 2] ?? "") ? s.slice(0, -1) : s;
}

// Silent terminal e: Anne -> ann, Claire -> clair. Guarded by length so
// two-and three-letter names (Abe, Eve) keep their vowel.
function dropTrailingE(s: string): string {
  if (s.length < TRAILING_E_MIN_LENGTH || !s.endsWith("e")) return s;
  return s.slice(0, -1);
}

// Any doubled letter, vowel or consonant: Aaden -> aden, Katelynn -> katelyn,
// Ellen -> elen. Runs after the terminal-letter rules so "Anne" -> "ann" -> "an".
function collapseDoubles(s: string): string {
  return s.replace(/([a-z])\1+/g, "$1");
}

/**
 * The ordered pipeline, exposed so tests can assert each stage independently
 * rather than only the final key.
 */
export const VARIANT_STEPS: readonly { name: string; apply: (s: string) => string }[] = [
  { name: "strip", apply: stripNonLetters },
  { name: "digraphs", apply: normalizeDigraphs },
  { name: "soft-c", apply: normalizeC },
  { name: "y-to-i", apply: yToI },
  { name: "trailing-h", apply: dropTrailingH },
  { name: "trailing-e", apply: dropTrailingE },
  { name: "doubles", apply: collapseDoubles },
];

/**
 * The normalized form before the consonant skeleton is taken. Exported for
 * tests and for the short-name fallback.
 */
export function variantBase(name: string): string {
  let s = name.toLowerCase();
  for (const step of VARIANT_STEPS) s = step.apply(s);
  return s;
}

/**
 * Grouping key for spelling variants. Deterministic and idempotent-safe to
 * store; names sharing a key are surfaced to each other as spelling relatives.
 *
 * The key is the consonant skeleton with the initial letter preserved even when
 * it is a vowel — that initial is what keeps Erin ("ern") apart from Aaron
 * ("arn") and Alan ("aln") apart from Ellen ("eln"). When the skeleton is too
 * short to discriminate, the vowel-bearing base is used instead.
 */
export function variantKey(name: string): string {
  const base = variantBase(name);
  if (!base) return "";
  const skeleton = base[0] + base.slice(1).replace(/[aeiou]/g, "");
  return skeleton.length >= SKELETON_MIN_LENGTH ? skeleton : base;
}
