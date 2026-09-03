/* Inventario: /api/admin/inventory/*
   Ver y ajustar stock: cualquier usuario. Crear/editar/eliminar productos: admin. */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const multer = require('multer');
const inventory = require('../models/inventory');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');
const { INVENTORY_DIR } = require('../config');

fs.mkdirSync(INVENTORY_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, INVENTORY_DIR),
  filename: (_req, file, cb) => cb(null, crypto.randomUUID() + (EXT[file.mimetype] || '.jpg')),
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (EXT[file.mimetype]) cb(null, true);
    else cb(new Error('Solo se permiten imágenes JPG, PNG o WEBP.'));
  },
});
function uploadPhoto(req, res, next) {
  upload.single('photo')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'No se pudo subir la imagen.' });
    if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
    next();
  });
}

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
  for (const [k, max] of [['sku', 60], ['category', 60], ['description', 2000], ['image_url', 260]]) {
    if (b[k] !== undefined) { const s = b[k] == null ? null : String(b[k]).trim(); f[k] = s ? s.slice(0, max) : null; }
  }
  for (const k of ['price', 'cost']) {
    if (b[k] !== undefined) { const r = num(b[k], { min: 0 }); if (!r.ok) return { error: `Valor inválido en ${k === 'price' ? 'precio' : 'costo'}.` }; f[k] = r.val; }
  }
  if (b.min_stock !== undefined) { const r = num(b.min_stock, { int: true, min: 0 }); if (!r.ok) return { error: 'Mínimo inválido.' }; f.min_stock = r.val == null ? 0 : r.val; }
  return { fields: f };
}

// Valida "YYYY-MM-DD" (o null para quitar la fecha). Devuelve la fecha o null;
// false si el formato es inválido.
function fechaCompra(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  return s;
}

router.get('/', async (req, res) => {
  try {
    res.json({ items: await inventory.listItems(req.query.search) });
  } catch (err) {
    console.error('inventory list error:', err.message);
    res.status(500).json({ error: 'Error al listar el inventario.' });
  }
});

// Inventario al cierre de cada mes (contabilidad mensual de Ventas).
router.get('/stock-by-month', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ months: await inventory.stockAtMonthEnds() });
  } catch (err) {
    console.error('inventory stock-by-month error:', err.message);
    res.status(500).json({ error: 'Error al calcular el inventario por mes.' });
  }
});

// Mercancía comprada por mes (entradas de stock × costo), para las tarjetas
// "Compras del mes" de la página de Inventario. Solo admin (cifras internas).
router.get('/purchases-by-month', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ months: await inventory.purchasesByMonth() });
  } catch (err) {
    console.error('inventory purchases error:', err.message);
    res.status(500).json({ error: 'Error al calcular las compras de mercancía.' });
  }
});

// Pone/quita la fecha real de compra de un movimiento de entrada (admin).
router.patch('/movements/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const fecha = fechaCompra(req.body ? req.body.purchased_at : undefined);
  if (fecha === false) return res.status(400).json({ error: 'Fecha inválida (formato YYYY-MM-DD).' });
  try {
    const mov = await inventory.setMovementPurchaseDate(id, fecha);
    if (!mov) return res.status(404).json({ error: 'Movimiento no encontrado.' });
    audit.logAction(req.user.id, 'inventory.movement_purchase_date', { targetType: 'inventory', targetId: mov.item_id, ip: getClientIp(req), metadata: { movementId: id, purchased_at: fecha } });
    res.json({ movement: mov });
  } catch (err) {
    console.error('inventory movement purchase date error:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la fecha de compra.' });
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
  if (b.purchased_at !== undefined) { const fc = fechaCompra(b.purchased_at); if (fc === false) return res.status(400).json({ error: 'Fecha de compra inválida (formato YYYY-MM-DD).' }); fields.purchased_at = fc; }
  try {
    const item = await inventory.create(fields, req.user.id);
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
  // Corrección directa de la Cantidad desde la ficha (además de /adjust).
  if (req.body && req.body.stock !== undefined) {
    const r = num(req.body.stock, { int: true, min: 0 });
    if (!r.ok) return res.status(400).json({ error: 'Cantidad inválida.' });
    fields.stock = r.val == null ? 0 : r.val;
  }
  if (req.body && req.body.purchased_at !== undefined) {
    const fc = fechaCompra(req.body.purchased_at);
    if (fc === false) return res.status(400).json({ error: 'Fecha de compra inválida (formato YYYY-MM-DD).' });
    fields.purchased_at = fc;
  }
  try {
    const existing = await inventory.findById(id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });
    const item = await inventory.update(id, fields, req.user.id);
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
  const fc = fechaCompra(b.purchased_at);
  if (fc === false) return res.status(400).json({ error: 'Fecha de compra inválida (formato YYYY-MM-DD).' });
  try {
    const item = await inventory.adjustStock(id, delta, reason, note, req.user.id, fc);
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

// Subir foto de un producto (admin).
router.post('/:id/photo', requireRole('admin'), uploadPhoto, async (req, res) => {
  const id = parseId(req, res);
  if (id === null) { fs.unlink(req.file.path, () => {}); return; }
  const url = '/x/s/inventory/photos/' + req.file.filename;
  try {
    const existing = await inventory.findById(id);
    if (!existing) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Producto no encontrado.' }); }
    if (existing.image_url) {
      const old = path.join(INVENTORY_DIR, path.basename(existing.image_url));
      fs.unlink(old, () => {});
    }
    const item = await inventory.update(id, { image_url: url });
    audit.logAction(req.user.id, 'inventory.photo_add', { targetType: 'inventory', targetId: id, ip: getClientIp(req) });
    res.json({ item });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('inventory photo upload error:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la foto.' });
  }
});

// Eliminar foto de un producto (admin).
router.delete('/:id/photo', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const existing = await inventory.findById(id);
    if (!existing) return res.status(404).json({ error: 'Producto no encontrado.' });
    if (existing.image_url) {
      const old = path.join(INVENTORY_DIR, path.basename(existing.image_url));
      fs.unlink(old, () => {});
    }
    const item = await inventory.update(id, { image_url: null });
    audit.logAction(req.user.id, 'inventory.photo_delete', { targetType: 'inventory', targetId: id, ip: getClientIp(req) });
    res.json({ item });
  } catch (err) {
    console.error('inventory photo delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la foto.' });
  }
});

module.exports = router;
