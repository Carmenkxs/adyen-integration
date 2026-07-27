import { getDb } from './db.js';

/**
 * Inserts a webhook event if dedupeKey has not been seen before.
 * Returns { inserted: true } on first delivery, { inserted: false } on redelivery.
 */
export function recordWebhookEvent({ dedupeKey, eventCode, rawPayload }) {
  const db = getDb();
  const result = db
    .prepare(
      `INSERT OR IGNORE INTO webhook_events (dedupe_key, event_code, raw_payload)
       VALUES (@dedupeKey, @eventCode, @rawPayload)`,
    )
    .run({ dedupeKey, eventCode, rawPayload });

  return { inserted: result.changes === 1 };
}
