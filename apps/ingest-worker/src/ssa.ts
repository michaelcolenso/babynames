// SSA download helpers. Streams the zip into R2 once per ingest, then reads
// from R2 on every retry/replay so we don't hammer ssa.gov.

import { unzipSync } from "fflate";

export interface SsaFetchResult {
  etag: string | null;
  bytes: Uint8Array;
}

export async function fetchNamesZip(url: string): Promise<SsaFetchResult> {
  const r = await fetch(url, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error(`SSA fetch failed: ${r.status} ${r.statusText}`);
  const etag = r.headers.get("etag");
  const buf = new Uint8Array(await r.arrayBuffer());
  return { etag, bytes: buf };
}

export async function headEtag(url: string): Promise<string | null> {
  const r = await fetch(url, { method: "HEAD" });
  if (!r.ok) return null;
  return r.headers.get("etag");
}

export interface YobFile {
  year: number;
  text: string;
}

const YOB_RE = /^yob(\d{4})\.txt$/i;

// Synchronous unzip is fine — the names.zip is ~10MB compressed,
// ~70MB uncompressed, and Workers have 128MB RAM. fflate runs in well
// under a second.
export function unpackYobFiles(zip: Uint8Array): YobFile[] {
  const files = unzipSync(zip);
  const out: YobFile[] = [];
  const dec = new TextDecoder("utf-8");
  for (const [path, data] of Object.entries(files)) {
    const m = YOB_RE.exec(path.split("/").pop() ?? "");
    if (!m) continue;
    out.push({ year: Number(m[1]), text: dec.decode(data) });
  }
  out.sort((a, b) => a.year - b.year);
  return out;
}
