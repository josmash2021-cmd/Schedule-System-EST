/* Ajustes del negocio: /x/s/settings — solo admin.
   GET/PUT /dropoffs: dónde se dejan los paquetes de cada paquetería (lo usa
   el seguimiento público: parada "Dejado en …" y pin en el mapa). */
const express = require('express');
const settings = require('../models/settings');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser, requireRole('admin'));

router.get('/dropoffs', async (_req, res) => {
  try {
    res.json({ dropoffs: await settings.getDropoffs() });
  } catch (err) {
    console.error('settings dropoffs get error:', err.message);
    res.status(500).json({ error: 'No se pudieron leer los ajustes.' });
  }
});

router.put('/dropoffs', async (req, res) => {
  try {
    const raw = req.body && req.body.dropoffs;
    if (!raw || typeof raw !== 'object') return res.status(400).json({ error: 'Faltan los datos de las oficinas.' });
    res.json({ dropoffs: await settings.setDropoffs(raw) });
  } catch (err) {
    console.error('settings dropoffs put error:', err.message);
    res.status(500).json({ error: 'No se pudieron guardar los ajustes.' });
  }
});

module.exports = router;
