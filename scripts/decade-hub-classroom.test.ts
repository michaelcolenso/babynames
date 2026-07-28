// Classroom apportionment tests (SPEC §5 / §11, Coder A).
//
// IMPORTANT DOCUMENTED FINDING: on real 1984 national data the deterministic
// largest-remainder apportionment produces 30 UNIQUE names and 0 repeats,
// because 1984 name diversity means no name earns even one full expected seat
// (Michael M: 67,736 / 1,804,440 × 16 ≈ 0.60; Jennifer F ≈ 0.42). Duplicates
// are allowed by construction — the repeat path is asserted below on a
// concentrated synthetic fixture — but SPEC §5's "assert ≥1 repeat actually
// occurs in 1984 real data" is mathematically unsatisfiable under the §5
// formula. Deviation flagged and approved by the orchestrator; the 0-repeat
// result is itself the editorial finding for the 1980s.

import assert from "node:assert/strict";
import test from "node:test";

import type { SourceNameRecord } from "../packages/shared/src/decade-hub-compute";
import { CLASSROOM_SIZE, CLASSROOM_YEAR, apportionClassroom } from "../packages/shared/src/decade-hub-compute";
import { loadShardSource } from "./build-decade-hub";

function rec(name: string, sex: "F" | "M", series: Record<number, number>): SourceNameRecord {
  return { name, sex, series };
}

test("concentrated fixture: duplicates occur, seats reconcile, mostRepeated well-defined", () => {
  // femaleSeats = round(30 × 100k/200k) = 15; maleSeats = 15
  const records: SourceNameRecord[] = [
    rec("Maryish", "F", { 1984: 90000 }), // expected 13.5 -> floor 13, rem 0.5
    rec("Anneish", "F", { 1984: 10000 }), // expected 1.5  -> floor 1,  rem 0.5
    rec("Mikeish", "M", { 1984: 80000 }), // expected 12   -> floor 12
    rec("Daveish", "M", { 1984: 20000 }), // expected 3    -> floor 3
  ];
  const room = apportionClassroom(records, CLASSROOM_YEAR, CLASSROOM_SIZE, 100000, 100000);
  assert.equal(room.students.length, 30);
  assert.equal(room.femaleSeats, 15);
  assert.equal(room.maleSeats, 15);
  // tie on remainder 0.5 -> higher count wins the bonus seat
  const seatsOf = (name: string) => room.students.find((s) => s.name === name)?.seats ?? 0;
  assert.equal(seatsOf("Maryish"), 14);
  assert.equal(seatsOf("Anneish"), 1);
  assert.equal(seatsOf("Mikeish"), 12);
  assert.equal(seatsOf("Daveish"), 3);
  // duplicates are the point: repeats actually occur here
  assert.equal(room.uniqueNames, 4);
  assert.equal(room.repeatedNames, 26);
  assert.deepEqual(room.mostRepeated, { name: "Maryish", slug: "Maryish", seats: 14 });
  assert.ok(Math.abs(room.topShare - 14 / 30) < 1e-3); // stored at 4-decimal precision
  // expanded roster: seats desc, then alphabetical; per-name seats sum to 30
  let sum = 0;
  const seen = new Map<string, number>();
  for (const s of room.students) seen.set(s.name, (seen.get(s.name) ?? 0) + 1);
  for (const [, v] of seen) sum += v;
  assert.equal(sum, 30);
  assert.equal(room.students[0]!.name, "Maryish");
  // roster groups each name's seats contiguously
  assert.equal(room.students.filter((s) => s.name === "Maryish").length, 14);
});

test("deterministic ties: identical counts resolve alphabetically; run-twice identical", () => {
  const records: SourceNameRecord[] = [
    rec("Beta", "M", { 1984: 50000 }), // expected 15 -> ... both 7.5 with maleTotal 100k? see below
    rec("Alpha", "M", { 1984: 50000 }),
    rec("Solo", "F", { 1984: 100000 }),
  ];
  // femaleSeats = 15 (100k of 200k total); Solo expected 15 -> 15 seats.
  // maleSeats = 15; Alpha/Beta expected 7.5 each -> floors 7+7=14, 1 remaining;
  // remainder tie 0.5/0.5, count tie -> alphabetical "Alpha" wins the bonus.
  const room = apportionClassroom(records, CLASSROOM_YEAR, CLASSROOM_SIZE, 100000, 100000);
  const seatsOf = (name: string) => room.students.find((s) => s.name === name)?.seats ?? 0;
  assert.equal(seatsOf("Alpha"), 8);
  assert.equal(seatsOf("Beta"), 7);
  assert.equal(seatsOf("Solo"), 15);
  const again = apportionClassroom(records, CLASSROOM_YEAR, CLASSROOM_SIZE, 100000, 100000);
  assert.deepEqual(room, again);
});

test("real 1984 data: 30 students, seats reconcile, all names exist in source, largest-remainder holds", async () => {
  const { source } = await loadShardSource();
  let femaleTotal = 0;
  let maleTotal = 0;
  for (const r of source.records) {
    const c = r.series[CLASSROOM_YEAR] ?? 0;
    if (r.sex === "F") femaleTotal += c;
    else maleTotal += c;
  }
  const room = apportionClassroom(source.records, CLASSROOM_YEAR, CLASSROOM_SIZE, femaleTotal, maleTotal);

  // exactly 30; sex seats reconcile
  assert.equal(room.students.length, 30);
  assert.equal(room.femaleSeats + room.maleSeats, 30);
  assert.equal(room.students.filter((s) => s.sex === "F").length, room.femaleSeats);
  assert.equal(room.students.filter((s) => s.sex === "M").length, room.maleSeats);
  // actual 1984 split (48.26% female) -> 14F/16M, computed not assumed
  assert.equal(room.femaleSeats, 14);
  assert.equal(room.maleSeats, 16);

  // every roster name exists in 1984 source data for that sex
  const present = new Set(
    source.records.filter((r) => (r.series[CLASSROOM_YEAR] ?? 0) > 0).map((r) => `${r.sex}|${r.name.toLowerCase()}`),
  );
  for (const s of room.students) {
    assert.ok(present.has(`${s.sex}|${s.name.toLowerCase()}`), `${s.name} (${s.sex}) must exist in 1984 data`);
  }

  // per-name seats sum to 30; unique/repeated accounting consistent
  const seatsByKey = new Map<string, number>();
  for (const s of room.students) {
    const k = `${s.sex}|${s.name.toLowerCase()}`;
    seatsByKey.set(k, s.seats);
  }
  assert.equal([...seatsByKey.values()].reduce((a, b) => a + b, 0), 30);
  assert.equal(room.uniqueNames, seatsByKey.size);
  assert.equal(room.repeatedNames, 30 - room.uniqueNames);

  // largest-remainder property, recomputed independently per sex:
  // no name with a strictly higher remainder is seated fewer times than one
  // with a lower remainder; seats are always floor or floor+1.
  for (const sex of ["F", "M"] as const) {
    const sexSeats = sex === "F" ? room.femaleSeats : room.maleSeats;
    const sexTotal = sex === "F" ? femaleTotal : maleTotal;
    const pool = source.records
      .filter((r) => r.sex === sex && (r.series[CLASSROOM_YEAR] ?? 0) > 0)
      .map((r) => {
        const count = r.series[CLASSROOM_YEAR]!;
        const expected = (count / sexTotal) * sexSeats;
        return { name: r.name, expected, floor: Math.floor(expected), remainder: expected - Math.floor(expected) };
      });
    // 1984 finding: no name earns a full expected seat
    assert.ok(Math.max(...pool.map((p) => p.expected)) < 1, "1984: every name's expected seats < 1");
    const seatOf = (name: string) => seatsByKey.get(`${sex}|${name.toLowerCase()}`) ?? 0;
    for (const p of pool) {
      const seats = seatOf(p.name);
      assert.ok(seats === p.floor || seats === p.floor + 1, `${p.name}: seats must be floor or floor+1`);
    }
    let minRemSeated = Infinity;
    let maxRemUnseated = -Infinity;
    for (const p of pool) {
      if (seatOf(p.name) > p.floor) minRemSeated = Math.min(minRemSeated, p.remainder);
      else maxRemUnseated = Math.max(maxRemUnseated, p.remainder);
    }
    assert.ok(minRemSeated >= maxRemUnseated, `${sex}: largest-remainder property violated`);
  }

  // real-data outcome: 0 repeats (documented finding; repeats allowed by design,
  // see fixture tests above). mostRepeated stays well-defined for the UI.
  assert.equal(room.repeatedNames, 0);
  assert.equal(room.mostRepeated.seats, 1);
  assert.ok(Math.abs(room.topShare - 1 / 30) < 1e-3); // stored at 4-decimal precision
  assert.ok(room.mostRepeated.name.length > 0);

  // deterministic across runs
  const again = apportionClassroom(source.records, CLASSROOM_YEAR, CLASSROOM_SIZE, femaleTotal, maleTotal);
  assert.deepEqual(room, again);
});
