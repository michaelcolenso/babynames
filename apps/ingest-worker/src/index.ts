// Cron-triggered SSA ingest worker.
//
//   Cron → scheduled() → check ETag → fetch zip → store in R2 → parse →
//          enqueue 1k-row chunks on INGEST_QUEUE → enqueue finalize message
//   Queue → queue() → insert chunks into name_year_raw_staging
//                   → on finalize, aggregate into names_staging /
//                     name_years_staging, swap onto live, set data_version
//
// The staging-swap pattern means reads against /api/* keep seeing
// consistent old data until the swap completes inside one transaction.

import { META_KEYS, getMeta, setMeta, enrichName } from "@nv/shared";
import type {
  D1Database,
  ExecutionContext,
  MessageBatch,
  Queue,
  R2Bucket,
  ScheduledController,
} from "@cloudflare/workers-types";

import { fetchNamesZip, headEtag, unpackYobFiles } from "./ssa";
import { parseYob } from "./parse";
import { CHUNK_ROWS, type IngestMessage, type ChunkRow, type YearTotalRow } from "./chunks";
import { ensureStaging, clearStagingForRun, insertRowChunk, upsertYearTotals } from "./upsert";
import { finalize } from "./compute";

interface Env {
  DB: D1Database;
  INGEST_CACHE: R2Bucket;
  INGEST_QUEUE: Queue<IngestMessage>;
  SSA_URL: string;
  TRIGGER_SECRET: string;
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runIngest(env, /*force*/ false));
  },

  // Manual trigger via `wrangler dev --test-scheduled` hits this path.
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__scheduled" || url.pathname === "/run") {
      const auth = req.headers.get("Authorization");
      if (!env.TRIGGER_SECRET || auth !== `Bearer ${env.TRIGGER_SECRET}`) {
        return new Response("unauthorized\n", { status: 401 });
      }
      const force = url.searchParams.get("force") === "1";
      ctx.waitUntil(runIngest(env, force));
      return new Response("ingest started\n", { status: 202 });
    }
    if (url.pathname === "/health") {
      const dv = await getMeta(env.DB, META_KEYS.dataVersion);
      const li = await getMeta(env.DB, META_KEYS.lastIngestAt);
      return Response.json({ dataVersion: dv, lastIngestAt: li });
    }
    if (url.pathname === "/enrich") {
      const name = (url.searchParams.get("name") ?? "").trim();
      const sex = (url.searchParams.get("sex") ?? "").trim().toUpperCase();
      if (!name) return Response.json({ error: "missing_name" }, { status: 400 });
      const result = await enrichName(
        env.DB,
        name,
        sex === "M" || sex === "F" ? sex : undefined,
      );
      return Response.json(result, {
        headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" },
      });
    }
    return new Response("not found\n", { status: 404 });
  },

  async queue(batch: MessageBatch<IngestMessage>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await handleMessage(env, msg.body);
        msg.ack();
      } catch (err) {
        console.error("queue message failed", err);
        msg.retry();
      }
    }
  },
};

async function runIngest(env: Env, force: boolean): Promise<void> {
  const lastEtag = await getMeta(env.DB, META_KEYS.lastSsaEtag);
  const head = await headEtag(env.SSA_URL);
  if (!force && head && lastEtag && head === lastEtag) {
    console.log(`ingest: ETag unchanged (${head}), skipping`);
    return;
  }

  const runId = crypto.randomUUID();
  console.log(`ingest: run ${runId} starting (etag ${head ?? "?"} → ${lastEtag ?? "none"})`);

  const { etag, bytes } = await fetchNamesZip(env.SSA_URL);
  await env.INGEST_CACHE.put(`names-${new Date().toISOString().slice(0, 10)}.zip`, bytes);

  const yobs = unpackYobFiles(bytes);
  if (!yobs.length) throw new Error("no yob*.txt files in SSA zip");
  const ym = yobs[0]!.year;
  const yM = yobs[yobs.length - 1]!.year;

  await ensureStaging(env.DB);
  await clearStagingForRun(env.DB, runId);

  // Fan out: one queue message per CHUNK_ROWS rows, plus year-totals msgs.
  let buf: ChunkRow[] = [];
  let bufYear = 0;
  const totals = new Map<string, YearTotalRow>();

  const flush = async () => {
    if (!buf.length) return;
    await env.INGEST_QUEUE.send({ type: "rows", runId, year: bufYear, rows: buf });
    buf = [];
  };

  for (const yob of yobs) {
    bufYear = yob.year;
    for (const row of parseYob(yob.year, yob.text)) {
      buf.push({ name: row.name, sex: row.sex, count: row.count });
      const tk = row.year + ":" + row.sex;
      const t = totals.get(tk);
      if (t) t.total += row.count;
      else totals.set(tk, { year: row.year, sex: row.sex, total: row.count });
      if (buf.length >= CHUNK_ROWS) await flush();
    }
    await flush();
  }

  await env.INGEST_QUEUE.send({ type: "year-totals", runId, totals: [...totals.values()] });
  await env.INGEST_QUEUE.send({ type: "finalize", runId, ym, yM, etag });

  console.log(`ingest: enqueued runId=${runId} years=${ym}-${yM}`);
}

async function handleMessage(env: Env, msg: IngestMessage): Promise<void> {
  switch (msg.type) {
    case "rows":
      await insertRowChunk(env.DB, msg.runId, msg.year, msg.rows);
      return;

    case "year-totals":
      await upsertYearTotals(env.DB, msg.totals);
      return;

    case "finalize": {
      const result = await finalize(env.DB, {
        runId: msg.runId,
        ym: msg.ym,
        yM: msg.yM,
      });
      const dataVersion = crypto.randomUUID();
      await Promise.all([
        setMeta(env.DB, META_KEYS.minYear, String(msg.ym)),
        setMeta(env.DB, META_KEYS.maxYear, String(msg.yM)),
        setMeta(env.DB, META_KEYS.totalNames, String(result.namesInserted)),
        setMeta(env.DB, META_KEYS.totalRows, String(result.rowsInserted)),
        setMeta(env.DB, META_KEYS.lastIngestAt, new Date().toISOString()),
        setMeta(env.DB, META_KEYS.lastSsaEtag, msg.etag ?? ""),
        setMeta(env.DB, META_KEYS.dataVersion, dataVersion),
      ]);
      // Best-effort cleanup of the per-run buffer.
      await env.DB.prepare("DELETE FROM name_year_raw_staging WHERE run_id = ?1").bind(msg.runId).run();
      console.log(
        `ingest complete: rows=${result.rowsInserted} names=${result.namesInserted} ` + `data_version=${dataVersion}`,
      );
      return;
    }
  }
}
