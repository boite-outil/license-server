const { createClient } = require('@libsql/client');

// En production (Render), TURSO_DATABASE_URL et TURSO_AUTH_TOKEN sont lus
// depuis les variables d'environnement (base Turso persistante, gratuite).
// En local sans ces variables, on retombe sur un fichier SQLite local
// (pratique pour développer/tester sans compte Turso, mais PAS persistant
// sur Render : le disque du conteneur est recréé à chaque redéploiement
// ou réveil du service, donc toute donnée écrite dans ce fichier local
// est perdue dès que le service redémarre).
const usingTurso = Boolean(process.env.TURSO_DATABASE_URL);

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./db/licenses.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Log de démarrage explicite : permet de vérifier dans les logs Render
// quelle base est réellement utilisée, sans avoir à deviner.
if (usingTurso) {
  console.log('[DB] Connexion a Turso (base persistante) :', process.env.TURSO_DATABASE_URL);
} else {
  console.warn('[DB] ATTENTION : TURSO_DATABASE_URL absente -> utilisation du fichier SQLite local ./db/licenses.db');
  console.warn('[DB] Sur Render (sans disque persistant), ce fichier est remis a zero a chaque redeploiement/reveil du service.');
  console.warn('[DB] Verifie les variables d\'environnement TURSO_DATABASE_URL et TURSO_AUTH_TOKEN dans Render > Environment.');
}

async function init() {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT UNIQUE NOT NULL,
      app_id TEXT NOT NULL,
      device_id TEXT,
      status TEXT NOT NULL DEFAULT 'unused',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      activated_at TEXT,
      last_check_at TEXT,
      expires_at TEXT,
      duration_days INTEGER,
      note TEXT
    )
  `);

  await client.execute('CREATE INDEX IF NOT EXISTS idx_license_key ON licenses(license_key)');
  await client.execute('CREATE INDEX IF NOT EXISTS idx_device_id ON licenses(device_id)');

  // Migration douce pour une base créée avant l'ajout de ces colonnes.
  const info = await client.execute('PRAGMA table_info(licenses)');
  const columns = info.rows.map((r) => r.name);
  if (!columns.includes('expires_at')) {
    await client.execute('ALTER TABLE licenses ADD COLUMN expires_at TEXT');
  }
  if (!columns.includes('duration_days')) {
    await client.execute('ALTER TABLE licenses ADD COLUMN duration_days INTEGER');
  }
}

module.exports = { client, init };
