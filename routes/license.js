const express = require('express');
const { client } = require('../db/db');
const { isValidFormat } = require('../utils/keygen');

const router = express.Router();

/**
 * POST /api/activate
 * Première activation d'une clé sur un appareil : lie la clé au device_id.
 * body: { key, deviceId, appId }
 */
router.post('/activate', async (req, res) => {
  try {
    const { key, deviceId, appId } = req.body || {};

    if (!key || !deviceId || !appId) {
      return res.status(400).json({ valid: false, reason: 'MISSING_FIELDS' });
    }

    const normalizedKey = key.toUpperCase().trim();

    if (!isValidFormat(normalizedKey)) {
      return res.status(400).json({ valid: false, reason: 'INVALID_FORMAT' });
    }

    const result = await client.execute({
      sql: 'SELECT * FROM licenses WHERE license_key = ? AND app_id = ?',
      args: [normalizedKey, appId],
    });
    const license = result.rows[0];

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

    // Clé déjà activée dans le passé et expirée depuis
    if (license.expires_at && new Date(license.expires_at + 'Z') < new Date()) {
      return res.status(403).json({ valid: false, reason: 'KEY_EXPIRED' });
    }

    // Première activation : si la clé a une durée, on fixe expires_at maintenant
    const isFirstActivation = !license.activated_at;
    const expiresAtExpr =
      isFirstActivation && license.duration_days
        ? `datetime('now', '+${parseInt(license.duration_days, 10)} days')`
        : 'expires_at';

    await client.execute({
      sql: `UPDATE licenses
            SET status = 'active', device_id = ?, activated_at = COALESCE(activated_at, datetime('now')),
                last_check_at = datetime('now'), expires_at = ${expiresAtExpr}
            WHERE id = ?`,
      args: [deviceId, license.id],
    });

    return res.json({ valid: true, reason: 'ACTIVATED' });
  } catch (err) {
    console.error('Erreur /api/activate:', err);
    return res.status(500).json({ valid: false, reason: 'SERVER_ERROR' });
  }
});

/**
 * POST /api/validate
 * Vérification périodique côté app : la clé doit exister, être active,
 * être liée à ce device_id précis, et ne pas être expirée.
 * body: { key, deviceId, appId }
 */
router.post('/validate', async (req, res) => {
  try {
    const { key, deviceId, appId } = req.body || {};

    if (!key || !deviceId || !appId) {
      return res.status(400).json({ valid: false, reason: 'MISSING_FIELDS' });
    }

    const normalizedKey = key.toUpperCase().trim();

    if (!isValidFormat(normalizedKey)) {
      return res.status(400).json({ valid: false, reason: 'INVALID_FORMAT' });
    }

    const result = await client.execute({
      sql: 'SELECT * FROM licenses WHERE license_key = ? AND app_id = ?',
      args: [normalizedKey, appId],
    });
    const license = result.rows[0];

    if (!license) {
      return res.status(404).json({ valid: false, reason: 'KEY_NOT_FOUND' });
    }
    if (license.status === 'revoked') {
      return res.status(403).json({ valid: false, reason: 'KEY_REVOKED' });
    }
    if (license.status !== 'active' || license.device_id !== deviceId) {
      return res.status(403).json({ valid: false, reason: 'DEVICE_MISMATCH' });
    }
    if (license.expires_at && new Date(license.expires_at + 'Z') < new Date()) {
      return res.status(403).json({ valid: false, reason: 'KEY_EXPIRED' });
    }

    await client.execute({
      sql: "UPDATE licenses SET last_check_at = datetime('now') WHERE id = ?",
      args: [license.id],
    });

    return res.json({ valid: true, reason: 'OK' });
  } catch (err) {
    console.error('Erreur /api/validate:', err);
    return res.status(500).json({ valid: false, reason: 'SERVER_ERROR' });
  }
});

module.exports = router;
