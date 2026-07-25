import assert from "node:assert/strict";
import test from "node:test";

import { contentId, eventFromContent, normalizeEmail, parseSubscribeStatus, renderNewsletterSignup, renderSubscribeStatus, validateAnalyticsEvent, validateStoryPackage, type StoryPackage } from "../packages/shared/src";

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
  for (const bad of ["a@b.c", "a@b..com", "a@-b.com", "a@b.com.", "a b@example.com", "a@example.123", "@example.com", "a@"]) {
    assert.equal(normalizeEmail(bad).valid, false, `expected ${bad} to be rejected`);
  }
  for (const good of ["a.b+tag@sub.example.co.uk", "reader@example.com"]) {
    assert.equal(normalizeEmail(good).valid, true, `expected ${good} to be accepted`);
  }
});

test("newsletter signup markup escapes attribute values and wires labels", () => {
  const html = renderNewsletterSignup('evil" onmouseover="x', "story:a&b");
  assert.ok(!html.includes('onmouseover="x'));
  assert.match(html, /data-source-content-id="story:a&amp;b"/);
  assert.match(html, /<label for="nv-newsletter-email">/);
  assert.match(html, /id="nv-newsletter-email"/);
  assert.match(html, /name="company"/); // honeypot
});

test("newsletter status banner renders only for known statuses", () => {
  assert.equal(parseSubscribeStatus(new URLSearchParams("subscribed=1")), "subscribed");
  assert.equal(parseSubscribeStatus(new URLSearchParams("subscribe=invalid")), "invalid");
  assert.equal(parseSubscribeStatus(new URLSearchParams("subscribe=<script>")), null);
  assert.match(renderSubscribeStatus("error"), /role="status"/);
  assert.equal(renderSubscribeStatus(null), "");
});

test("newsletter subscribe rejects cross-origin posts and bot-filled honeypots", async () => {
  let inserted = 0;
  const db = {
    prepare() {
      return { bind() { return { async run() { inserted++; } }; } };
    },
  } as unknown as D1Database;
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const post = (init: RequestInit, headers: Record<string, string> = {}) =>
    onRequestPost({
      request: new Request("https://example.com/api/newsletter/subscribe", { method: "POST", headers, ...init }),
      env: { DB: db },
    } as never);

  const good = new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" });
  const crossOrigin = await post({ body: good }, { origin: "https://evil.test" });
  assert.equal(crossOrigin.status, 403);
  assert.equal(inserted, 0);

  const honeypot = new URLSearchParams({ email: "bot@example.com", sourcePlacement: "test", company: "Acme" });
  const trapped = await post({ body: honeypot }, { origin: "https://example.com" });
  assert.equal(trapped.status, 200);
  assert.equal(inserted, 0);

  const invalid = await post({ body: new URLSearchParams({ email: "nope", sourcePlacement: "test" }) });
  assert.equal(invalid.status, 400);
  assert.equal(inserted, 0);

  assert.equal((await post({ body: good }, { origin: "https://example.com" })).status, 200);
  assert.equal(inserted, 1);
});

test("newsletter subscribe reports storage failures instead of faking success", async () => {
  const db = {
    prepare() {
      return { bind() { return { async run() { throw new Error("D1 down"); } }; } };
    },
  } as unknown as D1Database;
  const res = await (await import("../apps/web/functions/api/newsletter/subscribe")).onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
    }),
    env: { DB: db },
  } as never);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, status: "error" });
});

test("newsletter subscribe redirects browsers to a status-bearing page", async () => {
  const db = { prepare() { return { bind() { return { async run() {} }; } }; } } as unknown as D1Database;
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const res = await onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      headers: { accept: "text/html", origin: "https://example.com" },
      body: new URLSearchParams({ email: "bad", sourcePlacement: "test" }),
    }),
    env: { DB: db },
  } as never);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://example.com/newsletter?subscribe=invalid");
  assert.equal(res.headers.get("cache-control"), "no-store");
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
