import {
  EMAIL_RULE,
  IP_RULE,
  checkRateLimit,
  clientKey,
  isEmailConfigured,
  normalizeEmail,
  sendConfirmationEmail,
  signToken,
  sweepRateLimits,
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

  const secret = tokenSecret(ctx.env);
  const byIp = await checkRateLimit(ctx.env.DB, secret, IP_RULE, clientKey(ctx.request));
  if (!byIp.allowed) return finish(url, acceptsHtml, "rate-limited", 429, byIp.retryAfter);

  // Keyed on the recipient rather than the sender: without it, a rotating IP
  // pool could use this form to bury a third party's inbox in confirmations.
  const byEmail = await checkRateLimit(ctx.env.DB, secret, EMAIL_RULE, normalized.email);
  if (!byEmail.allowed) return finish(url, acceptsHtml, "rate-limited", 429, byEmail.retryAfter);

  ctx.waitUntil(sweepRateLimits(ctx.env.DB));

  const emailConfig = {
    apiKey: ctx.env.NEWSLETTER_API_KEY,
    from: ctx.env.NEWSLETTER_FROM,
    replyTo: ctx.env.NEWSLETTER_REPLY_TO,
  };
  // Double opt-in requires an email provider to close the loop. Until one is
  // configured, activating immediately is strictly better than parking people
  // in a 'pending' state no confirmation email can ever release them from.
  const doubleOptIn = isEmailConfigured(emailConfig);

  let existingStatus: string | null = null;
  try {
    const existing = await ctx.env.DB.prepare(`SELECT status FROM newsletter_subscribers WHERE email = ?1`)
      .bind(normalized.email)
      .first<{ status: string }>();
    existingStatus = existing?.status ?? null;

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

  // Someone already confirmed doesn't need another confirmation email, but the
  // response is identical either way: whether an address is on the list is not
  // something an unauthenticated caller gets to probe for.
  if (existingStatus !== "active") {
    const [confirmToken, unsubscribeToken] = await Promise.all([
      signToken(secret, "confirm", normalized.email),
      signToken(secret, "unsubscribe", normalized.email),
    ]);
    ctx.waitUntil(
      sendConfirmationEmail(emailConfig, {
        to: normalized.email,
        confirmUrl: `${url.origin}/newsletter/confirm?token=${encodeURIComponent(confirmToken)}`,
        unsubscribeUrl: `${url.origin}/newsletter/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
      }).then((result) => {
        if (!result.ok) console.error(`newsletter: confirmation send failed (${result.reason})`);
      }),
    );
  }

  return finish(url, acceptsHtml, "pending", 200);
};

type Status = "subscribed" | "pending" | "invalid" | "rate-limited" | "error";

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

/**
 * Falls back to a build-stable string so local dev and tests work unconfigured.
 * Tokens signed with the fallback are still unforgeable *within* a deployment;
 * setting NEWSLETTER_TOKEN_SECRET in production is what makes them unforgeable
 * by anyone reading this repository.
 */
export function tokenSecret(env: Env): string {
  return env.NEWSLETTER_TOKEN_SECRET || "nv-newsletter-dev-secret";
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
