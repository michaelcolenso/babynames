import { strToU8, zipSync } from "fflate";
import type { Queue } from "@cloudflare/workers-types";

import type { IngestMessage } from "./chunks";
import { enqueueStateFile, enqueueStateRows } from "./states-ingest";

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function stateZip(lines: string): Uint8Array {
  return zipSync({ "AK.TXT": strToU8(lines) });
}

async function testEnqueueStateRowsUsesSingleMessageSends(): Promise<void> {
  const lines = Array.from(
    { length: 1001 },
    (_, i) => `AK,F,2025,Name${i},5`,
  ).join("\n");
  const sent: IngestMessage[] = [];
  const queue = {
    async send(message: IngestMessage) {
      sent.push(message);
      return { metadata: { metrics: {} } };
    },
    async sendBatch() {
      throw new Error("state ingest must not use sendBatch");
    },
  } as unknown as Queue<IngestMessage>;

  const result = await enqueueStateRows(stateZip(`${lines}\n`), queue, "state-run-1");

  assertEqual(result.rows, 1001, "row count");
  assertEqual(result.files, 1, "file count");
  assertEqual(sent.length, 2, "message count");
  assertEqual(sent[0]?.type, "state-rows", "first message type");
  assertEqual(sent[1]?.type, "state-rows", "second message type");
  if (sent[0]?.type === "state-rows") assertEqual(sent[0].rows.length, 1000, "first chunk size");
  if (sent[1]?.type === "state-rows") assertEqual(sent[1].rows.length, 1, "second chunk size");
}

await testEnqueueStateRowsUsesSingleMessageSends();

async function testEnqueueStateFileOnlyFansOutOneState(): Promise<void> {
  const sent: IngestMessage[] = [];
  const queue = {
    async send(message: IngestMessage) {
      sent.push(message);
      return { metadata: { metrics: {} } };
    },
  } as unknown as Queue<IngestMessage>;
  const zip = zipSync({
    "AK.TXT": strToU8("AK,F,2025,Ada,5\n"),
    "AL.TXT": strToU8("AL,F,2025,Ada,7\n"),
  });

  const result = await enqueueStateFile(zip, queue, "state-run-2", "AL");

  assertEqual(result.rows, 1, "single-state row count");
  assertEqual(result.files, 1, "single-state file count");
  assertEqual(sent.length, 1, "single-state message count");
  if (sent[0]?.type === "state-rows") {
    assertEqual(sent[0].rows[0]?.state, "AL", "single-state row state");
    assertEqual(sent[0].rows[0]?.count, 7, "single-state row count value");
  }
}

await testEnqueueStateFileOnlyFansOutOneState();
