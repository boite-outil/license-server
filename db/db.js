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
    expires_at TEXT, -- fixée à l'activation si duration_days est renseigné
    duration_days INTEGER, -- durée de validité en jours depuis l'activation (NULL = illimité)
    note TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key);
  CREATE INDEX IF NOT EXISTS idx_device_id ON licenses(device_id);
`);

// Migration douce : si la base existait déjà sans la colonne expires_at
// (ancien déploiement), on l'ajoute sans perdre les données.
const columns = db.prepare('PRAGMA table_info(licenses)').all();
if (!columns.some((c) => c.name === 'expires_at')) {
  db.exec('ALTER TABLE licenses ADD COLUMN expires_at TEXT');
}
if (!columns.some((c) => c.name === 'duration_days')) {
  db.exec('ALTER TABLE licenses ADD COLUMN duration_days INTEGER');
}

module.exports = db;
