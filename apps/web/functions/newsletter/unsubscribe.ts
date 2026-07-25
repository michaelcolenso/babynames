import { contentId, contentIdentityMeta, pageShell, renderUnsubscribeConfirm, verifyToken } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { tokenSecret } from "../api/newsletter/subscribe";

// GET /newsletter/unsubscribe?token=… — renders a confirmation form.
//
// Deliberately does not mutate. Mail clients, link scanners and corporate
// security gateways prefetch every URL in an incoming message; a GET that
// unsubscribed on sight would quietly remove subscribers who never clicked.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token") ?? "";
  const secret = tokenSecret(ctx.env, url);
  // No deployment secret means no token can be trusted, so none is honoured.
  const result = secret
    ? await verifyToken(secret, token, "unsubscribe")
    : ({ ok: false, reason: "bad-signature" } as const);
  if (!result.ok) return redirect(url, "link-invalid");

  const identityMeta = contentIdentityMeta({
    contentId: contentId("newsletter", "unsubscribe"),
    contentType: "newsletter",
    slug: "unsubscribe",
  });
  const html = pageShell({
    title: "Unsubscribe — NobodyNamed Newsletter",
    description: "Confirm that you want to stop receiving the NobodyNamed newsletter.",
    canonical: `${url.origin}/newsletter/unsubscribe`,
    currentPath: "/newsletter",
    body: `<div ${identityMeta}>${renderUnsubscribeConfirm(token, result.payload.email)}</div>`,
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

// POST /newsletter/unsubscribe — the button on that form.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  // Body first (our own form), query second: some mail providers POST the
  // List-Unsubscribe URL verbatim, query string and all.
  const token = (await formToken(ctx.request)) || url.searchParams.get("token") || "";
  const secret = tokenSecret(ctx.env, url);
  // No deployment secret means no token can be trusted, so none is honoured.
  const result = secret
    ? await verifyToken(secret, token, "unsubscribe")
    : ({ ok: false, reason: "bad-signature" } as const);
  if (!result.ok) return redirect(url, "link-invalid");

  try {
    await unsubscribe(ctx.env.DB, result.payload.email);
  } catch {
    return redirect(url, "error");
  }
  return redirect(url, "unsubscribed");
};

export async function unsubscribe(db: Env["DB"], email: string): Promise<void> {
  await db
    .prepare(
      `UPDATE newsletter_subscribers
       SET status='unsubscribed', unsubscribed_at=datetime('now'), updated_at=datetime('now')
       WHERE email = ?1 AND status != 'unsubscribed'`,
    )
    .bind(email)
    .run();
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
