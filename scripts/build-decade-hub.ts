#!/usr/bin/env tsx
/** Compatibility 1980s builder and source API. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import { stableStringify } from "../packages/shared/src/decade-hub-compute";
import { runLegacyBuilder } from "./build-decade-hubs";

export type { LoadedSource, SourceResolutionOptions } from "./lib/decade-hub-source";
export { d1Query, D1IntegrityError, loadShardSource, loadZipSource, loadD1Source, loadSqliteSource, readLiveFingerprint, resolveSource } from "./lib/decade-hub-source";

export function profileToSql(profile: DecadeProfile): string {
  const payload = stableStringify(profile).replace(/'/g, "''");
  return "INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(" +
    `'${profile.decade}s','${profile.methodologyVersion}','${profile.sourceVersion}','${profile.generatedAt}','${payload}');\n`;
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) {
  runLegacyBuilder(1980, process.argv.slice(2)).then((result) => {
    console.log(`built 1980s profile in ${result.outputDir}`);
  }).catch((error) => { console.error(error); process.exit(1); });
}
