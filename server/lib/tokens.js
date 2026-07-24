/* Firma/verificación del JWT de acceso del panel.
   Payload: { sub: userId, role, tv: token_version }. El tv permite revocar
   sesiones (se incrementa al desactivar, cambiar rol o cambiar contraseña). */
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_ACCESS_TTL } = require('../config');

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, tv: user.token_version },
    JWT_SECRET,
    { expiresIn: JWT_ACCESS_TTL }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken, JWT_ACCESS_TTL };
