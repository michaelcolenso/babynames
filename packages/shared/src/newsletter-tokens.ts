// Signed, stateless newsletter tokens.
//
// Confirmation and unsubscribe links have to survive a round trip through
// somebody's inbox, so they can't be session-bound — but they also can't be
// guessable, or anyone could confirm (or unsubscribe) an address they don't
// control. Both are therefore HMAC-SHA256 over "purpose:email:issuedAt",
// keyed by NEWSLETTER_TOKEN_SECRET. Nothing is stored: verification recomputes
// the MAC, so there is no token table to grow, expire, or leak.

export type TokenPurpose = "confirm" | "unsubscribe";

export interface TokenPayload {
  purpose: TokenPurpose;
  email: string;
  issuedAt: number;
}

export type TokenFailure = "malformed" | "bad-signature" | "expired" | "wrong-purpose";
export type TokenResult = { ok: true; payload: TokenPayload } | { ok: false; reason: TokenFailure };

// Confirmation links are short-lived; unsubscribe links must work forever,
// because they live in every email we ever sent.
export const CONFIRM_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export async function signToken(secret: string, purpose: TokenPurpose, email: string, issuedAt = Date.now()): Promise<string> {
  const seconds = Math.floor(issuedAt / 1000);
  const body = `${purpose}:${email}:${seconds}`;
  const mac = await hmac(secret, body);
  return `${b64url(new TextEncoder().encode(body))}.${b64url(mac)}`;
}

export async function verifyToken(
  secret: string,
  token: string,
  expectedPurpose: TokenPurpose,
  now = Date.now(),
): Promise<TokenResult> {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: "malformed" };

  let body: string;
  let signature: Uint8Array;
  try {
    body = new TextDecoder().decode(unb64url(token.slice(0, dot)));
    signature = unb64url(token.slice(dot + 1));
  } catch {
    return { ok: false, reason: "malformed" };
  }

  const expected = await hmac(secret, body);
  if (!timingSafeEqual(expected, signature)) return { ok: false, reason: "bad-signature" };

  // Only parse the body *after* the MAC checks out, so nothing downstream ever
  // sees attacker-chosen fields.
  const sep1 = body.indexOf(":");
  const sep2 = body.lastIndexOf(":");
  if (sep1 <= 0 || sep2 <= sep1) return { ok: false, reason: "malformed" };
  const purpose = body.slice(0, sep1);
  const email = body.slice(sep1 + 1, sep2);
  const seconds = Number(body.slice(sep2 + 1));
  if (!email || !Number.isFinite(seconds)) return { ok: false, reason: "malformed" };
  if (purpose !== expectedPurpose) return { ok: false, reason: "wrong-purpose" };

  const issuedAt = seconds * 1000;
  if (purpose === "confirm" && now - issuedAt > CONFIRM_TOKEN_TTL_SECONDS * 1000) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, payload: { purpose, email, issuedAt } };
}

/**
 * Stable, non-reversible key for rate-limit buckets. IP addresses are personal
 * data and there is no reason to persist them in cleartext to count requests.
 */
export async function hashKey(secret: string, value: string): Promise<string> {
  return b64url(await hmac(secret, `ratelimit:${value}`)).slice(0, 22);
}

async function hmac(secret: string, body: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  // Comparing MACs, so the length is public and a length mismatch is a plain
  // reject; the byte loop below stays constant-time for equal-length inputs.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("not base64url");
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
