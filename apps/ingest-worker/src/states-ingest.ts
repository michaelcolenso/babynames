// SSA state-level download + parse for the diaspora map. Mirrors ssa.ts but
// for namesbystate.zip, which is far larger (~25MB zipped, ~330MB unzipped).
// We never decompress the whole archive at once: fflate's `filter` extracts a
// single state file per pass, so peak memory stays at one state (~6-10MB).
// Rows are fanned out onto the queue one chunk per message.

import { unzipSync } from "fflate";
import { ALL_STATES, type Sex } from "@nv/shared";
import type { Queue } from "@cloudflare/workers-types";
import { STATE_CHUNK_ROWS, type StateRow } from "./chunks";

export interface StateFetchResult {
  etag: string | null;
  bytes: Uint8Array;
}

const MAX_ZIP_BYTES = 100 * 1024 * 1024; // 100MB — well above the ~25MB state zip.
const UA = "name-vitals-ingest/1.0 (+https://github.com/michaelcolenso/babynames)";

export async function fetchStateZip(url: string): Promise<StateFetchResult> {
  const r = await fetch(url, {
    headers: { "User-Agent": UA },
    cf: { cacheTtl: 0 },
  } as RequestInit);
  if (!r.ok) throw new Error(`SSA state fetch failed: ${r.status} ${r.statusText}`);
  const contentLength = r.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len > MAX_ZIP_BYTES) {
      throw new Error(`SSA state zip too large: ${len} bytes`);
    }
  }
  const etag = r.headers.get("etag");
  const bytes = new Uint8Array(await r.arrayBuffer());
  return { etag, bytes };
}

// Each state file is named "<ABBR>.TXT" with lines: state,sex,year,name,count
export function* parseStateFile(text: string): Generator<StateRow> {
  let i = 0;
  const n = text.length;
  while (i < n) {
    let end = text.indexOf("\n", i);
    if (end === -1) end = n;
    const line = text.slice(i, end).trim();
    i = end + 1;
    if (!line) continue;
    const parts = line.split(",");
    if (parts.length !== 5) continue;
    const state = parts[0]!.trim();
    const sex = parts[1]!.trim() as Sex;
    const year = Number(parts[2]!.trim());
    const name = parts[3]!.trim();
    const count = Number(parts[4]!.trim());
    if (
      !name ||
      !state ||
      (sex !== "M" && sex !== "F") ||
      !Number.isFinite(year) ||
      !Number.isFinite(count)
    ) {
      continue;
    }
    yield { name, sex, year, state, count };
  }
}

// Decompress one state at a time and fan rows onto the queue. Keep each queue
// request to one state chunk so Cloudflare's 256KB sendBatch limit cannot be
// exceeded by an array of otherwise-valid messages.
export async function enqueueStateRows(
  zip: Uint8Array,
  queue: Queue,
  runId: string,
): Promise<{ rows: number; files: number }> {
  let totalRows = 0;
  let totalFiles = 0;
  for (const st of ALL_STATES) {
    const result = await enqueueStateFile(zip, queue, runId, st);
    totalRows += result.rows;
    totalFiles += result.files;
  }
  return { rows: totalRows, files: totalFiles };
}

export async function enqueueStateFile(
  zip: Uint8Array,
  queue: Queue,
  runId: string,
  state: string,
): Promise<{ rows: number; files: number }> {
  const dec = new TextDecoder("utf-8");

  let rowBuf: StateRow[] = [];
  let totalRows = 0;

  const flushRows = async () => {
    if (!rowBuf.length) return;
    await queue.send({ type: "state-rows", runId, rows: rowBuf });
    rowBuf = [];
  };

  const wanted = state.toUpperCase() + ".TXT";
  const extracted = unzipSync(zip, {
    filter: (f) => f.name.split("/").pop()?.toUpperCase() === wanted,
  });
  const keys = Object.keys(extracted);
  if (!keys.length) return { rows: 0, files: 0 };
  const data = extracted[keys[0]!]!;
  for (const row of parseStateFile(dec.decode(data))) {
    rowBuf.push(row);
    totalRows++;
    if (rowBuf.length >= STATE_CHUNK_ROWS) await flushRows();
  }
  await flushRows();

  return { rows: totalRows, files: 1 };
}
