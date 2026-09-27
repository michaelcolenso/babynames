import assert from "node:assert/strict";
import test from "node:test";

import { linkifyBlogBody } from "../packages/shared/src/render-blog";

function fakeDb(existingNames: string[], totals: Record<string, number> = {}): D1Database {
  const byLower = new Set(existingNames.map((name) => name.toLowerCase()));
  return {
    prepare() {
      return {
        bind(...values: string[]) {
          return {
            async all() {
              return {
                results: values
                  .filter((value) => byLower.has(value))
                  .map((value) => ({ name: value, total: totals[value] ?? 1_000_000 })),
              };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

test("linkifyBlogBody links each name at most once", async () => {
  const html = [
    '<p><a href="/name/Jessica/">Jessica</a> peaked in 1987. Jessica fell later.</p>',
    "<p>Ashley was also high. Ashley fell too.</p>",
  ].join("\n");

  const linked = await linkifyBlogBody(html, fakeDb(["Jessica", "Ashley"]));

  assert.equal((linked.match(/href="\/name\/Jessica\/"/g) ?? []).length, 1);
  assert.equal((linked.match(/href="\/name\/Ashley\/"/g) ?? []).length, 1);
  assert.match(linked, /Jessica fell later/);
  assert.match(linked, /<a href="\/name\/Ashley\/">Ashley<\/a> was also high\. Ashley fell too\./);
});

test("linkifyBlogBody skips common words that happen to exist as names", async () => {
  const html = [
    '<p><a href="/name/Name/">Name</a> is a table header.</p>',
    "<p>January in America. Night makes a name. You'll see Jessica.</p>",
  ].join("\n");

  const linked = await linkifyBlogBody(
    html,
    fakeDb(["Name", "January", "America", "Night", "You", "Jessica"]),
  );

  assert.doesNotMatch(linked, /href="\/name\/Name\/"/);
  assert.doesNotMatch(linked, /href="\/name\/January\/"/);
  assert.doesNotMatch(linked, /href="\/name\/America\/"/);
  assert.doesNotMatch(linked, /href="\/name\/Night\/"/);
  assert.doesNotMatch(linked, /href="\/name\/You\/"/);
  assert.match(linked, /<a href="\/name\/Jessica\/">Jessica<\/a>/);
});

test("linkifyBlogBody sends state names to state hubs, never to /name/", async () => {
  const html = "<p>Eithan is common in Texas and California. New Mexico too. Texas again. Dakota was born in North Dakota.</p>";
  const linked = await linkifyBlogBody(html, fakeDb(["Eithan", "Texas", "California", "Dakota"]));
  assert.match(linked, /<a href="\/state\/texas\/">Texas<\/a>/);
  assert.match(linked, /<a href="\/state\/california\/">California<\/a>/);
  assert.match(linked, /<a href="\/state\/new-mexico\/">New Mexico<\/a>/);
  assert.match(linked, /<a href="\/state\/north-dakota\/">North Dakota<\/a>/);
  assert.equal((linked.match(/href="\/state\/texas\/"/g) ?? []).length, 1);
  assert.doesNotMatch(linked, /href="\/name\/(Texas|California)\/"/);
  assert.match(linked, /<a href="\/name\/Dakota\/">Dakota<\/a> was born/, "standalone Dakota is still a name");
});

test("linkifyBlogBody skips rare names and sentence-initial common words", async () => {
  const html = [
    "<p>Add every spelling. Baby-name consultants agree.</p>",
    '<p>It means \u201cGod has answered.\u201d A girl named Willow. Willow rose later.</p>',
  ].join("\n");
  const linked = await linkifyBlogBody(
    html,
    fakeDb(["Add", "Baby", "God", "Willow"], { add: 102, baby: 12_481, god: 61, willow: 40_000 }),
  );
  assert.doesNotMatch(linked, /href="\/name\/(Add|Baby|God)\/"/);
  assert.match(linked, /A girl named <a href="\/name\/Willow\/">Willow<\/a>\./, "mid-sentence common-word names still link");
});
