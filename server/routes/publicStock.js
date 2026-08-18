/* Stock público para el sitio web: /api/stock
   Devuelve sku, nombre y stock de los productos activos. La web lo usa para
   marcar "Vendido" automáticamente cuando un producto llega a 0 (el enlace
   es el SKU del panel = data-inv de la tarjeta/página). */
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const r = await pool.query('SELECT sku, name, stock FROM inventory_items WHERE active');
    res.set('Cache-Control', 'no-store');
    res.json({ items: r.rows });
  } catch (err) {
    console.error('GET /api/stock error:', err.message);
    res.status(500).json({ error: 'Error al consultar el stock.' });
  }
});

module.exports = router;
