#!/usr/bin/env node
// Generate a chunked D1 seed file from the decade hub JSON artifact.
// D1 caps a single SQL statement near 100KB; the default build emits one
// ~819KB INSERT which fails with SQLITE_TOOBIG. This writes an INSERT for
// the first slice plus UPDATE ... payload = payload || '<slice>' for the rest.
//
// usage: node gen-chunked-seed.mjs [inJson] [outSql] [chunkBytes]

import { readFileSync, writeFileSync } from "node:fs";

const inJson = process.argv[2] || "data/dist/decade-hub-1980.json";
const outSql = process.argv[3] || "data/dist/decade-hub-1980.chunked.sql";
const CHUNK = Number(process.argv[4] || 45000);

const raw = readFileSync(inJson, "utf8");
const profile = JSON.parse(raw);

// Match the build script: payload is compact JSON, not the pretty form.
const payload = JSON.stringify(profile);

// NB: profile.decade is numeric (1980); the decade_hub primary key is the
// label form ("1980s") that the route looks up. Do not use profile.decade.
const decade = `${profile.decade}s`;
const methodologyVersion = profile.methodologyVersion;
const sourceVersion = profile.sourceVersion;
const generatedAt = profile.generatedAt;

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

// Slice on code units, then repair any split surrogate pair so each chunk is
// independently valid UTF-8 when serialized.
function sliceChunks(str, size) {
  const out = [];
  let i = 0;
  while (i < str.length) {
    let end = Math.min(i + size, str.length);
    if (end < str.length) {
      const c = str.charCodeAt(end - 1);
      if (c >= 0xd800 && c <= 0xdbff) end -= 1; // don't split a surrogate pair
    }
    out.push(str.slice(i, end));
    i = end;
  }
  return out;
}

const chunks = sliceChunks(payload, CHUNK);

const lines = [];
lines.push(`-- chunked seed for ${decade}; ${chunks.length} statements`);
lines.push(`-- payload ${payload.length} chars, chunk size ${CHUNK}`);
lines.push(
  `INSERT OR REPLACE INTO decade_hub(decade,methodology_version,source_version,generated_at,payload) VALUES(${q(
    decade
  )},${q(methodologyVersion)},${q(sourceVersion)},${q(generatedAt)},${q(
    chunks[0]
  )});`
);
for (let i = 1; i < chunks.length; i++) {
  lines.push(
    `UPDATE decade_hub SET payload = payload || ${q(
      chunks[i]
    )} WHERE decade = ${q(decade)};`
  );
}

const sql = lines.join("\n") + "\n";
writeFileSync(outSql, sql, "utf8");

const maxStmt = Math.max(...sql.split("\n").map((l) => Buffer.byteLength(l, "utf8")));
console.log(`wrote ${outSql}`);
console.log(`  statements: ${chunks.length}`);
console.log(`  payload chars: ${payload.length}`);
console.log(`  largest statement bytes: ${maxStmt}`);
