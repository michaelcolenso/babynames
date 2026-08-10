# Auth.md

NobodyNamed's public data API and MCP server require **no authentication**.

There is no API key, no OAuth flow, no signup, and no bearer token for reading
name data. There is no authorization server, and no OAuth or OIDC discovery
metadata is published — a client attempting a sign-in handshake before reading
data is misconfigured.

## What the no-auth guarantee covers

It covers the **read-only name-data surface**, listed explicitly rather than as
a wildcard so that adding an endpoint elsewhere never silently widens it:

| Surface                        | Auth |
| ------------------------------ | ---- |
| `https://nobodynamed.com/mcp`  | None |
| `GET /api/search`              | None |
| `GET /api/name/{name}`         | None |
| `GET /api/meta`                | None |
| `GET /api/landing/{kind}`      | None |
| `GET /api/year/{year}`         | None |
| `GET /api/decade/{decade}`     | None |
| `GET /api/movers/{year}`       | None |
| `GET /api/debuts/{year}`       | None |
| `GET /api/compare`             | None |
| `GET /api/twin/{name}`         | None |
| `GET /api/enrichment/{name}`   | None |
| `GET /api/diaspora/{name}`     | None |

Every MCP tool maps onto one of these. See
[/developers](https://nobodynamed.com/developers) for the full reference and
[/.well-known/api-catalog](https://nobodynamed.com/.well-known/api-catalog) for
a machine-readable index.

## Endpoints outside that guarantee

Other paths under `/api/` are **not** part of the public data surface and each
has its own requirement:

- **`GET /api/premium/report/{name}`** — gated by payment, not identity. See
  below.
- **`/api/blog/admin`** — a private administrative endpoint. A bare
  `GET` returns the admin page itself, but every operation that touches data
  (`?list`, `?load={slug}`, `POST`, `DELETE`) requires either a Cloudflare
  Access identity (`Cf-Access-Authenticated-User-Email`) or
  `Authorization: Bearer <secret>`, and returns `401 {"error":"unauthorized"}`
  without one. There are no credentials to hand out.
- **`POST /api/newsletter/subscribe`** — no credential, but rate limited. See
  below.
- **`POST /api/newsletter/unsubscribe`** — requires the signed, single-purpose
  token embedded in an unsubscribe link, supplied as a `token` query parameter
  or form field. Without a valid one it returns
  `400 {"status":"link-invalid"}`. The token is a capability, not an identity:
  it is issued only in outgoing email and cannot be requested.

## Rate limits

The read-only name-data endpoints listed above, and MCP tool calls, have no
enforced rate limit today. Please keep request volume reasonable.

`POST /api/newsletter/subscribe` is throttled:

| Scope          | Limit                  | On exceed                       |
| -------------- | ---------------------- | ------------------------------- |
| Per client IP  | 5 requests / 10 minutes| `429` with `Retry-After`        |
| Per email address | 3 requests / 24 hours | `429` with `Retry-After`       |

Both return HTTP `429` carrying a `Retry-After` value; wait for it rather than
retrying immediately.

## Paid endpoints

One endpoint, `GET /api/premium/report/{name}`, is gated behind the
[x402](https://x402.org) payment protocol rather than authentication. It
responds with HTTP 402 and payment requirements instead of a credential
challenge. All other endpoints are free.

## Data source

U.S. Social Security Administration birth records (1880–present), released as
CC0 public domain.
