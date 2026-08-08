import assert from "node:assert/strict";
import test from "node:test";

import { onRequestGet } from "../apps/web/functions/name/[name]/index";

// The name route fans out to a dozen queries and guards most of them with a
// fallback. That is the right call for availability — one failed enrichment
// lookup should not 503 the busiest route on the site — but the fallbacks are
// invisible in the response, so a degraded page looks exactly like a healthy
// one to the caching layer. Since the content version does not move during an
// outage, a stripped page cached under the versioned key would be served for a
// full day after D1 recovered.

const SERIES_ROWS = [1990, 1991, 1992, 1993, 1994].map((year) => ({
  id: 1,
  name: "Marvel",
  name_lower: "marvel",
  sex: "F",
  first_year: 1990,
  last_year: 1994,
  peak_year: 1992,
  peak_count: 400,
  total_count: 1_800,
  status: "declining",
  decline_pct: 40,
  latest_count: 200,
  prev_decade: 900,
  curr_decade: 900,
  growth_x: 1,
  year,
  count: year === 1992 ? 400 : 350,
}));

function fakeDb({ failFacts = false }: { failFacts?: boolean } = {}) {
  return {
    prepare(sql: string) {
      const stmt = {
        bind: () => stmt,
        async first<T>(): Promise<T | null> {
          if (sql.includes("FROM name_facts")) {
            if (failFacts) throw new Error("D1 unavailable");
            return null;
          }
          return null;
        },
        async all<T>(): Promise<{ results: T[] }> {
          if (sql.includes("JOIN name_years ny")) {
            return { results: SERIES_ROWS as unknown as T[] };
          }
          if (sql.includes("FROM name_collections") && failFacts) {
            throw new Error("D1 unavailable");
          }
          return { results: [] };
        },
      };
      return stmt;
    },
  };
}

function ctx(db: ReturnType<typeof fakeDb>) {
  return {
    request: new Request("https://nobodynamed.com/name/Marvel/"),
    env: { DB: db },
    params: { name: "Marvel" },
  } as never;
}

test("a healthy name page is cacheable", async () => {
  const res = (await onRequestGet(ctx(fakeDb()))) as Response;
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control") ?? "", /s-maxage=86400/);
});

test("a name page degraded by a facts failure is not cached", async () => {
  const res = (await onRequestGet(ctx(fakeDb({ failFacts: true })))) as Response;
  // Availability first: the page still renders from the core queries.
  assert.equal(res.status, 200, "a secondary query must not take the page down");
  assert.match(await res.text(), /Marvel/);
  // But it must not be frozen in its stripped state for the full TTL.
  assert.match(res.headers.get("Cache-Control") ?? "", /no-store/);
});
