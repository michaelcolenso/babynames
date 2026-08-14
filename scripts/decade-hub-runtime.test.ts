import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  loadDecadeHubRuntime,
  loadDecadeHubRuntimeForDefinition,
  type DecadeHubRuntimeLogger,
} from "../packages/shared/src/decade-hub-runtime";
import { DECADE_THESES } from "../packages/shared/src/content/decade-theses";
import { getDecadeHubDefinition } from "../packages/shared/src/content/decade-hub-definitions";

const PROFILE = JSON.parse(
  readFileSync(new URL("./fixtures/decade-hub-1980.fixture.json", import.meta.url), "utf8"),
);
const SEEDED = getDecadeHubDefinition("1980s")!;

function fakeDb(payload: string | null, options: { throws?: boolean; binds?: string[] } = {}): D1Database {
  return {
    prepare(sql: string) {
      assert.match(sql, /SELECT payload FROM decade_hub WHERE decade = \?1/);
      return {
        bind(value: unknown) {
          options.binds?.push(String(value));
          return {
            async first<T>() {
              if (options.throws) throw new Error("D1 unavailable");
              return (payload === null ? null : { payload }) as T | null;
            },
          };
        },
      };
    },
  } as unknown as D1Database;
}

function recordingLogger() {
  const records: { message: string; details: Readonly<Record<string, unknown>> }[] = [];
  const logger: DecadeHubRuntimeLogger = {
    warn(message, details) {
      records.push({ message, details });
    },
  };
  return { logger, records };
}

test("runtime boundary binds the requested seeded slug and returns validated inputs", async () => {
  const binds: string[] = [];
  const result = await loadDecadeHubRuntime(fakeDb(JSON.stringify(PROFILE), { binds }), "1980s");
  assert.equal(result.status, "eligible");
  assert.deepEqual(binds, ["1980s"]);
  if (result.status === "eligible") {
    assert.equal(result.profile.decade, 1980);
    assert.equal(result.definition, SEEDED);
    assert.equal(result.thesis, DECADE_THESES["1980s"]);
  }
});

test("explicit draft and unknown definitions are rejected before persistence lookup", async () => {
  const binds: string[] = [];
  const definition = getDecadeHubDefinition("1970s")!;
  const draft = { ...definition, rolloutState: "draft" as const };
  assert.deepEqual(await loadDecadeHubRuntimeForDefinition(
    fakeDb(JSON.stringify(PROFILE), { binds }),
    draft,
    DECADE_THESES["1970s"],
  ), {
    status: "ineligible",
    reason: "draft-definition",
    definition: draft,
  });
  assert.deepEqual(await loadDecadeHubRuntime(fakeDb(JSON.stringify(PROFILE), { binds }), "1981s"), {
    status: "ineligible",
    reason: "unknown-definition",
  });
  assert.deepEqual(binds, []);
});

test("reviewed definitions are eligible when thesis and payload provenance match", async () => {
  const reviewed = { ...SEEDED, rolloutState: "reviewed" as const };
  const result = await loadDecadeHubRuntimeForDefinition(
    fakeDb(JSON.stringify(PROFILE)),
    reviewed,
    DECADE_THESES["1980s"],
  );
  assert.equal(result.status, "eligible");
});

test("expected persistence and payload failures are classified with safe diagnostics", async () => {
  for (const [expected, db] of [
    ["query-failed", fakeDb(null, { throws: true })],
    ["malformed-json", fakeDb("{")],
    ["invalid-profile", fakeDb(JSON.stringify({ decade: 1980 }))],
  ] as const) {
    const { logger, records } = recordingLogger();
    const result = await loadDecadeHubRuntime(db, "1980s", logger);
    assert.equal(result.reason, expected);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.details.slug, "1980s");
    assert.equal(records[0]!.details.reason, expected);
    assert.doesNotMatch(JSON.stringify(records), /ownershipRankings|femaleChampion|Stale paragraph/);
  }

  const missing = await loadDecadeHubRuntime(fakeDb(null), "1980s");
  assert.deepEqual(missing, { status: "unavailable", reason: "missing-row", definition: SEEDED });
});

test("missing or stale reviewed thesis is ineligible before D1 lookup", async () => {
  const binds: string[] = [];
  const db = fakeDb(JSON.stringify(PROFILE), { binds });
  assert.equal((await loadDecadeHubRuntimeForDefinition(db, SEEDED, undefined)).reason, "missing-thesis");
  assert.equal((await loadDecadeHubRuntimeForDefinition(db, SEEDED, {
    ...DECADE_THESES["1980s"]!,
    sourceVersion: "ssa-national-2017",
  })).reason, "thesis-provenance");
  assert.deepEqual(binds, []);
});
