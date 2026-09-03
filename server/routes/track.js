/* Seguimiento público de pedidos: /api/track/:token
   El token (track_token de la orden) ES la credencial: va en el link que el
   cliente recibe por correo. Solo se devuelven los datos del pedido — nunca
   email ni teléfono del cliente. */
const express = require('express');
const orders = require('../models/orders');
const tracking = require('../lib/tracking');
const trackEvents = require('../lib/trackEvents');
const { CATALOG } = require('../catalog');

const router = express.Router();

// Rate limit simple en memoria (patrón del checkout): generoso para tráfico
// legítimo, frena el escaneo de tokens.
const RL_WINDOW_MS = 60 * 1000;
const RL_MAX = 60;
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

// Lo público del pedido: NUNCA email ni teléfono del cliente.
// Los items se enriquecen EN VIVO con la foto/descripción del catálogo
// (emparejando por nombre) para que el resumen siempre muestre el producto
// con imagen, aunque la orden se haya guardado sin esos datos.
const CAT_LIST = Object.values(CATALOG);
function enrichItems(items) {
  return (items || []).map((l) => {
    if (l.img) return l;
    const name = String(l.name || '');
    const p = CAT_LIST.find((c) => name === c.name || name.startsWith(c.name + ' ('));
    return p ? { ...l, img: p.img || null, desc: l.desc || p.descEn || p.desc || null } : l;
  });
}
function publicOrder(o) {
  return {
    order_number: `EST-${1000 + o.id}`,
    items: enrichItems(o.items),
    total: Number(o.total) || 0,
    currency: o.currency || 'usd',
    address: o.address || null,
    ship_status: o.ship_status || 'pendiente',
    ship_tag: o.ship_tag || null,
    expected_delivery: o.expected_delivery
      ? new Date(o.expected_delivery).toISOString().slice(0, 10)
      : null,
    tracking_number: o.tracking_number || null,
    carrier: o.carrier || null,
    created_at: o.created_at,
  };
}

// Webhook de AfterShip: avisa al instante cuando el paquete cambia de estado.
// Se registra la URL https://<dominio>/api/track/webhook en el dashboard de
// AfterShip. Siempre responde 200 rápido (AfterShip reintenta si no).
router.post('/webhook', async (req, res) => {
  try {
    const msg = req.body && req.body.msg;
    if (msg) {
      let o = msg.id ? await orders.findByTrackingId(msg.id) : null;
      if (!o && msg.tracking_number) o = await orders.findByTrackingNumber(msg.tracking_number);
      if (o) {
        await tracking.applyUpdate(o, { tag: msg.tag, expectedDelivery: msg.expected_delivery });
      }
    }
  } catch (err) {
    console.error('[tracking] webhook error:', err.message);
  }
  res.json({ ok: true });
});

// Stream SSE por pedido: el cliente (track.html) se entera al segundo de un
// cambio de estado sin esperar al polling. El polling de 30 s sigue activo
// como respaldo si el stream se cae.
router.get('/:token/stream', async (req, res) => {
  const token = String(req.params.token || '');
  if (!/^[a-f0-9]{32,96}$/.test(token)) return res.status(404).end();
  try {
    const o = await orders.findByTrackToken(token);
    if (!o) return res.status(404).end();
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ type: 'hello' })}\n\n`);
    const onUpdate = (id) => {
      if (id === o.id) res.write(`data: ${JSON.stringify({ type: 'update' })}\n\n`);
    };
    trackEvents.on('update', onUpdate);
    const hb = setInterval(() => res.write(': hb\n\n'), 25000);
    req.on('close', () => {
      clearInterval(hb);
      trackEvents.off('update', onUpdate);
    });
  } catch (err) {
    console.error('track stream error:', err.message);
    res.status(500).end();
  }
});

// Búsqueda por número de rastreo (lo escribe el cliente en "Mi pedido").
router.get('/lookup/:number', rateLimit, async (req, res) => {
  const num = String(req.params.number || '');
  if (!/^[A-Za-z0-9-]{6,40}$/.test(num)) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  try {
    const o = await orders.findByTrackingNumber(num);
    if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json(publicOrder(o));
  } catch (err) {
    console.error('track lookup error:', err.message);
    res.status(500).json({ error: 'Error al consultar el pedido.' });
  }
});

router.get('/:token', rateLimit, async (req, res) => {
  const token = String(req.params.token || '');
  // Tokens nuevos: 48 hex; backfill viejo: 64 hex. Nada más se acepta.
  if (!/^[a-f0-9]{32,96}$/.test(token)) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  try {
    const o = await orders.findByTrackToken(token);
    if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json(publicOrder(o));
  } catch (err) {
    console.error('track error:', err.message);
    res.status(500).json({ error: 'Error al consultar el pedido.' });
  }
});

module.exports = router;
