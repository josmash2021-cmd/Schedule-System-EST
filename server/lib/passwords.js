/* Hashing y política de contraseñas.
   bcryptjs (JS puro) para no arriesgar el build nativo de Railway. El wrapper
   permite cambiar de algoritmo más adelante sin tocar el resto del código. */
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const { BCRYPT_COST } = require('../config');

// Hash fijo contra el que comparar cuando el usuario NO existe, para que el
// tiempo de respuesta sea igual y no se pueda enumerar usuarios por timing.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing-safety', BCRYPT_COST);

async function hashPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_COST);
}

async function verifyPassword(plain, hash) {
  try {
    return await bcrypt.compare(String(plain), hash || DUMMY_HASH);
  } catch (_) {
    return false;
  }
}

// Contraseña temporal legible (sin caracteres ambiguos 0/O/1/l/I).
function generateTempPassword(len = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// Devuelve un mensaje de error si la contraseña no cumple, o null si está bien.
function validatePasswordPolicy(plain) {
  const p = String(plain == null ? '' : plain);
  if (p.length < 10) return 'La contraseña debe tener al menos 10 caracteres.';
  // bcrypt trunca a 72 bytes; rechazar por encima evita confusión silenciosa.
  if (Buffer.byteLength(p, 'utf8') > 72) return 'La contraseña es demasiado larga (máximo 72 bytes).';
  return null;
}

module.exports = { hashPassword, verifyPassword, generateTempPassword, validatePasswordPolicy, DUMMY_HASH };
