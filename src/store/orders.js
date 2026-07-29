import { getDb } from './db.js';

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
  db.prepare(
    `UPDATE orders SET status = 'session_open', updated_at = datetime('now')
     WHERE order_reference = ? AND status = 'created'`,
  ).run(orderReference);
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
