# Newsletter signup flow

End-to-end: signup form → confirmation email → confirm link → active
subscriber, with a one-click unsubscribe that works from any email client.

## Configuration

All four are Pages environment settings. The two secrets should be set with
`wrangler pages secret put <NAME>`; the other two are plain variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEWSLETTER_TOKEN_SECRET` | **yes, for double opt-in** | HMAC key for confirm/unsubscribe links. Off localhost there is no fallback: unset means signed links are disabled entirely (see below). |
| `NEWSLETTER_API_KEY` | for double opt-in | Resend API key. |
| `NEWSLETTER_FROM` | for double opt-in | Verified sender, e.g. `NobodyNamed <hello@nobodynamed.com>`. |
| `NEWSLETTER_REPLY_TO` | optional | Reply-to address. |

**Opt-in mode is inferred, not configured.** With `NEWSLETTER_API_KEY`,
`NEWSLETTER_FROM` **and** `NEWSLETTER_TOKEN_SECRET` all set, signup is double
opt-in. With any of them missing, it falls back to the previous single opt-in
behaviour — activating immediately rather than parking people in a `pending`
state that no confirmation email can ever release them from. Setting the three
values is what flips the flow on; no code change or redeploy toggle is involved.

`NEWSLETTER_TOKEN_SECRET` fails closed. A development fallback constant exists,
but it is only honoured when the request hostname is `localhost` / `127.0.0.1`,
because the constant is published in this repository — honouring it in
production would let anyone mint a valid token for any address and confirm or
unsubscribe it at will. In production an unset secret disables double opt-in
(logging an error) and causes every confirm/unsubscribe link to be rejected,
rather than issuing links that only look authorised.

Rotating `NEWSLETTER_TOKEN_SECRET` invalidates every outstanding link,
including unsubscribe links already sitting in subscribers' inboxes. Rotate it
only if the key leaks.

## Routes

| Route | Method | Notes |
| --- | --- | --- |
| `/api/newsletter/subscribe` | POST | Same-origin only. Honeypot, per-IP and per-address rate limits. |
| `/newsletter/confirm?token=` | GET | Idempotent; safe to prefetch. |
| `/newsletter/unsubscribe?token=` | GET | Renders a confirmation form. **Does not mutate.** |
| `/newsletter/unsubscribe` | POST | The button on that form. Reads the token from the body, falling back to the query string. |
| `/api/newsletter/unsubscribe` | POST | RFC 8058 one-click, called by Gmail/Outlook, and the URL named in the `List-Unsubscribe` header. Reads the token from either the query string or the body. Not same-origin gated — the signed token is the whole authorisation, and it only ever removes consent. |

The `List-Unsubscribe` header must point at `/api/newsletter/unsubscribe`, not
the page: providers POST it unattended with a `List-Unsubscribe=One-Click` body
and no token of their own, so only the query-aware API route can serve them.

Unsubscribe is split across a GET and a POST on purpose: mail clients and
corporate security gateways prefetch every link in an incoming message, so a
GET that unsubscribed on sight would silently drop subscribers who never
clicked anything.

## Guards

- **Same-origin** on subscribe (Origin, falling back to Referer), so no third-party page can POST addresses through a visitor's browser.
- **Honeypot** `company` field — hidden from layout, tab order and the accessibility tree. A filled one gets a success response and stores nothing.
- **Per-IP limit**: 5 subscribe attempts / 10 min. Stops scripted floods.
- **Per-address limit**: 3 confirmation sends / 24 h. The honeypot and IP limit both key on the *sender*, which does nothing to stop a rotating address pool aiming the signup form at a victim's inbox. This one keys on the recipient.
- **Stale pending rows** are deleted once their confirmation window closes — an expired token can never activate the row, so keeping it would retain an address nobody finished consenting to (and the confirmation email promises otherwise). Swept beside the rate-limit buckets.
- Counters live in `newsletter_rate_limit`, keyed by HMAC of the caller identity — raw IPs are never written to disk. Expired rows are swept opportunistically in `waitUntil`, so no cron is needed. The limiter **fails open**: a counter outage degrades to the previous behaviour rather than taking signups down.

## Subscriber states

`pending` → `active` → `unsubscribed`. Re-subscribing an already-`active`
address never knocks it back to `pending` (that would effectively unsubscribe
them until they re-confirmed). Responses are identical whether or not an
address is already on the list — subscription state is not something an
unauthenticated caller gets to probe for.

## Still missing

There is no send pipeline yet: `newsletter_issues` holds drafts and nothing
delivers them. When that lands, every outgoing email must carry the same
`List-Unsubscribe` / `List-Unsubscribe-Post` header pair the confirmation
email already sets (see `sendConfirmationEmail`), or one-click unsubscribe
won't appear in mail clients.
