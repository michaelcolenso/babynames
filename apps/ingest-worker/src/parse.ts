// SSA yob<year>.txt parser. Format is comma-separated, no header:
//   Mary,F,7065
//   John,M,9655
// Names are already title-cased and lowercased canonicalization is up to us.

import type { Sex } from "@nv/shared";

export interface YearRow {
  year: number;
  name: string;
  sex: Sex;
  count: number;
}

export function* parseYob(year: number, text: string): Generator<YearRow> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    let lineEnd = text.indexOf("\n", i);
    if (lineEnd === -1) lineEnd = n;
    const line = text.slice(i, lineEnd).trim();
    i = lineEnd + 1;
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length !== 3) continue;
    const name = parts[0]!.trim();
    const sex = parts[1]!.trim() as Sex;
    const count = Number(parts[2]!.trim());
    if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count)) continue;
    yield { year, name, sex, count };
  }
}
