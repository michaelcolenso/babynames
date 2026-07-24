#!/usr/bin/env tsx
// Applies the generated shadow-matches SQL to D1.
//
// Usage:
//   npm run seed-shadow-matches           # remote D1
//   npm run seed-shadow-matches:local     # local (wrangler) D1
//
// The SQL is a single idempotent batch (DELETE + INSERT + staging swap)
// produced by scripts/build-shadow-matches.ts, so re-running is safe.

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const SQL_FILE = path.join(REPO, "data/dist/shadow-matches.sql");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

function dbName(): string {
  const toml = readFileSync(CONFIG, "utf-8");
  const m = toml.match(/database_name\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`Could not find database_name in ${CONFIG}`);
  return m[1]!;
}

if (!existsSync(SQL_FILE)) {
  console.error(`Missing ${path.relative(process.cwd(), SQL_FILE)} — run "npm run build-shadow-matches" first.`);
  process.exit(1);
}

const wranglerArgs = [
  "wrangler",
  "d1",
  "execute",
  dbName(),
  "--config",
  CONFIG,
  "--file",
  SQL_FILE,
  target,
  "--yes",
];

console.error(`Applying ${path.relative(process.cwd(), SQL_FILE)} to ${dbName()} (${target}) …`);
const res = spawnSync("npx", wranglerArgs, { stdio: "inherit", cwd: REPO });
process.exit(res.status ?? 1);
