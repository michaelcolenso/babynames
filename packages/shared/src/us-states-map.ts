// Geographic tile-grid ("statebins") layout of the 50 states + DC. Each
// state occupies one cell positioned by rough US geography, so small states
// and DC stay visible — which matters for a diffusion map where holdouts and
// early adopters can be tiny. Used by the SSR/client diaspora map; the
// abbreviation list is also the canonical 51-state set the compute pass
// diffs against for holdouts.

export const ALL_STATES: readonly string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "DC", "FL", "GA", "HI",
  "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN",
  "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH",
  "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA",
  "WV", "WI", "WY",
];

export const TILE_ROWS = 8;
export const TILE_COLS = 11;

// [row, col], 0-indexed. row 0 = north, col 0 = west.
export const US_TILE_GRID: Record<string, readonly [number, number]> = {
  AK: [0, 0], ME: [0, 10],
  VT: [1, 9], NH: [1, 10],
  WA: [2, 0], ID: [2, 1], MT: [2, 2], ND: [2, 3], MN: [2, 4], WI: [2, 5],
  MI: [2, 7], NY: [2, 8], MA: [2, 9], RI: [2, 10],
  OR: [3, 0], NV: [3, 1], WY: [3, 2], SD: [3, 3], IA: [3, 4], IL: [3, 5],
  IN: [3, 6], OH: [3, 7], PA: [3, 8], NJ: [3, 9], CT: [3, 10],
  CA: [4, 0], UT: [4, 1], CO: [4, 2], NE: [4, 3], MO: [4, 4], KY: [4, 5],
  WV: [4, 6], VA: [4, 7], MD: [4, 8], DE: [4, 9],
  AZ: [5, 1], NM: [5, 2], KS: [5, 3], AR: [5, 4], TN: [5, 5], NC: [5, 6],
  SC: [5, 7], DC: [5, 8],
  OK: [6, 3], LA: [6, 4], MS: [6, 5], AL: [6, 6], GA: [6, 7],
  HI: [7, 0], TX: [7, 2], FL: [7, 8],
};

// Display names for the 51 abbreviations above. Lives here rather than in a
// renderer so collection pages, name pages, and the build scripts all read one
// map — an abbreviation rendered as "WV" in one place and "West Virginia" in
// another reads as a bug to users.
export const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "District of Columbia",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan",
  MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota",
  OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

/** Full state name for a two-letter abbreviation, falling back to the input. */
export function stateName(abbr: string): string {
  return STATE_NAMES[abbr] ?? abbr;
}

/** URL-safe slug fragment for a state: "WV" -> "west-virginia". */
export function stateSlug(abbr: string): string {
  return stateName(abbr).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
