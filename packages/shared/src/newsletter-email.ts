// Transactional email for the newsletter double opt-in flow.
//
// The site has no email provider wired up yet, so this is deliberately a thin
// seam rather than an SDK: one HTTP call to Resend when NEWSLETTER_API_KEY is
// present, and an explicit "unconfigured" result when it isn't. Callers decide
// what an unconfigured provider means — see subscribe.ts, which falls back to
// the previous single opt-in behaviour rather than stranding people in a
// pending state they can never leave.

export interface EmailConfig {
  apiKey?: string;
  from?: string;
  replyTo?: string;
}

export type SendResult = { ok: true } | { ok: false; reason: "unconfigured" | "failed" };

export interface ConfirmationEmail {
  to: string;
  confirmUrl: string;
  /** Human-clickable link in the body: a page with a confirmation button. */
  unsubscribeUrl: string;
  /**
   * List-Unsubscribe target. Mail providers POST here unattended with no user
   * present, so it must be the API route that reads the token from the query
   * string — not the page, whose POST expects a form body and would reject it.
   */
  oneClickUrl: string;
}

export function isEmailConfigured(config: EmailConfig): boolean {
  return Boolean(config.apiKey && config.from);
}

export async function sendConfirmationEmail(config: EmailConfig, email: ConfirmationEmail, fetchImpl: typeof fetch = fetch): Promise<SendResult> {
  if (!isEmailConfigured(config)) return { ok: false, reason: "unconfigured" };

  try {
    const res = await fetchImpl("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        ...(config.replyTo ? { reply_to: config.replyTo } : {}),
        subject: "Confirm your NobodyNamed subscription",
        text: confirmationText(email),
        html: confirmationHtml(email),
        headers: {
          // RFC 8058: lets mail clients offer a native unsubscribe button that
          // POSTs, instead of teaching people to hit "spam" to get off a list.
          "List-Unsubscribe": `<${email.oneClickUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });
    return res.ok ? { ok: true } : { ok: false, reason: "failed" };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

function confirmationText(email: ConfirmationEmail): string {
  return [
    "One more step and you're subscribed to NobodyNamed.",
    "",
    "Confirm your subscription:",
    email.confirmUrl,
    "",
    "This link expires in 7 days. If you didn't ask for this, ignore this email —",
    "we won't send you anything else, and the address is removed automatically.",
    "",
    `Unsubscribe: ${email.unsubscribeUrl}`,
  ].join("\n");
}

function confirmationHtml(email: ConfirmationEmail): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;color:#151412;max-width:32rem;margin:0 auto;padding:2rem 1rem">
<h1 style="font-size:1.25rem;margin:0 0 1rem">One more step</h1>
<p style="margin:0 0 1.25rem">Confirm your address and you'll get one short email a week about surprising patterns in American baby-name data.</p>
<p style="margin:0 0 1.5rem"><a href="${escapeAttr(email.confirmUrl)}" style="display:inline-block;background:#b4432f;color:#fff;font-weight:700;text-decoration:none;padding:0.75rem 1.25rem;border-radius:999px">Confirm subscription</a></p>
<p style="margin:0 0 1.25rem;font-size:0.85rem;color:#5b5750">This link expires in 7 days. If you didn't ask for this, ignore this email — we won't send you anything else, and the address is removed automatically.</p>
<p style="margin:0;font-size:0.85rem;color:#5b5750"><a href="${escapeAttr(email.unsubscribeUrl)}" style="color:#5b5750">Unsubscribe</a></p>
</body></html>`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
