// Names first recorded in the last three years get "too new to call", not a
// trend read off one or two data points (audit finding 14: /name/Sayara/).

import { test } from "node:test";
import assert from "node:assert/strict";

import { classify, isTooNewToCall } from "../packages/shared/src/classify";
import { describeStatus, renderFullPage } from "../packages/shared/src/render-name";
import type { NameRecord } from "../packages/shared/src/schema";

const yM = 2025;
const record = (series: Record<number, number>): NameRecord => ({ name: "Sayara", sex: "F", ym: 1880, yM, series });

test("a name seen only in 2024 is too new to call, not a stable decline", () => {
  const r = record({ 2024: 6 });
  const a = classify({ series: r.series, yM })!;
  assert.equal(a.status, "declining");
  assert.equal(isTooNewToCall(a, yM), true);
  const d = describeStatus(r, a);
  assert.equal(d.status, "Too new to call");
  assert.equal(d.trajectory, "First recorded in 2024");
  const html = renderFullPage(r, a, { canonical: "https://nobodynamed.com/name/Sayara/" });
  assert.doesNotMatch(html, /Stable Decline|Gradual decline from 2024|declining since/);
  assert.match(html, /Too new to call/);
});

test("older names, rising newcomers and crashed spikes keep their status", () => {
  const old = classify({ series: { 2018: 40, 2019: 30, 2020: 20, 2021: 15, 2022: 12, 2023: 10, 2024: 8, 2025: 6 }, yM })!;
  assert.equal(isTooNewToCall(old, yM), false);
  // A newcomer with thousands of births is news, whatever status it falls into.
  const breakout = classify({ series: { 2023: 50, 2024: 400, 2025: 2_000 }, yM })!;
  assert.equal(isTooNewToCall(breakout, yM), false);
  const crashed = classify({ series: { 2023: 900, 2024: 120, 2025: 30 }, yM })!;
  assert.equal(crashed.status, "endangered");
  assert.equal(isTooNewToCall(crashed, yM), false);
  // Three reported years starting yM-2 is the edge; yM-3 is a trend.
  assert.equal(isTooNewToCall({ firstYear: yM - 2, status: "stable", totalCount: 40 }, yM), true);
  assert.equal(isTooNewToCall({ firstYear: yM - 3, status: "stable", totalCount: 40 }, yM), false);
});
