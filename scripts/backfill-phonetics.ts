#!/usr/bin/env tsx
import { execSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { getPhoneticKey } from "../packages/shared/src/phonetic";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const OUT_FILE = path.join(REPO, "migrations/backfill_phonetics.sql");

async function main() {
  const remote = process.argv.includes("--remote");
  const dbFlag = remote ? "--remote" : "--local";

  console.log(`Fetching names from D1 (${dbFlag}) ...`);
  const cmd = `npx wrangler d1 execute name-vitals ${dbFlag} --config apps/web/wrangler.toml --json --command "SELECT id, name FROM names WHERE phonetic_code IS NULL"`;
  
  let output: string;
  try {
    output = execSync(cmd, { encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
  } catch (err) {
    console.error("Failed to fetch names from D1:", err);
    process.exit(1);
  }

  // Parse JSON results from wrangler execution output
  let rows: { id: number; name: string }[] = [];
  try {
    // wrangler output might contain startup logs, so find the JSON array block
    const startIdx = output.indexOf("[");
    const endIdx = output.lastIndexOf("]") + 1;
    if (startIdx === -1 || endIdx === -1) {
      console.log("No unbackfilled names found or invalid wrangler response.");
      return;
    }
    const jsonStr = output.slice(startIdx, endIdx);
    const parsed = JSON.parse(jsonStr);
    rows = parsed[0]?.results ?? parsed;
  } catch (err) {
    console.error("Failed to parse wrangler JSON output:", err);
    console.log("Raw output was:", output);
    process.exit(1);
  }

  if (!rows || rows.length === 0) {
    console.log("All names already have phonetic codes. Nothing to backfill!");
    return;
  }

  console.log(`Found ${rows.length} names to backfill. Generating SQL statements ...`);

  const sqlLines: string[] = ["BEGIN;"];
  for (const row of rows) {
    const key = getPhoneticKey(row.name);
    const safeKey = key.replace(/'/g, "''");
    sqlLines.push(`UPDATE names SET phonetic_code = '${safeKey}' WHERE id = ${row.id};`);
  }
  sqlLines.push("COMMIT;");

  await fs.writeFile(OUT_FILE, sqlLines.join("\n") + "\n", "utf8");
  console.log(`Wrote SQL updates to ${OUT_FILE}`);
  console.log(`\nApply with:`);
  console.log(`  npx wrangler d1 execute name-vitals ${dbFlag} --config apps/web/wrangler.toml --file=${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
