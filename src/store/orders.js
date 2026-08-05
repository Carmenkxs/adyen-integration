import { getDb } from './db.js';

// Order state machine (as of M3):
//
//   created --------------------------> session_open --> awaiting_shopper_action
//      ^                                                    |    |    |    ^
//      |                                                    |    |    |    | (retry, new attempt)
//      |                                             (webhook) (webhook) (age timeout)
//      |                                                    |    |    |
//      |                                                authorised refused abandoned
//      |                                                              |       |
//      +--------------------------------------------------------------+-------+
//        (abandoned/refused can both reopen a session; authorised cannot)
//
// error is reachable from awaiting_shopper_action via an amount/currency mismatch on
// the confirming webhook (see src/webhooks/route.js), not shown above for brevity.
//
// Only the webhook handler ever sets authorised/refused/error. Only session creation
// (POST /orders/:ref/session) ever sets session_open/awaiting_shopper_action. Only the
// lazy age check (checkAndMarkAbandoned) ever sets abandoned.

export function createOrder({ orderReference, shopperId, amount, currency }) {
  const db = getDb();
  db.prepare(
    `INSERT INTO orders (order_reference, shopper_id, amount, currency, status)
     VALUES (@orderReference, @shopperId, @amount, @currency, 'created')`,
  ).run({ orderReference, shopperId, amount, currency });
  return getOrderByReference(orderReference);
}

export function getOrderByReference(orderReference) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM orders WHERE order_reference = ?')
    .get(orderReference);
}

export function markSessionOpen(orderReference) {
  const db = getDb();
  // 'abandoned' is included as a valid starting point: it is our own age-based
  // guess, never a confirmed outcome from Adyen, so a genuine new attempt must be
  // able to reopen it — this is what makes abandonment a recoverable state rather
  // than a terminal one, per prd.md's M3 acceptance criteria.
  db.prepare(
    `UPDATE orders SET status = 'session_open', updated_at = datetime('now')
     WHERE order_reference = ? AND status IN ('created', 'abandoned')`,
  ).run(orderReference);
}

// No mid-flow signal exists for exactly when a 3D Secure challenge begins — the
// Sessions flow + Drop-in keep the merchant server blind throughout (confirmed by
// observation, not assumption: see BUILD_LOG.md 2026-08-05). This is therefore set
// immediately after session_open, which is also where the abandonment clock starts.
// Guarded to fire only once per attempt: a page refresh while already in this state
// is a deliberate no-op, so refreshing does not reset the abandonment clock — only a
// genuinely new attempt (via markSessionOpen from 'abandoned') restarts it.
export function markAwaitingShopperAction(orderReference) {
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = 'awaiting_shopper_action', updated_at = datetime('now')
     WHERE order_reference = ? AND status = 'session_open'`,
  ).run(orderReference);
}

// Deliberately short relative to Adyen's own session expiry (around 1 hour by
// default) — this is a UX heuristic for "the shopper appears to have walked away",
// not a claim about when Adyen's session itself becomes unusable.
const ABANDONMENT_TIMEOUT_MS = 10 * 60 * 1000;

export function markAbandoned(orderReference) {
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = 'abandoned', updated_at = datetime('now')
     WHERE order_reference = ? AND status = 'awaiting_shopper_action'`,
  ).run(orderReference);
}

// Abandonment is detected by age, not by any event Adyen sends (none exists for
// this). Checked lazily whenever an order is read, rather than via a background
// sweep — sufficient for this project's scale, per prd.md's own instruction to
// build the smallest testable thing.
export function checkAndMarkAbandoned(orderReference) {
  let order = getOrderByReference(orderReference);
  if (!order || order.status !== 'awaiting_shopper_action') return order;

  const enteredAtMs = new Date(order.updated_at.replace(' ', 'T') + 'Z').getTime();
  if (Date.now() - enteredAtMs > ABANDONMENT_TIMEOUT_MS) {
    markAbandoned(orderReference);
    order = getOrderByReference(orderReference);
  }
  return order;
}

export function markAuthorised(orderReference, { pspReference, authorisedAmount }) {
  const db = getDb();
  db.prepare(
    `UPDATE orders
     SET status = 'authorised', psp_reference = @pspReference,
         authorised_amount = @authorisedAmount, updated_at = datetime('now')
     WHERE order_reference = @orderReference`,
  ).run({ orderReference, pspReference, authorisedAmount });
}

export function markRefused(orderReference, { pspReference }) {
  const db = getDb();
  // Guarded: a late or out-of-order decline must never downgrade an order that
  // a previously processed webhook has already confirmed as authorised.
  db.prepare(
    `UPDATE orders
     SET status = 'refused', psp_reference = @pspReference, updated_at = datetime('now')
     WHERE order_reference = @orderReference AND status != 'authorised'`,
  ).run({ orderReference, pspReference });
}

export function markError(orderReference) {
  const db = getDb();
  db.prepare(
    `UPDATE orders SET status = 'error', updated_at = datetime('now')
     WHERE order_reference = ?`,
  ).run(orderReference);
}
