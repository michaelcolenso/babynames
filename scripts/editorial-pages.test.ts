import assert from "node:assert/strict";
import test from "node:test";

import { getEditorialPageConfig, onRequestGet } from "../apps/web/functions/[slug]";

const CLASSIC_NAMES = ["James", "Elizabeth", "William", "Anna", "John", "Mary"];

interface ClassicSparkRow {
  name: string;
  name_lower: string;
  sex: "F" | "M";
  total_count: number;
  spark_blob: ArrayBuffer;
}

function sparkBlob(seed: number): ArrayBuffer {
  return Uint8Array.from({ length: 60 }, (_, index) => ((index + seed) % 59) + 1).buffer;
}

function classicRows(names = CLASSIC_NAMES): ClassicSparkRow[] {
  return names.map((name, index) => ({
    name,
    name_lower: name.toLowerCase(),
    sex: name === "Elizabeth" || name === "Anna" || name === "Mary" ? "F" : "M",
    total_count: 1_000_000 - index,
    spark_blob: sparkBlob(index),
  }));
}

function routeDb(rows: ClassicSparkRow[], rejectSparkQuery = false) {
  let sparkQueryCount = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          if (/FROM meta/.test(sql)) {
            return {
              async first<T>() {
                const key = String(values[0]);
                return { value: key === "min_year" ? "1880" : "2025" } as T;
              },
            };
          }

          sparkQueryCount += 1;
          return {
            async all<T>() {
              if (rejectSparkQuery) throw new Error("D1 unavailable");
              return { results: rows as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, getSparkQueryCount: () => sparkQueryCount };
}

async function renderClassicNames(rows: ClassicSparkRow[], rejectSparkQuery = false) {
  const { db, getSparkQueryCount } = routeDb(rows, rejectSparkQuery);
  const response = await onRequestGet({
    params: { slug: "classic-names" },
    request: new Request("https://example.com/classic-names"),
    env: { DB: db },
  } as never);
  return { response, html: await response.text(), getSparkQueryCount };
}

function cardLinks(html: string): string[] {
  return Array.from(
    html.matchAll(/<a class="diagnosis-card[^\"]*" href="\/name\/([^/]+)\/">/g),
    (match) => decodeURIComponent(match[1] ?? ""),
  );
}

function words(value: string): number {
  return value
    .replace(/<[^>]+>/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

test("classic names page has click-worthy metadata and substantive editorial content", () => {
  const page = getEditorialPageConfig("classic-names");
  assert.ok(page, "classic-names configuration should exist");

  const seoTitle = page.seoTitle ?? page.title;
  const seoDescription = page.seoDescription ?? page.lede;
  assert.match(seoTitle, /^Classic Baby Names/);
  assert.ok(seoTitle.length >= 50 && seoTitle.length <= 60, `title length was ${seoTitle.length}`);
  assert.ok(
    seoDescription.length >= 150 && seoDescription.length <= 160,
    `description length was ${seoDescription.length}`,
  );
  assert.equal(page.title, "Classic Baby Names");
  assert.equal(page.sections?.length, 3);

  const editorial = [page.lede, page.body, ...(page.sections ?? []).map((section) => section.body)].join(" ");
  const editorialWords = words(editorial);
  assert.ok(editorialWords >= 300 && editorialWords <= 500, `editorial word count was ${editorialWords}`);

  const sectionHtml = (page.sections ?? []).map((section) => `${section.heading} ${section.body}`).join(" ");
  assert.match(sectionHtml, /<a href="\/name\/James\/">/);
  assert.match(sectionHtml, /<a href="\/comeback">/);
  assert.match(sectionHtml, /<a href="\/names\/1940s\/">/);
});

test("classic name cards render six ordered accessible SSR sparklines and preserve dossier links", async () => {
  const { response, html, getSparkQueryCount } = await renderClassicNames(classicRows());

  assert.equal(response.status, 200);
  assert.equal(getSparkQueryCount(), 1, "classic spark rows should be fetched in one query");
  assert.deepEqual(cardLinks(html), CLASSIC_NAMES);
  assert.equal((html.match(/<svg class="mini-sparkline"/g) ?? []).length, 6);

  for (const name of CLASSIC_NAMES) {
    assert.match(html, new RegExp(`aria-label="Normalized popularity trend for ${name}, 1880-2025"`));
    assert.match(html, new RegExp(`href="/name/${name}/"`));
  }
  assert.equal((html.match(/>1880<\/text>/g) ?? []).length, 6);
  assert.equal((html.match(/>2025<\/text>/g) ?? []).length, 6);

  const cardGrid = html.match(/<div class="diagnosis-grid">([\s\S]*?)<\/div>/)?.[1] ?? "";
  assert.equal((cardGrid.match(/<svg class="mini-sparkline"/g) ?? []).length, 6);
  assert.doesNotMatch(cardGrid, /<script/);
});

test("one missing classic name row leaves five charts but all six ordered linked cards", async () => {
  const { response, html } = await renderClassicNames(classicRows(CLASSIC_NAMES.slice(0, -1)));

  assert.equal(response.status, 200);
  assert.deepEqual(cardLinks(html), CLASSIC_NAMES);
  assert.equal((html.match(/<svg class="mini-sparkline"/g) ?? []).length, 5);
  assert.match(html, /href="\/name\/Mary\/"><span class="card-name">Mary<\/span><span class="card-status">Open dossier<\/span><\/a>/);
});

test("classic spark query rejection returns all six linked cards and no charts", async () => {
  const { response, html, getSparkQueryCount } = await renderClassicNames([], true);

  assert.equal(response.status, 200);
  assert.equal(getSparkQueryCount(), 1);
  assert.deepEqual(cardLinks(html), CLASSIC_NAMES);
  assert.doesNotMatch(html, /<svg class="mini-sparkline"/);
});
