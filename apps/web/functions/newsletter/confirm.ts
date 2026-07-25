import { contentId, contentIdentityMeta, pageShell, renderConfirmPrompt, verifyToken } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { tokenSecret } from "../api/newsletter/subscribe";

// GET /newsletter/confirm?token=… — renders a confirmation form.
//
// Deliberately does not activate. Mail clients, link scanners and corporate
// security gateways prefetch every URL in an incoming message, so a GET that
// activated on sight would let someone submit a victim's address and have the
// victim's own gateway complete the opt-in for them — establishing exactly the
// consent that double opt-in exists to prove.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const result = await verify(ctx.env, url, url.searchParams.get("token") ?? "");
  if (!result.ok) return redirect(url, result.reason === "expired" ? "link-expired" : "link-invalid");

  const identityMeta = contentIdentityMeta({
    contentId: contentId("newsletter", "confirm"),
    contentType: "newsletter",
    slug: "confirm",
  });
  const html = pageShell({
    title: "Confirm your subscription — NobodyNamed Newsletter",
    description: "Confirm your NobodyNamed newsletter subscription.",
    canonical: `${url.origin}/newsletter/confirm`,
    currentPath: "/newsletter",
    body: `<div ${identityMeta}>${renderConfirmPrompt(url.searchParams.get("token") ?? "", result.payload.email)}</div>`,
  });
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      // The URL carries a signed token; keep it out of search results.
      "X-Robots-Tag": "noindex",
    },
  });
};

// POST /newsletter/confirm — the button on that form. Closes the opt-in loop.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const token = (await formToken(ctx.request)) || url.searchParams.get("token") || "";
  const result = await verify(ctx.env, url, token);
  if (!result.ok) return redirect(url, result.reason === "expired" ? "link-expired" : "link-invalid");

  try {
    const meta = await ctx.env.DB.prepare(
      `UPDATE newsletter_subscribers
       SET status='active', confirmed_at=datetime('now'), unsubscribed_at=NULL, updated_at=datetime('now')
       WHERE email = ?1 AND status = 'pending'`,
    )
      .bind(result.payload.email)
      .run();
    // No pending row: either already confirmed, or unsubscribed and now
    // re-confirming from an old link. Neither is an error worth alarming
    // someone about, and a confirmed-vs-unknown distinction would turn this
    // endpoint into a subscriber oracle.
    const changed = meta.meta?.changes ?? 0;
    return redirect(url, changed > 0 ? "confirmed" : "already-confirmed");
  } catch {
    return redirect(url, "error");
  }
};

async function verify(env: Env, url: URL, token: string) {
  const secret = tokenSecret(env, url);
  // No deployment secret means no token can be trusted, so none is honoured.
  if (!secret) return { ok: false, reason: "bad-signature" } as const;
  return verifyToken(secret, token, "confirm");
}

async function formToken(request: Request): Promise<string> {
  try {
    return String((await request.formData()).get("token") ?? "");
  } catch {
    return "";
  }
}

function redirect(url: URL, status: string): Response {
  const target = new URL("/newsletter", url.origin);
  target.searchParams.set("subscribe", status);
  return new Response(null, { status: 303, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
}
