/* Facturas (Bill of Sale): /x/s/invoices
   Listar, crear, actualizar y eliminar facturas: solo admin.
   GET /:id/pdf descarga el PDF del documento (mismo diseño que el panel,
   generado server-side con lib/invoicePdf.js). */
const express = require('express');
const invoices = require('../models/invoices');
const { buildInvoicePdf } = require('../lib/invoicePdf');
const audit = require('../models/audit');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { getClientIp } = require('../lib/rateLimit');

const router = express.Router();
router.use(verifyToken, loadUser);

router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    res.json({ invoices: await invoices.listAll() });
  } catch (err) {
    console.error('invoices list error:', err.message);
    res.status(500).json({ error: 'Error al listar las facturas.' });
  }
});

// PDF sin guardar: el modo form del panel lo usa para "Imprimir / PDF" —
// recibe el contenido del formulario y devuelve el documento, sin tocar la DB.
router.post('/preview-pdf', requireRole('admin'), async (req, res) => {
  try {
    const f = invoices.normalizeFields(req.body);
    // normalizeFields serializa items a JSON (como se guardan en la DB);
    // el generador de PDF los necesita como array.
    const pdf = await buildInvoicePdf({ ...f, items: f.items ? JSON.parse(f.items) : [] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="Receipt-draft.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error('invoice preview-pdf error:', err.message);
    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

// PDF del documento (misma generación que el adjunto del correo).
router.get('/:id/pdf', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Factura no encontrada.' });
  try {
    const inv = await invoices.findById(id);
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
    const pdf = await buildInvoicePdf(inv);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Receipt-${inv.invoice_number || id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('invoice pdf error:', err.message);
    res.status(500).json({ error: 'No se pudo generar el PDF.' });
  }
});

router.get('/:id', requireRole('admin'), async (req, res) => {  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Factura no encontrada.' });
  try {
    const inv = await invoices.findById(id);
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
    res.json({ invoice: inv });
  } catch (err) {
    console.error('invoice get error:', err.message);
    res.status(500).json({ error: 'Error al obtener la factura.' });
  }
});

// Errores de la venta generada (sin stock, producto borrado) llegan con
// status 400/409: se devuelven tal cual con una pista de cómo resolverlo.
function ventaError(res, err) {
  if (!err.status) return false;
  res.status(err.status).json({
    error: `${err.message} Cambia esa línea a "Otro (escribir a mano)" o desmarca "Registrar como venta".`,
  });
  return true;
}

// Crear. Con { register_sale: true } (factura libre del panel) genera también
// su venta de mostrador: así cuenta en Ventas/Dashboard y descuenta stock.
router.post('/', requireRole('admin'), async (req, res) => {
  try {
    const inv = await invoices.createWithSale(req.body, req.user.id);
    audit.logAction(req.user.id, 'invoice.create', {
      targetType: 'invoice', targetId: String(inv.id), ip: getClientIp(req),
      metadata: { invoice_number: inv.invoice_number, total: inv.total, sale_id: inv.sale_id || null },
    });
    res.status(201).json({ invoice: inv });
  } catch (err) {
    if (ventaError(res, err)) return;
    console.error('invoice create error:', err.message);
    res.status(500).json({ error: 'No se pudo crear la factura.' });
  }
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Factura no encontrada.' });
  try {
    // Si la factura generó su venta, la venta se actualiza con ella.
    const inv = await invoices.updateWithSale(id, req.body, req.user.id);
    if (!inv) return res.status(404).json({ error: 'Factura no encontrada.' });
    audit.logAction(req.user.id, 'invoice.update', {
      targetType: 'invoice', targetId: String(id), ip: getClientIp(req),
      metadata: { invoice_number: inv.invoice_number, sale_id: inv.sale_id || null },
    });
    res.json({ invoice: inv });
  } catch (err) {
    if (ventaError(res, err)) return;
    console.error('invoice update error:', err.message);
    res.status(500).json({ error: 'No se pudo actualizar la factura.' });
  }
});

router.delete('/:id', requireRole('admin'), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) return res.status(404).json({ error: 'Factura no encontrada.' });
  try {
    // Si la factura generó su venta, también la anula (repone stock).
    const ok = await invoices.remove(id, req.user.id);
    if (!ok) return res.status(404).json({ error: 'Factura no encontrada.' });
    audit.logAction(req.user.id, 'invoice.delete', {
      targetType: 'invoice', targetId: String(id), ip: getClientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('invoice delete error:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar la factura.' });
  }
});

module.exports = router;
