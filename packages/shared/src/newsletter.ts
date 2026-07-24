export interface NormalizedEmail { email: string; valid: boolean; reason?: string; }
export function normalizeEmail(input: string): NormalizedEmail {
  const email = input.trim().toLowerCase();
  if (!email) return { email, valid: false, reason: "missing" };
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { email, valid: false, reason: "invalid" };
  return { email, valid: true };
}
export function renderNewsletterSignup(sourcePlacement: string, sourceContentId?: string): string {
  return `<section class="newsletter-signup" data-source-placement="${sourcePlacement}"${sourceContentId ? ` data-source-content-id="${sourceContentId}"` : ""}>
    <p class="eyebrow">Newsletter</p><h2>One surprising name pattern each week</h2>
    <form action="/api/newsletter/subscribe" method="post"><label>Email <input type="email" name="email" autocomplete="email" required></label><input type="hidden" name="sourcePlacement" value="${sourcePlacement}">${sourceContentId ? `<input type="hidden" name="sourceContentId" value="${sourceContentId}">` : ""}<button type="submit">Subscribe</button></form>
  </section>`;
}
