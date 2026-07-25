-- Double opt-in, unsubscribe bookkeeping, and abuse throttling for the
-- newsletter.
--
-- `newsletter_subscribers.status` gains a 'pending' state: a subscribe POST no
-- longer produces an active subscriber, it produces an unconfirmed one plus a
-- signed confirmation link. Only clicking that link moves the row to 'active'.
-- SQLite can't alter a CHECK constraint in place, so the table is rebuilt.

CREATE TABLE newsletter_subscribers_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'unsubscribed')),
  source_content_id TEXT,
  source_placement TEXT NOT NULL,
  consented_at TEXT NOT NULL,
  confirmed_at TEXT,
  unsubscribed_at TEXT,
  -- Throttles confirmation resends so the signup form can't be aimed at a
  -- third party's inbox as a mail bomb.
  confirmation_sent_at TEXT,
  confirmation_send_count INTEGER NOT NULL DEFAULT 0,
  provider_subscriber_id TEXT,
  updated_at TEXT NOT NULL
);

-- Everyone already in the table consented under the previous single opt-in
-- flow. Preserve their status and backfill confirmed_at from consented_at
-- rather than silently demoting them to 'pending' and dropping the list.
INSERT INTO newsletter_subscribers_new (
  id, email, status, source_content_id, source_placement, consented_at,
  confirmed_at, unsubscribed_at, provider_subscriber_id, updated_at
)
SELECT
  id, email, status, source_content_id, source_placement, consented_at,
  CASE WHEN status = 'active' THEN consented_at ELSE NULL END,
  unsubscribed_at, provider_subscriber_id, updated_at
FROM newsletter_subscribers;

DROP TABLE newsletter_subscribers;
ALTER TABLE newsletter_subscribers_new RENAME TO newsletter_subscribers;

CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_status ON newsletter_subscribers(status);

-- Fixed-window request counter. `bucket` is "<scope>:<hashed-key>:<window>",
-- where the key is HMAC'd with the newsletter secret so raw IP addresses are
-- never written to disk. Rows are disposable: expired ones get swept
-- opportunistically after each write.
CREATE TABLE IF NOT EXISTS newsletter_rate_limit (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_newsletter_rate_limit_expiry ON newsletter_rate_limit(expires_at);
