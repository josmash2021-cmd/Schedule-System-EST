/* Tareas: /api/admin/tasks/*  (worker ve/actualiza las suyas; admin gestiona todo) */
const express = require('express');
const tasks = require('../models/tasks');
const users = require('../models/users');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser);

function parseId(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { res.status(404).json({ error: 'Tarea no encontrada.' }); return null; }
  return id;
}

async function validAssignee(value) {
  if (value === null || value === undefined || value === '') return { ok: true, id: null };
  const id = Number(value);
  if (!Number.isInteger(id)) return { ok: false };
  const u = await users.findById(id);
  if (!u) return { ok: false };
  return { ok: true, id };
}

// Mis tareas (cualquier usuario autenticado)
router.get('/mine', async (req, res) => {
  try {
    res.json({ tasks: await tasks.listForUser(req.user.id) });
  } catch (err) {
    console.error('tasks/mine error:', err.message);
    res.status(500).json({ error: 'Error al obtener tus tareas.' });
  }
});

// Cambiar estado de una tarea propia (o cualquiera si es admin)
router.patch('/:id/status', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const status = String((req.body && req.body.status) || '');
  if (!tasks.STATUSES.includes(status)) return res.status(400).json({ error: 'Estado inválido.' });
  try {
    const t = await tasks.findById(id);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada.' });
    if (req.user.role !== 'admin' && t.assigned_to !== req.user.id) {
      return res.status(403).json({ error: 'Esta tarea no es tuya.' });
    }
    const updated = await tasks.setStatus(id, status);
    audit.logAction(req.user.id, 'task.status', { targetType: 'task', targetId: id, ip: getClientIp(req), metadata: { status } });
    res.json({ task: updated });
  } catch (err) {
    console.error('task status error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la tarea.' });
  }
});

// ---------- Solo admin ----------
router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ tasks: await tasks.listAll() });
  } catch (err) {
    console.error('tasks list error:', err.message);
    res.status(500).json({ error: 'Error al listar tareas.' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ error: 'El título es obligatorio.' });
  if (title.length > 200) return res.status(400).json({ error: 'El título es demasiado largo.' });
  const asg = await validAssignee(b.assigned_to);
  if (!asg.ok) return res.status(400).json({ error: 'El trabajador asignado no es válido.' });
  try {
    const t = await tasks.create({
      title,
      description: b.description ? String(b.description) : null,
      assigned_to: asg.id,
      created_by: req.user.id,
      due_date: b.due_date ? String(b.due_date) : null,
    });
    audit.logAction(req.user.id, 'task.create', { targetType: 'task', targetId: t.id, ip: getClientIp(req) });
    res.status(201).json({ task: t });
  } catch (err) {
    console.error('task create error:', err.message);
    res.status(500).json({ error: 'No se pudo crear la tarea.' });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const b = req.body || {};
  const fields = {};
  if (b.title !== undefined) { const t = String(b.title).trim(); if (!t) return res.status(400).json({ error: 'El título es obligatorio.' }); fields.title = t; }
  if (b.description !== undefined) fields.description = b.description ? String(b.description) : null;
  if (b.due_date !== undefined) fields.due_date = b.due_date || null;
  if (b.status !== undefined) { if (!tasks.STATUSES.includes(b.status)) return res.status(400).json({ error: 'Estado inválido.' }); fields.status = b.status; }
  if (b.assigned_to !== undefined) {
    const asg = await validAssignee(b.assigned_to);
    if (!asg.ok) return res.status(400).json({ error: 'El trabajador asignado no es válido.' });
    fields.assigned_to = asg.id;
  }
  try {
    const t = await tasks.findById(id);
    if (!t) return res.status(404).json({ error: 'Tarea no encontrada.' });
    const updated = await tasks.update(id, fields);
    audit.logAction(req.user.id, 'task.update', { targetType: 'task', targetId: id, ip: getClientIp(req), metadata: fields });
    res.json({ task: updated });
  } catch (err) {
    console.error('task update error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la tarea.' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    await tasks.remove(id);
    audit.logAction(req.user.id, 'task.delete', { targetType: 'task', targetId: id, ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('task delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la tarea.' });
  }
});

module.exports = router;
