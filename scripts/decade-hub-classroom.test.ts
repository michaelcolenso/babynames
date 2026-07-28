// Classroom-suite tests: deterministic 1984 apportionment (SPEC §5, §13).

import assert from "node:assert/strict";
import test from "node:test";

import { apportionClassroom } from "../packages/shared/src/decade-hub-compute";
import type { SourceNameRecord } from "../packages/shared/src/decade-hub-compute";

function series(entries: [number, number][]): Record<number, number> {
  return Object.fromEntries(entries);
}

function classroomFixture(): { records: SourceNameRecord[]; femaleTotal: number; maleTotal: number } {
  // 1984-only universe: female counts exceed male counts, so the seat split is
  // not 15/15, and the largest female name must win the most seats.
  const girls: [string, number][] = [
    ["Jennifer", 6000],
    ["Jessica", 3000],
    ["Ashley", 1500],
    ["Amanda", 900],
    ["Sarah", 600],
  ];
  const boys: [string, number][] = [
    ["Michael", 5000],
    ["Christopher", 2500],
    ["Matthew", 1200],
    ["Joshua", 800],
    ["David", 500],
  ];
  const records: SourceNameRecord[] = [
    ...girls.map(([name, count]) => ({ name, sex: "F" as const, series: series([[1984, count]]) })),
    ...boys.map(([name, count]) => ({ name, sex: "M" as const, series: series([[1984, count]]) })),
  ];
  const femaleTotal = girls.reduce((a, [, c]) => a + c, 0); // 12,000
  const maleTotal = boys.reduce((a, [, c]) => a + c, 0); // 10,000
  return { records, femaleTotal, maleTotal };
}

test("sex split derives from actual year totals, rounded, boys take the remainder", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  const result = apportionClassroom(records, 1984, 30, femaleTotal, maleTotal);
  // round(30 × 12000/22000) = round(16.36) = 16 girls, 14 boys
  assert.equal(result.femaleSeats, 16);
  assert.equal(result.maleSeats, 14);
  assert.equal(result.femaleSeats + result.maleSeats, 30);
});

test("roster totals 30 seats and the most frequent name is consistent", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  const result = apportionClassroom(records, 1984, 30, femaleTotal, maleTotal);
  assert.equal(result.students.length, 30);
  const totalSeats = new Map<string, number>();
  for (const s of result.students) totalSeats.set(s.name, (totalSeats.get(s.name) ?? 0) + 1);
  assert.equal(totalSeats.get("Jennifer"), result.mostRepeated.seats);
  assert.equal(result.mostRepeated.name, "Jennifer");
  assert.equal(result.repeatedNames, 30 - result.uniqueNames);
  assert.equal(result.uniqueNames, totalSeats.size);
  // topShare = seats of the single most frequent name / 30
  assert.equal(result.topShare, result.mostRepeated.seats / 30);
});

test("largest-remainder apportionment: expected seats floor + fractional seats", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  const result = apportionClassroom(records, 1984, 30, femaleTotal, maleTotal);
  // Jennifer: 6000/12000 × 16 = 8.0 exactly → 8 seats, no remainder needed.
  const jennifer = result.students.filter((s) => s.name === "Jennifer");
  assert.equal(jennifer.length, 8);
  // Michael: 5000/10000 × 14 = 7.0 exactly → 7 seats.
  const michael = result.students.filter((s) => s.name === "Michael");
  assert.equal(michael.length, 7);
});

test("apportionment is deterministic regardless of input order", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  const a = apportionClassroom(records, 1984, 30, femaleTotal, maleTotal);
  const b = apportionClassroom([...records].reverse(), 1984, 30, femaleTotal, maleTotal);
  assert.deepEqual(b, a);
});

test("repeated names are allowed and reported, never suppressed", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  const result = apportionClassroom(records, 1984, 30, femaleTotal, maleTotal);
  assert.ok(result.repeatedNames > 0, "fixture must produce repeats");
  const names = result.students.map((s) => s.name);
  assert.ok(new Set(names).size < names.length, "roster contains duplicate names");
});

test("v1 rejects any year/size other than 1984/30", () => {
  const { records, femaleTotal, maleTotal } = classroomFixture();
  assert.throws(() => apportionClassroom(records, 1985, 30, femaleTotal, maleTotal));
  assert.throws(() => apportionClassroom(records, 1984, 25, femaleTotal, maleTotal));
});

test("ties in the largest-remainder step break by count, then name_lower", () => {
  // Two names with identical 1984 counts get identical expected seats and
  // identical remainders; the seat bonus must resolve alphabetically so the
  // roster is reproducible run over run.
  const records: SourceNameRecord[] = [
    { name: "Zoe", sex: "F", series: series([[1984, 1000]]) },
    { name: "Abby", sex: "F", series: series([[1984, 1000]]) },
    { name: "Mark", sex: "M", series: series([[1984, 1000]]) },
  ];
  const a = apportionClassroom(records, 1984, 30, 2000, 1000);
  const b = apportionClassroom([...records].reverse(), 1984, 30, 2000, 1000);
  assert.deepEqual(b, a);
  // girls: round(30 × 2000/3000) = 20 seats; each girl expects 10.0 → both get
  // 10 with no remainder seats left over. Boys: 10 seats to one name.
  assert.equal(a.femaleSeats, 20);
  assert.equal(a.maleSeats, 10);
  const seatsOf = (n: string) => a.students.filter((s) => s.name === n).length;
  assert.equal(seatsOf("Abby"), 10);
  assert.equal(seatsOf("Zoe"), 10);
  assert.equal(seatsOf("Mark"), 10);
});

test("fractional remainders allocate leftover seats to the largest fractions", () => {
  // Three girls with expected seats 6.5 / 3.5 / 0 (10-seat girl pool) → the
  // two .5 remainders each claim a seat; the roster still sums to 30.
  const records: SourceNameRecord[] = [
    { name: "Ann", sex: "F", series: series([[1984, 6500]]) },
    { name: "Beth", sex: "F", series: series([[1984, 3500]]) },
    { name: "Cleo", sex: "F", series: series([[1984, 5]]) },
    { name: "Solo", sex: "M", series: series([[1984, 10000]]) },
  ];
  // F total 10,005, M total 10,000 → femaleSeats = round(30 × 10005/20005) = 15
  const result = apportionClassroom(records, 1984, 30, 10005, 10000);
  assert.equal(result.femaleSeats + result.maleSeats, 30);
  assert.equal(result.students.length, 30);
  const seatsOf = (n: string) => result.students.filter((s) => s.name === n).length;
  // Ann: 6500/10005×15 = 9.745…, Beth: 5.247…, Cleo: 0.007… → floors 9+5+0=14,
  // one leftover seat goes to the largest remainder (Ann).
  assert.equal(seatsOf("Ann"), 10);
  assert.equal(seatsOf("Beth"), 5);
  assert.equal(seatsOf("Cleo"), 0, "below one expected seat, no remainder win");
  assert.equal(seatsOf("Solo"), 15);
});
