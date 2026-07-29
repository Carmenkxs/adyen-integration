import { getDb } from './db.js';

export function createShopper({ shopperReference, email }) {
  const db = getDb();
  const result = db
    .prepare('INSERT INTO shoppers (shopper_reference, email) VALUES (?, ?)')
    .run(shopperReference, email || null);
  return db.prepare('SELECT * FROM shoppers WHERE id = ?').get(result.lastInsertRowid);
}

export function getShopperById(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM shoppers WHERE id = ?').get(id);
}
