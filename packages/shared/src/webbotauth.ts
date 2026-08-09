// Web Bot Auth (IETF WebBotAuth WG) outbound request signing.
//
// Implements the two pieces this site's outbound fetches need:
//  - ed25519Thumbprint(): RFC 7638 JWK SHA-256 thumbprint for an Ed25519
//    (OKP) key, required as the `kid` in the published key directory and
//    the `keyid` signature parameter (draft-meunier-webbotauth-httpsig-directory
//    Section 3, "keyid MUST be a base64url JWK SHA-256 Thumbprint").
//  - signWebBotAuthRequest(): builds the Signature-Agent, Signature-Input,
//    and Signature headers per draft-meunier-webbotauth-httpsig-protocol
//    Section 5, covering the "@authority" and "signature-agent" components
//    with an Ed25519 signature (RFC 9421 HTTP Message Signatures).
//
// The signature-base construction and Ed25519 signing here are verified
// byte-for-byte against the protocol draft's own Ed25519 test vectors
// (Appendix E.2.1 and E.2.2) — see scripts/webbotauth.test.ts.

export interface Ed25519PrivateJwk {
  kty: "OKP";
  crv: "Ed25519";
  d: string;
  x: string;
}

export interface Ed25519PublicJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
}

function base64Encode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64UrlEncode(bytes: Uint8Array): string {
  return base64Encode(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// RFC 7638 JWK SHA-256 thumbprint, restricted to the Ed25519 (OKP) member
// set (crv, kty, x) per RFC 8037 Appendix A.3 — lexicographically ordered,
// no whitespace.
export async function ed25519Thumbprint(jwk: Ed25519PublicJwk): Promise<string> {
  const canonical = `{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}"}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return base64UrlEncode(new Uint8Array(digest));
}

// RFC 8941 Structured Fields sf-string serialization: quoted, with `\` and
// `"` backslash-escaped. Good enough here since we only ever serialize
// plain URLs and base64 text (no control characters).
function sfString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function randomNonce(): string {
  return base64Encode(crypto.getRandomValues(new Uint8Array(48)));
}

export interface WebBotAuthSignOptions {
  /** The signer's Ed25519 private key. */
  privateKey: Ed25519PrivateJwk;
  /** RFC 7638 thumbprint of the *public* key — must match the kid published
   *  in this site's /.well-known/http-message-signatures-directory. */
  keyid: string;
  /** Origin verifiers resolve to find the key directory, e.g. "https://nobodynamed.com". */
  signatureAgentUrl: string;
  /** The request URL being signed — @authority is derived from its host. */
  targetUrl: string;
  /** Signature validity window in seconds. Keep this short — a signature
   *  covering only @authority is reusable against that authority for any
   *  request until it expires. Default 300s (5 minutes). */
  ttlSeconds?: number;
  /** Test-only overrides for created (unix seconds) and nonce, so a caller
   *  can reproduce a deterministic signature base — e.g. against the
   *  protocol draft's own test vectors. Never set these in production. */
  _createdAt?: number;
  _nonce?: string;
}

export interface WebBotAuthHeaders extends Record<string, string> {
  "Signature-Agent": string;
  "Signature-Input": string;
  Signature: string;
}

const SIGNATURE_LABEL = "sig1";

// Builds and signs the Signature-Agent / Signature-Input / Signature header
// trio for one outbound request, covering ("@authority" "signature-agent")
// with an Ed25519 signature — the format an origin's Web Bot Auth verifier
// (e.g. Cloudflare's) checks against the signer's published key directory.
export async function signWebBotAuthRequest(
  opts: WebBotAuthSignOptions,
): Promise<WebBotAuthHeaders> {
  const authority = new URL(opts.targetUrl).host;
  const created = opts._createdAt ?? Math.floor(Date.now() / 1000);
  const expires = created + (opts.ttlSeconds ?? 300);
  const nonce = opts._nonce ?? randomNonce();

  const agentValue = sfString(opts.signatureAgentUrl);
  const paramsList =
    `("@authority" "signature-agent";key=${sfString(SIGNATURE_LABEL)})` +
    `;created=${created};keyid=${sfString(opts.keyid)};alg="ed25519";expires=${expires}` +
    `;nonce=${sfString(nonce)};tag="web-bot-auth"`;

  const signatureBase =
    `"@authority": ${authority}\n` +
    `"signature-agent";key=${sfString(SIGNATURE_LABEL)}: ${agentValue}\n` +
    `"@signature-params": ${paramsList}`;

  const key = await crypto.subtle.importKey("jwk", opts.privateKey, { name: "Ed25519" }, false, [
    "sign",
  ]);
  const signatureBytes = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(signatureBase),
  );

  return {
    "Signature-Agent": `${SIGNATURE_LABEL}=${agentValue}`,
    "Signature-Input": `${SIGNATURE_LABEL}=${paramsList}`,
    Signature: `${SIGNATURE_LABEL}=:${base64Encode(new Uint8Array(signatureBytes))}:`,
  };
}
