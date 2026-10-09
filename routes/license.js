const express = require('express');
const db = require('../db/db');
const { isValidFormat } = require('../utils/keygen');

const router = express.Router();

/**
 * POST /api/activate
 * Première activation d'une clé sur un appareil : lie la clé au device_id.
 * body: { key, deviceId, appId }
 */
router.post('/activate', (req, res) => {
  const { key, deviceId, appId } = req.body || {};

  if (!key || !deviceId || !appId) {
    return res.status(400).json({ valid: false, reason: 'MISSING_FIELDS' });
  }

  const normalizedKey = key.toUpperCase().trim();

  if (!isValidFormat(normalizedKey)) {
    return res.status(400).json({ valid: false, reason: 'INVALID_FORMAT' });
  }

  const license = db
    .prepare('SELECT * FROM licenses WHERE license_key = ? AND app_id = ?')
    .get(normalizedKey, appId);

  if (!license) {
    return res.status(404).json({ valid: false, reason: 'KEY_NOT_FOUND' });
  }

  if (license.status === 'revoked') {
    return res.status(403).json({ valid: false, reason: 'KEY_REVOKED' });
  }

  // Clé déjà activée sur un autre appareil
  if (license.status === 'active' && license.device_id && license.device_id !== deviceId) {
    return res.status(409).json({ valid: false, reason: 'KEY_ALREADY_USED' });
  }

  // Première activation, ou réactivation sur le même appareil
  db.prepare(
    `UPDATE licenses
     SET status = 'active', device_id = ?, activated_at = COALESCE(activated_at, datetime('now')), last_check_at = datetime('now')
     WHERE id = ?`
  ).run(deviceId, license.id);

  return res.json({ valid: true, reason: 'ACTIVATED' });
});

/**
 * POST /api/validate
 * Vérification périodique côté app : la clé doit exister, être active,
 * et être liée à ce device_id précis.
 * body: { key, deviceId, appId }
 */
router.post('/validate', (req, res) => {
  const { key, deviceId, appId } = req.body || {};

  if (!key || !deviceId || !appId) {
    return res.status(400).json({ valid: false, reason: 'MISSING_FIELDS' });
  }

  const normalizedKey = key.toUpperCase().trim();

  if (!isValidFormat(normalizedKey)) {
    return res.status(400).json({ valid: false, reason: 'INVALID_FORMAT' });
  }

  const license = db
    .prepare('SELECT * FROM licenses WHERE license_key = ? AND app_id = ?')
    .get(normalizedKey, appId);

  if (!license) {
    return res.status(404).json({ valid: false, reason: 'KEY_NOT_FOUND' });
  }
  if (license.status === 'revoked') {
    return res.status(403).json({ valid: false, reason: 'KEY_REVOKED' });
  }
  if (license.status !== 'active' || license.device_id !== deviceId) {
    return res.status(403).json({ valid: false, reason: 'DEVICE_MISMATCH' });
  }

  db.prepare(`UPDATE licenses SET last_check_at = datetime('now') WHERE id = ?`).run(license.id);

  return res.json({ valid: true, reason: 'OK' });
});

module.exports = router;
