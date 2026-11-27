import assert from "node:assert/strict";
import test from "node:test";

import { isAdminRequest } from "../apps/web/functions/api/blog/admin";

const req = (host: string, headers: Record<string, string> = {}) =>
  new Request(`https://${host}/api/blog/admin?list=1`, { headers });

const accessEnv = { CF_ACCESS_AUD: "aud-123", CF_ACCESS_TEAM_DOMAIN: "team.cloudflareaccess.com" };
const acceptJwt = async () => "editor@example.com";
const rejectJwt = async () => {
  throw new Error("invalid_jwt_signature");
};

test("a spoofed Cf-Access email header alone is never enough", async () => {
  const r = req("name-vitals.pages.dev", { "Cf-Access-Authenticated-User-Email": "x@example.com" });
  assert.equal(await isAdminRequest(r, {}, acceptJwt), false);
  assert.equal(await isAdminRequest(r, accessEnv, acceptJwt), false);
});

test("nothing configured fails closed off localhost", async () => {
  assert.equal(await isAdminRequest(req("name-vitals.pages.dev"), {}), false);
  assert.equal(await isAdminRequest(req("abc123.name-vitals.pages.dev"), {}), false);
  assert.equal(await isAdminRequest(req("nobodynamed.com"), {}), false);
});

test("nothing configured stays open on localhost for dev", async () => {
  assert.equal(await isAdminRequest(req("localhost:8788"), {}), true);
  assert.equal(await isAdminRequest(req("127.0.0.1:8788"), {}), true);
});

test("localhost is closed once any auth is configured", async () => {
  assert.equal(await isAdminRequest(req("localhost:8788"), { BLOG_ADMIN_SECRET: "s3cret" }), false);
  assert.equal(await isAdminRequest(req("localhost:8788"), accessEnv, rejectJwt), false);
});

test("a verified Access JWT is accepted, a rejected one is not", async () => {
  const r = req("nobodynamed.com", { "Cf-Access-Jwt-Assertion": "a.b.c" });
  assert.equal(await isAdminRequest(r, accessEnv, acceptJwt), true);
  assert.equal(await isAdminRequest(r, accessEnv, rejectJwt), false);
  assert.equal(await isAdminRequest(r, {}, acceptJwt), false, "JWT ignored when Access is not configured");
});

test("bearer secret must match exactly", async () => {
  const env = { BLOG_ADMIN_SECRET: "s3cret" };
  assert.equal(await isAdminRequest(req("nobodynamed.com", { Authorization: "Bearer s3cret" }), env), true);
  assert.equal(await isAdminRequest(req("nobodynamed.com", { Authorization: "Bearer s3cre" }), env), false);
  assert.equal(await isAdminRequest(req("nobodynamed.com", { Authorization: "Bearer " }), env), false);
  assert.equal(await isAdminRequest(req("nobodynamed.com"), env), false);
});
