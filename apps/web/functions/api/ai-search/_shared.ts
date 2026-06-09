// Shared helpers for the /api/ai-search endpoints. The leading underscore
// keeps this module out of the Pages Functions route table (same convention
// as api/og/_fonts.ts).

export const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
};

// AI Search results only change when the underlying corpus is re-indexed, so
// cache aggressively at the edge and lean on stale-while-revalidate to keep
// latency low between re-indexes.
export const CACHE_HEADERS = {
  ...JSON_HEADERS,
  "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export interface Citation {
  key: string;
  score: number;
  text: string;
  url?: string;
}

// Slim a raw AI Search chunk down to what clients need. The indexed `item.key`
// usually carries the source path/filename; surface it as a URL hint when it
// looks like a site path, or prefer an explicit `metadata.url` when present.
export function toCitation(chunk: AiSearchChunk): Citation {
  const key = chunk.item?.key ?? chunk.id;
  const metaUrl = chunk.item?.metadata?.url;
  const url =
    typeof metaUrl === "string" ? metaUrl : key.startsWith("/") ? key : undefined;
  return { key, score: chunk.score, text: chunk.text, url };
}

// Coerce a limit param (query string or JSON number) into 1..25, default 8.
export function clampLimit(raw: string | number | null | undefined): number {
  const n = Number(raw ?? 8);
  return Math.max(1, Math.min(25, Number.isFinite(n) ? n : 8));
}
