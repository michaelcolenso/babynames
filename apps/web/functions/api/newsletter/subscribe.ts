import { normalizeEmail } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const form = await ctx.request.formData();
  const emailInput = String(form.get("email") ?? "");
  const sourceContentId = String(form.get("sourceContentId") ?? "").slice(0, 200) || null;
  const sourcePlacement = String(form.get("sourcePlacement") ?? "unknown").slice(0, 80);
  const normalized = normalizeEmail(emailInput);

  if (normalized.valid) {
    try {
      await ctx.env.DB.prepare(`INSERT INTO newsletter_subscribers(email, status, source_content_id, source_placement, consented_at, updated_at)
        VALUES(?1, 'active', ?2, ?3, datetime('now'), datetime('now'))
        ON CONFLICT(email) DO UPDATE SET status='active', source_content_id=COALESCE(excluded.source_content_id, newsletter_subscribers.source_content_id), source_placement=excluded.source_placement, consented_at=datetime('now'), unsubscribed_at=NULL, updated_at=datetime('now')`)
        .bind(normalized.email, sourceContentId, sourcePlacement).run();
    } catch {
      // Non-enumerating response: storage/provider failures should not leak subscriber state.
    }
  }

  const acceptsHtml = ctx.request.headers.get("accept")?.includes("text/html");
  if (acceptsHtml) return Response.redirect(new URL("/newsletter?subscribed=1", ctx.request.url).toString(), 303);
  return Response.json({ ok: true });
};
