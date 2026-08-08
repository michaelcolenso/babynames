import assert from "node:assert/strict";
import test from "node:test";

import { zipSync, strToU8, unzipSync } from "fflate";

import { forEachStateRow } from "./lib/ssa-zip";

type Row = [string, string, number, string, number];

function collect(zipBytes: Uint8Array): Row[] {
  const rows: Row[] = [];
  forEachStateRow(zipBytes, (state, sex, year, name, count) =>
    rows.push([state, sex, year, name, count]),
  );
  return rows;
}

/** The pre-streaming implementation, kept as the oracle for equivalence. */
function collectViaUnzipSync(zipBytes: Uint8Array): Row[] {
  const rows: Row[] = [];
  const files = unzipSync(zipBytes);
  const dec = new TextDecoder("utf-8");
  for (const [filePath, data] of Object.entries(files)) {
    const base = filePath.split("/").pop() ?? "";
    const m = /^([A-Z]{2})\.txt$/i.exec(base);
    if (!m) continue;
    const state = m[1]!.toUpperCase();
    for (const rawLine of dec.decode(data).split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      const p = line.split(",");
      if (p.length !== 5) continue;
      const sex = p[1]!.trim();
      const year = Number(p[2]!.trim());
      const name = p[3]!.trim();
      const count = Number(p[4]!.trim());
      if (!name || (sex !== "M" && sex !== "F") || !Number.isFinite(count) || count <= 0) continue;
      rows.push([state, sex, year, name, count]);
    }
  }
  return rows;
}

function stateFile(state: string, rows: [number, string, string, number][]): string {
  return rows.map(([year, sex, name, count]) => `${state},${sex},${year},${name},${count}`).join("\n");
}

test("streaming yields exactly what inflating the whole archive did", () => {
  // Large enough that fflate delivers each entry over several ondata chunks,
  // which is where a naive line split loses or splices records.
  const ca: [number, string, string, number][] = [];
  for (let year = 1910; year <= 2025; year++) {
    for (let i = 0; i < 400; i++) {
      ca.push([year, i % 2 ? "F" : "M", `Name${i}`, (i % 97) + 5]);
    }
  }
  const zip = zipSync({
    "CA.TXT": strToU8(stateFile("CA", ca)),
    "VT.TXT": strToU8(stateFile("VT", [[1994, "F", "Marvel", 6]])),
    "StateReadMe.pdf": strToU8("not a state file"),
  });

  const streamed = collect(zip);
  assert.deepEqual(streamed, collectViaUnzipSync(zip));
  assert.equal(streamed.length, ca.length + 1);
  assert.ok(streamed.some((r) => r[0] === "VT" && r[3] === "Marvel"));
});

test("records spanning a chunk boundary are neither dropped nor spliced", () => {
  // One long file of distinct names: any boundary mishandling shows up as a
  // missing name or a mangled one rather than as a count that happens to match.
  const rows: [number, string, string, number][] = [];
  for (let i = 0; i < 60_000; i++) rows.push([1990 + (i % 30), "F", `Nm${i}`, 5 + (i % 11)]);
  const zip = zipSync({ "TX.TXT": strToU8(stateFile("TX", rows)) });

  const seen = collect(zip);
  assert.equal(seen.length, rows.length);
  assert.deepEqual(
    seen.map((r) => r[3]),
    rows.map((r) => r[2]),
  );
});

test("a final line without a trailing newline is still emitted", () => {
  const zip = zipSync({ "WY.TXT": strToU8("WY,M,1931,Marvel,7\nWY,F,1931,Elzada,6") });
  assert.deepEqual(collect(zip), [
    ["WY", "M", 1931, "Marvel", 7],
    ["WY", "F", 1931, "Elzada", 6],
  ]);
});

test("CRLF line endings and blank lines are tolerated", () => {
  const zip = zipSync({ "OH.TXT": strToU8("OH,F,1950,Ottilie,12\r\n\r\nOH,M,1950,Zetta,5\r\n") });
  assert.deepEqual(collect(zip), [
    ["OH", "F", 1950, "Ottilie", 12],
    ["OH", "M", 1950, "Zetta", 5],
  ]);
});

test("malformed rows are skipped, not fatal", () => {
  const zip = zipSync({
    "ME.TXT": strToU8(
      ["ME,F,1970,Good,10", "ME,F,1970,TooFewFields", "ME,X,1970,BadSex,9", "ME,F,1970,Zero,0", "ME,F,1970,Fine,3"].join(
        "\n",
      ),
    ),
  });
  assert.deepEqual(collect(zip), [
    ["ME", "F", 1970, "Good", 10],
    ["ME", "F", 1970, "Fine", 3],
  ]);
});

test("an archive with no state files is an error, not a silent empty pass", () => {
  const zip = zipSync({ "StateReadMe.pdf": strToU8("nothing here") });
  assert.throws(() => collect(zip), /no <ST>\.TXT files/);
});
