#!/usr/bin/env tsx
// Builds and publishes the viz_payloads rows (migration 0023) for the dataset
// currently live in D1.
//
// Usage:
//   npm run backfill-viz-payloads            # all four endpoints
//   npm run backfill-viz-payloads -- --key=concentration
//   npm run backfill-viz-payloads -- --dry   # build + report sizes, write nothing
//
// Runs publishVizPayloads() — the same function the ingest worker calls at
// finalize — against remote D1 over the REST API, so the backfill and the
// scheduled rebuild cannot diverge. Idempotent: each key is a single row write
// stamped with the live data_version.
//
// Remote only. Local D1 has no REST endpoint; use the ingest worker's dev
// server (`npm run dev:ingest`) if you need to populate a local database.

import { readFileSync } from "node:fs";
import path from "node:path";
import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { D1Database, D1PreparedStatement } from "@cloudflare/workers-types";
import {
  VIZ_KEYS,
  computeVizPayload,
  writeVizPayload,
  getMeta,
  META_KEYS,
  type VizKey,
} from "../packages/shared/src/index";

const REPO = path.resolve(import.meta.dirname ?? __dirname, "..");
const CONFIG = path.join(REPO, "apps/web/wrangler.toml");

// The sandbox routes outbound HTTPS through an agent proxy; Node's fetch does
// not read HTTPS_PROXY on its own.
if (process.env.HTTPS_PROXY) setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY));

const DRY = process.argv.includes("--dry");
const keyArg = process.argv.find((a) => a.startsWith("--key="))?.slice("--key=".length);

// CLOUDFLARE_ACCOUNT_ID is trimmed defensively: a stray space produces a
// malformed URL and a misleading "Authentication error [code: 10000]".
const ACCOUNT = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
const TOKEN = (process.env.CLOUDFLARE_API_TOKEN ?? "").trim();
if (!ACCOUNT || !TOKEN) {
  console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.");
  process.exit(1);
}

function databaseId(): string {
  const toml = readFileSync(CONFIG, "utf-8");
  const m = toml.match(/database_id\s*=\s*"([^"]+)"/);
  if (!m) throw new Error(`Could not find database_id in ${CONFIG}`);
  return m[1]!;
}

const ENDPOINT = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${databaseId()}/query`;

interface QueryResult<T> {
  results: T[];
  meta: { rows_read?: number; duration?: number };
}

let queries = 0;
let rowsRead = 0;

async function query<T>(sql: string, params: unknown[]): Promise<QueryResult<T>> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const json = (await res.json()) as {
    success: boolean;
    errors?: { message: string }[];
    result?: QueryResult<T>[];
  };
  if (!json.success) {
    throw new Error(`D1 query failed: ${json.errors?.map((e) => e.message).join("; ") ?? res.status}`);
  }
  const first = json.result?.[0];
  queries++;
  rowsRead += first?.meta?.rows_read ?? 0;
  return { results: first?.results ?? [], meta: first?.meta ?? {} };
}

// Minimal D1Database over the REST API — enough for the collectors, which use
// prepare/bind/all/first/run and batch(). batch() runs its statements
// concurrently, matching the pipelining db.batch() gives inside a Worker.
function restD1(): D1Database {
  const stmt = (sql: string, params: unknown[]): D1PreparedStatement =>
    ({
      bind: (...args: unknown[]) => stmt(sql, args),
      all: async () => {
        const r = await query(sql, params);
        return { results: r.results, success: true, meta: r.meta };
      },
      first: async () => (await query(sql, params)).results[0] ?? null,
      run: async () => {
        const r = await query(sql, params);
        return { results: r.results, success: true, meta: r.meta };
      },
      raw: async () => (await query(sql, params)).results,
    }) as unknown as D1PreparedStatement;

  return {
    prepare: (sql: string) => stmt(sql, []),
    batch: async (statements: D1PreparedStatement[]) =>
      Promise.all(statements.map((s) => s.all())),
  } as unknown as D1Database;
}

async function main() {
  const db = restD1();

  const [ymStr, yMStr, dataVersion] = await Promise.all([
    getMeta(db, META_KEYS.minYear),
    getMeta(db, META_KEYS.maxYear),
    getMeta(db, META_KEYS.dataVersion),
  ]);
  const ym = Number(ymStr ?? 1880);
  const yM = Number(yMStr ?? 0);

  if (!dataVersion) {
    console.error("meta.data_version is empty — run an ingest first, or readers will never trust the payloads.");
    process.exit(1);
  }
  if (!yM) {
    console.error("meta.max_year is empty — is this database populated?");
    process.exit(1);
  }

  const keys: VizKey[] = keyArg ? [keyArg as VizKey] : [...VIZ_KEYS];
  for (const key of keys) {
    if (!VIZ_KEYS.includes(key)) {
      console.error(`Unknown key "${key}". Known keys: ${VIZ_KEYS.join(", ")}`);
      process.exit(1);
    }
  }

  console.error(`Building ${keys.length} payload(s) for ${ym}–${yM}, data_version ${dataVersion} …`);

  for (const key of keys) {
    const startedAt = Date.now();
    const beforeQueries = queries;
    const beforeRows = rowsRead;
    const payload = await computeVizPayload(db, key, ym, yM);
    const bytes = JSON.stringify(payload).length;
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.error(
      `  ${key}: ${bytes.toLocaleString()} bytes, ` +
        `${(queries - beforeQueries).toLocaleString()} queries, ` +
        `${(rowsRead - beforeRows).toLocaleString()} rows read, ${secs}s`,
    );
    if (DRY) continue;
    await writeVizPayload(db, key, payload, dataVersion);
  }

  console.error(
    DRY
      ? "Dry run — nothing written."
      : `Published ${keys.length} payload(s) for data_version ${dataVersion}.`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
