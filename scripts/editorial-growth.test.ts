import assert from "node:assert/strict";
import test from "node:test";

import { contentId, eventFromContent, normalizeEmail, validateAnalyticsEvent, validateStoryPackage, type StoryPackage } from "../packages/shared/src";

test("content identities are stable and analytics events are validated", () => {
  const identity = { contentId: contentId("franchise-hub", "American Name Atlas"), contentType: "franchise-hub" as const, slug: "american-name-atlas", franchiseId: "american-name-atlas" };
  assert.equal(identity.contentId, "franchise:american-name-atlas");
  assert.deepEqual(validateAnalyticsEvent(eventFromContent("meaningful_content_view", identity)), []);
  assert.match(validateAnalyticsEvent({ name: "internal_discovery_click", contentId: identity.contentId })[0], /targetContentId/);
});

test("story packages require evidence-backed claims and alt text", () => {
  const story: StoryPackage = {
    schemaVersion: 1,
    id: "article:atlas-utah-names",
    slug: "atlas-utah-names",
    title: "The Names Utah Uses Differently",
    status: "published",
    publishedAt: "2026-08-17",
    updatedAt: "2026-08-17",
    franchiseId: "american-name-atlas",
    dek: "A reproducible state-name story.",
    primaryStates: ["UT"],
    claims: [{ id: "claim-1", text: "Utah over-indexes on several names.", evidenceIds: ["query-1"] }],
    evidence: [{ id: "query-1", kind: "query", title: "State share versus national share", query: "SELECT ..." }],
    visuals: [{ id: "chart-1", title: "Utah ratio leaders", alt: "Bar chart of names with elevated Utah usage." }],
  };
  assert.deepEqual(validateStoryPackage(story), []);
  assert.match(validateStoryPackage({ ...story, claims: [{ ...story.claims[0], evidenceIds: ["missing"] }] })[0], /missing evidence/);
  assert.match(validateStoryPackage({ ...story, visuals: [{ ...story.visuals![0], alt: "" }] })[0], /alt text/);
  assert.match(validateStoryPackage({ ...story, evidence: [{ id: "query-1", kind: "query", title: "Missing query" }] })[0], /needs query/);
  assert.match(validateStoryPackage({ ...story, evidence: [{ id: "query-1", kind: "source", title: "Missing URL" }] })[0], /needs url/);
});

test("story package duplicate checks record ids across a validation batch", () => {
  const seenIds = new Set<string>();
  const story = {
    schemaVersion: 1 as const,
    id: "article:duplicate",
    slug: "duplicate",
    title: "Duplicate",
    status: "draft" as const,
    updatedAt: "2026-08-17",
    dek: "Test",
    claims: [],
    evidence: [],
  };
  assert.deepEqual(validateStoryPackage(story, seenIds), []);
  assert.match(validateStoryPackage(story, seenIds)[0], /Duplicate story id/);
});

test("newsletter email normalization is case-insensitive and rejects invalid input", () => {
  assert.deepEqual(normalizeEmail(" Test@Example.COM "), { email: "test@example.com", valid: true });
  assert.equal(normalizeEmail("not-an-email").valid, false);
});


test("newsletter subscribe SQL clears stale unsubscribe metadata when reactivating", async () => {
  let sql = "";
  const db = {
    prepare(value: string) {
      sql = value;
      return { bind() { return { async run() {} }; } };
    },
  } as unknown as D1Database;
  const body = new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" });
  await (await import("../apps/web/functions/api/newsletter/subscribe")).onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", { method: "POST", body }),
    env: { DB: db },
  } as never);
  assert.match(sql, /consented_at=datetime\('now'\)/);
  assert.match(sql, /unsubscribed_at=NULL/);
});
