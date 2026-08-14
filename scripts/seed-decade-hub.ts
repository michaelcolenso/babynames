#!/usr/bin/env tsx
// Validates and optionally seeds reviewed decade-hub artifacts into live D1.
// Dry-run is the default. Writes require the explicit --apply flag.

import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableStringify } from "../packages/shared/src/decade-hub-compute-core";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import { validateDecadeHubProfile, type DecadeHubValidationResult } from "../packages/shared/src/decade-hub-validate";
import {
  DECADE_HUB_DEFINITIONS,
  type DecadeHubDefinition,
} from "../packages/shared/src/content/decade-hub-definitions";
import type { Manifest, ManifestProfile } from "./build-decade-hubs";
import { d1Query } from "./build-decade-hub";

const REPO = path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_ARTIFACTS = path.join(REPO, "data/dist/decade-hubs");

export type SeedSelector = { kind: "decade"; startYear: number } | { kind: "all-reviewed" };
export interface SeedArgs { selector: SeedSelector; apply: boolean; artifactsDir?: string }
export type SeedQuery = <T = Record<string, unknown>>(sql: string, parameters?: string[]) => Promise<T[]>;
export interface SeedDependencies {
  readFile: (file: string) => Promise<string>;
  query: SeedQuery;
  validateProfile: (value: unknown, definition: DecadeHubDefinition) => DecadeHubValidationResult;
  log: (message: string) => void;
  definitions?: readonly DecadeHubDefinition[];
}

interface ExistingRow {
  decade: string;
  methodology_version: string;
  source_version: string;
  generated_at: string;
  payload: string;
}

interface PreparedSeed {
  definition: DecadeHubDefinition;
  profile: DecadeProfile;
  payload: string;
  manifest: ManifestProfile;
  existing?: ExistingRow;
}

export interface SeedReport {
  candidates: Array<{ slug: string; bytes: number; changed: boolean }>;
  changed: string[];
  cachePaths: string[];
}

export function parseSeedArgs(argv: string[]): SeedArgs {
  let selector: SeedSelector | undefined;
  let apply = false;
  let applySeen = false;
  let artifactsDir: string | undefined;
  for (const arg of argv) {
    if (arg === "--all-reviewed") {
      if (selector) throw new Error("selector conflict: choose exactly one of --decade or --all-reviewed");
      selector = { kind: "all-reviewed" };
      continue;
    }
    if (arg.startsWith("--decade=")) {
      if (selector) throw new Error("selector conflict: choose exactly one of --decade or --all-reviewed");
      const match = /^(\d{4})$/.exec(arg.slice("--decade=".length));
      const startYear = match ? Number(match[1]) : NaN;
      if (!DECADE_HUB_DEFINITIONS.some((definition) => definition.startYear === startYear)) throw new Error(`unknown decade selector: ${arg}`);
      selector = { kind: "decade", startYear };
      continue;
    }
    if (arg === "--apply") {
      if (applySeen) throw new Error("duplicate option: --apply");
      applySeen = true;
      apply = true;
      continue;
    }
    if (arg.startsWith("--artifacts=")) {
      if (artifactsDir !== undefined) throw new Error("duplicate option: --artifacts");
      artifactsDir = arg.slice("--artifacts=".length);
      if (!artifactsDir) throw new Error("--artifacts requires a path");
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }
  if (!selector) throw new Error("exactly one selector is required: --decade=YYYY or --all-reviewed");
  return { selector, apply, artifactsDir };
}

function sourceYear(version: string, label: string): number {
  const year = Number(/(\d{4})$/.exec(version)?.[1] ?? NaN);
  if (!Number.isFinite(year)) throw new Error(`cannot read a vintage year from ${label} ${version}`);
  return year;
}

function cachePaths(slug: string): string[] {
  const root = `/names/${slug}/`;
  return [root, `${root}methodology/`, `${root}classroom/`, `${root}spelling-families/`];
}

function assertManifestProfile(entry: ManifestProfile, definition: DecadeHubDefinition, profile: DecadeProfile, payload: string, manifestSourceVersion: string, sourceMaxYear: number): void {
  const expectedEnd = Math.min(definition.nominalEndYear, sourceMaxYear);
  const expectedComplete = expectedEnd === definition.nominalEndYear;
  if (profile.decade !== definition.startYear || profile.startYear !== definition.startYear || profile.endYear !== expectedEnd || profile.isComplete !== expectedComplete) {
    throw new Error(`${definition.slug} coverage mismatch: expected ${definition.startYear}-${expectedEnd} complete=${expectedComplete}`);
  }
  if (profile.sourceVersion !== definition.thesisSourceVersion) throw new Error(`${definition.slug} thesis/source mismatch: ${profile.sourceVersion} != ${definition.thesisSourceVersion}`);
  if (profile.sourceVersion !== manifestSourceVersion) throw new Error(`${definition.slug} source/manifest mismatch: ${profile.sourceVersion} != ${manifestSourceVersion}`);
  if (entry.slug !== definition.slug || entry.decade !== definition.startYear || entry.startYear !== definition.startYear || entry.nominalEndYear !== definition.nominalEndYear || entry.endYear !== expectedEnd || entry.isComplete !== expectedComplete) {
    throw new Error(`${definition.slug} manifest coverage mismatch`);
  }
  if (entry.sourceVersion !== profile.sourceVersion || entry.methodologyVersion !== profile.methodologyVersion) throw new Error(`${definition.slug} manifest/profile provenance mismatch`);
  if (entry.validationOnly) throw new Error(`${definition.slug} is a validation-only artifact and cannot be seeded`);
  if (entry.familyStatus !== "reviewed") throw new Error(`${definition.slug} manifest family status must be reviewed, got ${entry.familyStatus}`);
  const hash = createHash("sha256").update(payload, "utf8").digest("hex");
  const bytes = Buffer.byteLength(payload, "utf8");
  if (entry.profileSha256 !== hash) throw new Error(`${definition.slug} profile hash mismatch`);
  if (entry.payloadBytes !== bytes) throw new Error(`${definition.slug} payload byte count mismatch`);
}

async function prepareAll(args: SeedArgs, deps: SeedDependencies): Promise<{ manifest: Manifest; prepared: PreparedSeed[] }> {
  const artifactsDir = path.resolve(args.artifactsDir ?? DEFAULT_ARTIFACTS);
  const manifest = JSON.parse(await deps.readFile(path.join(artifactsDir, "decade-hub-manifest.json"))) as Manifest;
  if (manifest.schemaVersion !== 1) throw new Error(`unsupported manifest schema: ${String(manifest.schemaVersion)}`);
  if (manifest.validationOnly || manifest.source.validationOnly) throw new Error("validation-only manifests cannot be seeded");
  const definitions = deps.definitions ?? DECADE_HUB_DEFINITIONS;
  const selected = args.selector.kind === "all-reviewed"
    ? definitions.filter((definition) => definition.rolloutState !== "draft")
    : definitions.filter((definition) => definition.startYear === (args.selector as { kind: "decade"; startYear: number }).startYear);
  if (selected.length === 0) throw new Error("selected decade is not present in the active definition set");
  if (selected.some((definition) => definition.rolloutState === "draft")) throw new Error("draft definitions cannot be seeded");

  const prepared: PreparedSeed[] = [];
  for (const definition of selected) {
    const entry = manifest.profiles.find((item) => item.slug === definition.slug);
    if (!entry) throw new Error(`missing manifest entry for ${definition.slug}`);
    const parsed = JSON.parse(await deps.readFile(path.join(artifactsDir, `decade-hub-${definition.startYear}.json`))) as unknown;
    const validation = deps.validateProfile(parsed, definition);
    if (!validation.ok) throw new Error(`${definition.slug} artifact validation failed: ${validation.issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
    const payload = stableStringify(validation.profile);
    assertManifestProfile(entry, definition, validation.profile, payload, manifest.source.sourceVersion, manifest.source.maxYear);
    prepared.push({ definition, profile: validation.profile, payload, manifest: entry });
  }
  return { manifest, prepared };
}

export async function seedDecadeHubs(args: SeedArgs, deps: SeedDependencies): Promise<SeedReport> {
  // Deliberately complete every local artifact check before the first D1 request.
  const { manifest, prepared } = await prepareAll(args, deps);
  const [dbVintage] = await deps.query<{ max_year: string }>("SELECT value AS max_year FROM meta WHERE key = 'max_year'");
  const rawDbYear: unknown = dbVintage?.max_year;
  if (typeof rawDbYear !== "string" || !/^\d{4}$/.test(rawDbYear)) throw new Error("D1 meta.max_year is missing or invalid");
  const dbYear = Number(rawDbYear);
  const artifactYear = sourceYear(manifest.source.sourceVersion, "manifest sourceVersion");
  if (Number.isFinite(dbYear) && artifactYear < dbYear) throw new Error(`refusing stale artifacts: ${manifest.source.sourceVersion} is older than D1 max_year ${dbYear}`);

  for (const candidate of prepared) {
    const [existing] = await deps.query<ExistingRow>(
      "SELECT decade, methodology_version, source_version, generated_at, payload FROM decade_hub WHERE decade = ?1",
      [candidate.definition.slug],
    );
    candidate.existing = existing;
    if (existing && sourceYear(candidate.profile.sourceVersion, "artifact sourceVersion") < sourceYear(existing.source_version, "live sourceVersion")) {
      throw new Error(`refusing to downgrade ${candidate.definition.slug}: ${candidate.profile.sourceVersion} < ${existing.source_version}`);
    }
  }

  const candidates = prepared.map((candidate) => ({
    slug: candidate.definition.slug,
    bytes: Buffer.byteLength(candidate.payload, "utf8"),
    changed: candidate.existing?.payload !== candidate.payload,
  }));
  for (const candidate of candidates) deps.log(`${candidate.slug}: ${candidate.changed ? "candidate change" : "already exact"} (${candidate.bytes} bytes)`);
  if (!args.apply) {
    deps.log("dry run — no rows written; pass --apply to write after review");
    return { candidates, changed: [], cachePaths: [] };
  }

  const changed: string[] = [];
  try {
    for (const candidate of prepared) {
      if (candidate.existing?.payload === candidate.payload) continue;
      const slug = candidate.definition.slug;
      await deps.query(
        "INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(?1,?2,?3,?4,?5)",
        [slug, candidate.profile.methodologyVersion, candidate.profile.sourceVersion, candidate.profile.generatedAt, candidate.payload],
      );
      const [after] = await deps.query<ExistingRow>(
        "SELECT decade, methodology_version, source_version, generated_at, payload FROM decade_hub WHERE decade = ?1",
        [slug],
      );
      if (!after || after.decade !== slug || after.methodology_version !== candidate.profile.methodologyVersion || after.source_version !== candidate.profile.sourceVersion || after.generated_at !== candidate.profile.generatedAt || after.payload !== candidate.payload) {
        throw new Error(`${slug} exact readback verification failed`);
      }
      changed.push(slug);
      deps.log(`seeded ${slug}: exact readback verified`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}; earlier rows changed: ${changed.join(", ") || "none"}`);
  }
  const paths = changed.flatMap(cachePaths);
  if (paths.length) deps.log(`cache purge paths:\n${paths.join("\n")}`);
  return { candidates, changed, cachePaths: paths };
}

async function main(): Promise<void> {
  const args = parseSeedArgs(process.argv.slice(2));
  await seedDecadeHubs(args, {
    readFile: (file) => fs.readFile(file, "utf8"),
    query: d1Query,
    validateProfile: validateDecadeHubProfile,
    log: (message) => console.error(message),
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
