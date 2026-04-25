// Queue message types for the ingest pipeline. Messages are produced by the
// scheduled handler (one per ~1 000-row chunk) and consumed by the queue
// handler in the same Worker.

import type { Sex } from "@nv/shared";

export type IngestMessage =
  | { type: "rows"; runId: string; year: number; rows: ChunkRow[] }
  | { type: "year-totals"; runId: string; totals: YearTotalRow[] }
  | { type: "finalize"; runId: string; ym: number; yM: number; etag: string | null };

export interface ChunkRow {
  name: string;
  sex: Sex;
  count: number;
}

export interface YearTotalRow {
  year: number;
  sex: Sex;
  total: number;
}

export const CHUNK_ROWS = 1000;
