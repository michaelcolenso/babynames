#!/usr/bin/env tsx
/** Compatibility 1980s builder and source API. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLegacyBuilder } from "./build-decade-hubs";

export type { LoadedSource, SourceResolutionOptions } from "./lib/decade-hub-source";
export { d1Query, D1IntegrityError, loadShardSource, loadZipSource, loadD1Source, loadSqliteSource, readLiveFingerprint, resolveSource } from "./lib/decade-hub-source";
export { profileToSql } from "./build-decade-hubs";

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) {
  runLegacyBuilder(1980, process.argv.slice(2)).then((result) => {
    console.log(`built 1980s profile in ${result.outputDir}`);
  }).catch((error) => { console.error(error); process.exit(1); });
}
