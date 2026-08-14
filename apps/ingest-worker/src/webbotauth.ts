// Signs this worker's outbound SSA.gov fetches per Web Bot Auth
// (draft-meunier-webbotauth-httpsig-protocol), so nobodynamed.com's
// automated fetches can be identified against the public key published at
// https://nobodynamed.com/.well-known/http-message-signatures-directory.
//
// Fails open: SSA.gov doesn't require or check this, and the ingest
// pipeline must keep working even if WEBBOTAUTH_PRIVATE_KEY_JWK isn't
// configured yet, or is briefly misconfigured.

import { ed25519Thumbprint, signWebBotAuthRequest, type Ed25519PrivateJwk } from "@nv/shared";

const SIGNATURE_AGENT_URL = "https://nobodynamed.com";

export async function webBotAuthHeaders(
  privateKeyJwk: string | undefined,
  targetUrl: string,
): Promise<Record<string, string>> {
  if (!privateKeyJwk) return {};

  let privateKey: Ed25519PrivateJwk;
  try {
    privateKey = JSON.parse(privateKeyJwk);
  } catch {
    console.error(JSON.stringify({ message: "WEBBOTAUTH_PRIVATE_KEY_JWK is not valid JSON" }));
    return {};
  }

  try {
    const keyid = await ed25519Thumbprint({
      kty: privateKey.kty,
      crv: privateKey.crv,
      x: privateKey.x,
    });
    return await signWebBotAuthRequest({
      privateKey,
      keyid,
      signatureAgentUrl: SIGNATURE_AGENT_URL,
      targetUrl,
    });
  } catch (err) {
    console.error(JSON.stringify({ message: "webbotauth signing failed", error: String(err) }));
    return {};
  }
}
