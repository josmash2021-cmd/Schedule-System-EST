const express = require('express');
const jwt = require('jsonwebtoken');
const { ADMIN_PASSWORD, JWT_SECRET } = require('../config');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const loginAttempts = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
}

function getAttempts(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return { count: 0, resetAt: now + WINDOW_MS };
  if (record.resetAt < now) {
    const fresh = { count: 0, resetAt: now + WINDOW_MS };
    loginAttempts.set(ip, fresh);
    return fresh;
  }
  return record;
}

function recordFailedAttempt(ip) {
  const record = getAttempts(ip);
  record.count += 1;
  loginAttempts.set(ip, record);
  return record;
}

function cleanupOldAttempts() {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.resetAt < now) loginAttempts.delete(ip);
  }
}

setInterval(cleanupOldAttempts, 60_000).unref();

router.post('/login', (req, res) => {
  const ip = getClientIp(req);
  const record = getAttempts(ip);

  if (record.count >= MAX_ATTEMPTS) {
    const minutes = Math.ceil((record.resetAt - Date.now()) / 60_000);
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Intenta de nuevo en ${minutes} minuto${minutes === 1 ? '' : 's'}.`,
    });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    recordFailedAttempt(ip);
    return res.status(401).json({ error: 'Contraseña incorrecta.' });
  }

  if (password !== ADMIN_PASSWORD) {
    const updated = recordFailedAttempt(ip);
    const remaining = Math.max(0, MAX_ATTEMPTS - updated.count);
    return res.status(401).json({
      error: 'Contraseña incorrecta.',
      remainingAttempts: remaining,
    });
  }

  // Login exitoso: limpiar intentos y generar JWT
  loginAttempts.delete(ip);

  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '8h' });
  res.json({ token, expiresIn: '8h' });
});

module.exports = router;
