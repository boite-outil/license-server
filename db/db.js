const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'licenses.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    app_id TEXT NOT NULL,
    device_id TEXT,
    status TEXT NOT NULL DEFAULT 'unused', -- unused | active | revoked
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    activated_at TEXT,
    last_check_at TEXT,
    note TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
  CREATE INDEX IF NOT EXISTS idx_device_id ON licenses(device_id);
`);

module.exports = db;
