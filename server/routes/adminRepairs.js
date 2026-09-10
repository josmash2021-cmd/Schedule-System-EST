/* Reparaciones: /api/admin/repairs/*  (admin + trabajadores)
   Fotos guardadas en el volumen de Railway (REPAIRS_DIR), nombre UUID. */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const multer = require('multer');
const repairs = require('../models/repairs');
const users = require('../models/users');
const audit = require('../models/audit');
const invoices = require('../models/invoices');
const { buildInvoicePdf } = require('../lib/invoicePdf');
const email = require('../lib/email');
const tracking = require('../lib/tracking');
const trackEvents = require('../lib/trackEvents');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');
const { REPAIRS_DIR } = require('../config');

fs.mkdirSync(REPAIRS_DIR, { recursive: true });

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, REPAIRS_DIR),
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
router.use(verifyToken, loadUser); // admin + trabajadores

function parseId(req, res, name = 'Reparación') {
  const raw = String(req.params.id);
  if (!/^\d+$/.test(raw)) { res.status(404).json({ error: `${name} no encontrada.` }); return null; }
  return Number(raw);
}

function num(v) {
  if (v === '' || v === null || v === undefined) return { ok: true, val: null };
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return { ok: false };
  return { ok: true, val: n };
}

// Extrae y valida los campos de texto/precio del body.
function extractFields(b) {
  const f = {};
  const textMax = { device_brand: 120, device_model: 120, device_serial: 120, customer_name: 120, customer_phone: 40, problem: 4000, diagnosis: 4000, tracking_number: 60, carrier: 40 };
  for (const [k, max] of Object.entries(textMax)) {
    if (b[k] !== undefined) { const s = b[k] == null ? null : String(b[k]).trim(); f[k] = s ? s.slice(0, max) : null; }
  }
  if (b.customer_email !== undefined) {
    const s = b.customer_email == null ? null : String(b.customer_email).trim().slice(0, 160);
    if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return { error: 'Correo del cliente inválido.' };
    f.customer_email = s || null;
  }
  for (const k of ['quoted_price', 'final_price', 'amount_paid']) {
    if (b[k] !== undefined) { const r = num(b[k]); if (!r.ok) return { error: 'Precio inválido.' }; f[k] = r.val; }
  }
  return { fields: f };
}

// Valida los enums de tipo de equipo y servicio; los agrega a `fields`.
function validEnums(b, fields) {
  if (b.device_type !== undefined) {
    if (b.device_type !== null && b.device_type !== '' && !repairs.DEVICE_TYPES.includes(b.device_type)) return 'Tipo de equipo inválido.';
    fields.device_type = b.device_type || null;
  }
  if (b.service_type !== undefined) {
    if (b.service_type !== null && b.service_type !== '' && !repairs.SERVICE_TYPES.includes(b.service_type)) return 'Tipo de servicio inválido.';
    fields.service_type = b.service_type || null;
  }
  return null;
}

async function validAssignee(value) {
  if (value === null || value === undefined || value === '') return { ok: true, id: null };
  if (!/^\d+$/.test(String(value))) return { ok: false };
  const u = await users.findById(Number(value));
  if (!u || !u.active) return { ok: false };
  return { ok: true, id: u.id };
}

router.get('/', async (_req, res) => {
  try {
    res.json({ tickets: await repairs.listAll() });
  } catch (err) {
    console.error('repairs list error:', err.message);
    res.status(500).json({ error: 'Error al listar reparaciones.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const t = await repairs.getWithPhotos(id);
    if (!t) return res.status(404).json({ error: 'Reparación no encontrada.' });
    res.json({ ticket: t });
  } catch (err) {
    console.error('repair get error:', err.message);
    res.status(500).json({ error: 'Error al obtener la reparación.' });
  }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const { fields, error } = extractFields(b);
  if (error) return res.status(400).json({ error });
  if (!fields.device_brand && !fields.device_model && !fields.customer_name) {
    return res.status(400).json({ error: 'Ingresa al menos el equipo o el cliente.' });
  }
  const enumErr = validEnums(b, fields);
  if (enumErr) return res.status(400).json({ error: enumErr });
  if (b.status !== undefined) {
    if (!repairs.STATUSES.includes(b.status)) return res.status(400).json({ error: 'Estado inválido.' });
    fields.status = b.status;
  }
  if (b.assigned_to !== undefined) {
    const asg = await validAssignee(b.assigned_to);
    if (!asg.ok) return res.status(400).json({ error: 'El trabajador asignado no es válido.' });
    fields.assigned_to = asg.id;
  }
  try {
    const t = await repairs.create(fields, req.user.id);
    audit.logAction(req.user.id, 'repair.create', { targetType: 'repair', targetId: t.id, ip: getClientIp(req) });
    res.status(201).json({ ticket: t });
  } catch (err) {
    console.error('repair create error:', err.message);
    res.status(500).json({ error: 'No se pudo crear la reparación.' });
  }
});

router.patch('/:id', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const b = req.body || {};
  const { fields, error } = extractFields(b);
  if (error) return res.status(400).json({ error });
  const enumErr = validEnums(b, fields);
  if (enumErr) return res.status(400).json({ error: enumErr });
  if (b.status !== undefined) {
    if (!repairs.STATUSES.includes(b.status)) return res.status(400).json({ error: 'Estado inválido.' });
    fields.status = b.status;
  }
  if (b.assigned_to !== undefined) {
    const asg = await validAssignee(b.assigned_to);
    if (!asg.ok) return res.status(400).json({ error: 'El trabajador asignado no es válido.' });
    fields.assigned_to = asg.id;
  }
  // Vincular una factura existente a la reparación (o quitar el vínculo).
  if (b.invoice_id !== undefined) {
    if (b.invoice_id === null || b.invoice_id === '') {
      fields.invoice_id = null;
    } else {
      if (!/^\d+$/.test(String(b.invoice_id))) return res.status(400).json({ error: 'Factura inválida.' });
      const inv = await invoices.findById(Number(b.invoice_id));
      if (!inv) return res.status(400).json({ error: 'La factura seleccionada no existe.' });
      fields.invoice_id = inv.id;
    }
  }
  try {
    const existing = await repairs.findById(id);
    if (!existing) return res.status(404).json({ error: 'Reparación no encontrada.' });
    const t = await repairs.update(id, fields);
    // Tracking del repuesto NUEVO o cambiado: sella shipped_at (regla de
    // 24 h) y lo registra con el proveedor (USPS/AfterShip) para que el
    // estado de la pieza se actualice solo en la página pública. Sin key no
    // pasa nada (tracking_id queda null y aplica la regla de 24 h).
    const newTracking = fields.tracking_number && fields.tracking_number !== existing.tracking_number;
    if (newTracking) {
      await repairs.stampShipped(id);
      const tid = await tracking.register(fields.tracking_number, fields.carrier !== undefined ? fields.carrier : existing.carrier);
      if (tid) await repairs.setTrackingId(id, tid);
      trackEvents.emit('update', 'rep:' + id);
    }
    // Estado → 'listo': correo al cliente "tu equipo está listo para
    // recoger", una sola vez (flag email_ready; si el envío falla no se
    // marca y reintenta en el próximo cambio).
    if (fields.status === 'listo' && existing.status !== 'listo' && t.customer_email && !existing.email_ready) {
      email.sendRepairReadyEmail(t)
        .then((ok) => { if (ok) return repairs.markEmailSent(id, 'email_ready'); })
        .catch((e) => console.error('repair ready email failed:', e.message));
    }
    audit.logAction(req.user.id, 'repair.update', { targetType: 'repair', targetId: id, ip: getClientIp(req), metadata: { status: fields.status } });
    res.json({ ticket: t });
  } catch (err) {
    console.error('repair update error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la reparación.' });
  }
});

// Enviar al cliente el correo con el link de seguimiento de su reparación
// (track.html). Requiere tracking_number y customer_email guardados.
router.post('/:id/send-tracking', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const t = await repairs.findById(id);
    if (!t) return res.status(404).json({ error: 'Reparación no encontrada.' });
    if (!t.tracking_number) return res.status(400).json({ error: 'Guarda primero el número de seguimiento.' });
    if (!t.customer_email) return res.status(400).json({ error: 'El cliente no tiene correo guardado.' });
    const sent = await email.sendRepairTrackingEmail(t);
    audit.logAction(req.user.id, 'repair.send_tracking', { targetType: 'repair', targetId: id, ip: getClientIp(req) });
    res.json({ ok: true, sent });
  } catch (err) {
    console.error('repair send-tracking error:', err.message);
    res.status(500).json({ error: 'No se pudo enviar el correo.' });
  }
});

// Enviar/reenviar la factura de la reparación por correo (PDF adjunto).
// Si la factura no existe (se suele crear desde Ventas), se crea al vuelo
// con los datos del ticket.
router.post('/:id/send-invoice', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const t = await repairs.findById(id);
    if (!t) return res.status(404).json({ error: 'Reparación no encontrada.' });
    if (!t.customer_email) return res.status(400).json({ error: 'El cliente no tiene correo guardado.' });
    const inv = await invoices.createFromRepair(t);
    const pdf = await buildInvoicePdf(inv);
    const ok = await email.sendRepairInvoiceEmail(t, inv, pdf);
    if (!ok) return res.status(502).json({ error: 'No se pudo enviar el correo (revisa las credenciales de Gmail).' });
    audit.logAction(req.user.id, 'repair.send_invoice', { targetType: 'repair', targetId: id, ip: getClientIp(req), metadata: { invoice_number: inv.invoice_number } });
    res.json({ ok: true, invoice_number: inv.invoice_number });
  } catch (err) {
    console.error('repair send-invoice error:', err.message);
    res.status(500).json({ error: 'Error al enviar la factura.' });
  }
});

// Link PÚBLICO del PDF de la factura (para verla o mandarla por WhatsApp).
// Asegura que la factura exista y devuelve la ruta /api/track/:token/invoice.pdf
router.post('/:id/invoice-link', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const t = await repairs.findById(id);
    if (!t) return res.status(404).json({ error: 'Reparación no encontrada.' });
    const inv = await invoices.createFromRepair(t);
    res.json({ ok: true, invoice_number: inv.invoice_number, path: `/api/track/${t.track_token}/invoice.pdf` });
  } catch (err) {
    console.error('repair invoice-link error:', err.message);
    res.status(500).json({ error: 'Error al generar el link de la factura.' });
  }
});

// Borrado masivo. Solo admin. Tres formas:
//   { ids: [...] }        → las seleccionadas
//   { all: true }         → TODAS
//   { delivered: true }   → solo las entregadas (reinicia la página de Ventas)
router.delete('/', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const opts = {};
  if (b.all) { /* todas */ }
  else if (b.delivered) opts.delivered = true;
  else {
    if (!Array.isArray(b.ids) || b.ids.length === 0) {
      return res.status(400).json({ error: 'Selecciona al menos una reparación.' });
    }
    opts.ids = b.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (!opts.ids.length) return res.status(400).json({ error: 'Selección inválida.' });
  }
  try {
    const { deleted, files } = await repairs.removeMany(opts);
    for (const f of files) fs.unlink(path.join(REPAIRS_DIR, path.basename(f)), () => {});
    audit.logAction(req.user.id, 'repair.delete_bulk', {
      targetType: 'repair', ip: getClientIp(req),
      metadata: { mode: opts.ids ? 'seleccion' : opts.delivered ? 'entregadas' : 'todas', count: deleted },
    });
    res.json({ ok: true, deleted });
  } catch (err) {
    console.error('repair bulk delete error:', err.message);
    res.status(500).json({ error: 'No se pudieron eliminar las reparaciones.' });
  }
});

// Eliminar reparación: solo admin. Borra también sus fotos del disco.
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  try {
    const existing = await repairs.findById(id);
    if (!existing) return res.status(404).json({ error: 'Reparación no encontrada.' });
    const files = await repairs.listPhotoFilenames(id);
    await repairs.remove(id); // cascada borra filas de fotos
    for (const f of files) fs.unlink(path.join(REPAIRS_DIR, path.basename(f)), () => {});
    audit.logAction(req.user.id, 'repair.delete', { targetType: 'repair', targetId: id, ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('repair delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la reparación.' });
  }
});

// Subir una foto a una reparación.
router.post('/:id/photos', uploadPhoto, async (req, res) => {
  const id = parseId(req, res);
  if (id === null) { fs.unlink(req.file.path, () => {}); return; }
  try {
    const t = await repairs.findById(id);
    if (!t) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Reparación no encontrada.' }); }
    const photo = await repairs.addPhoto(id, req.file.filename, req.user.id);
    audit.logAction(req.user.id, 'repair.photo_add', { targetType: 'repair', targetId: id, ip: getClientIp(req) });
    res.status(201).json({ photo });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('repair photo upload error:', err.message);
    res.status(500).json({ error: 'No se pudo guardar la foto.' });
  }
});

// Eliminar una foto.
router.delete('/:id/photos/:photoId', async (req, res) => {
  const id = parseId(req, res); if (id === null) return;
  const pid = Number(req.params.photoId);
  if (!Number.isInteger(pid) || pid < 1) return res.status(404).json({ error: 'Foto no encontrada.' });
  try {
    const photo = await repairs.getPhoto(pid);
    if (!photo || photo.ticket_id !== id) return res.status(404).json({ error: 'Foto no encontrada.' });
    await repairs.removePhoto(pid);
    fs.unlink(path.join(REPAIRS_DIR, path.basename(photo.filename)), () => {});
    audit.logAction(req.user.id, 'repair.photo_delete', { targetType: 'repair', targetId: id, ip: getClientIp(req) });
    res.json({ ok: true });
  } catch (err) {
    console.error('repair photo delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la foto.' });
  }
});

module.exports = router;
