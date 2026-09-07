/* Pagos con PayPal y PayPal Credit: /api/paypal
   REST API v2 con fetch (sin dependencias). Misma lógica de precios que el
   checkout de Stripe (routes/checkout.js): catálogo server-side, promo
   welcome26, tax y envío flat — NUNCA se confía en el cliente.
   Flujo: el front pide /config (client-id público) → botones del SDK →
   create-order (server crea la orden en PayPal) → el cliente paga en el
   popup → capture-order (server captura y registra la orden igual que el
   webhook de Stripe: correos, factura automática, inventario). */
const express = require('express');
const { getItem, enrichLineItems } = require('../catalog');
const {
  PAYPAL_CLIENT_ID,
  PAYPAL_CLIENT_SECRET,
  PAYPAL_ENV,
  CURRENCY,
  TAX_RATE,
} = require('../config');
const orders = require('../models/orders');
const { sendNewOrderEmails } = require('../lib/email');
const { sendOwnerOrderNotification } = require('../notifications');

const router = express.Router();

const API_BASE = PAYPAL_ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

// Deben coincidir con routes/checkout.js (y con assets/cart.js en el front).
const MAX_QTY = 10;
const MAX_LINES = 50;
const SHIPPING_FLAT = 16;
const PROMO_CODE = 'welcome26';
const PROMO_ITEM = 'victus-gaming-excelente';
const PROMO_PRICE = 420;

const configured = () => Boolean(PAYPAL_CLIENT_ID && PAYPAL_CLIENT_SECRET);

async function getAccessToken() {
  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error('PayPal OAuth HTTP ' + res.status);
  const data = await res.json();
  return data.access_token;
}

// Rate limit (mismo patrón que checkout).
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = 100;
const rlHits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'global';
  let rec = rlHits.get(key);
  if (!rec || now > rec.reset) {
    rec = { count: 0, reset: now + RL_WINDOW_MS };
    rlHits.set(key, rec);
  }
  rec.count += 1;
  if (rlHits.size > 5000) rlHits.clear();
  if (rec.count > RL_MAX) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }
  return next();
}

// Valida el carrito contra el catálogo y calcula los totales reales.
// Devuelve { items, itemTotal, taxTotal, shipping, total, metaItems } en dólares.
function priceCart(rawItems, promo) {
  if (!rawItems.length) return { error: 'El carrito está vacío.' };
  if (rawItems.length > MAX_LINES) return { error: 'Demasiados artículos en el carrito.' };

  const items = [];
  const metaItems = [];
  let itemTotal = 0;
  let allFreeShip = true;
  let promoApplied = false;

  for (const raw of rawItems) {
    const id = String(raw && raw.id || '');
    const qty = Math.floor(Number(raw && raw.qty));
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return { error: 'Cantidad inválida.' };
    }
    const prod = getItem(id);
    if (!prod) return { error: 'Producto no disponible.' };

    let unit = prod.price;
    if (promo === PROMO_CODE && id === PROMO_ITEM) {
      unit = PROMO_PRICE;
      promoApplied = true;
    }
    itemTotal += unit * qty;
    if (!prod.freeShip) allFreeShip = false;
    items.push({ id, qty, unit, name: prod.name, cond: prod.cond });
    metaItems.push({ id, qty });
  }

  if (promo === PROMO_CODE && !promoApplied) {
    return { error: 'El código no aplica a este carrito.' };
  }
  if (promoApplied) allFreeShip = true;

  const taxTotal = TAX_RATE > 0 ? Math.round(itemTotal * TAX_RATE * 100) / 100 : 0;
  const shipping = SHIPPING_FLAT > 0 && !allFreeShip ? SHIPPING_FLAT : 0;
  const round = (n) => Math.round(n * 100) / 100;
  return {
    items: items.map((i) => ({ ...i, unit: round(i.unit) })),
    metaItems,
    itemTotal: round(itemTotal),
    taxTotal,
    shipping,
    total: round(itemTotal + taxTotal + shipping),
  };
}

const money2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

// GET /config — el client-id es PÚBLICO por diseño (lo usa el SDK de PayPal
// en el navegador); el secret jamás sale del server.
router.get('/config', (_req, res) => {
  if (!configured()) return res.json({ clientId: null });
  res.json({ clientId: PAYPAL_CLIENT_ID, currency: String(CURRENCY || 'usd').toUpperCase() });
});

// POST /create-order — crea la orden en PayPal con los totales reales.
router.post('/create-order', rateLimit, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'PayPal no está configurado.' });

  const promo = String(req.body && req.body.promo || '').trim().toLowerCase();
  if (promo && promo !== PROMO_CODE) {
    return res.status(400).json({ error: 'Código de descuento inválido.' });
  }
  const rawItems = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  const cart = priceCart(rawItems, promo);
  if (cart.error) return res.status(400).json({ error: cart.error });

  const lang = req.body && req.body.lang === 'en' ? 'en' : 'es';
  try {
    const token = await getAccessToken();
    const unit = {
      reference_id: 'est',
      amount: {
        currency_code: String(CURRENCY || 'usd').toUpperCase(),
        value: money2(cart.total),
        breakdown: {
          item_total: { currency_code: String(CURRENCY || 'usd').toUpperCase(), value: money2(cart.itemTotal) },
          ...(cart.taxTotal > 0 ? { tax_total: { currency_code: String(CURRENCY || 'usd').toUpperCase(), value: money2(cart.taxTotal) } } : {}),
          ...(cart.shipping > 0 ? { shipping: { currency_code: String(CURRENCY || 'usd').toUpperCase(), value: money2(cart.shipping) } } : {}),
        },
      },
      items: cart.items.map((i) => ({
        name: (i.cond ? `${i.name} (${lang === 'en' ? i.cond : i.cond})` : i.name).slice(0, 127),
        quantity: String(i.qty),
        unit_amount: { currency_code: String(CURRENCY || 'usd').toUpperCase(), value: money2(i.unit) },
      })),
    };
    const ppRes = await fetch(`${API_BASE}/v2/checkout/orders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [unit],
        application_context: {
          brand_name: 'ElectronicST',
          // El cliente pone su dirección de envío dentro del popup de PayPal.
          shipping_preference: 'GET_FROM_FILE',
          user_action: 'PAY_NOW',
        },
      }),
    });
    const data = await ppRes.json().catch(() => ({}));
    if (!ppRes.ok || !data.id) {
      console.error('PayPal create-order HTTP', ppRes.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: 'No se pudo iniciar el pago con PayPal.' });
    }
    // El carrito cotizado se guarda en memoria por order-id para el capture
    // (evita recalcular y documenta qué se cobró). Se limpia solo.
    pendingCarts.set(data.id, { ...cart, createdAt: Date.now() });
    if (pendingCarts.size > 500) {
      const oldest = pendingCarts.keys().next().value;
      pendingCarts.delete(oldest);
    }
    res.json({ id: data.id });
  } catch (err) {
    console.error('PayPal create-order error:', err.message);
    res.status(502).json({ error: 'No se pudo iniciar el pago con PayPal.' });
  }
});

// Carritos cotizados pendientes de captura (memoria; en un reinicio se
// pierde la cotización pero el pago ya cobrado igual se registra con los
// datos que PayPal devuelve en el capture).
const pendingCarts = new Map();

// POST /capture-order — el cliente ya pagó en el popup; se captura el dinero
// y se registra la orden (idempotente: un doble capture no duplica nada).
router.post('/capture-order', rateLimit, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'PayPal no está configurado.' });
  const orderId = String(req.body && req.body.orderId || '');
  if (!/^[A-Z0-9]{10,20}$/.test(orderId)) {
    return res.status(400).json({ error: 'Orden de PayPal inválida.' });
  }

  try {
    const token = await getAccessToken();
    const capRes = await fetch(`${API_BASE}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    });
    const data = await capRes.json().catch(() => ({}));
    // Ya capturada antes (doble clic / reintento): se trata como éxito y se
    // registra igual — el dedupe por stripe_session_id evita duplicados.
    const already = data.name === 'ORDER_ALREADY_CAPTURED';
    if (!capRes.ok && !already) {
      console.error('PayPal capture HTTP', capRes.status, JSON.stringify(data).slice(0, 300));
      return res.status(502).json({ error: 'No se pudo confirmar el pago con PayPal.' });
    }

    const pu = (data.purchase_units || [])[0] || {};
    const capture = pu.payments && pu.payments.captures && pu.payments.captures[0];
    const total = capture ? Number(capture.amount && capture.amount.value) : Number(pu.amount && pu.amount.value) || 0;
    const currency = String((capture && capture.amount && capture.amount.currency_code) || CURRENCY || 'usd').toLowerCase();

    // Datos del pagador y del envío que devuelve PayPal.
    const payer = data.payer || {};
    const payerName = [payer.name && payer.name.given_name, payer.name && payer.name.surname].filter(Boolean).join(' ');
    const email = payer.email_address || null;
    const ship = pu.shipping || {};
    const sa = ship.address || {};
    const address = [sa.address_line_1, sa.address_line_2,
      [sa.admin_area_2, sa.admin_area_1, sa.postal_code].filter(Boolean).join(', ')]
      .filter(Boolean).join(' | ') || null;
    const customerName = (ship.name && ship.name.full_name) || payerName || null;

    const cart = pendingCarts.get(orderId);
    pendingCarts.delete(orderId);
    // Detalle de líneas: de la cotización guardada (fuente confiable). Los
    // importes de Tax/Envío van como líneas aparte, igual que en Stripe.
    let items = [];
    let metaItems = [];
    if (cart) {
      metaItems = cart.metaItems;
      items = cart.items.map((i) => ({ name: i.cond ? `${i.name} (${i.cond})` : i.name, qty: i.qty, price: i.unit * i.qty }));
      if (cart.taxTotal > 0) items.push({ name: 'Tax', qty: 1, price: cart.taxTotal });
      if (cart.shipping > 0) items.push({ name: 'Shipping', qty: 1, price: cart.shipping });
      items = enrichLineItems(items, metaItems, 'en');
    }

    let savedOrder = null;
    try {
      savedOrder = await orders.createFromStripe({
        sessionId: `pp_${orderId}`, // dedupe: mismo mecanismo que Stripe
        customerName,
        email,
        phone: null,
        address,
        items,
        total,
        currency,
      });
    } catch (e) {
      console.error('No se pudo guardar la orden PayPal:', e.message);
    }

    if (savedOrder) {
      sendNewOrderEmails(savedOrder).catch((e) => console.error('Order emails failed:', e.message));
      (async () => {
        try {
          const costo = await orders.applySaleToInventory(metaItems);
          if (costo > 0) await orders.setCosto(savedOrder.id, costo);
        } catch (e) {
          console.error('No se pudo aplicar la venta al inventario:', e.message);
        }
      })();
      sendOwnerOrderNotification({ total, currency, email, address, items, reference: orderId })
        .catch((e) => console.error('Order notification failed:', e.message));
    }

    res.json({ ok: true, id: orderId, total, currency });
  } catch (err) {
    console.error('PayPal capture-order error:', err.message);
    res.status(502).json({ error: 'No se pudo confirmar el pago con PayPal.' });
  }
});

// GET /order?id=… — resumen para la página de éxito (mismo contrato que
// /api/checkout/session: payment_status + amount_total en centavos).
router.get('/order', rateLimit, async (req, res) => {
  if (!configured()) return res.status(503).json({ error: 'PayPal no configurado.' });
  const id = String(req.query.id || '');
  if (!/^[A-Z0-9]{10,20}$/.test(id)) return res.status(400).json({ error: 'Orden inválida.' });
  try {
    const token = await getAccessToken();
    const r = await fetch(`${API_BASE}/v2/checkout/orders/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.id) return res.status(404).json({ error: 'Orden no encontrada.' });
    const pu = (data.purchase_units || [])[0] || {};
    const cap = pu.payments && pu.payments.captures && pu.payments.captures[0];
    const value = cap && cap.amount ? Number(cap.amount.value) : Number(pu.amount && pu.amount.value) || 0;
    res.json({
      payment_status: data.status === 'COMPLETED' ? 'paid' : String(data.status || '').toLowerCase(),
      amount_total: Math.round(value * 100),
      currency: String((cap && cap.amount && cap.amount.currency_code) || CURRENCY || 'usd').toLowerCase(),
    });
  } catch (err) {
    console.error('PayPal get order error:', err.message);
    res.status(404).json({ error: 'Orden no encontrada.' });
  }
});

module.exports = router;
