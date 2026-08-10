# Auth.md

NobodyNamed's public data API and MCP server require **no authentication**.

There is no API key, no OAuth flow, no signup, and no bearer token for reading
name data. There is no authorization server, and no OAuth or OIDC discovery
metadata is published — a client attempting a sign-in handshake before reading
data is misconfigured.

## Endpoints

| Surface              | URL                                      | Auth                     |
| -------------------- | ---------------------------------------- | ------------------------ |
| MCP server           | `https://nobodynamed.com/mcp`            | None                     |
| Name data API        | `https://nobodynamed.com/api/*`           | None (except rows below) |
| Newsletter signup    | `POST /api/newsletter/subscribe`         | None, but rate limited   |
| Paid report          | `GET /api/premium/report/{name}`         | Payment, not credentials |
| Blog admin           | `/api/blog/admin`                        | **Required**             |

Two `/api/*` paths are exceptions to the blanket "no auth" rule above:

- **`/api/blog/admin`** is a private administrative endpoint. It requires either
  a Cloudflare Access identity (`Cf-Access-Authenticated-User-Email`) or
  `Authorization: Bearer <secret>`, and returns `401 {"error":"unauthorized"}`
  otherwise. It is not part of the public data API and has no credentials to
  hand out.
- **`GET /api/premium/report/{name}`** is gated by payment rather than identity
  — see below.

See [/developers](https://nobodynamed.com/developers) for the full endpoint
reference and MCP client setup, and
[/.well-known/api-catalog](https://nobodynamed.com/.well-known/api-catalog) for
a machine-readable index.

## Rate limits

Read endpoints (name data, search, MCP tool calls) have no enforced rate limit
today. Please keep request volume reasonable.

`POST /api/newsletter/subscribe` is the exception and is actively throttled:

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
