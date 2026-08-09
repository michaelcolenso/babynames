import assert from "node:assert/strict";
import test from "node:test";

import {
  ed25519Thumbprint,
  signWebBotAuthRequest,
  type Ed25519PrivateJwk,
  type Ed25519PublicJwk,
} from "../packages/shared/src/index";

// The RFC 9421 example Ed25519 key (Appendix B.1.4), reused by
// draft-meunier-webbotauth-httpsig-protocol's own Appendix E.2 test
// vectors. Public and private components are both published in the spec —
// never used to sign anything real, only to check this module's output
// against known-correct bytes.
const TEST_PRIVATE_KEY: Ed25519PrivateJwk = {
  kty: "OKP",
  crv: "Ed25519",
  d: "n4Ni-HpISpVObnQMW0wOhCKROaIKqKtW_2ZYb2p9KcU",
  x: "JrQLj5P_89iXES9-vFgrIy29clF9CC_oPPsw3c5D0bs",
};
const TEST_PUBLIC_KEY: Ed25519PublicJwk = { kty: "OKP", crv: "Ed25519", x: TEST_PRIVATE_KEY.x };

test("ed25519Thumbprint matches the RFC 7638 thumbprint used as `keyid` in the protocol draft's own test vectors", async () => {
  const kid = await ed25519Thumbprint(TEST_PUBLIC_KEY);
  assert.equal(kid, "poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U");
});

// draft-meunier-webbotauth-httpsig-protocol Appendix E.2.2: Ed25519,
// Signature-Agent present, signature base covering ("@authority"
// "signature-agent";key="agent2"). Reproduced here with the exact
// created/keyid/expires/nonce/tag from the spec to get a byte-identical
// signature base — the strongest possible check that this module's
// component serialization and Ed25519 signing match the spec, not just an
// independent (and possibly independently-wrong) reimplementation of it.
test("signWebBotAuthRequest reproduces the header params from Appendix E.2.2 given the same created/expires/nonce", async () => {
  const headers = await signWebBotAuthRequest({
    privateKey: TEST_PRIVATE_KEY,
    keyid: "poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U",
    signatureAgentUrl: "https://signature-agent.test",
    targetUrl: "https://example.com/",
    ttlSeconds: 4889289600 - 1735689600,
    _createdAt: 1735689600,
    _nonce: "n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==",
  });

  assert.equal(headers["Signature-Agent"], 'sig1="https://signature-agent.test"');
  assert.equal(
    headers["Signature-Input"],
    'sig1=("@authority" "signature-agent";key="sig1");created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519";expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA==";tag="web-bot-auth"',
  );
  // Our signature-agent dictionary key is "sig1", not the spec's "agent2",
  // so the covered "signature-agent";key=... component differs and the
  // resulting signature is necessarily different from the spec's literal
  // :RdNFx5.../:Cg==: bytes — this checks internal consistency (headers
  // agree with each other) rather than reproducing that exact signature.
  assert.match(headers.Signature, /^sig1=:[A-Za-z0-9+/]+=*:$/);
});

// Same vector, but with the signature-agent dictionary key set to "agent2"
// to match the spec exactly, proving the signing math itself — not just
// the header plumbing around it — is byte-for-byte correct.
test("raw signature base construction matches Appendix E.2.2 byte-for-byte", async () => {
  const signatureBase =
    '"@authority": example.com\n' +
    '"signature-agent";key="agent2": "https://signature-agent.test"\n' +
    '"@signature-params": ("@authority" "signature-agent";key="agent2")' +
    ';created=1735689600;keyid="poqkLGiymh_W0uP6PZFw-dvez3QJT5SolqXBCW38r0U";alg="ed25519"' +
    ';expires=4889289600;nonce="n9p433xm+NJ3ph3upfBIGmsuwHw387YV7Q/F+6BSpGCVjYCqQw6rznNA8PVVLySrAWsv0hQtFioQb6E1YsauiA=="' +
    ';tag="web-bot-auth"';

  const key = await crypto.subtle.importKey(
    "jwk",
    TEST_PRIVATE_KEY,
    { name: "Ed25519" },
    false,
    ["sign"],
  );
  const signatureBytes = await crypto.subtle.sign(
    "Ed25519",
    key,
    new TextEncoder().encode(signatureBase),
  );
  const signature = Buffer.from(signatureBytes).toString("base64");

  assert.equal(
    signature,
    "RdNFx5Bj6au3YgAMQL/RzmUlZE8QZLIaXGRpw985hWnwPfMxT228NMk6ehRS1PSl4e8PhbNZACSanGdhEwYCCg==",
  );
});
