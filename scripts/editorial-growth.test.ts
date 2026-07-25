import assert from "node:assert/strict";
import test from "node:test";

import { CONFIRM_TOKEN_TTL_SECONDS, EMAIL_RULE, IP_RULE, checkRateLimit, contentId, eventFromContent, hashKey, normalizeEmail, sendConfirmationEmail, signToken, sweepStalePending, renderUnsubscribeConfirm, verifyToken, parseSubscribeStatus, renderNewsletterSignup, renderSubscribeStatus, validateAnalyticsEvent, validateStoryPackage, type StoryPackage } from "../packages/shared/src";

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
  const { db } = fakeDb({ onRun: (sql) => { if (sql.startsWith("INSERT INTO newsletter_subscribers")) inserted++; } });
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const post = (init: RequestInit, headers: Record<string, string> = {}) =>
    onRequestPost({
      request: new Request("https://example.com/api/newsletter/subscribe", { method: "POST", headers, ...init }),
      env: { DB: db },
      waitUntil() {},
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
    prepare(sql: string) {
      return {
        bind() {
          return {
            async first() {
              // The rate limiter tolerates its own outage; the subscriber
              // write is what must surface as an error.
              if (sql.includes("newsletter_rate_limit")) return { hits: 1 };
              throw new Error("D1 down");
            },
            async run() { throw new Error("D1 down"); },
          };
        },
      };
    },
  } as unknown as D1Database;
  const res = await (await import("../apps/web/functions/api/newsletter/subscribe")).onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
    }),
    env: { DB: db },
    waitUntil() {},
  } as never);
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { ok: false, status: "error" });
});

test("newsletter subscribe redirects browsers to a status-bearing page", async () => {
  const { db } = fakeDb();
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const res = await onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      headers: { accept: "text/html", origin: "https://example.com" },
      body: new URLSearchParams({ email: "bad", sourcePlacement: "test" }),
    }),
    env: { DB: db },
    waitUntil() {},
  } as never);
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "https://example.com/newsletter?subscribe=invalid");
  assert.equal(res.headers.get("cache-control"), "no-store");
});


test("newsletter subscribe SQL clears stale unsubscribe metadata when reactivating", async () => {
  let sql = "";
  const { db } = fakeDb({ onRun: (value) => { if (value.includes("newsletter_subscribers")) sql = value; } });
  const body = new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" });
  await (await import("../apps/web/functions/api/newsletter/subscribe")).onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", { method: "POST", body }),
    env: { DB: db },
    waitUntil() {},
  } as never);
  assert.match(sql, /consented_at=datetime\('now'\)/);
  assert.match(sql, /unsubscribed_at=NULL/);
});

// ── Double opt-in, unsubscribe, and rate limiting ────────────────────────

const SECRET = "test-secret";

test("newsletter tokens round-trip and reject tampering, wrong purpose and expiry", async () => {
  const token = await signToken(SECRET, "confirm", "reader@example.com");
  const good = await verifyToken(SECRET, token, "confirm");
  assert.equal(good.ok, true);
  assert.equal(good.ok && good.payload.email, "reader@example.com");

  assert.equal((await verifyToken("other-secret", token, "confirm")).ok, false);
  assert.equal((await verifyToken(SECRET, token, "unsubscribe")).ok, false);
  assert.equal((await verifyToken(SECRET, "garbage", "confirm")).ok, false);
  assert.equal((await verifyToken(SECRET, token + "x", "confirm")).ok, false);

  // A confirm token past its TTL is refused; an unsubscribe token never expires,
  // because it lives in every email we ever sent.
  const old = Date.now() - (CONFIRM_TOKEN_TTL_SECONDS + 60) * 1000;
  const staleConfirm = await signToken(SECRET, "confirm", "reader@example.com", old);
  const expired = await verifyToken(SECRET, staleConfirm, "confirm");
  assert.equal(expired.ok, false);
  assert.equal(!expired.ok && expired.reason, "expired");

  const staleUnsub = await signToken(SECRET, "unsubscribe", "reader@example.com", old);
  assert.equal((await verifyToken(SECRET, staleUnsub, "unsubscribe")).ok, true);
});

test("a forged token body cannot smuggle a different address past the MAC", async () => {
  const token = await signToken(SECRET, "unsubscribe", "victim@example.com");
  const signature = token.slice(token.indexOf(".") + 1);
  const forgedBody = Buffer.from(`unsubscribe:attacker@example.com:${Math.floor(Date.now() / 1000)}`)
    .toString("base64url");
  const result = await verifyToken(SECRET, `${forgedBody}.${signature}`, "unsubscribe");
  assert.equal(result.ok, false);
  assert.equal(!result.ok && result.reason, "bad-signature");
});

/** In-memory stand-in for the D1 calls the rate limiter and endpoints make. */
function fakeDb(options: { rows?: Record<string, { status: string }>; onRun?: (sql: string) => void } = {}) {
  const counters = new Map<string, number>();
  const rows = options.rows ?? {};
  const statements: string[] = [];
  const db = {
    prepare(sql: string) {
      statements.push(sql);
      return {
        bind(...args: unknown[]) {
          return {
            async first() {
              if (sql.includes("newsletter_rate_limit")) {
                const bucket = String(args[0]);
                const hits = (counters.get(bucket) ?? 0) + 1;
                counters.set(bucket, hits);
                return { hits };
              }
              return rows[String(args[0])] ?? null;
            },
            async run() {
              options.onRun?.(sql);
              return { meta: { changes: rows[String(args[0])] ? 1 : 0 } };
            },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, statements };
}

test("rate limiting trips at the configured ceiling and fails open on D1 errors", async () => {
  const { db } = fakeDb();
  const rule = { scope: "ip", limit: 2, windowSeconds: 600 };
  assert.equal((await checkRateLimit(db, SECRET, rule, "1.2.3.4")).allowed, true);
  assert.equal((await checkRateLimit(db, SECRET, rule, "1.2.3.4")).allowed, true);
  const third = await checkRateLimit(db, SECRET, rule, "1.2.3.4");
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfter > 0 && third.retryAfter <= 600);
  // A different caller has its own bucket.
  assert.equal((await checkRateLimit(db, SECRET, rule, "5.6.7.8")).allowed, true);

  const broken = { prepare() { throw new Error("D1 down"); } } as unknown as D1Database;
  assert.equal((await checkRateLimit(broken, SECRET, rule, "1.2.3.4")).allowed, true);
});

test("rate-limit buckets never contain the raw client key", async () => {
  const { db, statements } = fakeDb();
  await checkRateLimit(db, SECRET, IP_RULE, "203.0.113.7");
  await checkRateLimit(db, SECRET, EMAIL_RULE, "reader@example.com");
  const bucketArgs = statements.filter((s) => s.includes("newsletter_rate_limit"));
  assert.equal(bucketArgs.length, 2);
  const key = await hashKey(SECRET, "203.0.113.7");
  assert.ok(!key.includes("203.0.113.7"));
  assert.equal(key, await hashKey(SECRET, "203.0.113.7")); // stable
  assert.notEqual(key, await hashKey("different", "203.0.113.7"));
});

test("subscribe uses single opt-in when no email provider is configured", async () => {
  let sql = "";
  const { db } = fakeDb({ onRun: (s) => { if (s.includes("newsletter_subscribers")) sql = s; } });
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const res = await onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
    }),
    env: { DB: db },
    waitUntil() {},
  } as never);
  assert.deepEqual(await res.json(), { ok: true, status: "subscribed" });
  assert.match(sql, /'active'/);
});

test("subscribe holds the address pending and sends confirmation when configured", async () => {
  let sql = "";
  const { db } = fakeDb({ onRun: (s) => { if (s.includes("newsletter_subscribers")) sql = s; } });
  const pending: Promise<unknown>[] = [];
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const res = await onRequestPost({
    request: new Request("https://example.com/api/newsletter/subscribe", {
      method: "POST",
      body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
    }),
    env: { DB: db, NEWSLETTER_API_KEY: "key", NEWSLETTER_FROM: "hi@example.com", NEWSLETTER_TOKEN_SECRET: SECRET },
    waitUntil(p: Promise<unknown>) { pending.push(p); },
  } as never);
  assert.deepEqual(await res.json(), { ok: true, status: "pending" });
  assert.match(sql, /'pending'/);
  // An existing active subscriber must not be demoted back to pending.
  assert.match(sql, /WHEN newsletter_subscribers\.status = 'active' THEN 'active'/);
  assert.ok(pending.length >= 1);
});

test("subscribe rate-limits by IP with a Retry-After", async () => {
  const { db } = fakeDb();
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/subscribe");
  const post = () =>
    onRequestPost({
      request: new Request("https://example.com/api/newsletter/subscribe", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.9" },
        body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
      }),
      env: { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET },
      waitUntil() {},
    } as never);

  let last: Response | undefined;
  for (let i = 0; i < IP_RULE.limit + 1; i++) last = await post();
  assert.equal(last?.status, 429);
  assert.deepEqual(await last?.json(), { ok: false, status: "rate-limited" });
  assert.ok(Number(last?.headers.get("retry-after")) > 0);
});

test("confirming a pending subscriber activates it; a bad link never mutates", async () => {
  let ran = "";
  const { db } = fakeDb({ rows: { "reader@example.com": { status: "pending" } }, onRun: (s) => { ran = s; } });
  const { onRequestGet } = await import("../apps/web/functions/newsletter/confirm");
  const token = await signToken(SECRET, "confirm", "reader@example.com");
  const env = { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET };

  const ok = await onRequestGet({
    request: new Request(`https://example.com/newsletter/confirm?token=${encodeURIComponent(token)}`),
    env,
  } as never);
  assert.equal(ok.status, 303);
  assert.equal(ok.headers.get("location"), "https://example.com/newsletter?subscribe=confirmed");
  assert.match(ran, /status='active'/);

  ran = "";
  const bad = await onRequestGet({
    request: new Request("https://example.com/newsletter/confirm?token=nope"),
    env,
  } as never);
  assert.equal(bad.headers.get("location"), "https://example.com/newsletter?subscribe=link-invalid");
  assert.equal(ran, "", "an invalid token must not touch the database");

  // An unsubscribe token must not be usable to confirm.
  const wrongPurpose = await signToken(SECRET, "unsubscribe", "reader@example.com");
  const rejected = await onRequestGet({
    request: new Request(`https://example.com/newsletter/confirm?token=${encodeURIComponent(wrongPurpose)}`),
    env,
  } as never);
  assert.equal(rejected.headers.get("location"), "https://example.com/newsletter?subscribe=link-invalid");
});

test("unsubscribe GET renders a confirmation form without mutating", async () => {
  let ran = "";
  const { db } = fakeDb({ onRun: (s) => { ran = s; } });
  const token = await signToken(SECRET, "unsubscribe", "reader@example.com");
  const { onRequestGet } = await import("../apps/web/functions/newsletter/unsubscribe");
  const res = await onRequestGet({
    request: new Request(`https://example.com/newsletter/unsubscribe?token=${encodeURIComponent(token)}`),
    env: { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET },
  } as never);
  const html = await res.text();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.equal(res.headers.get("x-robots-tag"), "noindex");
  assert.match(html, /method="post"/);
  assert.match(html, /reader@example\.com/);
  assert.equal(ran, "", "a prefetched unsubscribe link must not unsubscribe anyone");
});

test("unsubscribe POST and RFC 8058 one-click both remove consent", async () => {
  for (const [label, load] of [
    ["form post", () => import("../apps/web/functions/newsletter/unsubscribe")],
    ["one-click", () => import("../apps/web/functions/api/newsletter/unsubscribe")],
  ] as const) {
    let ran = "";
    const { db } = fakeDb({ onRun: (s) => { ran = s; } });
    const token = await signToken(SECRET, "unsubscribe", "reader@example.com");
    const { onRequestPost } = await load();
    const res = await onRequestPost({
      request: new Request("https://example.com/newsletter/unsubscribe", {
        method: "POST",
        body: new URLSearchParams({ token, "List-Unsubscribe": "One-Click" }),
      }),
      env: { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET },
    } as never);
    assert.match(ran, /status='unsubscribed'/, label);
    assert.ok(res.status === 200 || res.status === 303, label);
  }
});

test("one-click unsubscribe rejects an unsigned token", async () => {
  const { db } = fakeDb();
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/unsubscribe");
  const res = await onRequestPost({
    request: new Request("https://example.com/api/newsletter/unsubscribe?token=forged", { method: "POST" }),
    env: { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET },
  } as never);
  assert.equal(res.status, 400);
});

test("confirmation email carries List-Unsubscribe one-click headers", async () => {
  let payload: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    payload = JSON.parse(String(init.body));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const result = await sendConfirmationEmail(
    { apiKey: "k", from: "hi@example.com" },
    { to: "reader@example.com", confirmUrl: "https://example.com/c", unsubscribeUrl: "https://example.com/u", oneClickUrl: "https://example.com/api/u" },
    fakeFetch,
  );
  assert.equal(result.ok, true);
  const headers = payload.headers as Record<string, string>;
  assert.equal(headers["List-Unsubscribe"], "<https://example.com/api/u>");
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");

  const unconfigured = await sendConfirmationEmail({}, { to: "a@b.com", confirmUrl: "x", unsubscribeUrl: "y", oneClickUrl: "z" });
  assert.deepEqual(unconfigured, { ok: false, reason: "unconfigured" });
});

// ── Review follow-ups (#105) ─────────────────────────────────────────────

test("signed links fail closed when no deployment secret is set", async () => {
  const { db } = fakeDb();
  const { tokenSecret } = await import("../apps/web/functions/api/newsletter/subscribe");
  // A dev fallback exists, but only on localhost — the constant is public.
  assert.equal(tokenSecret({} as never, new URL("https://nobodynamed.com/x")), null);
  assert.ok(tokenSecret({} as never, new URL("http://localhost:8788/x")));
  assert.equal(tokenSecret({ NEWSLETTER_TOKEN_SECRET: "real" } as never, new URL("https://nobodynamed.com/x")), "real");

  // A token minted with the public dev constant must not work in production.
  const forged = await signToken("nv-newsletter-dev-secret", "unsubscribe", "victim@example.com");
  let ran = "";
  const { onRequestPost } = await import("../apps/web/functions/api/newsletter/unsubscribe");
  const res = await onRequestPost({
    request: new Request(`https://nobodynamed.com/api/newsletter/unsubscribe?token=${encodeURIComponent(forged)}`, { method: "POST" }),
    env: { DB: fakeDb({ onRun: (s) => { ran = s; } }).db },
  } as never);
  assert.equal(res.status, 400);
  assert.equal(ran, "");

  // …and with the provider configured but no secret, signup must not issue
  // links at all: it falls back to single opt-in instead.
  let sql = "";
  const sub = await (await import("../apps/web/functions/api/newsletter/subscribe")).onRequestPost({
    request: new Request("https://nobodynamed.com/api/newsletter/subscribe", {
      method: "POST",
      body: new URLSearchParams({ email: "reader@example.com", sourcePlacement: "test" }),
    }),
    env: { DB: fakeDb({ onRun: (s) => { if (s.includes("newsletter_subscribers")) sql = s; } }).db,
           NEWSLETTER_API_KEY: "key", NEWSLETTER_FROM: "hi@example.com" },
    waitUntil() {},
  } as never);
  assert.deepEqual(await sub.json(), { ok: true, status: "subscribed" });
  assert.match(sql, /'active'/);
  assert.ok(db);
});

test("List-Unsubscribe points at the one-click API route, not the page", async () => {
  let payload: Record<string, unknown> = {};
  const fakeFetch = (async (_url: string, init: RequestInit) => {
    payload = JSON.parse(String(init.body));
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  await sendConfirmationEmail(
    { apiKey: "k", from: "hi@example.com" },
    {
      to: "reader@example.com",
      confirmUrl: "https://example.com/newsletter/confirm?token=c",
      unsubscribeUrl: "https://example.com/newsletter/unsubscribe?token=u",
      oneClickUrl: "https://example.com/api/newsletter/unsubscribe?token=u",
    },
    fakeFetch,
  );
  const headers = payload.headers as Record<string, string>;
  assert.equal(headers["List-Unsubscribe"], "<https://example.com/api/newsletter/unsubscribe?token=u>");
  // The body still links the friendly page, so a human clicking gets a button.
  assert.match(String(payload.html), /\/newsletter\/unsubscribe\?token=u/);
});

test("a provider POSTing the List-Unsubscribe URL with no body still unsubscribes", async () => {
  const token = await signToken(SECRET, "unsubscribe", "reader@example.com");
  for (const [label, path, load] of [
    ["api route", "/api/newsletter/unsubscribe", () => import("../apps/web/functions/api/newsletter/unsubscribe")],
    ["page route", "/newsletter/unsubscribe", () => import("../apps/web/functions/newsletter/unsubscribe")],
  ] as const) {
    let ran = "";
    const { db } = fakeDb({ onRun: (s) => { ran = s; } });
    const { onRequestPost } = await load();
    await onRequestPost({
      request: new Request(`https://example.com${path}?token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "List-Unsubscribe=One-Click",
      }),
      env: { DB: db, NEWSLETTER_TOKEN_SECRET: SECRET },
    } as never);
    assert.match(ran, /status='unsubscribed'/, label);
  }
});

test("expired pending signups are swept so the email's promise holds", async () => {
  let sql = "";
  let bound: unknown[] = [];
  const db = {
    prepare(value: string) {
      return { bind(...args: unknown[]) { sql = value; bound = args; return { async run() {} }; } };
    },
  } as unknown as D1Database;
  await sweepStalePending(db);
  assert.match(sql, /DELETE FROM newsletter_subscribers/);
  assert.match(sql, /status = 'pending'/);
  assert.equal(bound[0], `-${CONFIRM_TOKEN_TTL_SECONDS} seconds`);
});

test("the unsubscribe form is not instrumented as a newsletter signup", () => {
  const html = renderUnsubscribeConfirm("tok", "reader@example.com");
  // analytics.js keys its submit listener on the subscribe action; the
  // unsubscribe form must match neither that nor the signup container class.
  assert.ok(!html.includes("newsletter-signup"));
  assert.ok(!html.includes('action="/api/newsletter/subscribe"'));
  assert.match(renderNewsletterSignup("hub"), /action="\/api\/newsletter\/subscribe"/);
});
