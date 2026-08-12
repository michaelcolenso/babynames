#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  buildDecadeProfileGeneric,
  createDecadeComputeConfig,
  evaluateSanityAnchors,
  stableStringify,
} from "../packages/shared/src/decade-hub-compute-core";
import type { DecadeHubSource } from "../packages/shared/src/decade-hub-compute-core";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import { DECADE_HUB_DEFINITIONS, getDecadeHubDefinition, type DecadeHubDefinition } from "../packages/shared/src/content/decade-hub-definitions";
import { resolveSource } from "./lib/decade-hub-source";
import type { LoadedSource, SourceResolutionOptions } from "./lib/decade-hub-source";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(REPO, "data/dist/decade-hubs");
const EMPTY_FAMILIES = "family_id,label,canonical,variant,review_status,rationale\n";

export type BuildSource = "d1" | "sqlite" | "zip" | "shards" | "auto";
export type BuildSelector = { kind: "all" } | { kind: "decade"; startYear: number };
export interface BuildArgs {
  selector: BuildSelector;
  source: BuildSource;
  sqlitePath?: string;
  zipPath?: string;
  outDir?: string;
  generatedAt?: string;
  allowValidationArtifacts: boolean;
}

function optionValue(arg: string, name: string): string | undefined {
  return arg.startsWith(`${name}=`) ? arg.slice(name.length + 1) : undefined;
}

export function parseBuildArgs(argv: string[]): BuildArgs {
  let selector: BuildSelector | undefined;
  let source: BuildSource = "auto";
  let sqlitePath: string | undefined;
  let zipPath: string | undefined;
  let outDir: string | undefined;
  let generatedAt: string | undefined;
  let allowValidationArtifacts = false;
  const seen = new Set<string>();
  for (const arg of argv) {
    if (arg === "--all") {
      if (selector) throw new Error("exactly one selector is required; --all conflicts with --decade");
      selector = { kind: "all" };
      continue;
    }
    const decade = optionValue(arg, "--decade");
    if (decade !== undefined) {
      if (selector) throw new Error("exactly one selector is required; selectors conflict");
      const match = /^(\d{4})s?$/.exec(decade);
      const startYear = match ? Number(match[1]) : NaN;
      if (!Number.isInteger(startYear) || startYear % 10 !== 0 || !DECADE_HUB_DEFINITIONS.some((d) => d.startYear === startYear)) throw new Error(`unknown decade selector: ${decade}`);
      selector = { kind: "decade", startYear };
      continue;
    }
    const sourceValue = optionValue(arg, "--source");
    if (sourceValue !== undefined) {
      if (seen.has("source")) throw new Error("duplicate option: --source");
      seen.add("source");
      if (!["d1", "sqlite", "zip", "shards", "auto"].includes(sourceValue)) throw new Error(`unknown source: ${sourceValue}`);
      source = sourceValue as BuildSource;
      continue;
    }
    const sqlite = optionValue(arg, "--sqlite");
    if (sqlite !== undefined) { if (seen.has("sqlite")) throw new Error("duplicate option: --sqlite"); seen.add("sqlite"); sqlitePath = sqlite; continue; }
    const zip = optionValue(arg, "--zip");
    if (zip !== undefined) { if (seen.has("zip")) throw new Error("duplicate option: --zip"); seen.add("zip"); zipPath = zip; continue; }
    const out = optionValue(arg, "--out");
    if (out !== undefined) { if (seen.has("out")) throw new Error("duplicate option: --out"); seen.add("out"); outDir = out; continue; }
    const at = optionValue(arg, "--generated-at");
    if (at !== undefined) {
      if (seen.has("generated-at")) throw new Error("duplicate option: --generated-at");
      seen.add("generated-at");
      if (!Number.isFinite(Date.parse(at))) throw new Error(`invalid --generated-at: ${at}`);
      generatedAt = at;
      continue;
    }
    if (arg === "--allow-validation-artifacts") { allowValidationArtifacts = true; continue; }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!selector) throw new Error("exactly one selector is required: --decade=YYYY or --all");
  if (sqlitePath && source !== "sqlite") throw new Error("--sqlite requires --source=sqlite");
  if (zipPath && source !== "zip") throw new Error("--zip requires --source=zip");
  if (source === "sqlite" && !sqlitePath) throw new Error("--source=sqlite requires --sqlite=PATH");
  return { selector, source, sqlitePath, zipPath, outDir, generatedAt, allowValidationArtifacts };
}

export function profileToSql(profile: DecadeProfile): string {
  const payload = stableStringify(profile).replace(/'/g, "''");
  return "INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(" +
    `'${profile.decade}s','${profile.methodologyVersion}','${profile.sourceVersion}','${profile.generatedAt}','${payload}');\n`;
}

function definitionsFor(selector: BuildSelector): DecadeHubDefinition[] {
  return selector.kind === "all" ? [...DECADE_HUB_DEFINITIONS] : [getDecadeHubDefinition(`${selector.startYear}s`)!];
}

async function readFamilyCsv(definition: DecadeHubDefinition): Promise<{ csv: string; status: string }> {
  const file = path.join(REPO, definition.familyFile);
  try {
    return { csv: await fs.readFile(file, "utf8"), status: "reviewed" };
  } catch (error) {
    if (definition.rolloutState !== "draft") throw new Error(`selected ${definition.slug} has no reviewed family file: ${definition.familyFile}`);
    return { csv: EMPTY_FAMILIES, status: "none-draft" };
  }
}

function canonicalBytes(profile: DecadeProfile): { profileSha256: string; payloadBytes: number } {
  const payload = stableStringify(profile);
  return { profileSha256: createHash("sha256").update(payload, "utf8").digest("hex"), payloadBytes: Buffer.byteLength(payload, "utf8") };
}

async function writeDurable(file: string, content: string): Promise<void> {
  const handle = await fs.open(file, "w");
  try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
}

export interface BuildResult {
  outputDir: string;
  manifest: Manifest;
}

export interface ManifestProfile {
  decade: number; slug: string; startYear: number; endYear: number; nominalEndYear: number; isComplete: boolean;
  methodologyVersion: string; sourceVersion: string; profileSha256: string; payloadBytes: number; familyStatus: string; validationOnly: boolean;
}
export interface Manifest {
  schemaVersion: 1; generatedAt: string;
  source: { type: string; label: string; sourceVersion: string; fingerprint: string; minYear: number; maxYear: number; validationOnly: boolean };
  validationOnly: boolean; profiles: ManifestProfile[];
}

export interface BuildHooks { beforeSwap?: () => void | Promise<void>; afterBackup?: () => void | Promise<void> }

export async function buildArtifacts(args: BuildArgs, sourceLoader: (options: SourceResolutionOptions) => Promise<LoadedSource> = resolveSource, hooks: BuildHooks = {}): Promise<BuildResult> {
  const source = await sourceLoader({ source: args.source, sqlitePath: args.sqlitePath, zipPath: args.zipPath });
  if (source.validationOnly && !args.allowValidationArtifacts) throw new Error(`source ${source.sourceLabel} is validation-only; pass --allow-validation-artifacts to write artifacts`);
  const definitions = definitionsFor(args.selector);
  const generatedAt = args.generatedAt ?? new Date().toISOString();
  const profiles: { definition: DecadeHubDefinition; profile: DecadeProfile; familyStatus: string }[] = [];
  for (const definition of definitions) {
    evaluateSanityAnchors(source.source, createDecadeComputeConfig({ ...definition }));
    const family = await readFamilyCsv(definition);
    const profile = buildDecadeProfileGeneric({ source: source.source, config: createDecadeComputeConfig({ ...definition }), familiesCsv: family.csv, generatedAt, sourceVersion: source.sourceVersion });
    profiles.push({ definition, profile, familyStatus: family.status });
  }
  const buildValidationOnly = source.validationOnly || profiles.some(({ definition, familyStatus }) => definition.rolloutState === "draft" || familyStatus !== "reviewed");
  const manifest: Manifest = {
    schemaVersion: 1, generatedAt,
    source: { type: source.sourceType, label: source.sourceLabel, sourceVersion: source.sourceVersion, fingerprint: source.fingerprint, minYear: source.source.minYear, maxYear: source.source.maxYear, validationOnly: source.validationOnly },
    validationOnly: buildValidationOnly,
    profiles: profiles.map(({ definition, profile, familyStatus }) => ({
      decade: profile.decade, slug: definition.slug, startYear: profile.startYear, endYear: profile.endYear, nominalEndYear: profile.nominalEndYear,
      isComplete: profile.isComplete, methodologyVersion: profile.methodologyVersion, sourceVersion: profile.sourceVersion,
      ...canonicalBytes(profile), familyStatus, validationOnly: source.validationOnly || definition.rolloutState === "draft" || familyStatus !== "reviewed",
    })),
  };
  const outputDir = path.resolve(args.outDir ?? DEFAULT_OUT);
  const parent = path.dirname(outputDir);
  await fs.mkdir(parent, { recursive: true });
  const tempDir = `${outputDir}.tmp-${process.pid}-${Date.now()}`;
  const backupDir = `${outputDir}.bak-${process.pid}-${Date.now()}`;
  try {
    await fs.mkdir(tempDir);
    for (const { profile } of profiles) {
      await writeDurable(path.join(tempDir, `decade-hub-${profile.decade}.json`), stableStringify(profile, true) + "\n");
      await writeDurable(path.join(tempDir, `decade-hub-${profile.decade}.sql`), profileToSql(profile));
    }
    await writeDurable(path.join(tempDir, "decade-hub-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    const existing = await fs.stat(outputDir).catch(() => undefined);
    if (existing && !existing.isDirectory()) throw new Error(`output path is not a directory: ${outputDir}`);
    if (existing) {
      const owned = await Promise.all([
        fs.readFile(path.join(outputDir, "decade-hub-manifest.json"), "utf8"),
        fs.readdir(outputDir),
      ]).then(([text, entries]: [string, string[]]) => {
        const value = JSON.parse(text) as Partial<Manifest>;
        if (value.schemaVersion !== 1 || !Array.isArray(value.profiles) || value.profiles.length === 0) return false;
        const expected = new Set(["decade-hub-manifest.json", ...value.profiles.flatMap((profile) => [`decade-hub-${profile.decade}.json`, `decade-hub-${profile.decade}.sql`])]);
        return entries.length === expected.size && entries.every((entry) => expected.has(entry));
      }).catch(() => false);
      if (!owned) throw new Error(`not a managed decade-hub output directory: ${outputDir}`);
      await hooks.beforeSwap?.();
      await fs.rename(outputDir, backupDir);
      await hooks.afterBackup?.();
    } else {
      await hooks.beforeSwap?.();
    }
    await fs.rename(tempDir, outputDir);
    if (existing) await fs.rm(backupDir, { recursive: true, force: true });
    return { outputDir, manifest };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    const backupExists = await fs.stat(backupDir).then(() => true).catch(() => false);
    const outputExists = await fs.stat(outputDir).then(() => true).catch(() => false);
    if (backupExists && !outputExists) await fs.rename(backupDir, outputDir).catch(() => undefined);
    throw error;
  }
}

/** Publish one managed build to the historical data/dist artifact paths. */
export async function publishLegacyArtifacts(managedDir: string, destinationDir: string, decade: number): Promise<void> {
  await fs.mkdir(destinationDir, { recursive: true });
  const copies = [
    { source: `decade-hub-${decade}.json`, target: `decade-hub-${decade}.json` },
    { source: `decade-hub-${decade}.sql`, target: `decade-hub-${decade}.sql` },
    { source: "decade-hub-manifest.json", target: `decade-hub-${decade}.manifest.json` },
  ];
  const staged: { temp: string; target: string }[] = [];
  try {
    for (const copy of copies) {
      const target = path.join(destinationDir, copy.target);
      const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
      await writeDurable(temp, await fs.readFile(path.join(managedDir, copy.source), "utf8"));
      staged.push({ temp, target });
    }
    for (const item of staged) await fs.rename(item.temp, item.target);
  } catch (error) {
    await Promise.all(staged.map(({ temp }) => fs.rm(temp, { force: true }).catch(() => undefined)));
    throw error;
  }
}

export async function runLegacyBuilder(
  decade: number,
  argv: string[],
  destinationDir = path.join(REPO, "data/dist"),
  sourceLoader: (options: SourceResolutionOptions) => Promise<LoadedSource> = resolveSource,
): Promise<BuildResult> {
  const explicitOut = argv.find((arg) => arg.startsWith("--out="));
  if (explicitOut) return buildArtifacts(parseBuildArgs([`--decade=${decade}`, ...argv]), sourceLoader);
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), `decade-hub-${decade}-`));
  const managedDir = path.join(stagingRoot, "artifacts");
  try {
    const result = await buildArtifacts(parseBuildArgs([`--decade=${decade}`, `--out=${managedDir}`, ...argv]), sourceLoader);
    await publishLegacyArtifacts(managedDir, destinationDir, decade);
    return { outputDir: destinationDir, manifest: result.manifest };
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseBuildArgs(argv);
  const result = await buildArtifacts(args);
  console.log(`built ${result.manifest.profiles.length} decade profile(s) in ${result.outputDir}`);
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exit(1); });

export { loadShardSource, loadZipSource, loadD1Source, loadSqliteSource, resolveSource } from "./lib/decade-hub-source";
