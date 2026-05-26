import type { D1PreparedStatement } from "@cloudflare/workers-types";

import type { NameAgg } from "./diaspora-compute";
import { buildDiasporaStatements } from "./diaspora-compute";

interface MockStatement extends D1PreparedStatement {
  bindCount?: number;
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makePage(count: number): NameAgg[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Name${i}`,
    sex: "F",
    rows: [{ year: 2025, state: "AK", count: 5 }],
  }));
}

function testBuildDiasporaStatementsKeepsD1BindsUnderLimit(): void {
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
  };

  const stmts = buildDiasporaStatements(db as never, makePage(11), new Map());

  assertEqual(stmts.length, 2, "statement count");
  assertEqual(bindCounts[0], 100, "first bind count");
  assertEqual(bindCounts[1], 10, "second bind count");
}

testBuildDiasporaStatementsKeepsD1BindsUnderLimit();
