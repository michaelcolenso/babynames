// SSA download helpers. Streams the zip into R2 once per ingest, then reads
// from R2 on every retry/replay so we don't hammer ssa.gov.

import { unzipSync } from "fflate";

export interface SsaFetchResult {
  etag: string | null;
  bytes: Uint8Array;
}

const MAX_ZIP_BYTES = 50 * 1024 * 1024; // 50 MB — well above the known ~10 MB zip.

export async function fetchNamesZip(url: string): Promise<SsaFetchResult> {
  const r = await fetch(url, {
    headers: { "User-Agent": "name-vitals-ingest/1.0 (+https://github.com/michaelcolenso/babynames)" },
    cf: { cacheTtl: 0 },
  } as RequestInit);
  if (!r.ok) throw new Error(`SSA fetch failed: ${r.status} ${r.statusText}`);
  const contentLength = r.headers.get("content-length");
  if (contentLength) {
    const len = Number(contentLength);
    if (!Number.isFinite(len) || len > MAX_ZIP_BYTES) {
      throw new Error(`SSA zip too large: ${len} bytes`);
    }
  }
  const etag = r.headers.get("etag");
  const buf = new Uint8Array(await r.arrayBuffer());
  return { etag, bytes: buf };
}

export async function headEtag(url: string): Promise<string | null> {
  const r = await fetch(url, {
    method: "HEAD",
    headers: { "User-Agent": "name-vitals-ingest/1.0 (+https://github.com/michaelcolenso/babynames)" },
  });
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
