import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { stableStringify, type DecadeHubSource } from "../packages/shared/src/decade-hub-compute-core";
import {
  buildArtifacts,
  parseBuildArgs,
  publishLegacyArtifacts,
  runLegacyBuilder,
  type BuildArgs,
} from "./build-decade-hubs";
import {
  D1IntegrityError,
  loadSqliteSource,
  resolveSourceWithLoaders,
  sourceFingerprint,
  sourceYearBounds,
  type LoadedSource,
} from "./lib/decade-hub-source";

const FIXED_TIME = "2026-01-01T00:00:00.000Z";

const nodeVersion = (globalThis as { process?: { versions?: { node?: string } } }).process?.versions?.node ?? "0";
const sqliteSkip = Number.parseInt(nodeVersion.split(".")[0] ?? "0", 10) >= 22
  ? false
  : "requires node:sqlite (Node 22+)";

function sourceThrough(maxYear = 2025, validationOnly = false): LoadedSource {
  const female: Record<number, number> = {};
  const male: Record<number, number> = {};
  const emma: Record<number, number> = {};
  const liam: Record<number, number> = {};
  for (let year = 1880; year <= maxYear; year++) {
    female[year] = year >= 2010 && year <= 2019 ? 1_840_000 : year >= 2020 ? 1_650_000 : 10_000;
    male[year] = year >= 2010 && year <= 2019 ? 1_840_000 : year >= 2020 ? 1_650_000 : 11_000;
    if (year >= 2010 && year <= 2019) emma[year] = 19_507;
    if (year >= 2020) liam[year] = 20_807;
  }
  const source: DecadeHubSource = {
    minYear: 1880,
    maxYear,
    records: [
      { name: "Ava", sex: "F", series: female },
      { name: "Adam", sex: "M", series: male },
      { name: "Emma", sex: "F", series: emma },
      { name: "Liam", sex: "M", series: liam },
    ],
  };
  return {
    source,
    sourceVersion: `ssa-national-${maxYear}`,
    sourceLabel: "test source",
    sourceType: validationOnly ? "shards" : "sqlite",
    fingerprint: `fixture-${maxYear}`,
    validationOnly,
  };
}

function args(outDir: string, startYear = 2020): BuildArgs {
  return {
    selector: { kind: "decade", startYear },
    source: "sqlite",
    sqlitePath: "/unused",
    outDir,
    generatedAt: FIXED_TIME,
    allowValidationArtifacts: true,
  };
}

async function tempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("build parser accepts exactly one decade selector and source", () => {
  assert.deepEqual(parseBuildArgs(["--decade=1930s", "--source=sqlite", "--sqlite=/tmp/names.sqlite"]), {
    selector: { kind: "decade", startYear: 1930 }, source: "sqlite", sqlitePath: "/tmp/names.sqlite",
    zipPath: undefined, outDir: undefined, generatedAt: undefined, allowValidationArtifacts: false,
  });
});

test("build parser rejects selector conflicts, unknown options, and duplicate singleton options", () => {
  assert.throws(() => parseBuildArgs(["--all", "--decade=1930"]), /exactly one selector/i);
  assert.throws(() => parseBuildArgs(["--decade=1930", "--wat"]), /unknown option/i);
  for (const duplicate of [
    ["--source=d1", "--source=shards"],
    ["--sqlite=a", "--sqlite=b"],
    ["--zip=a", "--zip=b"],
    ["--out=a", "--out=b"],
    ["--generated-at=2025-01-01T00:00:00Z", "--generated-at=2026-01-01T00:00:00Z"],
  ]) {
    assert.throws(() => parseBuildArgs(["--decade=1930", ...duplicate]), /duplicate option/i);
  }
});

test("validation-only sources require an explicit write override", async () => {
  const root = await tempDir("decade-refusal-");
  const out = path.join(root, "out");
  await assert.rejects(
    () => buildArtifacts({ ...args(out), source: "shards", allowValidationArtifacts: false }, async () => sourceThrough(2025, true)),
    /validation-only.*allow-validation-artifacts/i,
  );
  await assert.rejects(() => fs.stat(out), /ENOENT/);
});

test("current-source reviewed build loads once and emits honest partial coverage", async () => {
  const root = await tempDir("decade-current-draft-");
  const out = path.join(root, "out");
  let loads = 0;
  const result = await buildArtifacts(args(out), async () => { loads += 1; return sourceThrough(); });
  assert.equal(loads, 1);
  assert.equal(result.manifest.source.validationOnly, false);
  assert.equal(result.manifest.validationOnly, false);
  assert.equal(result.manifest.profiles.length, 1);
  const entry = result.manifest.profiles[0]!;
  assert.equal(entry.slug, "2020s");
  assert.equal(entry.endYear, 2025);
  assert.equal(entry.nominalEndYear, 2029);
  assert.equal(entry.isComplete, false);
  assert.equal(entry.familyStatus, "reviewed");
  const profile = JSON.parse(await fs.readFile(path.join(out, "decade-hub-2020.json"), "utf8"));
  assert.equal(profile.spellingFamilies.length, 0);
  assert.equal(profile.spellingFamilies.every((family: { yearly: unknown[] }) => family.yearly.length === 6), true);
  const compact = stableStringify(profile);
  assert.equal(entry.payloadBytes, Buffer.byteLength(compact, "utf8"));
  assert.equal(entry.profileSha256, createHash("sha256").update(compact).digest("hex"));
  const sql = await fs.readFile(path.join(out, "decade-hub-2020.sql"), "utf8");
  assert.match(sql, /source_fingerprint/);
  assert.match(sql, /fixture-2025/);
});

test("a late pre-swap failure leaves an existing managed destination byte-identical", async () => {
  const root = await tempDir("decade-atomic-");
  const out = path.join(root, "out");
  await buildArtifacts(args(out), async () => sourceThrough());
  const before = new Map<string, string>();
  for (const name of await fs.readdir(out)) before.set(name, await fs.readFile(path.join(out, name), "utf8"));
  await assert.rejects(
    () => buildArtifacts(args(out, 2010), async () => sourceThrough(), { afterBackup: () => { throw new Error("injected late failure"); } }),
    /injected late failure/,
  );
  assert.deepEqual(await fs.readdir(out), [...before.keys()]);
  for (const [name, content] of before) assert.equal(await fs.readFile(path.join(out, name), "utf8"), content);
  const siblings = await fs.readdir(root);
  assert.equal(siblings.some((name) => name.includes(".tmp-") || name.includes(".bak-")), false);
});

test("replacement rejects a directory without a valid managed manifest", async () => {
  const root = await tempDir("decade-owned-");
  const out = path.join(root, "out");
  await fs.mkdir(out);
  await fs.writeFile(path.join(out, "decade-hub-2020.json"), "forged\n");
  await assert.rejects(() => buildArtifacts(args(out), async () => sourceThrough()), /not a managed decade-hub output/i);
  assert.equal(await fs.readFile(path.join(out, "decade-hub-2020.json"), "utf8"), "forged\n");
});

async function createSqliteFixture(options: { orphanName?: boolean; missingTotal?: boolean; missingBounds?: boolean; laggingNameTotal?: boolean } = {}): Promise<string> {
  const root = await tempDir("decade-sqlite-");
  const file = path.join(root, "source.sqlite");
  const moduleName = "node:sqlite";
  const { DatabaseSync } = await import(moduleName) as { DatabaseSync: new (file: string) => any };
  const db = new DatabaseSync(file);
  try {
    db.exec(`
      CREATE TABLE names(id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lower TEXT NOT NULL, sex TEXT NOT NULL, first_year INTEGER NOT NULL, last_year INTEGER NOT NULL, peak_year INTEGER NOT NULL, peak_count INTEGER NOT NULL, total_count INTEGER NOT NULL);
      CREATE TABLE name_years(name_id INTEGER NOT NULL, year INTEGER NOT NULL, count INTEGER NOT NULL);
      CREATE TABLE year_totals(year INTEGER NOT NULL, sex TEXT NOT NULL, total INTEGER NOT NULL);
      CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO names VALUES(1,'Ada','ada','F',2020,2021,2021,20,${options.laggingNameTotal ? 25 : 30});
      INSERT INTO names VALUES(2,'Adam','adam','M',2020,2021,2021,25,40);
      INSERT INTO name_years VALUES(1,2020,10),(1,2021,20),(2,2020,15),(2,2021,25);
      INSERT INTO year_totals VALUES(2020,'F',10),(2021,'F',20),(2020,'M',15)${options.missingTotal ? "" : ",(2021,'M',25)"};
      INSERT INTO meta VALUES('data_version','fixture-v1');
      ${options.missingBounds ? "" : "INSERT INTO meta VALUES('min_year','2020'),('max_year','2021');"}
      ${options.orphanName ? "INSERT INTO names VALUES(3,'Amy','amy','F',2020,2020,2020,5,5);" : ""}
    `);
  } finally {
    db.close();
  }
  return file;
}

test("source fingerprints distinguish equal aggregates with different yearly distributions", () => {
  const ids = new Map([["Ada|F", 1], ["Adam|M", 2]]);
  const first = sourceFingerprint("v1", [
    { name: "Ada", sex: "F", series: { 2020: 10, 2021: 20 } },
    { name: "Adam", sex: "M", series: { 2020: 15, 2021: 25 } },
  ], ids);
  const second = sourceFingerprint("v1", [
    { name: "Ada", sex: "F", series: { 2020: 20, 2021: 10 } },
    { name: "Adam", sex: "M", series: { 2020: 25, 2021: 15 } },
  ], ids);
  assert.notEqual(first, second);
  assert.equal(first.split("|sha256:")[0], second.split("|sha256:")[0]);
});

test("auto source resolution never falls back after an integrity failure", async () => {
  let fallbacks = 0;
  await assert.rejects(
    () => resolveSourceWithLoaders({ source: "auto" }, {
      d1: async () => { throw new D1IntegrityError("torn scan"); },
      zip: async () => { fallbacks += 1; return sourceThrough(); },
      shards: async () => { fallbacks += 1; return sourceThrough(2017, true); },
      localZip: async () => undefined,
    }),
    /torn scan/,
  );
  assert.equal(fallbacks, 0);
});

test("source year bounds are iterative and safe for production-sized row counts", () => {
  const series = Object.fromEntries(Array.from({ length: 150_000 }, (_, index) => [1880 + index, 1]));
  assert.deepEqual(sourceYearBounds([{ name: "Scale", sex: "F", series }]), { minYear: 1880, maxYear: 151_879 });
});

test("SQLite source loader validates complete tables and emits the D1-compatible source identity", { skip: sqliteSkip }, async () => {
  const source = await loadSqliteSource(await createSqliteFixture());
  assert.equal(source.sourceVersion, "ssa-national-2021");
  assert.equal(source.source.records.length, 2);
  assert.match(source.fingerprint, /^fixture-v1\|2\|70\|110\|sha256:[a-f0-9]{64}$/);
});

test("SQLite source loader accepts a lagging names rollup while using granular rows", { skip: sqliteSkip }, async () => {
  const source = await loadSqliteSource(await createSqliteFixture({ laggingNameTotal: true }));
  assert.equal(source.source.records[0]!.series[2021], 20);
});

test("SQLite source loader rejects orphaned names, missing totals, and missing coverage metadata", { skip: sqliteSkip }, async () => {
  for (const [fixture, message] of [
    [{ orphanName: true }, /names row.*without name_years/i],
    [{ missingTotal: true }, /missing year_totals/i],
    [{ missingBounds: true }, /meta\.(?:min_year|max_year)/i],
  ] as const) {
    const sqlitePath = await createSqliteFixture(fixture);
    await assert.rejects(() => loadSqliteSource(sqlitePath), (error: unknown) => error instanceof D1IntegrityError && message.test(error.message));
  }
});

test("legacy wrapper stages into a child path and publishes historical root files", async () => {
  const root = await tempDir("decade-wrapper-");
  await runLegacyBuilder(2020, ["--source=sqlite", "--sqlite=/unused", `--generated-at=${FIXED_TIME}`], root, async () => sourceThrough());
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "decade-hub-2020.json"), "utf8")).decade, 2020);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "decade-hub-2020.manifest.json"), "utf8")).profiles[0].decade, 2020);
});

test("legacy publication atomically updates the root JSON, SQL, and manifest", async () => {
  const root = await tempDir("decade-legacy-");
  const managed = path.join(root, "managed");
  await buildArtifacts(args(managed), async () => sourceThrough());
  await publishLegacyArtifacts(managed, root, 2020);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "decade-hub-2020.json"), "utf8")).decade, 2020);
  assert.match(await fs.readFile(path.join(root, "decade-hub-2020.sql"), "utf8"), /'2020s'/);
  assert.equal(JSON.parse(await fs.readFile(path.join(root, "decade-hub-2020.manifest.json"), "utf8")).profiles[0].decade, 2020);
});
