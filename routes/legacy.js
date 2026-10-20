const express = require('express');
const crypto = require('crypto');
const { client } = require('../db/db');

const router = express.Router();

// Routes de compatibilité pour l'app KLEY (com.defmedia.invbar), dont le
// code source a été perdu : elle parle un protocole différent de celui de
// routes/license.js (chemins et formats de réponse propres à son ancien
// serveur VPS, repris ici tels quels pour ne pas avoir à repatcher la
// logique métier dans l'app décompilée).

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function isExpired(license) {
  return Boolean(license.expires_at) && new Date(`${license.expires_at}Z`) < new Date();
}

/**
 * POST /activate
 * body: { key, device_id, user_name }
 * L'app ne connaît pas la notion d'app_id (ancien protocole) : on
 * retrouve la licence uniquement par license_key, qui est unique
 * globalement (voir routes/admin.js, vérif anti-collision à la génération).
 */
router.post('/activate', async (req, res) => {
  try {
    const { key, device_id: deviceId, user_name: userName } = req.body || {};
    if (!key || !deviceId) {
      return res.status(400).json({ ok: false, error: 'missing fields' });
    }
    const normalizedKey = key.toUpperCase().trim();

    const result = await client.execute({
      sql: 'SELECT * FROM licenses WHERE license_key = ?',
      args: [normalizedKey],
    });
    const license = result.rows[0];

    if (!license) {
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    if (license.status === 'revoked') {
      return res.status(403).json({ ok: false, error: 'revoked' });
    }
    if (license.status === 'active' && license.device_id && license.device_id !== deviceId) {
      return res.status(409).json({ ok: false, error: 'another device' });
    }
    if (isExpired(license)) {
      return res.status(403).json({ ok: false, error: 'expired' });
    }

    const isFirstActivation = !license.activated_at;
    const expiresAtExpr =
      isFirstActivation && license.duration_days
        ? `datetime('now', '+${parseInt(license.duration_days, 10)} days')`
        : 'expires_at';
    const token = license.token || generateToken();

    await client.execute({
      sql: `UPDATE licenses
            SET status = 'active', device_id = ?, token = ?,
                activated_at = COALESCE(activated_at, datetime('now')),
                last_check_at = datetime('now'), expires_at = ${expiresAtExpr},
                note = COALESCE(note, ?)
            WHERE id = ?`,
      args: [deviceId, token, userName || null, license.id],
    });

    const refreshed = await client.execute({
      sql: 'SELECT expires_at FROM licenses WHERE id = ?',
      args: [license.id],
    });

    return res.json({ ok: true, token, expires_at: refreshed.rows[0]?.expires_at || '' });
  } catch (err) {
    console.error('Erreur POST /activate:', err);
    return res.status(500).json({ ok: false, error: 'server error' });
  }
});

/**
 * POST /verify
 * body: { key, token, device_id }
 * L'app efface sa licence locale si le message d'erreur contient
 * "invalid", "revoked", "not found", "another device" ou "expired"
 * (comparaison insensible à la casse côté app) : on reprend exactement
 * ces libellés.
 */
router.post('/verify', async (req, res) => {
  try {
    const { key, token, device_id: deviceId } = req.body || {};
    if (!key || !deviceId) {
      return res.status(400).json({ ok: false, error: 'not found' });
    }
    const normalizedKey = key.toUpperCase().trim();

    const result = await client.execute({
      sql: 'SELECT * FROM licenses WHERE license_key = ?',
      args: [normalizedKey],
    });
    const license = result.rows[0];

    if (!license) {
      return res.status(404).json({ ok: false, error: 'not found' });
    }
    if (license.status === 'revoked') {
      return res.status(403).json({ ok: false, error: 'revoked' });
    }
    if (license.status !== 'active' || license.device_id !== deviceId) {
      return res.status(403).json({ ok: false, error: 'another device' });
    }
    if (token && license.token && token !== license.token) {
      return res.status(403).json({ ok: false, error: 'another device' });
    }
    if (isExpired(license)) {
      return res.status(403).json({ ok: false, error: 'expired' });
    }

    await client.execute({
      sql: "UPDATE licenses SET last_check_at = datetime('now') WHERE id = ?",
      args: [license.id],
    });

    return res.json({ ok: true, expires_at: license.expires_at || '' });
  } catch (err) {
    console.error('Erreur POST /verify:', err);
    return res.status(500).json({ ok: false, error: 'server error' });
  }
});

/**
 * POST /api/complete
 * Rapport de fin d'exécution du bot (fire-and-forget côté app, qui
 * ignore la réponse et avale les erreurs réseau). On se contente de
 * logger pour garder une trace exploitable.
 */
router.post('/api/complete', (req, res) => {
  const { key, device_id: deviceId, user_name: userName, success, error, stopped, duration_ms: durationMs, link_count: linkCount } =
    req.body || {};
  console.log('[complete]', { key, deviceId, userName, success, error, stopped, durationMs, linkCount });
  return res.json({ ok: true });
});

/**
 * POST /api/reset-device
 * Appelée directement par l'app (pas par l'admin) pour libérer SA PROPRE
 * licence de l'appareil courant, ex: avant une réinstallation. On exige
 * donc que le device_id fourni corresponde à celui déjà enregistré, pour
 * qu'un appareil ne puisse pas libérer la licence d'un autre.
 */
router.post('/api/reset-device', async (req, res) => {
  try {
    const { key, device_id: deviceId } = req.body || {};
    if (!key || !deviceId) {
      return res.status(400).json({ ok: false });
    }
    const normalizedKey = key.toUpperCase().trim();

    const result = await client.execute({
      sql: "UPDATE licenses SET device_id = NULL, status = 'unused', token = NULL WHERE license_key = ? AND device_id = ?",
      args: [normalizedKey, deviceId],
    });

    return res.json({ ok: result.rowsAffected > 0 });
  } catch (err) {
    console.error('Erreur POST /api/reset-device:', err);
    return res.status(500).json({ ok: false });
  }
});

/**
 * POST /api/stats
 * body: { total_runs, total_batch, total_akun }
 * Stats globales de farm affichées dans l'app. Chaque appel ajoute une
 * ligne ; on renvoie les totaux cumulés (all_time) et du jour (today).
 */
router.post('/api/stats', async (req, res) => {
  try {
    const { total_runs: totalRuns = 0, total_batch: totalBatch = 0, total_akun: totalAkun = 0 } = req.body || {};

    await client.execute({
      sql: 'INSERT INTO bot_stats (total_runs, total_batch, total_akun) VALUES (?, ?, ?)',
      args: [totalRuns, totalBatch, totalAkun],
    });

    const allTime = await client.execute(
      'SELECT COALESCE(SUM(total_runs),0) AS total_runs, COALESCE(SUM(total_batch),0) AS total_batch, COALESCE(SUM(total_akun),0) AS total_akun FROM bot_stats'
    );
    const today = await client.execute(
      "SELECT COALESCE(SUM(total_runs),0) AS total_runs, COALESCE(SUM(total_batch),0) AS total_batch, COALESCE(SUM(total_akun),0) AS total_akun FROM bot_stats WHERE date(created_at) = date('now')"
    );

    return res.json({ ok: true, all_time: allTime.rows[0], today: today.rows[0] });
  } catch (err) {
    console.error('Erreur POST /api/stats:', err);
    return res.status(500).json({ ok: false });
  }
});

/**
 * GET /app/version
 * Vérif de mise à jour du jeu Monopoly GO que l'app télécharge/installe
 * elle-même. Entièrement piloté par variables d'environnement : tant que
 * GAME_DOWNLOAD_URL n'est pas renseignée, on répond force_update:false et
 * l'app ne tente aucun téléchargement (pas de fichier à héberger ici tant
 * que la question de l'hébergement du .xapk n'est pas tranchée).
 */
router.get('/app/version', (req, res) => {
  const downloadUrl = process.env.GAME_DOWNLOAD_URL || '';
  if (!downloadUrl) {
    return res.json({ ok: true, force_update: false });
  }
  return res.json({
    ok: true,
    version_code: parseInt(process.env.GAME_VERSION_CODE, 10) || 0,
    version_name: process.env.GAME_VERSION_NAME || '',
    download_url: downloadUrl,
    release_notes: process.env.GAME_RELEASE_NOTES || '',
    force_update: process.env.GAME_FORCE_UPDATE === 'true',
    apk_size_bytes: parseInt(process.env.GAME_APK_SIZE_BYTES, 10) || 0,
    apk_sha256: process.env.GAME_APK_SHA256 || '',
  });
});

module.exports = router;
