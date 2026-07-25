export interface NormalizedEmail { email: string; valid: boolean; reason?: string; }

// Deliberately stricter than the old `[^\s@]+@[^\s@]+\.[^\s@]+` test, which
// accepted "a@b.c", "a@-b.com" and "a@b..com". We can't validate deliverability
// here, but we can reject the shapes that only ever arrive from typos and bots.
const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export function normalizeEmail(input: string): NormalizedEmail {
  const email = input.trim().toLowerCase();
  if (!email) return { email, valid: false, reason: "missing" };
  if (email.length > 254) return { email, valid: false, reason: "invalid" };

  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return { email, valid: false, reason: "invalid" };

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return { email, valid: false, reason: "invalid" };

  const labels = domain.split(".");
  if (labels.length < 2) return { email, valid: false, reason: "invalid" };
  if (!labels.every((l) => l.length <= 63 && LABEL.test(l))) return { email, valid: false, reason: "invalid" };
  // Require an alphabetic TLD of at least two characters ("…@example.c" and
  // "…@example.123" are always typos, never real inboxes).
  if (!/^[a-z]{2,}$/.test(labels[labels.length - 1] ?? "")) return { email, valid: false, reason: "invalid" };

  return { email, valid: true };
}

/** Outcomes the subscribe and confirm/unsubscribe endpoints hand back to the page. */
export type SubscribeStatus =
  | "subscribed"
  | "pending"
  | "confirmed"
  | "already-confirmed"
  | "unsubscribed"
  | "invalid"
  | "rate-limited"
  | "link-expired"
  | "link-invalid"
  | "error";

const STATUS_COPY: Record<SubscribeStatus, { tone: "ok" | "error"; message: string }> = {
  subscribed: { tone: "ok", message: "You're on the list. The next dispatch will land in your inbox." },
  pending: { tone: "ok", message: "Almost there — check your inbox for a confirmation link. It expires in seven days." },
  confirmed: { tone: "ok", message: "Confirmed. You're on the list, and every email has a one-click unsubscribe." },
  "already-confirmed": { tone: "ok", message: "That address was already confirmed. Nothing more to do." },
  unsubscribed: { tone: "ok", message: "You're unsubscribed. We won't email that address again." },
  invalid: { tone: "error", message: "That email address doesn't look right. Check it and try again." },
  "rate-limited": { tone: "error", message: "Too many attempts from here. Give it a few minutes and try again." },
  "link-expired": { tone: "error", message: "That confirmation link has expired. Subscribe again and we'll send a fresh one." },
  "link-invalid": { tone: "error", message: "That link isn't valid. Subscribe again to get a working one." },
  error: { tone: "error", message: "Something went wrong on our end and you were not subscribed. Please try again in a moment." },
};

export function parseSubscribeStatus(params: URLSearchParams): SubscribeStatus | null {
  // `subscribed=1` is the original success param and is still what the
  // analytics beacon keys its completion event on — keep honouring it.
  if (params.get("subscribed") === "1") return "subscribed";
  const status = params.get("subscribe");
  return status && status in STATUS_COPY ? (status as SubscribeStatus) : null;
}

export function renderSubscribeStatus(status: SubscribeStatus | null): string {
  if (!status) return "";
  const { tone, message } = STATUS_COPY[status];
  return `<p class="newsletter-status is-${tone}" role="status">${escapeHtml(message)}</p>`;
}

export interface NewsletterSignupOptions {
  /** Suppress the section heading where the surrounding page already says it. */
  heading?: string | false;
  status?: SubscribeStatus | null;
  /** Distinguishes the DOM ids when more than one form is on a page. */
  idSuffix?: string;
}

export function renderNewsletterSignup(
  sourcePlacement: string,
  sourceContentId?: string,
  options: NewsletterSignupOptions = {},
): string {
  const { heading = "One surprising name pattern each week", status = null, idSuffix = "" } = options;
  const emailId = `nv-newsletter-email${idSuffix}`;
  const noteId = `nv-newsletter-note${idSuffix}`;

  return `<section class="newsletter-signup" data-source-placement="${escapeHtml(sourcePlacement)}"${sourceContentId ? ` data-source-content-id="${escapeHtml(sourceContentId)}"` : ""}>
    ${heading === false ? "" : `<p class="eyebrow">Newsletter</p><h2>${escapeHtml(heading)}</h2>`}
    <p class="newsletter-pitch" id="${noteId}">One short email a week. No ads, we never share your address, and every email unsubscribes in one click.</p>
    <div class="newsletter-status-slot" aria-live="polite">${renderSubscribeStatus(status)}</div>
    <form action="/api/newsletter/subscribe" method="post">
      <label for="${emailId}">Email</label>
      <input id="${emailId}" type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" spellcheck="false" autocapitalize="off" placeholder="you@example.com" aria-describedby="${noteId}" required>
      <p class="newsletter-hp" aria-hidden="true"><label for="${emailId}-co">Leave this field empty</label><input id="${emailId}-co" type="text" name="company" tabindex="-1" autocomplete="off"></p>
      <input type="hidden" name="sourcePlacement" value="${escapeHtml(sourcePlacement)}">${sourceContentId ? `<input type="hidden" name="sourceContentId" value="${escapeHtml(sourceContentId)}">` : ""}
      <button type="submit">Subscribe</button>
    </form>
  </section>`;
}

/**
 * Unsubscribe is a two-step flow on purpose: mail clients and security scanners
 * routinely prefetch every link in an email, so a GET that unsubscribes on
 * sight would silently drop subscribers who never clicked anything. The GET
 * renders this form; only the POST mutates.
 */
export function renderUnsubscribeConfirm(token: string, email: string): string {
  return `<section class="newsletter-signup">
    <p class="eyebrow">Newsletter</p><h1>Unsubscribe</h1>
    <p class="newsletter-pitch">Confirm that you want to stop receiving the NobodyNamed newsletter at <strong>${escapeHtml(email)}</strong>.</p>
    <form action="/newsletter/unsubscribe" method="post">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <button type="submit">Unsubscribe me</button>
    </form>
    <p class="newsletter-pitch"><a href="/newsletter">Changed your mind? Keep the subscription.</a></p>
  </section>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
