// Queue message types for the ingest pipeline. Messages are produced by the
// scheduled handler (one per ~1 000-row chunk) and consumed by the queue
// handler in the same Worker.

import type { Sex } from "@nv/shared";

export type IngestMessage =
  | { type: "rows"; runId: string; year: number; rows: ChunkRow[] }
  | { type: "year-totals"; runId: string; totals: YearTotalRow[] }
  | { type: "finalize"; runId: string; ym: number; yM: number; etag: string | null }
  // State-level pipeline (diaspora map). state-rows lands raw rows into
  // name_states; state-file is a queue-side producer for one state file;
  // diaspora-finalize is the cursor-paged compute chain that self-re-enqueues
  // until every (name, sex) is summarized, then swaps.
  | { type: "state-file"; runId: string; r2Key: string; state: string }
  | { type: "state-rows"; runId: string; rows: StateRow[] }
  | { type: "diaspora-finalize"; runId: string; cursor: { name: string; sex: Sex } | null };

export interface ChunkRow {
  name: string;
  sex: Sex;
  count: number;
}

export interface StateRow {
  name: string;
  sex: Sex;
  year: number;
  state: string;
  count: number;
}

export interface YearTotalRow {
  year: number;
  sex: Sex;
  total: number;
}

export const CHUNK_ROWS = 1000;
export const STATE_CHUNK_ROWS = 1000;
