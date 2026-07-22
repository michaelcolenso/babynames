import assert from "node:assert/strict";
import test from "node:test";

import { listDominantNamesWithSparks } from "../packages/shared/src/d1-queries";

type SparkRow = {
  name: string;
  name_lower: string;
  sex: "F" | "M";
  total_count: number;
  spark_blob: ArrayBuffer;
};

function recordingD1(rows: SparkRow[]) {
  const calls = {
    prepareCount: 0,
    sql: [] as string[],
    bindValues: [] as unknown[][],
    allCount: 0,
  };

  const db = {
    prepare(sql: string) {
      calls.prepareCount += 1;
      calls.sql.push(sql);
      return {
        bind(...values: unknown[]) {
          calls.bindValues.push(values);
          return {
            async all<T>() {
              calls.allCount += 1;
              return { results: rows as T[] };
            },
          };
        },
      };
    },
  } as unknown as D1Database;

  return { db, calls };
}

test("listDominantNamesWithSparks returns early for empty input", async () => {
  const { db, calls } = recordingD1([]);

  assert.deepEqual(await listDominantNamesWithSparks(db, []), []);
  assert.equal(calls.prepareCount, 0);
  assert.equal(calls.allCount, 0);
});

test("listDominantNamesWithSparks issues one parameterized dominant-row query with normalized unique names", async () => {
  const williamSpark = new Uint8Array([1, 2]).buffer;
  const jamesSpark = new Uint8Array([3, 4]).buffer;
  const d1Rows: SparkRow[] = [
    { name: "William", name_lower: "william", sex: "M", total_count: 4_100_000, spark_blob: williamSpark },
    { name: "James", name_lower: "james", sex: "M", total_count: 5_200_000, spark_blob: jamesSpark },
  ];
  const { db, calls } = recordingD1(d1Rows);

  const result = await listDominantNamesWithSparks(db, ["James", "WILLIAM", "james"]);

  assert.deepEqual(result, d1Rows, "D1 result order should be preserved");
  assert.equal(calls.prepareCount, 1);
  assert.equal(calls.allCount, 1);
  assert.deepEqual(calls.bindValues, [["james", "william"]]);

  const sql = calls.sql[0] ?? "";
  assert.match(sql, /SELECT\s+name,\s*name_lower,\s*sex,\s*total_count,\s*spark_blob/i);
  assert.match(sql, /name_lower\s+IN\s*\(\s*\?1\s*,\s*\?2\s*\)/i);
  assert.match(sql, /ROW_NUMBER\s*\(\s*\)\s+OVER\s*\(\s*PARTITION BY name_lower\s+ORDER BY total_count DESC,\s*peak_count DESC,\s*sex\s*\)/i);
  assert.match(sql, /spark_blob\s+IS\s+NOT\s+NULL/i);
  assert.match(sql, /WHERE\s+rn\s*=\s*1/i);
  assert.doesNotMatch(sql, /James|WILLIAM|james|william/);
});
