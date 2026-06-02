import assert from "node:assert/strict";
import test from "node:test";

import { linkifyBlogBody } from "../packages/shared/src/render-blog";

function fakeDb(existingNames: string[]): D1Database {
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
                  .map((value) => ({ name: value })),
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
