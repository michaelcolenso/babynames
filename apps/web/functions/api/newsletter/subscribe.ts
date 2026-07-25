import {
  EMAIL_RULE,
  IP_RULE,
  checkRateLimit,
  clientKey,
  isEmailConfigured,
  normalizeEmail,
  sendConfirmationEmail,
  signToken,
  releaseRateLimit,
  sweepRateLimits,
  sweepStalePending,
} from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const acceptsHtml = ctx.request.headers.get("accept")?.includes("text/html") ?? false;

  // The form is same-origin only. Without this, any page on the web can POST
  // arbitrary addresses into the subscriber table from a visitor's browser.
  if (!isSameOrigin(ctx.request, url)) {
    return finish(url, acceptsHtml, "error", 403);
  }

  const form = await ctx.request.formData();
  const emailInput = String(form.get("email") ?? "");
  const sourceContentId = String(form.get("sourceContentId") ?? "").slice(0, 200) || null;
  const sourcePlacement = String(form.get("sourcePlacement") ?? "unknown").slice(0, 80);

  // Honeypot: hidden from users and screen readers, irresistible to form bots.
  // Report success so the bot has no signal to adapt against, but store nothing.
  if (String(form.get("company") ?? "").trim()) {
    return finish(url, acceptsHtml, "pending", 200);
  }

  const normalized = normalizeEmail(emailInput);
  if (!normalized.valid) {
    return finish(url, acceptsHtml, "invalid", 400);
  }

  const secret = tokenSecret(ctx.env, url);
  const buckets = bucketSecret(ctx.env);
  const byIp = await checkRateLimit(ctx.env.DB, buckets, IP_RULE, clientKey(ctx.request));
  if (!byIp.allowed) return finish(url, acceptsHtml, "rate-limited", 429, byIp.retryAfter);

  // Keyed on the recipient rather than the sender: without it, a rotating IP
  // pool could use this form to bury a third party's inbox in confirmations.
  const byEmail = await checkRateLimit(ctx.env.DB, buckets, EMAIL_RULE, normalized.email);
  if (!byEmail.allowed) return finish(url, acceptsHtml, "rate-limited-address", 429, byEmail.retryAfter);

  ctx.waitUntil(sweepRateLimits(ctx.env.DB));
  // Makes the confirmation email's "the address is removed automatically" true:
  // a pending row whose confirm token has expired is unconfirmable, so keeping
  // it would be retaining an address nobody ever consented to.
  ctx.waitUntil(sweepStalePending(ctx.env.DB));

  const emailConfig = {
    apiKey: ctx.env.NEWSLETTER_API_KEY,
    from: ctx.env.NEWSLETTER_FROM,
    replyTo: ctx.env.NEWSLETTER_REPLY_TO,
  };
  // Double opt-in needs both halves: a provider to send the confirmation, and a
  // real signing secret so the link it carries actually authorises anything.
  // Missing either one falls back to single opt-in, which is strictly better
  // than parking people in a 'pending' state nothing can release them from —
  // and far better than issuing links signed with a repo-public constant.
  if (isEmailConfigured(emailConfig) && !secret) {
    console.error("newsletter: NEWSLETTER_TOKEN_SECRET is unset; double opt-in disabled");
  }
  const doubleOptIn = isEmailConfigured(emailConfig) && secret !== null;

  try {
    if (doubleOptIn) {
      // An already-active subscriber re-submitting the form must not be knocked
      // back to 'pending' — that would unsubscribe them until they re-confirm.
      await ctx.env.DB.prepare(
        `INSERT INTO newsletter_subscribers(email, status, source_content_id, source_placement, consented_at, confirmation_sent_at, confirmation_send_count, updated_at)
         VALUES(?1, 'pending', ?2, ?3, datetime('now'), datetime('now'), 1, datetime('now'))
         ON CONFLICT(email) DO UPDATE SET
           status = CASE WHEN newsletter_subscribers.status = 'active' THEN 'active' ELSE 'pending' END,
           source_content_id = COALESCE(excluded.source_content_id, newsletter_subscribers.source_content_id),
           source_placement = excluded.source_placement,
           consented_at = datetime('now'),
           confirmation_sent_at = datetime('now'),
           confirmation_send_count = newsletter_subscribers.confirmation_send_count + 1,
           updated_at = datetime('now')`,
      )
        .bind(normalized.email, sourceContentId, sourcePlacement)
        .run();
    } else {
      await ctx.env.DB.prepare(
        `INSERT INTO newsletter_subscribers(email, status, source_content_id, source_placement, consented_at, confirmed_at, updated_at)
         VALUES(?1, 'active', ?2, ?3, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(email) DO UPDATE SET status='active', source_content_id=COALESCE(excluded.source_content_id, newsletter_subscribers.source_content_id), source_placement=excluded.source_placement, consented_at=datetime('now'), confirmed_at=datetime('now'), unsubscribed_at=NULL, updated_at=datetime('now')`,
      )
        .bind(normalized.email, sourceContentId, sourcePlacement)
        .run();
    }
  } catch {
    // A write failure used to be swallowed behind a success response, so the
    // visitor was told they had subscribed when nothing was stored. Report the
    // failure instead — the response still says nothing about whether the
    // address was already on the list, which is the state worth not leaking.
    return finish(url, acceptsHtml, "error", 503);
  }

  if (!doubleOptIn) return finish(url, acceptsHtml, "subscribed", 200);

  // Sent unconditionally, including to an address that is already active.
  // Skipping the send for known subscribers would make the response depend on
  // whether the address is on the list — during a provider outage the skipped
  // branch returns 200 while everyone else gets a 503, which is exactly the
  // subscriber oracle this endpoint is supposed to deny. Re-confirming an
  // active subscriber is a no-op, and the per-address rate limit bounds the
  // extra mail.
  {
    // `secret` is non-null here: doubleOptIn requires it.
    const [confirmToken, unsubscribeToken] = await Promise.all([
      signToken(secret as string, "confirm", normalized.email),
      signToken(secret as string, "unsubscribe", normalized.email),
    ]);
    const unsub = encodeURIComponent(unsubscribeToken);
    // Awaited, not fire-and-forget: "check your inbox" is a lie if the provider
    // rejected the message, and the subscriber has no way to discover that.
    const sent = await sendConfirmationEmail(emailConfig, {
      to: normalized.email,
      confirmUrl: `${url.origin}/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`,
      // Human-clickable link: the page with the confirmation button.
      unsubscribeUrl: `${url.origin}/newsletter/unsubscribe?token=${unsub}`,
      // List-Unsubscribe target: mail providers POST here unattended, so it
      // must be the query-aware API route, not the page.
      oneClickUrl: `${url.origin}/api/newsletter/unsubscribe?token=${unsub}`,
    });

    if (!sent.ok) {
      console.error(`newsletter: confirmation send failed (${sent.reason})`);
      // Hand back the per-address slot. It was claimed to guard a confirmation
      // email that never arrived, and keeping it would lock a legitimate
      // subscriber out of retrying for the rest of the day.
      ctx.waitUntil(releaseRateLimit(ctx.env.DB, buckets, EMAIL_RULE, normalized.email));
      // The row stays 'pending' and is swept if never confirmed; the caller is
      // told to retry rather than to watch an inbox nothing is coming to.
      return finish(url, acceptsHtml, "error", 503);
    }
  }

  return finish(url, acceptsHtml, "pending", 200);
};

type Status = "subscribed" | "pending" | "invalid" | "rate-limited" | "rate-limited-address" | "error";

function finish(url: URL, acceptsHtml: boolean, status: Status, code: number, retryAfter?: number): Response {
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  if (acceptsHtml) {
    const target = new URL("/newsletter", url.origin);
    // `subscribed=1` stays the success param: the analytics beacon keys its
    // newsletter_signup_complete event on it.
    if (status === "subscribed") target.searchParams.set("subscribed", "1");
    else target.searchParams.set("subscribe", status);
    return new Response(null, { status: 303, headers: { ...headers, Location: target.toString() } });
  }
  return Response.json({ ok: status === "subscribed" || status === "pending", status }, { status: code, headers });
}

const DEV_SECRET = "nv-newsletter-dev-secret";

/**
 * Signing key for confirm/unsubscribe links, or null when there isn't a usable
 * one. Fails closed on purpose: the dev fallback is a constant published in
 * this repository, so honouring it off localhost would let anyone mint a valid
 * token for any address and confirm or unsubscribe it at will. Outside local
 * development an unset NEWSLETTER_TOKEN_SECRET disables signed links entirely
 * rather than pretending to authorise them.
 */
export function tokenSecret(env: Env, url: URL): string | null {
  if (env.NEWSLETTER_TOKEN_SECRET) return env.NEWSLETTER_TOKEN_SECRET;
  return isLocalDev(url) ? DEV_SECRET : null;
}

/**
 * Key for rate-limit bucket hashing. Unlike token signing this is a privacy
 * measure, not an authorisation one — the hash only keeps raw IPs off disk, and
 * a predictable key costs nothing — so it always resolves.
 */
export function bucketSecret(env: Env): string {
  return env.NEWSLETTER_TOKEN_SECRET || DEV_SECRET;
}

function isLocalDev(url: URL): boolean {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
}

function isSameOrigin(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  if (origin) return origin === url.origin;
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === url.origin;
    } catch {
      return false;
    }
  }
  // Neither header present: a non-browser client (curl, the parity checker,
  // tests). Browsers always send Origin on a cross-origin form POST, so the
  // CSRF vector this guards is still covered.
  return true;
}
