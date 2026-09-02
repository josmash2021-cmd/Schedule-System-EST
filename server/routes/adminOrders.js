/* Órdenes online (compras web por Stripe): /x/s/orders
   Solo lectura y solo admin: se crean solas desde el webhook de checkout y
   los reembolsos/anulaciones se gestionan en el dashboard de Stripe. */
const express = require('express');
const orders = require('../models/orders');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken, loadUser);

router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ orders: await orders.listAll() });
  } catch (err) {
    console.error('orders list error:', err.message);
    res.status(500).json({ error: 'Error al listar las órdenes online.' });
  }
});

module.exports = router;
