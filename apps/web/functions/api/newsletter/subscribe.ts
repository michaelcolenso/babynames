import { normalizeEmail } from "@nv/shared";
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
    return finish(url, acceptsHtml, "subscribed", 200);
  }

  const normalized = normalizeEmail(emailInput);
  if (!normalized.valid) {
    return finish(url, acceptsHtml, "invalid", 400);
  }

  try {
    await ctx.env.DB.prepare(`INSERT INTO newsletter_subscribers(email, status, source_content_id, source_placement, consented_at, updated_at)
      VALUES(?1, 'active', ?2, ?3, datetime('now'), datetime('now'))
      ON CONFLICT(email) DO UPDATE SET status='active', source_content_id=COALESCE(excluded.source_content_id, newsletter_subscribers.source_content_id), source_placement=excluded.source_placement, consented_at=datetime('now'), unsubscribed_at=NULL, updated_at=datetime('now')`)
      .bind(normalized.email, sourceContentId, sourcePlacement).run();
  } catch {
    // A write failure used to be swallowed behind a success response, so the
    // visitor was told they had subscribed when nothing was stored. Report the
    // failure instead — the response still says nothing about whether the
    // address was already on the list, which is the state worth not leaking.
    return finish(url, acceptsHtml, "error", 503);
  }

  return finish(url, acceptsHtml, "subscribed", 200);
};

type Status = "subscribed" | "invalid" | "error";

function finish(url: URL, acceptsHtml: boolean, status: Status, code: number): Response {
  const headers = { "Cache-Control": "no-store" };
  if (acceptsHtml) {
    const target = new URL("/newsletter", url.origin);
    // `subscribed=1` stays the success param: the analytics beacon keys its
    // newsletter_signup_complete event on it.
    if (status === "subscribed") target.searchParams.set("subscribed", "1");
    else target.searchParams.set("subscribe", status);
    return new Response(null, { status: 303, headers: { ...headers, Location: target.toString() } });
  }
  return Response.json({ ok: status === "subscribed", status }, { status: code, headers });
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
