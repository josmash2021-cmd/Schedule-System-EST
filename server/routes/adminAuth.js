/* Autenticación del panel de back-office: /api/admin/auth/* */
const express = require('express');
const users = require('../models/users');
const audit = require('../models/audit');
const { verifyPassword, hashPassword, validatePasswordPolicy } = require('../lib/passwords');
const { signAccessToken, JWT_ACCESS_TTL } = require('../lib/tokens');
const { createLimiter, getClientIp } = require('../lib/rateLimit');
const { verifyToken, loadUser } = require('../middleware/auth');

const router = express.Router();

// Doble rate-limit: por IP y por usuario (para que rotar IPs no baste para
// atacar una cuenta concreta). Cuentan solo intentos fallidos.
const WINDOW = 15 * 60 * 1000;
const ipLimiter = createLimiter({ windowMs: WINDOW, max: 5 });
const userLimiter = createLimiter({ windowMs: WINDOW, max: 10 });

router.post('/login', async (req, res) => {
  const ip = getClientIp(req);
  const body = req.body || {};
  const uname = String(body.username || '').trim();
  const password = body.password;
  const ukey = 'u:' + uname.toLowerCase();

  const ipState = ipLimiter.tooMany(ip);
  const userState = uname ? userLimiter.tooMany(ukey) : { limited: false, resetAt: 0 };
  if (ipState.limited || userState.limited) {
    const resetAt = Math.max(ipState.resetAt || 0, userState.resetAt || 0);
    const minutes = Math.max(1, Math.ceil((resetAt - Date.now()) / 60000));
    return res.status(429).json({ error: `Demasiados intentos. Intenta de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.` });
  }

  if (!uname || typeof password !== 'string' || !password) {
    ipLimiter.fail(ip);
    return res.status(401).json({ error: 'Credenciales incorrectas.' });
  }

  try {
    const user = await users.findByUsername(uname);
    // Siempre verificar (contra un hash dummy si el usuario no existe) para no
    // filtrar la existencia de la cuenta por diferencia de tiempo.
    const ok = await verifyPassword(password, user ? user.password_hash : null);

    if (!user || !ok || !user.active) {
      const st = ipLimiter.fail(ip);
      if (uname) userLimiter.fail(ukey);
      audit.logAction(user ? user.id : null, 'auth.login_failed', { ip, metadata: { username: uname } });
      return res.status(401).json({ error: 'Credenciales incorrectas.', remainingAttempts: st.remaining });
    }

    ipLimiter.reset(ip);
    userLimiter.reset(ukey);
    await users.touchLastLogin(user.id);
    audit.logAction(user.id, 'auth.login', { ip });
    const token = signAccessToken(user);
    return res.json({ token, expiresIn: JWT_ACCESS_TTL, user: users.toPublic(user) });
  } catch (err) {
    console.error('POST /api/admin/auth/login error:', err.message);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

router.post('/logout', verifyToken, loadUser, (req, res) => {
  audit.logAction(req.user.id, 'auth.logout', { ip: getClientIp(req) });
  res.json({ ok: true });
});

router.get('/me', verifyToken, loadUser, (req, res) => {
  res.json({ user: users.toPublic(req.user) });
});

router.post('/change-password', verifyToken, loadUser, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  try {
    const ok = await verifyPassword(currentPassword || '', req.user.password_hash);
    if (!ok) return res.status(400).json({ error: 'La contraseña actual es incorrecta.' });
    const policyErr = validatePasswordPolicy(newPassword);
    if (policyErr) return res.status(400).json({ error: policyErr });
    const hash = await hashPassword(newPassword);
    const updated = await users.setPassword(req.user.id, hash, { mustChange: false });
    audit.logAction(req.user.id, 'auth.change_password', { ip: getClientIp(req) });
    // El token anterior quedó inválido (subió token_version); devolver uno nuevo.
    const token = signAccessToken(updated);
    return res.json({ token, user: users.toPublic(updated) });
  } catch (err) {
    console.error('POST /api/admin/auth/change-password error:', err.message);
    return res.status(500).json({ error: 'No se pudo cambiar la contraseña.' });
  }
});

module.exports = router;
