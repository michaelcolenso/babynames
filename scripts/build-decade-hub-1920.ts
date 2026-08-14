#!/usr/bin/env tsx
/** Compatibility 1920s builder. */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runLegacyBuilder } from "./build-decade-hubs";

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedAs === fileURLToPath(import.meta.url)) {
  runLegacyBuilder(1920, process.argv.slice(2)).then((result) => {
    console.log(`built 1920s profile in ${result.outputDir}`);
  }).catch((error) => { console.error(error); process.exit(1); });
}
