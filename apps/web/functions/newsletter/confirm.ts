import { verifyToken } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { tokenSecret } from "../api/newsletter/subscribe";

// GET /newsletter/confirm?token=… — closes the double opt-in loop.
//
// Confirming is idempotent and only ever moves a row forward, so unlike
// unsubscribe it's safe for a mail client to prefetch: the worst case is that
// the subscriber arrives to find themselves already confirmed.
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  const token = url.searchParams.get("token") ?? "";
  const result = await verifyToken(tokenSecret(ctx.env), token, "confirm");

  if (!result.ok) {
    return redirect(url, result.reason === "expired" ? "link-expired" : "link-invalid");
  }

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

function redirect(url: URL, status: string): Response {
  const target = new URL("/newsletter", url.origin);
  target.searchParams.set("subscribe", status);
  return new Response(null, { status: 303, headers: { Location: target.toString(), "Cache-Control": "no-store" } });
}
