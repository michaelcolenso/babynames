# Authentication

NobodyNamed's public API and MCP server require **no authentication**.

There is no API key, no OAuth flow, no signup, and no bearer token. Every
endpoint listed below is open to anonymous requests.

If a client attempts an OAuth or sign-in handshake against this site, that is a
misconfiguration on the client side — this site publishes no authorization
server and does not accept credentials.

## Endpoints

| Surface   | URL                                | Auth |
| --------- | ---------------------------------- | ---- |
| REST API  | `https://nobodynamed.com/api/*`    | None |
| MCP server| `https://nobodynamed.com/mcp`      | None |

See [/developers](https://nobodynamed.com/developers) for the full endpoint
reference and MCP client setup, and
[/.well-known/api-catalog](https://nobodynamed.com/.well-known/api-catalog) for
a machine-readable index.

## Rate limits

No rate limits are enforced today. Please keep request volume reasonable.

## Paid endpoints

One endpoint, `GET /api/premium/report/{name}`, is gated behind the
[x402](https://x402.org) payment protocol rather than authentication. It
responds with HTTP 402 and payment requirements instead of a credential
challenge. All other endpoints are free.

## Data source

U.S. Social Security Administration birth records (1880–present), released as
CC0 public domain.
