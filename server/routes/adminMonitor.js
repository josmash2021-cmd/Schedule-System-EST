/* Monitoreo en vivo: /api/admin/live/* (sondeo, no SSE) */
const express = require('express');
const live = require('../lib/live');
const time = require('../models/timeEntries');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser);

// Heartbeat de presencia (cualquier usuario autenticado; en la práctica los
// trabajadores desde su app). screen = pestaña actual.
router.post('/presence', (req, res) => {
  const screen = String((req.body && req.body.screen) || '').slice(0, 40);
  live.recordPresence(req.user.id, req.user.username, screen);
  res.json({ ok: true });
});

// Snapshot en vivo (solo admin): quién ficha, quién está en línea, actividad.
router.get('/monitor', requireRole('admin'), async (_req, res) => {
  try {
    const working = await time.openNow();
    res.json({
      working,
      online: live.onlineList(),
      activity: live.recentActivity(30),
      now: new Date().toISOString(),
    });
  } catch (err) {
    console.error('monitor error:', err.message);
    res.status(500).json({ error: 'Error al obtener el monitoreo.' });
  }
});

module.exports = router;
