import type { D1PreparedStatement } from "@cloudflare/workers-types";

import type { StateRow } from "./chunks";
import { insertStateRows } from "./upsert";

interface MockStatement extends D1PreparedStatement {
  bindCount?: number;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeRows(count: number): StateRow[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Name${i}`,
    sex: "F",
    year: 2025,
    state: "AK",
    count: 5,
  }));
}

async function testInsertStateRowsKeepsD1BindsUnderLimit(): Promise<void> {
  const bindCounts: number[] = [];
  const db = {
    prepare() {
      return {
        bind(...values: unknown[]) {
          bindCounts.push(values.length);
          return this;
        },
      } as MockStatement;
    },
    async batch(statements: MockStatement[]) {
      assertEqual(statements.length, 3, "statement count");
      return [];
    },
  };

  await insertStateRows(db as never, makeRows(45));

  assertEqual(bindCounts.length, 3, "bind call count");
  for (const count of bindCounts) {
    if (count > 100) throw new Error(`bind count exceeded D1 limit: ${count}`);
  }
  assertEqual(bindCounts[0], 100, "first bind count");
  assertEqual(bindCounts[1], 100, "second bind count");
  assertEqual(bindCounts[2], 25, "third bind count");
}

await testInsertStateRowsKeepsD1BindsUnderLimit();
