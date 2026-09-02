const express = require('express');
const { getItem } = require('../catalog');
const {
  NODE_ENV,
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  SITE_URL,
  CURRENCY,
  TAX_RATE,
} = require('../config');
const { sendOwnerOrderNotification } = require('../notifications');
const orders = require('../models/orders');
const { sendNewOrderEmails } = require('../lib/email');

const router = express.Router();

// Inicialización tolerante: si aún no hay llave, el server sigue vivo
// y los endpoints responden 503 en vez de crashear al arrancar. El
// try/catch evita además que un fallo del módulo tumbe el resto de la API.
let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(STRIPE_SECRET_KEY);
  } catch (err) {
    console.error('No se pudo inicializar Stripe:', err.message);
  }
}

const MAX_QTY = 10;
const MAX_LINES = 50;
// Envío flat por pedido; debe coincidir con SHIPPING del front (assets/cart.js).
const SHIPPING_FLAT = 16;

// Código de descuento welcome26: la Victus baja a $420 y el envío sale gratis.
// Debe coincidir con PROMO_* del front (assets/cart.js). El descuento se aplica
// SOLO aquí, server-side: nunca se confía en precios que mande el cliente.
const PROMO_CODE = 'welcome26';
const PROMO_ITEM = 'victus-gaming-excelente';
const PROMO_PRICE = 420;

// Rate limiting simple en memoria (defensa contra abuso/flood). Es generoso
// para no afectar tráfico legítimo de una tienda pequeña y falla-abierto: si
// se reinicia el proceso, el contador se limpia. Nota: detrás de un proxy,
// req.ip puede ser la IP del proxy; el límite alto lo hace tolerable.
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
  if (rlHits.size > 5000) rlHits.clear(); // tope de memoria
  if (rec.count > RL_MAX) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Intenta en un momento.' });
  }
  return next();
}

// Recorta el id para no reflejar cadenas enormes del cliente en los errores.
function shortId(id) {
  return id.length > 64 ? id.slice(0, 64) + '…' : id;
}

// Dedupe de eventos de webhook: Stripe entrega "al menos una vez" y reintenta.
// Sin esto, cada reintento reenvía la notificación al dueño (SMS/WhatsApp).
const seenEvents = new Set();
function alreadyProcessed(eventId) {
  if (seenEvents.has(eventId)) return true;
  seenEvents.add(eventId);
  if (seenEvents.size > 1000) {
    seenEvents.delete(seenEvents.values().next().value); // recorta el más antiguo
  }
  return false;
}

// Base pública del sitio para las redirecciones de Stripe.
// En producción el server corre en Railway detrás del proxy de Vercel,
// por eso se EXIGE SITE_URL: no se confía en cabeceras controlables por
// el cliente (Origin/Referer) para construir la URL de retorno, ya que
// permitiría un open-redirect/phishing al cliente después de pagar.
// En desarrollo sí se acepta el Origin/Referer por comodidad.
function siteBase(req) {
  if (SITE_URL) return SITE_URL.replace(/\/+$/, '');
  if (NODE_ENV === 'production') return null;
  const origin = req.headers.origin;
  if (origin) return origin.replace(/\/+$/, '');
  const ref = req.headers.referer;
  if (ref) {
    try { return new URL(ref).origin; } catch (_) { /* ignore */ }
  }
  return `${req.protocol}://${req.get('host')}`;
}

// POST /api/checkout — crea la sesión de Stripe Checkout
router.post('/', rateLimit, async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: 'Pagos no configurados. Falta STRIPE_SECRET_KEY.' });
  }

  const lang = req.body && req.body.lang === 'en' ? 'en' : 'es';
  const rawItems = Array.isArray(req.body && req.body.items) ? req.body.items : [];
  // Código de descuento opcional; uno desconocido rechaza el pedido.
  const promo = String(req.body && req.body.promo || '').trim().toLowerCase();
  if (promo && promo !== PROMO_CODE) {
    return res.status(400).json({ error: 'Código de descuento inválido.' });
  }

  if (!rawItems.length) {
    return res.status(400).json({ error: 'El carrito está vacío.' });
  }
  if (rawItems.length > MAX_LINES) {
    return res.status(400).json({ error: 'Demasiados artículos en el carrito.' });
  }

  const base = siteBase(req);
  if (!base) {
    console.error('Checkout bloqueado: falta SITE_URL en producción.');
    return res.status(500).json({ error: 'Pago mal configurado. Contacta a la tienda.' });
  }
  const line_items = [];
  const orderItems = []; // resumen confiable para metadata/notificaciones
  let subtotalCents = 0;
  // Envío gratis solo si TODOS los productos del pedido lo tienen (freeShip
  // en catalog.js); si se mezcla con un producto normal, se cobra el flat.
  let allFreeShip = true;
  // true si el código welcome26 se aplicó a la Victus del pedido
  let promoApplied = false;

  for (const raw of rawItems) {
    const id = String(raw && raw.id || '');
    const qty = Math.floor(Number(raw && raw.qty));
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return res.status(400).json({ error: `Cantidad inválida para "${shortId(id)}".` });
    }
    const prod = getItem(id);
    if (!prod) {
      return res.status(400).json({ error: `Producto no disponible: "${shortId(id)}".` });
    }

    let unit = prod.price;
    if (promo === PROMO_CODE && id === PROMO_ITEM) {
      unit = PROMO_PRICE;
      promoApplied = true;
    }
    const unitCents = Math.round(unit * 100);
    subtotalCents += unitCents * qty;
    if (!prod.freeShip) allFreeShip = false;

    const condLabel = lang === 'en' ? (prod.condEn || prod.cond) : prod.cond;
    line_items.push({
      quantity: qty,
      price_data: {
        currency: CURRENCY,
        unit_amount: unitCents,
        product_data: {
          name: condLabel ? `${prod.name} (${condLabel})` : prod.name,
          description: prod.desc || undefined,
          images: prod.img ? [`${base}/${prod.img.replace(/^\/+/, '')}`] : undefined,
        },
      },
    });
    orderItems.push({ id, qty, name: prod.name, cond: prod.cond, price: prod.price });
  }

  // El código welcome26 solo aplica si la Victus está en el pedido; con
  // código válido el envío sale gratis aunque se mezcle con otros productos.
  if (promo === PROMO_CODE && !promoApplied) {
    return res.status(400).json({ error: 'El código no aplica a este carrito.' });
  }
  if (promoApplied) allFreeShip = true;

  // Impuestos como línea aparte, para que el total coincida con el carrito.
  // La etiqueta NO muestra el porcentaje (petición del dueño).
  if (TAX_RATE > 0) {
    const taxCents = Math.round(subtotalCents * TAX_RATE);
    if (taxCents > 0) {
      line_items.push({
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: taxCents,
          product_data: {
            name: lang === 'en' ? 'Tax' : 'Impuestos',
          },
        },
      });
    }
  }

  // Envío flat como línea aparte, para que el total coincida con el carrito
  // (no entra en la base del impuesto: se suma después del tax). Productos
  // con freeShip (p. ej. Alienware) no pagan envío si el pedido es solo de ellos.
  if (SHIPPING_FLAT > 0 && !allFreeShip) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.round(SHIPPING_FLAT * 100),
        product_data: {
          name: lang === 'en' ? 'Shipping' : 'Envío',
        },
      },
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items,
      locale: lang === 'en' ? 'en' : 'es',
      billing_address_collection: 'auto',
      // Dirección de envío del cliente (US): aparece en shipping_details
      // del webhook y se incluye en la notificación al dueño.
      shipping_address_collection: { allowed_countries: ['US'] },
      phone_number_collection: { enabled: true },
      success_url: `${base}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/cart`,
      metadata: {
        // Resumen compacto (< 500 chars) para reconstruir el pedido en el webhook.
        items: JSON.stringify(orderItems.map((i) => ({ id: i.id, qty: i.qty }))).slice(0, 500),
      },
    });
    return res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error('Error creando sesión de Stripe:', err.message);
    return res.status(502).json({ error: 'No se pudo iniciar el pago. Intenta de nuevo.' });
  }
});

// GET /api/checkout/session?id=cs_...  — resumen del pago para la página de éxito
router.get('/session', rateLimit, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Pagos no configurados.' });
  const id = String(req.query.id || '');
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) {
    return res.status(400).json({ error: 'Sesión inválida.' });
  }
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    // Solo datos no sensibles: NO se expone el email ni otros PII del cliente.
    return res.json({
      payment_status: s.payment_status,
      amount_total: s.amount_total,
      currency: s.currency,
    });
  } catch (err) {
    console.error('Error recuperando sesión de Stripe:', err.message);
    return res.status(404).json({ error: 'Sesión no encontrada.' });
  }
});

// POST /api/checkout/webhook — confirmación segura del pago.
// Se registra en index.js con express.raw ANTES de express.json().
async function webhookHandler(req, res) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).send('Webhook no configurado.');
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Firma de webhook inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Evita procesar el mismo evento dos veces (reintentos/duplicados de Stripe).
  if (alreadyProcessed(event.id)) {
    return res.json({ received: true, duplicate: true });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status === 'paid') {
      // Las líneas se leen directo de Stripe (fuente confiable), no del
      // metadata: así el detalle nunca se trunca ni depende del cliente.
      let items = [];
      try {
        const li = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
        items = (li.data || []).map((l) => ({
          name: l.description,
          qty: l.quantity,
          price: (l.amount_total || 0) / 100,
        }));
      } catch (e) {
        console.error('No se pudieron leer las líneas del pedido:', e.message);
      }

      // Dirección de envío en una sola línea (nombre + línea, ciudad, estado, ZIP).
      let address = null;
      const sd = session.shipping_details;
      if (sd && sd.address) {
        const a = sd.address;
        const parts = [sd.name, a.line1, a.line2, [a.city, a.state, a.postal_code].filter(Boolean).join(', ')].filter(Boolean);
        address = parts.join(' | ');
      }

      // Guardar la orden en la base (aparece en el panel, página Ventas).
      // En try/catch aparte: si la DB falla, la notificación al dueño igual sale.
      const cd = session.customer_details || {};
      let savedOrder = null;
      try {
        savedOrder = await orders.createFromStripe({
          sessionId: session.id,
          customerName: sd && sd.name ? sd.name : cd.name,
          email: cd.email,
          phone: cd.phone,
          address,
          items,
          total: (session.amount_total || 0) / 100,
          currency: session.currency,
        });
      } catch (e) {
        console.error('No se pudo guardar la orden online:', e.message);
      }

      // Correos (Resend): al dueño "nuevo pedido" y al cliente la
      // confirmación con su link de seguimiento. No bloqueantes.
      if (savedOrder) {
        sendNewOrderEmails(savedOrder).catch((e) => console.error('Order emails failed:', e.message));

        // Inventario: descontar el stock de los productos ligados (invId en
        // catalog.js) y guardar el COSTO real de la orden, para que la
        // ganancia mensual cuadre (antes las ventas web contaban costo 0).
        // Solo si la orden se insertó (un webhook duplicado no descuenta dos
        // veces). Los ids salen del metadata compacto del checkout.
        (async () => {
          try {
            const metaItems = JSON.parse((session.metadata && session.metadata.items) || '[]');
            const costo = await orders.applySaleToInventory(metaItems);
            if (costo > 0) await orders.setCosto(savedOrder.id, costo);
          } catch (e) {
            console.error('No se pudo aplicar la venta al inventario:', e.message);
          }
        })();
      }

      sendOwnerOrderNotification({
        total: (session.amount_total || 0) / 100,
        currency: session.currency,
        email: cd.email,
        address,
        items,
        reference: session.id,
      }).catch((e) => console.error('Order notification failed:', e.message));
    }
  }

  return res.json({ received: true });
}

module.exports = { router, webhookHandler };
