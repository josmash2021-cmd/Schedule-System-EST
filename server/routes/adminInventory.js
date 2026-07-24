/* Inventario: /api/admin/inventory/*
   Ver y ajustar stock: cualquier usuario. Crear/editar/eliminar productos: admin. */
const express = require('express');
const inventory = require('../models/inventory');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser);

function parseId(req, res) {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) { res.status(404).json({ error: 'Producto no encontrado.' }); return null; }
  return Number(raw);
}

function num(v, { int = false, min = 0 } = {}) {
  if (v === '' || v === null || v === undefined) return { ok: true, val: null };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false };
  if (int && !Number.isInteger(n)) return { ok: false };
  if (min != null && n < min) return { ok: false };
  return { ok: true, val: n };
}

function extractItem(b) {
  const f = {};
  if (b.name !== undefined) f.name = String(b.name || '').trim().slice(0, 160);
  for (const [k, max] of [['sku', 60], ['category', 60], ['description', 2000]]) {
    if (b[k] !== undefined) { const s = b[k] == null ? null : String(b[k]).trim(); f[k] = s ? s.slice(0, max) : null; }
  }
  for (const k of ['price', 'cost']) {
    if (b[k] !== undefined) { const r = num(b[k], { min: 0 }); if (!r.ok) return { error: `Valor inválido en ${k === 'price' ? 'precio' : 'costo'}.` }; f[k] = r.val; }
  }
  if (b.min_stock !== undefined) { const r = num(b.min_stock, { int: true, min: 0 }); if (!r.ok) return { error: 'Mínimo inválido.' }; f.min_stock = r.val == null ? 0 : r.val; }
  return { fields: f };
}

router.get('/', async (req, res) => {
  try {
    res.json({ items: await inventory.listItems(req.query.search) });
  } catch (err) {
    console.error('inventory list error:', err.message);
    res.status(500).json({ error: 'Error al listar el inventario.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const item = await inventory.findById(id);
    if (!item) return res.status(404).json({ error: 'Producto no encontrado.' });
    const movements = await inventory.listMovements(id, 50);
    res.json({ item, movements });
  } catch (err) {
    console.error('inventory get error:', err.message);
    res.status(500).json({ error: 'Error al obtener el producto.' });
  }
});

router.post('/', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const { fields, error } = extractItem(b);
  if (error) return res.status(400).json({ error });
  if (!fields.name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if (b.stock !== undefined) { const r = num(b.stock, { int: true, min: 0 }); if (!r.ok) return res.status(400).json({ error: 'Stock inicial inválido.' }); fields.stock = r.val == null ? 0 : r.val; }
  try {
    const item = await inventory.create(fields);
    audit.logAction(req.user.id, 'inventory.create', { targetType: 'inventory', targetId: item.id, ip: getClientIp(req) });
    res.status(201).json({ item });
  } catch (err) {
    console.error('inventory create error:', err.message);
    res.status(500).json({ error: 'No se pudo crear el producto.' });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const { fields, error } = extractItem(req.body || {});
  if (error) return res.status(400).json({ error });
  if (fields.name !== undefined && !fields.name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  try {
    const existing = await inventory.findById(id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });
    const item = await inventory.update(id, fields);
    audit.logAction(req.user.id, 'inventory.update', { targetType: 'inventory', targetId: id, ip: getClientIp(req) });
    res.json({ item });
  } catch (err) {
    console.error('inventory update error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar el producto.' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const ok = await inventory.softDelete(id);
    if (!ok) return res.status(404).json({ error: 'Producto no encontrado.' });
    audit.logAction(req.user.id, 'inventory.delete', { targetType: 'inventory', targetId: id, ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('inventory delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el producto.' });
  }
});

// Ajustar stock (± con motivo). Cualquier usuario autenticado.
router.post('/:id/adjust', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const b = req.body || {};
  const delta = Number(b.delta);
  if (!Number.isInteger(delta) || delta === 0) return res.status(400).json({ error: 'Cantidad inválida (un entero distinto de 0).' });
  const reason = b.reason ? String(b.reason).slice(0, 40) : null;
  const note = b.note ? String(b.note).slice(0, 500) : null;
  try {
    const item = await inventory.adjustStock(id, delta, reason, note, req.user.id);
    if (!item) return res.status(404).json({ error: 'Producto no encontrado.' });
    audit.logAction(req.user.id, 'inventory.adjust', { targetType: 'inventory', targetId: id, ip: getClientIp(req), metadata: { delta, reason } });
    res.json({ item });
  } catch (err) {
    console.error('inventory adjust error:', err.message);
    res.status(500).json({ error: 'No se pudo ajustar el stock.' });
  }
});

router.get('/:id/movements', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    res.json({ movements: await inventory.listMovements(id, 100) });
  } catch (err) {
    console.error('inventory movements error:', err.message);
    res.status(500).json({ error: 'Error al obtener los movimientos.' });
  }
});

module.exports = router;
