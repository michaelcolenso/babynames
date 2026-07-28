#!/usr/bin/env tsx
// Applies the generated name-facts SQL to D1.
//
// Usage:
//   npm run seed-name-facts           # remote D1
//   npm run seed-name-facts:local     # local (wrangler) D1
//
// The SQL is a single idempotent transaction (DELETE + INSERT) produced by
// scripts/build-name-facts.ts, so re-running is safe. It also stamps
// meta.facts_version from the live meta.data_version, which is what
// scripts/verify-name-facts.ts checks for drift.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const SQL_FILE = path.join(REPO, "data/dist/name-facts.sql");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");
// Must match `database_name` in apps/web/wrangler.toml.
const DB_NAME = "name-vitals";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

if (!fs.existsSync(SQL_FILE)) {
  console.error(
    `Missing ${path.relative(process.cwd(), SQL_FILE)} — run "npm run build-name-facts" first.`,
  );
  process.exit(1);
}

console.error(`Applying ${path.relative(process.cwd(), SQL_FILE)} to ${DB_NAME} (${target}) …`);
const res = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", DB_NAME, "--config", CONFIG, "--file", SQL_FILE, target, "--yes"],
  { stdio: "inherit", cwd: REPO },
);
process.exit(res.status ?? 1);
