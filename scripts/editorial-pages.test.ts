import assert from "node:assert/strict";
import test from "node:test";

import { getEditorialPageConfig } from "../apps/web/functions/[slug]";

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
