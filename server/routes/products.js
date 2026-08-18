/* Catálogo público de la página web: /api/products
   Solo productos marcados "mostrar en la web" (show_on_web), activos y con
   stock. Las fotos se sirven como URL pública (/x/s/inventory/photos/<uuid>,
   nombre no adivinable). */
const express = require('express');
const { pool } = require('../db');

const router = express.Router();

const COLS = `id, name, subtitle, category, description, price,
  image_url, image2_url, image3_url, stock`;

router.get('/', async (_req, res) => {
  try {
    const r = await pool.query(
      `SELECT ${COLS} FROM inventory_items
       WHERE active AND show_on_web AND stock > 0
       ORDER BY created_at DESC`
    );
    res.json({ products: r.rows });
  } catch (err) {
    console.error('GET /api/products error:', err.message);
    res.status(500).json({ error: 'Error al listar productos.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Producto no encontrado.' });
  try {
    const r = await pool.query(
      `SELECT ${COLS} FROM inventory_items
       WHERE id = $1 AND active AND show_on_web AND stock > 0`,
      [id]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'Producto no encontrado.' });
    res.json({ product: r.rows[0] });
  } catch (err) {
    console.error('GET /api/products/:id error:', err.message);
    res.status(500).json({ error: 'Error al obtener el producto.' });
  }
});

module.exports = router;
