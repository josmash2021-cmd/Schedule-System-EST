/* Ventas directas: /x/s/sales
   Registrar una venta: admin y trabajadores (es trabajo de mostrador).
   Ver el listado, anular una venta y el borrado total: solo admin. */
const express = require('express');
const sales = require('../models/sales');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser);

const PAGOS = ['efectivo', 'tarjeta', 'transferencia', 'otro'];

router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ sales: await sales.listAll() });
  } catch (err) {
    console.error('sales list error:', err.message);
    res.status(500).json({ error: 'Error al listar las ventas.' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const raw = Array.isArray(b.items) ? b.items : [];
  if (!raw.length) return res.status(400).json({ error: 'Agrega al menos un producto o concepto.' });
  if (raw.length > 50) return res.status(400).json({ error: 'Demasiadas líneas en una sola venta.' });

  const items = [];
  for (const it of raw) {
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return res.status(400).json({ error: 'Cantidad inválida (1–999).' });
    const hasPrice = it.price !== undefined && it.price !== null && it.price !== '';
    const price = hasPrice ? Number(it.price) : null;
    if (hasPrice && (!Number.isFinite(price) || price < 0)) return res.status(400).json({ error: 'Precio inválido.' });
    if (it.item_id) {
      if (!/^\d+$/.test(String(it.item_id))) return res.status(400).json({ error: 'Producto inválido.' });
      items.push({ item_id: Number(it.item_id), qty, price });
    } else {
      const name = String(it.name || '').trim().slice(0, 160);
      if (!name) return res.status(400).json({ error: 'Cada línea libre necesita un concepto.' });
      // Sin producto de inventario no hay precio de referencia: es obligatorio.
      if (price == null) return res.status(400).json({ error: `Ponle precio a "${name}".` });
      items.push({ item_id: null, name, qty, price });
    }
  }

  const payment_method = PAGOS.includes(b.payment_method) ? b.payment_method : null;
  const note = b.note ? String(b.note).trim().slice(0, 500) : null;

  try {
    const sale = await sales.create({ items, payment_method, note }, req.user.id);
    audit.logAction(req.user.id, 'sale.create', {
      targetType: 'sale', targetId: String(sale.id), ip: getClientIp(req),
      metadata: { total: sale.total, lineas: items.length },
    });
    res.status(201).json({ ok: true, sale });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('sale create error:', err.message);
    res.status(500).json({ error: 'No se pudo registrar la venta.' });
  }
});

// Anular una venta (repone el stock de sus productos).
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Venta no encontrada.' });
  try {
    const ok = await sales.remove(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Venta no encontrada.' });
    audit.logAction(req.user.id, 'sale.delete', { targetType: 'sale', targetId: String(id), ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('sale delete error:', err.message);
    res.status(500).json({ error: 'No se pudo anular la venta.' });
  }
});

// Borrado total: requiere { all: true } explícito. No repone stock (limpieza
// de historial; las unidades sí se vendieron).
router.delete('/', requireRole('admin'), async (req, res) => {
  if (!req.body || req.body.all !== true) {
    return res.status(400).json({ error: 'Petición inválida.' });
  }
  try {
    const n = await sales.removeAll();
    audit.logAction(req.user.id, 'sale.delete_all', { targetType: 'sale', ip: getClientIp(req), metadata: { count: n } });
    res.json({ ok: true, deleted: n });
  } catch (err) {
    console.error('sales delete all error:', err.message);
    res.status(500).json({ error: 'No se pudieron borrar las ventas.' });
  }
});

module.exports = router;
