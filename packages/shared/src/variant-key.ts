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

export const VARIANT_KEY_VERSION = 5;

/** Minimum length before a trailing "e" is treated as silent. */
export const TRAILING_E_MIN_LENGTH = 4;

const VOWELS = "aeiou";

function stripNonLetters(s: string): string {
  return s.replace(/[^a-z]/g, "");
}

// Digraphs first, in an order where each rule's input cannot be produced by a
// later rule. `ck` must run before the general `c` rule, `ch` before both.
//
// `ch` becomes hard `k` only before `r` or `l` — Chris, Christina, Chloe. In
// English given names `ch` before a vowel is usually soft, and treating it as
// hard merged Cheri with Keri, Charlotte with Karlotte, Rachel with Rakel and
// Michelle with Mikelle. Measured against a curated set, the unrestricted rule
// bought one extra true merge (Nicholas/Nikolas) at the cost of six false ones.
function normalizeDigraphs(s: string): string {
  return s
    .replace(/ph/g, "f")
    .replace(/ch(?=[rl])/g, "k")
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
//
// The "-iah" ending is excluded. It is the one shape where the terminal h
// reliably carries a pronunciation: Mariah is not Maria, and merging them told
// 566k Marias that the 115k Mariahs spell their name differently — the most
// visible possible instance of a wrong relative. No orthographic rule separates
// Maria/Mariah from Amia/Amiah, which genuinely are respellings, so the ending
// as a whole has to go. This runs after y-to-i, so Aaliyah and Nyah are covered
// by the same rule.
//
// The cost, stated plainly: Aaliyah no longer groups with Aaliya, nor Josiah
// with Josia, nor the long tail of -iah respellings with their -ia forms. That
// is recall, and this file has consistently spent recall to buy precision — a
// missing relative is an absent link, a wrong one is a claim the page makes and
// gets wrong.
function dropTrailingH(s: string): string {
  if (s.length < 3 || !s.endsWith("h")) return s;
  if (s.endsWith("iah")) return s;
  return VOWELS.includes(s[s.length - 2] ?? "") ? s.slice(0, -1) : s;
}

// Silent terminal e: Anne -> ann, Claire -> clair, Brooke -> brook.
//
// A terminal e is only droppable when it is genuinely inert. Two shapes where
// it is not, both of which an unconditional drop merged wrongly:
//
//   Magic e — the consonant-vowel-consonant-e pattern, where the e is what
//   lengthens the vowel before it. Dropping it made Jake into Jack, and would
//   equally make Kate/Kat, Jane/Jan, Cole/Col, Pete/Pet, Luke/Luk.
//
//   Vowel + e — where the e is its own syllable or half a digraph. Dropping it
//   made Marie into Mary: 540k Maries told they are a respelling of 4.1M Marys.
//
// So: keep the e when the letter before it is a vowel, and keep it when the
// name ends in a single vowel between two consonants. Everything else — a
// doubled consonant (Anne), a two-vowel nucleus (Brooke, Claire), a consonant
// cluster (Elle) — really is inert, and still collapses.
function dropTrailingE(s: string): string {
  if (s.length < TRAILING_E_MIN_LENGTH || !s.endsWith("e")) return s;
  const before = s[s.length - 2] ?? "";
  if (VOWELS.includes(before)) return s;
  const nucleus = s[s.length - 3] ?? "";
  const onset = s[s.length - 4] ?? "";
  if (VOWELS.includes(nucleus) && !VOWELS.includes(onset)) return s;
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
 * Vowels are preserved. An earlier version reduced the name to a consonant
 * skeleton, which merged far more families — but measured against the real
 * corpus it produced 181 groups of more than twenty names, the largest holding
 * 172: `brn` put Barney with Berania, `kln` put Colleen with Kaylin and
 * Kailani, `mkl` put Michelle with Makayla. The page asserts these are
 * alternate spellings of each other, so precision has to win over recall; a
 * wrong relative is a visible error, a missing one is only a missed link.
 *
 * The cost is real and worth stating: Caitlin and Katelyn no longer group, nor
 * Aiden and Aidan. Those differ by an inserted vowel rather than a substituted
 * one, and no simple deterministic rule separates that case from Colleen and
 * Kaylin. What still groups is the orthographic core — Sarah/Sara,
 * Sophia/Sofia, Jaxon/Jackson/Jaxson, Nicholas/Nikolas, Aiden/Ayden.
 */
export function variantKey(name: string): string {
  return variantBase(name);
}
