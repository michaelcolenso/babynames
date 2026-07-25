import { verifyToken } from "@nv/shared";
import type { PagesFunction } from "@cloudflare/workers-types";
import { tokenSecret } from "./subscribe";
import { unsubscribe } from "../../newsletter/unsubscribe";

// POST /api/newsletter/unsubscribe — RFC 8058 one-click unsubscribe.
//
// This is the endpoint named by the List-Unsubscribe header on every outgoing
// email. Mail providers POST here directly with `List-Unsubscribe=One-Click`
// and no user interaction, which is exactly why it must be a POST: the same
// action behind a GET would fire on every link prefetch.
//
// Intentionally exempt from the same-origin check that guards subscribe —
// the caller here is Gmail or Outlook, never our own page. The signed token
// is the entire authorisation, and it only ever removes consent, so the worst
// a forged request can do is what its holder could already do by clicking.
export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const token = await extractToken(ctx.request);
  const secret = tokenSecret(ctx.env, new URL(ctx.request.url));
  // No deployment secret means no token can be trusted, so none is honoured.
  const result = secret
    ? await verifyToken(secret, token, "unsubscribe")
    : ({ ok: false, reason: "bad-signature" } as const);
  if (!result.ok) {
    return Response.json({ ok: false, status: "link-invalid" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    await unsubscribe(ctx.env.DB, result.payload.email);
  } catch {
    return Response.json({ ok: false, status: "error" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, status: "unsubscribed" }, { headers: { "Cache-Control": "no-store" } });
};

async function extractToken(request: Request): Promise<string> {
  // One-click senders vary: some echo the query string from the header URL,
  // others post the form body. Accept both.
  const fromQuery = new URL(request.url).searchParams.get("token");
  if (fromQuery) return fromQuery;
  try {
    const form = await request.formData();
    return String(form.get("token") ?? "");
  } catch {
    return "";
  }
}
