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
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function base64urlEncode(buf: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]!);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── JWK → CryptoKey (RS256) ───────────────────────────────────────────────

interface AccessJwk {
  kid: string;
  kty: string;
  alg: string;
  use?: string;
  n: string; // modulus, base64url
  e: string; // exponent, base64url
}

interface AccessJwks {
  keys: AccessJwk[];
}

async function jwkToCryptoKey(jwk: AccessJwk): Promise<CryptoKey> {
  // Import the RSA public key via JWK. The resulting CryptoKey may silently
  // fail to verify in some Workers runtime versions — the caller handles
  // this by falling back to SPKI (DER) import.
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

// Convert JWK RSA public key → SPKI DER (fallback when JWK import fails).
// The Workers Web Crypto implementation is known to be stricter with SPKI
// than JWK for RSA keys in some runtime versions.
function jwkToSpkiDer(jwk: AccessJwk): Uint8Array {
  // Decode base64url n (modulus) and e (exponent) to raw bytes.
  const nBytes = base64urlDecode(jwk.n);
  const eBytes = base64urlDecode(jwk.e);

  // ── ASN.1 DER helpers ─────────────────────────────────────────────────
  const lenByte = (len: number): number[] => {
    if (len < 0x80) return [len];
    const bytes: number[] = [];
    let v = len;
    while (v) { bytes.unshift(v & 0xff); v >>>= 8; }
    return [0x80 | bytes.length, ...bytes];
  };

  const integer = (bytes: Uint8Array): number[] => {
    // Strip leading zeros but ensure the integer stays positive.
    let start = 0;
    while (start < bytes.length && bytes[start] === 0) start++;
    if (start === bytes.length) return [0x02, 0x01, 0x00]; // zero
    // If the high bit of the first byte is set, prepend a zero byte.
    const needsPad = (bytes[start]! & 0x80) !== 0;
    const val = bytes.slice(start);
    const len = val.length + (needsPad ? 1 : 0);
    return [0x02, ...lenByte(len), ...(needsPad ? [0x00] : []), ...Array.from(val)];
  };

  const sequence = (items: number[][]): number[] => {
    const body = items.flat();
    return [0x30, ...lenByte(body.length), ...body];
  };

  const bitString = (bytes: Uint8Array): number[] => {
    return [0x03, ...lenByte(bytes.length + 1), 0x00, ...Array.from(bytes)];
  };

  const oid = (bytes: number[]): number[] => [0x06, ...lenByte(bytes.length), ...bytes];

  // rsaEncryption OID: 1.2.840.113549.1.1.1 → 2a 86 48 86 f7 0d 01 01 01
  const rsaOid = oid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]);
  const nullParam = [0x05, 0x00]; // ASN.1 NULL

  const algorithmIdentifier = sequence([rsaOid, nullParam]);
  const publicKey = sequence([integer(nBytes), integer(eBytes)]);
  const spki = sequence([
    algorithmIdentifier,
    bitString(new Uint8Array(publicKey)),
  ]);

  return new Uint8Array(spki);
}

async function jwkToCryptoKeySpki(jwk: AccessJwk): Promise<CryptoKey> {
  const spki = jwkToSpkiDer(jwk);
  return crypto.subtle.importKey(
    "spki",
    spki,
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
  const jwtRaw = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwtRaw) return null;
  const jwt = jwtRaw.trim();
  if (!jwt) return null;

  const { header, claims, signature, signingInput } = parseJwt(jwt);

  // 1. Fetch JWKS and locate the signing key.
  const jwks = await fetchJwks(opts.teamDomain);
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) {
    throw new Error(
      `unknown_jwk_kid: header kid=${header.kid}, available kids=${jwks.map((k) => k.kid).join(",")}`,
    );
  }

  // 2. Verify the RS256 signature — try JWK import first, then SPKI.
  const sigLen = signature.byteLength;
  const dataLen = signingInput.length;
  console.log(
    `cf-access: verifying kid=${jwk.kid} nLen=${jwk.n.length} eLen=${jwk.e.length} sigLen=${sigLen} dataLen=${dataLen}`,
  );
  const data = new TextEncoder().encode(signingInput);

  let key: CryptoKey;
  let importMethod: string;
  try {
    key = await jwkToCryptoKey(jwk);
    importMethod = "jwk";
  } catch {
    // JWK import failed outright — fall back to SPKI DER.
    console.log(`cf-access: JWK import failed, trying SPKI fallback`);
    key = await jwkToCryptoKeySpki(jwk);
    importMethod = "spki";
  }

  const keyAlg = key.algorithm as { name: string; hash?: { name: string } };
  console.log(
    `cf-access: key imported via ${importMethod} type=${key.type} algName=${keyAlg.name} algHash=${keyAlg.hash?.name ?? "none"} usages=${key.usages.join(",")}`,
  );

  let valid = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    key,
    signature,
    data,
  );

  // If JWK-based key didn't verify, try SPKI as a fallback.
  if (!valid && importMethod === "jwk") {
    console.log(`cf-access: JWK key verification failed, trying SPKI fallback`);
    try {
      key = await jwkToCryptoKeySpki(jwk);
      importMethod = "spki";
      const keyAlg2 = key.algorithm as { name: string; hash?: { name: string } };
      console.log(
        `cf-access: SPKI key imported type=${key.type} algName=${keyAlg2.name} algHash=${keyAlg2.hash?.name ?? "none"}`,
      );
      valid = await crypto.subtle.verify(
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        key,
        signature,
        data,
      );
    } catch (spkiErr) {
      console.error(`cf-access: SPKI fallback also failed: ${String(spkiErr)}`);
    }
  }

  if (!valid) {
    throw new Error(
      `invalid_jwt_signature: kid=${jwk.kid}, method=${importMethod}, header alg=${header.alg}, jwk alg=${jwk.alg}`,
    );
  }

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
