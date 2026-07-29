#!/usr/bin/env tsx
// Verifies the seeded name_facts / name_collections tables in D1.
//
// Usage:
//   npm run verify-name-facts           # remote D1
//   npm run verify-name-facts -- --local
//
// Exits non-zero on failure so it can gate CI. The staleness check is the point:
// name_facts is rebuilt offline, so an SSA ingest silently leaves it behind. The
// renderers deliberately do NOT gate on this (that would blank every story strip
// after an ingest) — this script is the alarm instead.

import { spawnSync } from "node:child_process";
import path from "node:path";

import { getCollection } from "../packages/shared/src/collections";
import { VARIANT_KEY_VERSION } from "../packages/shared/src/variant-key";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");
const DB_NAME = "name-vitals";

const local = process.argv.includes("--local");
const target = local ? "--local" : "--remote";

function query<T = Record<string, unknown>>(sql: string): T[] {
  const res = spawnSync(
    "npx",
    ["wrangler", "d1", "execute", DB_NAME, "--config", CONFIG, "--command", sql, target, "--json"],
    { encoding: "utf-8", cwd: REPO },
  );
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    throw new Error(`query failed: ${sql}`);
  }
  const start = res.stdout.indexOf("[");
  const parsed = JSON.parse(res.stdout.slice(start));
  return (parsed[0]?.results ?? []) as T[];
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

function one<T>(sql: string): T | undefined {
  return query<T>(sql)[0];
}

function main(): void {
  const facts = one<{ n: number }>("SELECT COUNT(*) AS n FROM name_facts")?.n ?? 0;
  const names = one<{ n: number }>("SELECT COUNT(*) AS n FROM names")?.n ?? 0;
  check("name_facts populated", facts > 0, `${facts} rows`);
  // A few percent of drift is expected: build-name-facts may have been run with
  // --limit, and classify() drops pairs the names table keeps.
  check(
    "name_facts covers the names table",
    names === 0 || facts >= names * 0.95,
    `${facts} facts vs ${names} names`,
  );

  const nullKeys = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM name_facts WHERE variant_key IS NULL OR variant_key = ''",
  )?.n ?? 0;
  check("every row has a variant_key", nullKeys === 0, `${nullKeys} blank`);

  const badBand = one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM name_facts WHERE rarity_pct_sex < 0 OR rarity_pct_sex > 100",
  )?.n ?? 0;
  check("rarity percentiles are in range", badBand === 0, `${badBand} out of range`);

  const orphanPrimary = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM (
       SELECT variant_key, sex FROM name_facts GROUP BY variant_key, sex
        HAVING SUM(variant_is_primary) <> 1
     )`,
  )?.n ?? 0;
  check("each spelling family has exactly one primary", orphanPrimary === 0, `${orphanPrimary} bad families`);

  // Membership integrity.
  const members = one<{ n: number }>("SELECT COUNT(*) AS n FROM name_collections")?.n ?? 0;
  check("name_collections populated", members > 0, `${members} rows`);

  const orphans = one<{ n: number }>(
    `SELECT COUNT(*) AS n FROM name_collections c
      LEFT JOIN names n ON n.name_lower = c.name_lower AND n.sex = c.sex
      WHERE n.id IS NULL`,
  )?.n ?? 0;
  check("every member joins a live names row", orphans === 0, `${orphans} orphans`);

  const slugs = query<{ slug: string; n: number }>(
    "SELECT slug, COUNT(*) AS n FROM name_collections GROUP BY slug ORDER BY n DESC",
  );
  const unknown = slugs.filter((s) => !getCollection(s.slug));
  check(
    "every stored slug resolves in the registry",
    unknown.length === 0,
    unknown.length ? unknown.map((s) => s.slug).join(", ") : `${slugs.length} slugs`,
  );

  const thin = slugs.filter((s) => s.n < 8);
  console.log(
    `      ${slugs.length} populated collections; ${thin.length} below the publish threshold` +
      (thin.length ? ` (${thin.slice(0, 8).map((s) => s.slug).join(", ")}…)` : ""),
  );

  // Staleness.
  const meta = query<{ key: string; value: string }>(
    "SELECT key, value FROM meta WHERE key IN ('data_version','facts_version','variant_key_version','facts_corpus')",
  );
  const get = (k: string) => meta.find((m) => m.key === k)?.value ?? null;
  const dataVersion = get("data_version");
  const factsVersion = get("facts_version");
  check(
    "facts_version matches the live data_version",
    Boolean(dataVersion) && dataVersion === factsVersion,
    `data=${dataVersion ?? "unset"} facts=${factsVersion ?? "unset"}`,
  );
  check(
    "variant_key_version matches the code",
    Number(get("variant_key_version")) === VARIANT_KEY_VERSION,
    `db=${get("variant_key_version") ?? "unset"} code=${VARIANT_KEY_VERSION}`,
  );

  // The version the build stamped is only a claim; this checks it. Both
  // quantities come from the same SSA corpus, so a build made from a different
  // vintage than the database holds cannot match, whatever --data-version said.
  const live = one<{ max_year: number; total_births: number }>(
    "SELECT MAX(last_year) AS max_year, SUM(total_count) AS total_births FROM names",
  );
  const liveFingerprint = live ? `ssa:${live.max_year}:${live.total_births}` : null;
  const storedFingerprint = get("facts_corpus");
  check(
    "facts were built from the corpus the database holds",
    Boolean(storedFingerprint) && storedFingerprint === liveFingerprint,
    `facts=${storedFingerprint ?? "unset"} live=${liveFingerprint ?? "unknown"}`,
  );

  if (failures) {
    console.log(`\n${failures} check(s) failed.`);
    console.log("If the staleness check failed, re-run: npm run build-name-facts && npm run seed-name-facts");
    console.log("If the corpus check failed, the SSA zip the build read is not the one this database was ingested from.");
  } else {
    console.log("\nAll checks passed.");
  }
  process.exit(failures ? 1 : 0);
}

main();
