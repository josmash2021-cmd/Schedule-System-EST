const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('node:crypto');
const { ADMIN_PASSWORD, JWT_SECRET } = require('../config');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutos
const loginAttempts = new Map();

function getClientIp(req) {
  // El ÚLTIMO valor de X-Forwarded-For es el que añade el proxy (Railway)
  // y no lo controla el cliente; el PRIMERO se puede falsear para rotar
  // "IPs" y anular el rate limit.
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket?.remoteAddress || 'unknown';
}

// Comparación en tiempo constante (evita oráculo de tiempo).
function passwordValida(password) {
  const a = Buffer.from(String(password));
  const b = Buffer.from(String(ADMIN_PASSWORD));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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

  if (!passwordValida(password)) {
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
