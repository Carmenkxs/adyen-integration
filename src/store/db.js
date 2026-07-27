import DatabaseConstructor from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'shop-a.sqlite');

let db;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  db = new DatabaseConstructor(DB_PATH);
  db.pragma('journal_mode = WAL');
  migrate(db);
  return db;
}

function migrate(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS shoppers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shopper_reference TEXT NOT NULL UNIQUE,
      email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_reference TEXT NOT NULL UNIQUE,
      amount INTEGER NOT NULL,
      currency TEXT NOT NULL,
      status TEXT NOT NULL,
      psp_reference TEXT,
      authorised_amount INTEGER NOT NULL DEFAULT 0,
      captured_amount INTEGER NOT NULL DEFAULT 0,
      refunded_amount INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stored_payment_method_id TEXT NOT NULL UNIQUE,
      shopper_id INTEGER NOT NULL REFERENCES shoppers(id),
      brand TEXT,
      last4 TEXT,
      expiry TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      psp_reference TEXT NOT NULL,
      parent_order_reference TEXT NOT NULL,
      type TEXT NOT NULL,
      amount INTEGER NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dedupe_key TEXT NOT NULL UNIQUE,
      event_code TEXT NOT NULL,
      received_at TEXT NOT NULL DEFAULT (datetime('now')),
      raw_payload TEXT NOT NULL,
      processed INTEGER NOT NULL DEFAULT 0
    );
  `);
}
