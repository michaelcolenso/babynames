# Newsletter signup flow

End-to-end: signup form → confirmation email → confirm link → active
subscriber, with a one-click unsubscribe that works from any email client.

## Configuration

All four are Pages environment settings. The two secrets should be set with
`wrangler pages secret put <NAME>`; the other two are plain variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEWSLETTER_TOKEN_SECRET` | strongly recommended | HMAC key for confirm/unsubscribe links. Falls back to a constant checked into the repo, which is fine for local dev and useless in production. |
| `NEWSLETTER_API_KEY` | for double opt-in | Resend API key. |
| `NEWSLETTER_FROM` | for double opt-in | Verified sender, e.g. `NobodyNamed <hello@nobodynamed.com>`. |
| `NEWSLETTER_REPLY_TO` | optional | Reply-to address. |

**Opt-in mode is inferred, not configured.** With `NEWSLETTER_API_KEY` and
`NEWSLETTER_FROM` both set, signup is double opt-in. With either missing, it
falls back to the previous single opt-in behaviour — activating immediately
rather than parking people in a `pending` state that no confirmation email can
ever release them from. Setting the two secrets is what flips the flow on;
no code change or redeploy toggle is involved.

Rotating `NEWSLETTER_TOKEN_SECRET` invalidates every outstanding link,
including unsubscribe links already sitting in subscribers' inboxes. Rotate it
only if the key leaks.

## Routes

| Route | Method | Notes |
| --- | --- | --- |
| `/api/newsletter/subscribe` | POST | Same-origin only. Honeypot, per-IP and per-address rate limits. |
| `/newsletter/confirm?token=` | GET | Idempotent; safe to prefetch. |
| `/newsletter/unsubscribe?token=` | GET | Renders a confirmation form. **Does not mutate.** |
| `/newsletter/unsubscribe` | POST | The button on that form. |
| `/api/newsletter/unsubscribe` | POST | RFC 8058 one-click, called by Gmail/Outlook. Not same-origin gated — the signed token is the whole authorisation, and it only ever removes consent. |

Unsubscribe is split across a GET and a POST on purpose: mail clients and
corporate security gateways prefetch every link in an incoming message, so a
GET that unsubscribed on sight would silently drop subscribers who never
clicked anything.

## Guards

- **Same-origin** on subscribe (Origin, falling back to Referer), so no third-party page can POST addresses through a visitor's browser.
- **Honeypot** `company` field — hidden from layout, tab order and the accessibility tree. A filled one gets a success response and stores nothing.
- **Per-IP limit**: 5 subscribe attempts / 10 min. Stops scripted floods.
- **Per-address limit**: 3 confirmation sends / 24 h. The honeypot and IP limit both key on the *sender*, which does nothing to stop a rotating address pool aiming the signup form at a victim's inbox. This one keys on the recipient.
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
