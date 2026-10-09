const express = require('express');
const { client } = require('../db/db');
const { generateLicenseKey } = require('../utils/keygen');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();
router.use(adminAuth);

/**
 * POST /api/admin/keys
 * Génère N clés pour une app donnée.
 * body: { appId, count, note, durationDays }
 * durationDays (optionnel) : nombre de jours de validité À PARTIR DE L'ACTIVATION
 * (pas de la génération). Omis ou 0/null = pas d'expiration.
 */
router.post('/keys', async (req, res) => {
  try {
    const { appId, count = 1, note, durationDays } = req.body || {};

    if (!appId) {
      return res.status(400).json({ error: 'appId requis' });
    }
    const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 1000);
    const days = durationDays ? Math.max(parseInt(durationDays, 10) || 0, 0) : 0;

    const keys = [];
    for (let i = 0; i < n; i++) {
      let key;
      let exists = true;
      // évite les collisions, très improbable mais on se protège
      do {
        key = generateLicenseKey();
        const check = await client.execute({
          sql: 'SELECT 1 FROM licenses WHERE license_key = ?',
          args: [key],
        });
        exists = check.rows.length > 0;
      } while (exists);

      await client.execute({
        sql: 'INSERT INTO licenses (license_key, app_id, note, duration_days) VALUES (?, ?, ?, ?)',
        args: [key, appId, note || null, days || null],
      });
      keys.push(key);
    }

    res.json({ appId, count: n, durationDays: days || null, keys });
  } catch (err) {
    console.error('Erreur POST /api/admin/keys:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/**
 * GET /api/admin/keys?appId=...&status=...
 * Liste les clés (avec filtre optionnel).
 */
router.get('/keys', async (req, res) => {
  try {
    const { appId, status } = req.query;
    let sql = 'SELECT * FROM licenses WHERE 1=1';
    const args = [];
    if (appId) {
      sql += ' AND app_id = ?';
      args.push(appId);
    }
    if (status) {
      sql += ' AND status = ?';
      args.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT 500';

    const result = await client.execute({ sql, args });
    res.json({ licenses: result.rows });
  } catch (err) {
    console.error('Erreur GET /api/admin/keys:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/admin/revoke
 * Révoque une clé (ex: remboursement, chargeback, abus détecté).
 * body: { key }
 */
router.post('/revoke', async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key requis' });

    const result = await client.execute({
      sql: "UPDATE licenses SET status = 'revoked' WHERE license_key = ?",
      args: [key.toUpperCase().trim()],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Clé introuvable' });
    }
    res.json({ revoked: true });
  } catch (err) {
    console.error('Erreur POST /api/admin/revoke:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/admin/reset-device
 * Libère une clé de son appareil actuel (ex: l'utilisateur a changé de téléphone).
 * body: { key }
 */
router.post('/reset-device', async (req, res) => {
  try {
    const { key } = req.body || {};
    if (!key) return res.status(400).json({ error: 'key requis' });

    const result = await client.execute({
      sql: "UPDATE licenses SET device_id = NULL, status = 'unused' WHERE license_key = ?",
      args: [key.toUpperCase().trim()],
    });

    if (result.rowsAffected === 0) {
      return res.status(404).json({ error: 'Clé introuvable' });
    }
    res.json({ reset: true });
  } catch (err) {
    console.error('Erreur POST /api/admin/reset-device:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
