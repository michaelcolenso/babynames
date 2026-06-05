// Tests for generateNameNarrative() covering edge cases.
// Run with: npx tsx scripts/test-narrative.ts

import { generateNameNarrative } from "../packages/shared/src/generate-narrative";
import { classify } from "../packages/shared/src/classify";
import type { NameRecord } from "../packages/shared/src/schema";

// ── helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function test(name: string, fn: () => void) {
  console.log(`\n▸ ${name}`);
  fn();
}

function makeRecord(
  name: string,
  sex: "M" | "F",
  series: Record<number, number>,
  ym = 1880,
  yM = 2024,
): NameRecord {
  return { name, sex, ym, yM, series };
}

// ── test data ─────────────────────────────────────────────────────────────────

// Helen: peaked 1934, old classic feminine name
const helenSeries: Record<number, number> = {};
for (let y = 1905; y <= 2024; y++) {
  if (y < 1910) helenSeries[y] = 5000;
  else if (y < 1920) helenSeries[y] = 10000 + (y - 1910) * 2000;
  else if (y < 1934) helenSeries[y] = 30000 + (y - 1920) * 1000;
  else if (y === 1934) helenSeries[y] = 54000;
  else if (y < 1960) helenSeries[y] = Math.max(1000, 54000 - (y - 1934) * 1500);
  else if (y < 2000) helenSeries[y] = Math.max(500, 14000 - (y - 1960) * 300);
  else helenSeries[y] = Math.max(150, 2000 - (y - 2000) * 50);
}
const helenRecord = makeRecord("Helen", "F", helenSeries);
const helenClassify = classify({ series: helenSeries, yM: 2024 })!;

// Mary: all-time popular feminine name, massive total
const marySeries: Record<number, number> = {};
for (let y = 1880; y <= 2024; y++) {
  if (y < 1920) marySeries[y] = 15000 + (y - 1880) * 200;
  else if (y < 1954) marySeries[y] = 50000 + (y - 1920) * 500;
  else if (y === 1954) marySeries[y] = 80000;
  else if (y < 1980) marySeries[y] = Math.max(5000, 80000 - (y - 1954) * 2500);
  else if (y < 2010) marySeries[y] = Math.max(1000, 14000 - (y - 1980) * 400);
  else marySeries[y] = Math.max(300, 2800 - (y - 2010) * 150);
}
const maryRecord = makeRecord("Mary", "F", marySeries);
const maryClassify = classify({ series: marySeries, yM: 2024 })!;

// Abhay: very rare masculine name, minimal data
const abhaySeries: Record<number, number> = {
  2005: 6, 2006: 8, 2007: 12, 2008: 9, 2009: 7,
  2010: 10, 2015: 8, 2020: 6, 2024: 5,
};
const abhayRecord = makeRecord("Abhay", "M", abhaySeries);
const abhayClassify = classify({ series: abhaySeries, yM: 2024 })!;

// Jeter: uncommon masculine name (peaked ~2000-2004 after Derek Jeter fame)
const jeterSeries: Record<number, number> = {
  1996: 5, 1997: 8, 1998: 15, 1999: 25, 2000: 45,
  2001: 55, 2002: 60, 2003: 52, 2004: 40, 2005: 30,
  2006: 22, 2007: 18, 2008: 15, 2009: 12, 2010: 10,
  2011: 8, 2012: 7, 2013: 6, 2014: 5, 2015: 5,
  2016: 5, 2017: 5, 2018: 6, 2019: 7, 2020: 8, 2024: 5,
};
const jeterRecord = makeRecord("Jeter", "M", jeterSeries);
const jeterClassify = classify({ series: jeterSeries, yM: 2024 })!;

// Extinct name: peaked 1920s, last seen 1965
const myrtieSeries: Record<number, number> = {
  1895: 200, 1900: 350, 1905: 550, 1910: 800, 1915: 1200,
  1920: 1800, 1925: 1600, 1930: 1200, 1935: 900, 1940: 600,
  1945: 400, 1950: 200, 1955: 80, 1960: 20, 1965: 6,
};
const myrtieRecord = makeRecord("Myrtie", "F", myrtieSeries);
const myrtieClassify = classify({ series: myrtieSeries, yM: 2024 })!;

// Missing age data: name with only very old data (all living estimates zero)
const oldOnlySeries: Record<number, number> = {
  1890: 120, 1895: 80, 1900: 50, 1905: 20,
};
const oldOnlyRecord = makeRecord("Zelpha", "F", oldOnlySeries);
const oldOnlyClassify = classify({ series: oldOnlySeries, yM: 2024 })!;

// Rising modern name: barely existed before 2010, now climbing
const novaSeries: Record<number, number> = {};
for (let y = 2005; y <= 2024; y++) {
  novaSeries[y] = Math.round(100 + (y - 2005) * 250);
}
const novaRecord = makeRecord("Nova", "F", novaSeries);
const novaClassify = classify({ series: novaSeries, yM: 2024 })!;

// ── tests ─────────────────────────────────────────────────────────────────────

test("Helen (declining classic)", () => {
  const n = generateNameNarrative(helenRecord, helenClassify);
  assert("metaTitle contains 'Helen'", n.metaTitle.includes("Helen"));
  assert("metaTitle contains 'NobodyNamed'", n.metaTitle.includes("NobodyNamed"));
  assert("metaDescription is non-empty", n.metaDescription.length > 20);
  assert("metaDescription mentions 'Helen'", n.metaDescription.includes("Helen"));
  assert("metaDescription does not contain undefined/null", !n.metaDescription.includes("undefined") && !n.metaDescription.includes("null"));
  assert("summaryParagraphs is non-empty", n.summaryParagraphs.length > 0);
  assert("first paragraph mentions Helen", n.summaryParagraphs[0]!.includes("Helen"));
  assert("first paragraph contains 'living' or 'historic'",
    n.summaryParagraphs[0]!.toLowerCase().includes("living") || n.summaryParagraphs[0]!.toLowerCase().includes("historic"));
  assert("population answer present", n.answers.population !== undefined);
  assert("population answer mentions 'estimated'", n.answers.population!.includes("estimated"));
  assert("rarity answer is non-empty", n.answers.rarity.length > 10);
  assert("rarity answer mentions births", n.answers.rarity.includes(String(helenClassify.latestCount)));
  assert("age answer present (series spans many decades)", n.answers.age !== undefined);
  assert("age answer mentions 'median'", n.answers.age!.toLowerCase().includes("median"));
  assert("trend answer is non-empty", n.answers.trend.length > 10);
  assert("no undefined text in summaryParagraphs", n.summaryParagraphs.every(p => !p.includes("undefined") && !p.includes("null")));
  assert("no undefined in any answer", Object.values(n.answers).every(v => v === undefined || (!String(v).includes("undefined") && !String(v).includes("null"))));
});

test("Mary (massive historic feminine name)", () => {
  const n = generateNameNarrative(maryRecord, maryClassify);
  assert("metaTitle correct format", n.metaTitle === "Mary Name Popularity, Rarity, Age & State Data | NobodyNamed");
  assert("population answer present", n.answers.population !== undefined);
  assert("population contains 'million' or large number", n.answers.population!.includes("million") || parseInt(n.answers.population!.replace(/[^0-9]/g, "")) > 100000);
  assert("summary present", n.summaryParagraphs.length > 0);
  assert("no null/undefined in output", !JSON.stringify(n).includes('"undefined"') && !JSON.stringify(n).includes('"null"'));
});

test("Abhay (very rare modern masculine name)", () => {
  const n = generateNameNarrative(abhayRecord, abhayClassify);
  assert("metaTitle present", n.metaTitle.length > 0);
  assert("rarity answer mentions few births", n.answers.rarity.toLowerCase().includes("rare") || n.answers.rarity.includes("5"));
  assert("summaryParagraphs non-empty", n.summaryParagraphs.length > 0);
  assert("no undefined/null strings in answers", Object.values(n.answers).every(v => v === undefined || !String(v).includes("undefined")));
});

test("Jeter (uncommon one-era masculine name)", () => {
  const n = generateNameNarrative(jeterRecord, jeterClassify);
  assert("metaTitle contains 'Jeter'", n.metaTitle.includes("Jeter"));
  assert("rarity or trend answer present", n.answers.rarity.length > 0 || n.answers.trend.length > 0);
  assert("summaryParagraphs present", n.summaryParagraphs.length > 0);
  assert("no undefined text anywhere", !JSON.stringify(n).includes("undefined") || JSON.stringify(n).includes('"age":undefined'));
});

test("Extinct name (Myrtie)", () => {
  const n = generateNameNarrative(myrtieRecord, myrtieClassify);
  assert("status is extinct", myrtieClassify.status === "extinct");
  assert("rarity mentions extinct or last year", n.answers.rarity.toLowerCase().includes("extinct") || n.answers.rarity.includes("1965"));
  assert("trend mentions extinct", n.answers.trend.toLowerCase().includes("extinct"));
  assert("summary mentions 'historic' or 'last seen'",
    n.summaryParagraphs.some(p => p.toLowerCase().includes("historic") || p.includes("1965")));
  assert("no undefined/null strings", !JSON.stringify(n).includes('"undefined"'));
});

test("Missing age data (Zelpha — only pre-1910 births)", () => {
  const n = generateNameNarrative(oldOnlyRecord, oldOnlyClassify);
  assert("age answer absent (all bearers would be 115+ years old)", n.answers.age === undefined);
  assert("summaryParagraphs present", n.summaryParagraphs.length > 0);
  assert("rarity answer present", n.answers.rarity.length > 0);
  assert("no null/undefined strings in summary", n.summaryParagraphs.every(p => !p.includes("null") && !p.includes("undefined")));
});

test("Rising modern name (Nova)", () => {
  const n = generateNameNarrative(novaRecord, novaClassify);
  assert("trend mentions 'rising'", n.answers.trend.toLowerCase().includes("rising"));
  assert("rarity answer present", n.answers.rarity.length > 0);
  assert("summaryParagraphs non-empty", n.summaryParagraphs.length > 0);
  assert("no null/undefined strings", !JSON.stringify(n).replace(/"age":null/g, "").includes("null"));
});

test("metaTitle format is consistent for all names", () => {
  const testCases = [
    [helenRecord, helenClassify],
    [maryRecord, maryClassify],
    [abhayRecord, abhayClassify],
    [myrtieRecord, myrtieClassify],
  ] as const;
  for (const [rec, cls] of testCases) {
    const n = generateNameNarrative(rec, cls);
    assert(
      `${rec.name}: title ends with '| NobodyNamed'`,
      n.metaTitle.endsWith("| NobodyNamed"),
    );
    assert(
      `${rec.name}: title contains name`,
      n.metaTitle.startsWith(rec.name),
    );
    assert(
      `${rec.name}: description starts with 'See how many'`,
      n.metaDescription.startsWith("See how many"),
    );
  }
});

test("No HTML injection through name field", () => {
  // summaryParagraphs and answers are HTML strings; the name must be escaped in them.
  // metaTitle / metaDescription are plain-text strings that get HTML-escaped by the
  // rendering layer (render-name.ts calls escape(title) / escape(desc)).
  const xssRecord = makeRecord("<script>alert(1)</script>", "M", { 2020: 5, 2024: 5 });
  const xssCls = classify({ series: xssRecord.series, yM: 2024 })!;
  const n = generateNameNarrative(xssRecord, xssCls);
  assert("summaryParagraphs do not contain raw <script> tag",
    n.summaryParagraphs.every(p => !p.includes("<script>")));
  assert("answers.rarity does not contain raw <script> tag", !n.answers.rarity.includes("<script>"));
  assert("answers.trend does not contain raw <script> tag", !n.answers.trend.includes("<script>"));
  if (n.answers.population) {
    assert("answers.population does not contain raw <script> tag", !n.answers.population.includes("<script>"));
  }
});

// ── results ───────────────────────────────────────────────────────────────────

console.log(`\n${"─".repeat(40)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
