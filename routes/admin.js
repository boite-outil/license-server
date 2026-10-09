const express = require('express');
const db = require('../db/db');
const { generateLicenseKey } = require('../utils/keygen');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

/**
 * POST /api/admin/keys
 * Génère N clés pour une app donnée.
 * body: { appId, count, note }
 */
router.post('/keys', (req, res) => {
  const { appId, count = 1, note } = req.body || {};

  if (!appId) {
    return res.status(400).json({ error: 'appId requis' });
  }
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 1000);

  const insert = db.prepare(
    'INSERT INTO licenses (license_key, app_id, note) VALUES (?, ?, ?)'
  );

  const keys = [];
  const insertMany = db.transaction((howMany) => {
    for (let i = 0; i < howMany; i++) {
      let key;
      // évite les collisions, très improbable mais on se protège
      do {
        key = generateLicenseKey();
      } while (db.prepare('SELECT 1 FROM licenses WHERE license_key = ?').get(key));
      insert.run(key, appId, note || null);
      keys.push(key);
    }
  });

  insertMany(n);

  res.json({ appId, count: n, keys });
});

/**
 * GET /api/admin/keys?appId=...&status=...
 * Liste les clés (avec filtre optionnel).
 */
router.get('/keys', (req, res) => {
  const { appId, status } = req.query;
  let query = 'SELECT * FROM licenses WHERE 1=1';
  const params = [];
  if (appId) {
    query += ' AND app_id = ?';
    params.push(appId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  query += ' ORDER BY created_at DESC LIMIT 500';

  const rows = db.prepare(query).all(...params);
  res.json({ licenses: rows });
});

/**
 * POST /api/admin/revoke
 * Révoque une clé (ex: remboursement, chargeback, abus détecté).
 * body: { key }
 */
router.post('/revoke', (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key requis' });

  const result = db
    .prepare(`UPDATE licenses SET status = 'revoked' WHERE license_key = ?`)
    .run(key.toUpperCase().trim());

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Clé introuvable' });
  }
  res.json({ revoked: true });
});

/**
 * POST /api/admin/reset-device
 * Libère une clé de son appareil actuel (ex: l'utilisateur a changé de téléphone).
 * body: { key }
 */
router.post('/reset-device', (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ error: 'key requis' });

  const result = db
    .prepare(
      `UPDATE licenses SET device_id = NULL, status = 'unused' WHERE license_key = ?`
    )
    .run(key.toUpperCase().trim());

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Clé introuvable' });
  }
  res.json({ reset: true });
});

module.exports = router;
