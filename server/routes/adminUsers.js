/* Gestión de usuarios/trabajadores: /api/admin/users/* (solo admin) */
const express = require('express');
const users = require('../models/users');
const audit = require('../models/audit');
const { hashPassword, generateTempPassword, validatePasswordPolicy } = require('../lib/passwords');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser, requireRole('admin'));

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ROLES = ['admin', 'worker'];

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(404).json({ error: 'Usuario no encontrado.' });
    return null;
  }
  return id;
}

router.get('/', async (_req, res) => {
  try {
    res.json({ users: await users.list() });
  } catch (err) {
    console.error('GET /users error:', err.message);
    res.status(500).json({ error: 'No se pudo listar usuarios.' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const username = String(b.username || '').trim().toLowerCase();
  const email = b.email ? String(b.email).trim() : null;
  const role = String(b.role || 'worker');

  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ error: 'Usuario inválido: 3-32 caracteres, minúsculas, letras/números y . _ -' });
  }
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Rol inválido.' });

  let password = b.password;
  let mustChange = false;
  let tempPassword = null;
  if (password) {
    const perr = validatePasswordPolicy(password);
    if (perr) return res.status(400).json({ error: perr });
  } else {
    password = generateTempPassword();
    tempPassword = password;
    mustChange = true;
  }

  try {
    const hash = await hashPassword(password);
    const created = await users.create({ username, email, password_hash: hash, role, must_change_password: mustChange });
    audit.logAction(req.user.id, 'user.create', { targetType: 'user', targetId: created.id, ip: getClientIp(req), metadata: { username, role } });
    return res.status(201).json({ user: users.toPublic(created), tempPassword });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese usuario o email ya existe.' });
    console.error('POST /users error:', err.message);
    return res.status(500).json({ error: 'No se pudo crear el usuario.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const u = await users.findById(id);
    if (!u) return res.status(404).json({ error: 'Usuario no encontrado.' });
    res.json({ user: users.toPublic(u) });
  } catch (err) {
    console.error('GET /users/:id error:', err.message);
    res.status(500).json({ error: 'Error al obtener el usuario.' });
  }
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });

    const b = req.body || {};
    const fields = {};
    if (b.email !== undefined) {
      const email = b.email ? String(b.email).trim() : null;
      if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido.' });
      fields.email = email;
    }
    if (b.role !== undefined) {
      if (!ROLES.includes(b.role)) return res.status(400).json({ error: 'Rol inválido.' });
      fields.role = b.role;
    }
    if (b.active !== undefined) fields.active = !!b.active;

    // Salvaguardas: no dispararse en el pie ni dejar el sistema sin admins.
    const willDemote = fields.role !== undefined && target.role === 'admin' && fields.role !== 'admin';
    const willDisable = fields.active === false && target.active === true;
    if (willDemote || willDisable) {
      if (target.id === req.user.id) {
        return res.status(409).json({ error: 'No puedes desactivarte ni cambiar tu propio rol.' });
      }
      if (target.role === 'admin') {
        const n = await users.countActiveAdmins();
        if (n <= 1) return res.status(409).json({ error: 'No puedes dejar el sistema sin administradores activos.' });
      }
    }

    const updated = await users.update(id, fields);
    audit.logAction(req.user.id, 'user.update', { targetType: 'user', targetId: id, ip: getClientIp(req), metadata: fields });
    res.json({ user: users.toPublic(updated) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está en uso.' });
    console.error('PATCH /users/:id error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el usuario.' });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const target = await users.findById(id);
    if (!target) return res.status(404).json({ error: 'Usuario no encontrado.' });
    const temp = generateTempPassword();
    const hash = await hashPassword(temp);
    await users.setPassword(id, hash, { mustChange: true });
    audit.logAction(req.user.id, 'user.reset_password', { targetType: 'user', targetId: id, ip: getClientIp(req) });
    res.json({ tempPassword: temp });
  } catch (err) {
    console.error('POST /users/:id/reset-password error:', err.message);
    res.status(500).json({ error: 'No se pudo restablecer la contraseña.' });
  }
});

module.exports = router;
