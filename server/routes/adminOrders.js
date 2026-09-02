/* Órdenes online (compras web por Stripe): /x/s/orders
   Solo lectura y solo admin: se crean solas desde el webhook de checkout y
   los reembolsos/anulaciones se gestionan en el dashboard de Stripe.
   El GET además SINCRONIZA con Stripe antes de responder (auto-importa los
   pagos que falten, p. ej. compras anteriores al webhook), así el panel
   siempre está al día sin intervención del usuario. */
const express = require('express');
const orders = require('../models/orders');
const invoices = require('../models/invoices');
const { buildInvoicePdf } = require('../lib/invoicePdf');
const tracking = require('../lib/tracking');
const email = require('../lib/email');
const { verifyToken, loadUser, requireRole } = require('../middleware/auth');
const { STRIPE_SECRET_KEY } = require('../config');

const router = express.Router();
router.use(verifyToken, loadUser);

// A lo sumo una sincronización por minuto: abrir Ventas y Dashboard a la vez
// (o recargar seguido) no debe martillar la API de Stripe.
let lastSync = 0;
const SYNC_EVERY_MS = 60 * 1000;

async function syncFromStripe() {
  if (!STRIPE_SECRET_KEY) return;
  if (Date.now() - lastSync < SYNC_EVERY_MS) return;
  lastSync = Date.now();

  const stripe = require('stripe')(STRIPE_SECRET_KEY);
  // Últimas 100 sesiones de checkout: cubre el historial de una tienda
  // pequeña y las compras hechas antes de que existiera el webhook.
  const list = await stripe.checkout.sessions.list({ limit: 100 });
  const existing = new Set(await orders.listSessionIds());
  for (const s of list.data || []) {
    if (s.status !== 'complete' || s.payment_status !== 'paid') continue;
    if (existing.has(s.id)) continue; // ya guardada: no gastar otra llamada
    let items = [];
    try {
      const li = await stripe.checkout.sessions.listLineItems(s.id, { limit: 100 });
      items = (li.data || []).map((l) => ({ name: l.description, qty: l.quantity, price: (l.amount_total || 0) / 100 }));
    } catch (_) { /* si falla, se guarda sin detalle de líneas */ }
    let address = null;
    const sd = s.shipping_details;
    if (sd && sd.address) {
      const a = sd.address;
      address = [sd.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', ')].filter(Boolean).join(' | ');
    }
    const cd = s.customer_details || {};
    const saved = await orders.createFromStripe({
      sessionId: s.id,
      customerName: sd && sd.name ? sd.name : cd.name,
      email: cd.email,
      phone: cd.phone,
      address,
      items,
      total: (s.amount_total || 0) / 100,
      currency: s.currency,
      createdAt: s.created ? new Date(s.created * 1000) : null, // fecha real del pago
    });
    // Correos de pedido nuevo (dueño + confirmación al cliente) también para
    // órdenes recuperadas por sync — el webhook pudo no haber llegado.
    if (saved) {
      email.sendNewOrderEmails(saved).catch((e) => console.error('Order emails failed:', e.message));
    }
  }
}

router.get('/', requireRole('admin'), async (_req, res) => {
  try {
    // La sincronización es best-effort: si Stripe falla, el panel igual
    // muestra lo que ya hay guardado en la base.
    try {
      await syncFromStripe();
    } catch (e) {
      console.error('orders sync error:', e.message);
    }
    res.json({ orders: await orders.listAll() });
  } catch (err) {
    console.error('orders list error:', err.message);
    res.status(500).json({ error: 'Error al listar las órdenes online.' });
  }
});

// POST / — crear orden manual de envío (FB Marketplace). El total se calcula
// server-side a partir de las líneas (nunca se confía en el cliente).
router.post('/', requireRole('admin'), async (req, res) => {
  const b = req.body || {};
  const customerName = String(b.customer_name || '').trim();
  const address = String(b.address || '').trim();
  if (!customerName) return res.status(400).json({ error: 'Falta el nombre del cliente.' });
  if (!address) return res.status(400).json({ error: 'Falta la dirección de envío.' });

  const raw = Array.isArray(b.items) ? b.items : [];
  if (!raw.length) return res.status(400).json({ error: 'Agrega al menos un artículo.' });
  if (raw.length > 50) return res.status(400).json({ error: 'Demasiados artículos en una orden.' });

  const items = [];
  let total = 0;
  for (const it of raw) {
    const name = String(it && it.name || '').trim();
    const qty = Number(it && it.qty);
    const price = Number(it && it.price);
    if (!name) return res.status(400).json({ error: 'Cada artículo necesita descripción.' });
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) return res.status(400).json({ error: 'Cantidad inválida (1–999).' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Precio inválido.' });
    items.push({ name, qty, price });
    total += qty * price;
  }
  total = Math.round(total * 100) / 100;

  try {
    const order = await orders.createManual({
      customer_name: customerName,
      email: String(b.email || '').trim() || null,
      phone: String(b.phone || '').trim() || null,
      address,
      items,
      total,
    });
    // Correo de confirmación al cliente con su link de seguimiento (si dio
    // correo); si no, el dueño puede reenviar el link por WhatsApp.
    if (order.email) {
      email.sendNewOrderEmails(order).catch((e) => console.error('Order emails failed:', e.message));
    }
    res.status(201).json({ order });
  } catch (err) {
    console.error('orders create error:', err.message);
    res.status(500).json({ error: 'Error al crear la orden.' });
  }
});

// PATCH /:id — dos usos:
//  a) { tracking_number, carrier } → guarda el tracking y pasa a 'enviado'
//     (si hay AFTERSHIP_API_KEY también lo registra para seguimiento automático).
//  b) { ship_status: 'entregado' } → marca manual (fallback sin API de tracking).
router.patch('/:id', requireRole('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Orden inválida.' });
  const id = Number(req.params.id);
  const b = req.body || {};

  try {
    if (b.ship_status !== undefined) {
      if (!orders.SHIP_STATUSES.includes(b.ship_status)) {
        return res.status(400).json({ error: 'Estado de envío inválido.' });
      }
      const order = await orders.updateShipStatus(id, b.ship_status);
      if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
      return res.json({ order });
    }

    const trackingNumber = String(b.tracking_number || '').trim();
    const carrier = String(b.carrier || '').trim().toLowerCase();
    if (!trackingNumber) return res.status(400).json({ error: 'Falta el número de tracking.' });
    if (trackingNumber.length > 64) return res.status(400).json({ error: 'Número de tracking demasiado largo.' });

    const trackingId = await tracking.register(trackingNumber, carrier); // null si no hay API key
    const order = await orders.updateTracking(id, {
      tracking_number: trackingNumber,
      carrier: carrier || null,
      tracking_id: trackingId,
    });
    if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
    // Correo "tu pedido va en camino" al cliente, una sola vez (el flag se
    // marca solo si el correo realmente salió; sin RESEND_API_KEY no se marca
    // y se reintenta en el próximo guardado de tracking).
    if (!order.email_shipped) {
      email.sendTrackingEmail(order)
        .then((ok) => { if (ok) return orders.markEmailSent(id, 'email_shipped'); })
        .catch((e) => console.error('Tracking email failed:', e.message));
    }
    res.json({ order, tracking_activo: Boolean(trackingId) });
  } catch (err) {
    console.error('orders patch error:', err.message);
    res.status(500).json({ error: 'Error al actualizar la orden.' });
  }
});

// POST /:id/send-invoice — envía al cliente su factura por correo con el PDF
// del Bill of Sale adjunto (mismo diseño que el del panel). La factura ya
// existe (se crea sola al registrar la orden); si falta, se crea al vuelo.
router.post('/:id/send-invoice', requireRole('admin'), async (req, res) => {
  if (!/^\d+$/.test(String(req.params.id))) return res.status(400).json({ error: 'Orden inválida.' });
  const id = Number(req.params.id);
  try {
    const order = await orders.findById(id);
    if (!order) return res.status(404).json({ error: 'Orden no encontrada.' });
    if (!order.email) return res.status(400).json({ error: 'La orden no tiene correo del cliente.' });

    const invoice = await invoices.findByOrderId(id) || await invoices.createFromOrder(order);
    const pdf = await buildInvoicePdf(invoice);
    const ok = await email.sendInvoiceEmail(order, invoice, pdf);
    if (!ok) {
      return res.status(502).json({ error: 'No se pudo enviar el correo (revisa RESEND_API_KEY y el dominio verificado).' });
    }
    res.json({ ok: true, invoice_number: invoice.invoice_number });
  } catch (err) {
    console.error('send-invoice error:', err.message);
    res.status(500).json({ error: 'Error al enviar la factura.' });
  }
});

module.exports = router;
