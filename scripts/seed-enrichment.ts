#!/usr/bin/env tsx
// Applies the generated enrichment SQL to D1.
//
// Usage:
//   npm run seed-enrichment           # remote D1
//   npm run seed-enrichment:local     # local (wrangler) D1
//
// The SQL is a single idempotent transaction (DELETE + INSERT) produced by
// scripts/build-enrichment.ts, so re-running is safe.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const SQL_FILE = path.join(REPO, "data/dist/enrichment.sql");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");
const DB_NAME = "nobodynamed";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

if (!fs.existsSync(SQL_FILE)) {
  console.error(`Missing ${path.relative(process.cwd(), SQL_FILE)} — run "npm run build-enrichment" first.`);
  process.exit(1);
}

const wranglerArgs = [
  "wrangler",
  "d1",
  "execute",
  DB_NAME,
  "--config",
  CONFIG,
  "--file",
  SQL_FILE,
  target,
  "--yes",
];

console.error(`Applying ${path.relative(process.cwd(), SQL_FILE)} to ${DB_NAME} (${target}) …`);
const res = spawnSync("npx", wranglerArgs, { stdio: "inherit", cwd: REPO });
process.exit(res.status ?? 1);
