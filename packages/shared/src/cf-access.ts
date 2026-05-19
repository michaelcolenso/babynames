// Cloudflare Access JWT verification utility.
//
// When Cloudflare Access sits in front of an endpoint, authenticated requests
// carry two headers:
//   Cf-Access-Authenticated-User-Email  — verified identity
//   Cf-Access-Jwt-Assertion             — signed RS256 JWT
//
// This module validates the JWT assertion against the Access team's JWKS
// endpoint so that a Worker / Pages Function can trust the identity without
// managing its own authentication state.
//
// Usage:
//   const email = await verifyAccessJwt(request, {
//     teamDomain: "myteam.cloudflareaccess.com",
//     aud: "abc123...",   // Application AUD from the Access policy
//   });
//
// Returns the authenticated email on success, null if no Access headers are
// present, or throws on invalid / expired tokens.

// ─── Base64URL helpers (no padding, URL-safe alphabet) ──────────────────────

function base64urlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "===".slice(0, (4 - (b64.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function base64urlEncode(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── JWK → CryptoKey (RS256) ───────────────────────────────────────────────

interface AccessJwk {
  kid: string;
  kty: "RSA";
  alg: "RS256";
  n: string; // modulus, base64url
  e: string; // exponent, base64url
}

interface AccessJwks {
  keys: AccessJwk[];
}

async function jwkToCryptoKey(jwk: AccessJwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: "RS256",
      ext: false,
      key_ops: ["verify"],
    },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

// ─── JWT parsing ───────────────────────────────────────────────────────────

interface AccessJwtHeader {
  kid: string;
  alg: string;
}

interface AccessJwtClaims {
  aud: string[];
  exp: number;
  iss: string;
  email: string;
  sub: string;
  iat: number;
  type: string;
  identity_nonce: string;
}

function parseJwt(token: string): {
  header: AccessJwtHeader;
  claims: AccessJwtClaims;
  signature: Uint8Array;
  signingInput: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("invalid_jwt_format");

  const [headerB64, claimsB64, sigB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(base64urlDecode(headerB64!))) as AccessJwtHeader;
  const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(claimsB64!))) as AccessJwtClaims;
  const signature = base64urlDecode(sigB64!);
  const signingInput = `${headerB64}.${claimsB64}`;

  return { header, claims, signature, signingInput };
}

// ─── JWKS fetching with minimal in-memory cache ─────────────────────────────

let cachedJwks: { keys: AccessJwk[]; expiresAt: number } | null = null;

async function fetchJwks(teamDomain: string): Promise<AccessJwk[]> {
  const now = Date.now();
  if (cachedJwks && cachedJwks.expiresAt > now) {
    return cachedJwks.keys;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`jwks_fetch_failed: ${resp.status}`);

  const jwks = (await resp.json()) as AccessJwks;
  // Cache for 1 hour. The keys rotate infrequently.
  cachedJwks = { keys: jwks.keys, expiresAt: now + 3_600_000 };
  return jwks.keys;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export interface AccessJwtOptions {
  /** Cloudflare Access team domain, e.g. "myteam.cloudflareaccess.com" */
  teamDomain: string;
  /** Application Audience (AUD) tag from the Access application settings */
  aud: string;
}

/**
 * Verify a Cloudflare Access JWT assertion.
 *
 * Returns the authenticated user's email on success.
 * Returns `null` if the request has no Access headers (so the caller can
 * fall back to another auth method).
 * Throws on an invalid / expired / misconfigured token.
 */
export async function verifyAccessJwt(
  request: Request,
  opts: AccessJwtOptions,
): Promise<string | null> {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return null;

  const { header, claims, signature, signingInput } = parseJwt(jwt);

  // 1. Fetch JWKS and locate the signing key.
  const jwks = await fetchJwks(opts.teamDomain);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) throw new Error("unknown_jwk_kid");

  // 2. Verify the RS256 signature.
  const key = await jwkToCryptoKey(jwk);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(signingInput),
  );
  if (!valid) throw new Error("invalid_jwt_signature");

  // 3. Check claims.
  const now = Math.floor(Date.now() / 1000);
  if (claims.exp <= now) throw new Error("jwt_expired");

  if (!claims.aud.includes(opts.aud)) {
    throw new Error(`jwt_aud_mismatch: expected ${opts.aud}, got ${JSON.stringify(claims.aud)}`);
  }

  // The issuer is the team domain.
  const expectedIss = `https://${opts.teamDomain}`;
  if (claims.iss !== expectedIss) {
    throw new Error(`jwt_iss_mismatch: expected ${expectedIss}, got ${claims.iss}`);
  }

  // The email header is set by Cloudflare and should match the JWT claims.
  // We trust the JWT claims directly after signature verification.
  return claims.email || null;
}
