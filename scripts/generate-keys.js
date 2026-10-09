// Script CLI pour générer des clés directement en local (sans passer par l'API).
// Usage: node scripts/generate-keys.js <appId> <count> ["note"]
require('dotenv').config();
const { client, init } = require('../db/db');
const { generateLicenseKey } = require('../utils/keygen');

async function main() {
  const [, , appId, countArg, note] = process.argv;

  if (!appId || !countArg) {
    console.log('Usage: node scripts/generate-keys.js <appId> <count> ["note"]');
    process.exit(1);
  }

  await init();

  const count = parseInt(countArg, 10);
  const keys = [];

  for (let i = 0; i < count; i++) {
    let key;
    let exists = true;
    do {
      key = generateLicenseKey();
      const check = await client.execute({
        sql: 'SELECT 1 FROM licenses WHERE license_key = ?',
        args: [key],
      });
      exists = check.rows.length > 0;
    } while (exists);

    await client.execute({
      sql: 'INSERT INTO licenses (license_key, app_id, note) VALUES (?, ?, ?)',
      args: [key, appId, note || null],
    });
    keys.push(key);
  }

  console.log(`${count} clé(s) générée(s) pour "${appId}":\n`);
  keys.forEach((k) => console.log(k));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
