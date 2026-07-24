/* Fichaje de horas: /api/admin/time/* */
const express = require('express');
const time = require('../models/timeEntries');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser); // cualquier usuario autenticado

router.post('/clock-in', async (req, res) => {
  try {
    const open = await time.getOpen(req.user.id);
    if (open) return res.status(409).json({ error: 'Ya tienes un turno abierto.', entry: open });
    const entry = await time.clockIn(req.user.id);
    audit.logAction(req.user.id, 'time.clock_in', { ip: getClientIp(req) });
    res.status(201).json({ entry });
  } catch (err) {
    // Índice único parcial: perdió la carrera → ya hay un turno abierto.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Ya tienes un turno abierto.' });
    }
    console.error('clock-in error:', err.message);
    res.status(500).json({ error: 'No se pudo fichar entrada.' });
  }
});

router.post('/clock-out', async (req, res) => {
  try {
    const entry = await time.clockOut(req.user.id);
    if (!entry) return res.status(400).json({ error: 'No tienes un turno abierto.' });
    audit.logAction(req.user.id, 'time.clock_out', { ip: getClientIp(req) });
    res.json({ entry });
  } catch (err) {
    console.error('clock-out error:', err.message);
    res.status(500).json({ error: 'No se pudo fichar salida.' });
  }
});

// Mi estado + turnos recientes (el cliente calcula las horas de hoy).
router.get('/mine', async (req, res) => {
  try {
    const [open, entries] = await Promise.all([
      time.getOpen(req.user.id),
      time.recentForUser(req.user.id, 14),
    ]);
    res.json({ open, entries });
  } catch (err) {
    console.error('time/mine error:', err.message);
    res.status(500).json({ error: 'Error al obtener el fichaje.' });
  }
});

// Admin: quién está fichado ahora + turnos recientes de todos.
router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    const [open, recent] = await Promise.all([time.openNow(), time.recentAll(7)]);
    res.json({ open, recent });
  } catch (err) {
    console.error('time list error:', err.message);
    res.status(500).json({ error: 'Error al listar fichajes.' });
  }
});

module.exports = router;
