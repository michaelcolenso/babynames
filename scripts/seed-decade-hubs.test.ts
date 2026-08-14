import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { stableStringify } from "../packages/shared/src/decade-hub-compute-core";
import { DECADE_HUB_DEFINITIONS } from "../packages/shared/src/content/decade-hub-definitions";
import { parseSeedArgs, seedDecadeHubs, type SeedDependencies } from "./seed-decade-hub";

const fakeProfile = (startYear: number) => {
  const definition = DECADE_HUB_DEFINITIONS.find((item) => item.startYear === startYear)!;
  const endYear = Math.min(definition.nominalEndYear, 2025);
  return {
    decade: startYear,
    startYear,
    endYear,
    isComplete: endYear === definition.nominalEndYear,
    methodologyVersion: "decade-hub/v1.0.0",
    sourceVersion: definition.thesisSourceVersion,
    generatedAt: "2026-08-14T00:00:00.000Z",
  };
};

function fixture(startYears: number[], options: { corruptHash?: number; wrongEnd?: number } = {}) {
  const files = new Map<string, string>();
  const profiles = startYears.map((startYear) => {
    const profile = fakeProfile(startYear);
    if (options.wrongEnd === startYear) profile.endYear -= 1;
    const payload = stableStringify(profile);
    files.set(`decade-hub-${startYear}.json`, JSON.stringify(profile));
    return {
      decade: startYear,
      slug: `${startYear}s`,
      startYear,
      endYear: profile.endYear,
      nominalEndYear: startYear + 9,
      isComplete: profile.isComplete,
      methodologyVersion: profile.methodologyVersion,
      sourceVersion: profile.sourceVersion,
      profileSha256: options.corruptHash === startYear ? "0".repeat(64) : createHash("sha256").update(payload).digest("hex"),
      payloadBytes: Buffer.byteLength(payload),
      familyStatus: "reviewed",
      validationOnly: false,
    };
  });
  files.set("decade-hub-manifest.json", JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-08-14T00:00:00.000Z",
    source: { type: "d1", label: "test", sourceVersion: "ssa-national-2025", fingerprint: "test", minYear: 1880, maxYear: 2025, validationOnly: false },
    validationOnly: false,
    profiles,
  }));
  return files;
}

function deps(files: Map<string, string>, query: SeedDependencies["query"]): SeedDependencies {
  return {
    readFile: async (file) => {
      const value = files.get(file.split("/").at(-1)!);
      if (value === undefined) throw new Error(`missing ${file}`);
      return value;
    },
    query,
    validateProfile: (value) => ({ ok: true, profile: value as never, issues: [] }),
    log: () => undefined,
  };
}

test("seed parser requires one reviewed selector and defaults to dry run", () => {
  assert.deepEqual(parseSeedArgs(["--decade=1930"]), { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: undefined });
  assert.deepEqual(parseSeedArgs(["--all-reviewed", "--apply", "--artifacts=/tmp/profiles"]), { selector: { kind: "all-reviewed" }, apply: true, artifactsDir: "/tmp/profiles" });
  assert.throws(() => parseSeedArgs([]), /exactly one selector/i);
  assert.throws(() => parseSeedArgs(["--decade=1930", "--all-reviewed"]), /conflict/i);
  assert.throws(() => parseSeedArgs(["--decade=1935"]), /unknown decade/i);
  assert.throws(() => parseSeedArgs(["--decade=1930s"]), /unknown decade/i);
  assert.throws(() => parseSeedArgs(["--decade=1930", "--apply", "--apply"]), /duplicate.*apply/i);
  assert.throws(() => parseSeedArgs(["--decade=1930", "--wat"]), /unknown option/i);
});

test("dry run validates hash and partial coverage without issuing writes", async () => {
  const sql: string[] = [];
  const result = await seedDecadeHubs(
    { selector: { kind: "decade", startYear: 2020 }, apply: false, artifactsDir: "/artifacts" },
    deps(fixture([2020]), async (statement) => {
      sql.push(statement);
      if (statement.includes("FROM meta")) return [{ max_year: "2025" }] as never;
      return [] as never;
    }),
  );
  assert.deepEqual(result.candidates.map((item) => item.slug), ["2020s"]);
  assert.equal(result.changed.length, 0);
  assert.equal(sql.some((statement) => /INSERT|REPLACE/.test(statement)), false);
});

test("artifact hash or coverage failure occurs before any D1 query", async () => {
  for (const files of [fixture([2020], { corruptHash: 2020 }), fixture([2020], { wrongEnd: 2020 })]) {
    let queries = 0;
    await assert.rejects(
      seedDecadeHubs(
        { selector: { kind: "decade", startYear: 2020 }, apply: false, artifactsDir: "/artifacts" },
        deps(files, async () => { queries += 1; return [] as never; }),
      ),
      /hash|coverage/i,
    );
    assert.equal(queries, 0);
  }
});

test("fails closed when manifest provenance or D1 max_year is unavailable", async () => {
  const mismatched = fixture([1930]);
  const manifest = JSON.parse(mismatched.get("decade-hub-manifest.json")!);
  manifest.source.sourceVersion = "ssa-national-2024";
  mismatched.set("decade-hub-manifest.json", JSON.stringify(manifest));
  let queries = 0;
  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
      deps(mismatched, async () => { queries += 1; return [] as never; }),
    ),
    /manifest.*source|source.*manifest/i,
  );
  assert.equal(queries, 0);

  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
      deps(fixture([1930]), async () => [] as never),
    ),
    /max_year/i,
  );

  for (const malformed of [null, "", "   ", true]) {
    await assert.rejects(
      seedDecadeHubs(
        { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
        deps(fixture([1930]), async (sql) => sql.includes("FROM meta") ? [{ max_year: malformed }] as never : [] as never),
      ),
      /max_year/i,
    );
  }
});

test("rejects unreviewed and forged manifest metadata before D1", async () => {
  for (const mutate of [
    (entry: Record<string, unknown>) => { entry.familyStatus = "draft"; },
    (entry: Record<string, unknown>) => { entry.startYear = 1931; },
    (entry: Record<string, unknown>) => { entry.nominalEndYear = 1940; },
  ]) {
    const files = fixture([1930]);
    const manifest = JSON.parse(files.get("decade-hub-manifest.json")!);
    mutate(manifest.profiles[0]);
    files.set("decade-hub-manifest.json", JSON.stringify(manifest));
    let queries = 0;
    await assert.rejects(
      seedDecadeHubs(
        { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
        deps(files, async () => { queries += 1; return [] as never; }),
      ),
      /family status|manifest coverage/i,
    );
    assert.equal(queries, 0);
  }
});

test("profile-validator rejection stops before D1", async () => {
  let queries = 0;
  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
      {
        ...deps(fixture([1930]), async () => { queries += 1; return [] as never; }),
        validateProfile: () => ({ ok: false, issues: [{ code: "missing-field", path: "$.births", message: "required" }] }),
      },
    ),
    /artifact validation failed/i,
  );
  assert.equal(queries, 0);
});

test("refuses artifacts older than D1 or an existing live row", async () => {
  const files = fixture([1930]);
  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
      deps(files, async (sql) => sql.includes("FROM meta") ? [{ max_year: "2026" }] as never : [] as never),
    ),
    /older than D1|max_year/i,
  );
  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "decade", startYear: 1930 }, apply: false, artifactsDir: "/artifacts" },
      deps(files, async (sql) => {
        if (sql.includes("FROM meta")) return [{ max_year: "2025" }] as never;
        return [{ decade: "1930s", methodology_version: "decade-hub/v1.0.0", source_version: "ssa-national-2026", generated_at: "2026-08-14T00:00:00.000Z", payload: "live" }] as never;
      }),
    ),
    /downgrade/i,
  );
});

test("all-reviewed validates every artifact before the first write", async () => {
  const years = DECADE_HUB_DEFINITIONS.filter((item) => item.rolloutState !== "draft").map((item) => item.startYear);
  const files = fixture(years);
  files.delete(`decade-hub-${years.at(-1)}.json`);
  let writes = 0;
  await assert.rejects(
    seedDecadeHubs(
      { selector: { kind: "all-reviewed" }, apply: true, artifactsDir: "/artifacts" },
      deps(files, async (sql) => { if (/INSERT|REPLACE/.test(sql)) writes += 1; return [] as never; }),
    ),
    /missing/i,
  );
  assert.equal(writes, 0);
});

test("apply binds payloads, verifies exact readback, and reports earlier changed rows on failure", async () => {
  const years = [1930, 1940];
  const files = fixture(years);
  const stored = new Map<string, string>();
  const query: SeedDependencies["query"] = async (sql, parameters = []) => {
    if (sql.includes("FROM meta")) return [{ max_year: "2025" }] as never;
    if (/INSERT|REPLACE/.test(sql)) { stored.set(String(parameters[0]), String(parameters[4])); return [] as never; }
    if (sql.includes("payload FROM decade_hub")) {
      const slug = String(parameters[0]);
      const payload = stored.get(slug);
      if (!payload) return [] as never;
      return [{ decade: slug, methodology_version: "decade-hub/v1.0.0", source_version: "ssa-national-2025", generated_at: "2026-08-14T00:00:00.000Z", payload: slug === "1940s" ? `${payload}x` : payload }] as never;
    }
    return [] as never;
  };
  await assert.rejects(
    seedDecadeHubs({ selector: { kind: "all-reviewed" }, apply: true, artifactsDir: "/artifacts" }, {
      ...deps(files, query),
      definitions: DECADE_HUB_DEFINITIONS.filter((item) => years.includes(item.startYear)),
    }),
    /1940s.*earlier rows changed: 1930s/i,
  );
});
