/* Órdenes online (compras web por Stripe): /x/s/orders
   Solo lectura y solo admin: se crean solas desde el webhook de checkout y
   los reembolsos/anulaciones se gestionan en el dashboard de Stripe.
   El GET además SINCRONIZA con Stripe antes de responder (auto-importa los
   pagos que falten, p. ej. compras anteriores al webhook), así el panel
   siempre está al día sin intervención del usuario. */
const express = require('express');
const orders = require('../models/orders');
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
    await orders.createFromStripe({
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

module.exports = router;
