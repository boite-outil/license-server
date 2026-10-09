// Script CLI pour générer des clés directement en local (sans passer par l'API).
// Usage: node scripts/generate-keys.js <appId> <count> ["note"]
const db = require('../db/db');
const { generateLicenseKey } = require('../utils/keygen');

const [, , appId, countArg, note] = process.argv;

if (!appId || !countArg) {
  console.log('Usage: node scripts/generate-keys.js <appId> <count> ["note"]');
  process.exit(1);
}

const count = parseInt(countArg, 10);
const insert = db.prepare('INSERT INTO licenses (license_key, app_id, note) VALUES (?, ?, ?)');

const keys = [];
const insertMany = db.transaction((n) => {
  for (let i = 0; i < n; i++) {
    let key;
    do {
      key = generateLicenseKey();
    } while (db.prepare('SELECT 1 FROM licenses WHERE license_key = ?').get(key));
    insert.run(key, appId, note || null);
    keys.push(key);
  }
});

insertMany(count);

console.log(`${count} clé(s) générée(s) pour "${appId}":\n`);
keys.forEach((k) => console.log(k));
