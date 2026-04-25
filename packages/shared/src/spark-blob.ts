// 60-byte normalized sparkline encoding for landing-page rows.
// Stored as a BLOB in `names.spark_blob`. Decoded client-side in landing.js.

const BUCKETS = 60;

export function encodeSpark(series: Record<number, number>, ym: number, yM: number): Uint8Array {
  const span = yM - ym + 1;
  if (span <= 0) return new Uint8Array(BUCKETS);
  const out = new Uint8Array(BUCKETS);
  let max = 0;
  // Bucket sums (mean-aggregated to flatten multi-year buckets).
  const buckets = new Float64Array(BUCKETS);
  const counts = new Uint16Array(BUCKETS);
  for (let y = ym; y <= yM; y++) {
    const i = Math.min(BUCKETS - 1, Math.floor(((y - ym) * BUCKETS) / span));
    const v = series[y] ?? 0;
    buckets[i]! += v;
    counts[i]! += 1;
  }
  for (let i = 0; i < BUCKETS; i++) {
    if (counts[i]! > 0) buckets[i]! = buckets[i]! / counts[i]!;
    if (buckets[i]! > max) max = buckets[i]!;
  }
  if (max === 0) return out;
  for (let i = 0; i < BUCKETS; i++) {
    out[i] = Math.round((buckets[i]! / max) * 255);
  }
  return out;
}

export function decodeSpark(blob: ArrayBuffer | Uint8Array): number[] {
  const u8 = blob instanceof Uint8Array ? blob : new Uint8Array(blob);
  return Array.from(u8);
}

export const SPARK_BUCKETS = BUCKETS;
