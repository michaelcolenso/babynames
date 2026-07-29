#!/usr/bin/env tsx
// Seeds the `decade_hub` row from the artifact that scripts/build-decade-hub.ts
// wrote. Repo owner only — this is a write against the live D1 database.
//
// Why this exists rather than `wrangler d1 execute --file=`:
// data/dist/decade-hub-1980.sql inlines the ~840 KB payload as a single SQL
// string literal, and D1 rejects the statement with SQLITE_TOOBIG (the limit is
// on the SQL text, not on the stored value). Binding the payload as a query
// parameter keeps the statement short and stores the identical bytes.
//
// Usage:
//   npx tsx scripts/seed-decade-hub.ts            # print what would change
//   npx tsx scripts/seed-decade-hub.ts --apply    # write it
//
// Reads CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN, same as --source=d1.

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { stableStringify } from "../packages/shared/src/decade-hub-compute";
import type { DecadeProfile } from "../packages/shared/src/decade-hub-types";
import { d1Query } from "./build-decade-hub";

const REPO = path.resolve(import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(REPO, "data/dist/decade-hub-1980.json");

interface ExistingRow {
  decade: string;
  methodology_version: string;
  source_version: string;
  generated_at: string;
  bytes: number;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const profile = JSON.parse(await fs.readFile(ARTIFACT, "utf8")) as DecadeProfile;
  // re-serialize with the build's stable key order so the stored bytes match
  // the artifact exactly, whatever order the parsed object happens to hold
  const payload = stableStringify(profile);
  const decade = `${profile.decade}s`;

  const [before] = await d1Query<ExistingRow>(
    "SELECT decade, methodology_version, source_version, generated_at, length(payload) AS bytes FROM decade_hub WHERE decade = ?1",
    [decade],
  );
  console.error(
    before
      ? `current row: ${before.decade} ${before.source_version} generated ${before.generated_at} (${before.bytes} bytes)`
      : `current row: none for ${decade}`,
  );
  console.error(
    `artifact:    ${decade} ${profile.sourceVersion} generated ${profile.generatedAt} (${payload.length} bytes)`,
  );

  // Refuse to downgrade. `resolveSource()` deliberately falls back to the
  // frozen 2017 shards when D1 credentials and both zip sources are all
  // unavailable, so an offline build leaves a stale artifact on disk that looks
  // exactly like a fresh one. Without this check, seeding it would quietly
  // replace a newer production row with a shard payload the guide says must
  // never ship.
  if (before) {
    const vintage = (v: string) => Number(/(\d{4})$/.exec(v)?.[1] ?? NaN);
    const artifactYear = vintage(profile.sourceVersion);
    const liveYear = vintage(before.source_version);
    if (!Number.isFinite(artifactYear) || !Number.isFinite(liveYear)) {
      throw new Error(
        `cannot compare vintages (artifact ${profile.sourceVersion}, live ${before.source_version}); rebuild or seed by hand`,
      );
    }
    if (artifactYear < liveYear) {
      throw new Error(
        `refusing to downgrade ${decade}: artifact is ${profile.sourceVersion} but the live row is ${before.source_version}. ` +
          "Rebuild with `--source=d1` (or a current SSA zip) — an offline build falls back to the 2017 shards.",
      );
    }
    if (artifactYear === liveYear && profile.generatedAt < before.generated_at) {
      console.error(
        `note: same vintage as the live row, but this artifact is older (${profile.generatedAt} < ${before.generated_at}).`,
      );
    }
  }

  if (!apply) {
    console.error("\ndry run — pass --apply to write this row.");
    return;
  }

  await d1Query(
    "INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(?1,?2,?3,?4,?5)",
    [decade, profile.methodologyVersion, profile.sourceVersion, profile.generatedAt, payload],
  );

  const [after] = await d1Query<ExistingRow>(
    "SELECT decade, methodology_version, source_version, generated_at, length(payload) AS bytes FROM decade_hub WHERE decade = ?1",
    [decade],
  );
  if (!after || after.source_version !== profile.sourceVersion || after.bytes !== payload.length) {
    throw new Error(`seed verification failed: read back ${JSON.stringify(after)}`);
  }
  console.error(`\nseeded ${decade}: ${after.source_version} (${after.bytes} bytes) — verified`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
