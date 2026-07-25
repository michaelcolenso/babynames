// Fixed-window rate limiting on D1.
//
// Cloudflare's rate-limiting binding isn't available to Pages Functions here,
// and the endpoint writes to D1 anyway, so the counter lives beside the data it
// protects. Buckets are keyed by HMAC of the caller identity (never the raw IP)
// and swept opportunistically, so the table stays small without a cron.

import { hashKey } from "./newsletter-tokens";
import type { D1Database } from "@cloudflare/workers-types";

export interface RateLimitRule {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitVerdict {
  allowed: boolean;
  /** Seconds until the current window rolls over — feeds the Retry-After header. */
  retryAfter: number;
}

/** Per-IP ceiling: generous for a human, useless for a scripted flood. */
export const IP_RULE: RateLimitRule = { scope: "ip", limit: 5, windowSeconds: 600 };
/**
 * Per-address ceiling. The honeypot and the IP rule both key on the *sender*,
 * which does nothing to stop someone pointing the signup form at a victim's
 * inbox from a rotating address pool. This one keys on the recipient.
 */
export const EMAIL_RULE: RateLimitRule = { scope: "email", limit: 3, windowSeconds: 86400 };

export async function checkRateLimit(
  db: D1Database,
  secret: string,
  rule: RateLimitRule,
  key: string,
  now = Date.now(),
): Promise<RateLimitVerdict> {
  const windowSeconds = rule.windowSeconds;
  const windowIndex = Math.floor(now / 1000 / windowSeconds);
  const expiresAt = (windowIndex + 1) * windowSeconds;
  const bucket = `${rule.scope}:${await hashKey(secret, key)}:${windowIndex}`;
  const retryAfter = Math.max(1, expiresAt - Math.floor(now / 1000));

  try {
    const row = await db
      .prepare(
        `INSERT INTO newsletter_rate_limit(bucket, hits, expires_at) VALUES(?1, 1, ?2)
         ON CONFLICT(bucket) DO UPDATE SET hits = newsletter_rate_limit.hits + 1
         RETURNING hits`,
      )
      .bind(bucket, expiresAt)
      .first<{ hits: number }>();
    const hits = row?.hits ?? 1;
    return { allowed: hits <= rule.limit, retryAfter };
  } catch {
    // Fail open. A counter outage should degrade to the pre-existing behaviour,
    // not take signups down — every other guard on the endpoint still applies.
    return { allowed: true, retryAfter };
  }
}

/** Drops rolled-over buckets. Cheap, indexed, and safe to run in waitUntil. */
export async function sweepRateLimits(db: D1Database, now = Date.now()): Promise<void> {
  try {
    await db.prepare(`DELETE FROM newsletter_rate_limit WHERE expires_at < ?1`).bind(Math.floor(now / 1000)).run();
  } catch {
    // Best-effort housekeeping.
  }
}

/** Cloudflare always sets CF-Connecting-IP at the edge; the rest is dev/test. */
export function clientKey(request: Request): string {
  return request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
