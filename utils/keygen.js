const crypto = require('crypto');

// Alphabet sans caractères ambigus (pas de 0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function randomSegment(length) {
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/**
 * Génère une clé au format XXXX-XXXX-XXXX-XXXX avec un dernier
 * segment qui est un checksum simple des 3 premiers segments.
 * Cela permet au client (et au serveur) de rejeter instantanément
 * une clé mal tapée ou inventée, sans toucher la base de données.
 */
function generateLicenseKey() {
  const seg1 = randomSegment(4);
  const seg2 = randomSegment(4);
  const seg3 = randomSegment(4);
  const checksum = computeChecksum(seg1 + seg2 + seg3);
  return `${seg1}-${seg2}-${seg3}-${checksum}`;
}

function computeChecksum(data) {
  const hash = crypto.createHash('sha256').update(data).digest();
  let out = '';
  for (let i = 0; i < 4; i++) {
    out += ALPHABET[hash[i] % ALPHABET.length];
  }
  return out;
}

function isValidFormat(key) {
  const match = /^([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})-([A-Z2-9]{4})$/.exec(
    (key || '').toUpperCase().trim()
  );
  if (!match) return false;
  const [, seg1, seg2, seg3, checksum] = match;
  return computeChecksum(seg1 + seg2 + seg3) === checksum;
}

module.exports = { generateLicenseKey, isValidFormat };
