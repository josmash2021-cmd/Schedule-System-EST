/* Seguimiento público de pedidos: /api/track/:token
   El token (track_token de la orden) ES la credencial: va en el link que el
   cliente recibe por correo. Solo se devuelven los datos del pedido — nunca
   email ni teléfono del cliente. */
const express = require('express');
const orders = require('../models/orders');

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

router.get('/:token', rateLimit, async (req, res) => {
  const token = String(req.params.token || '');
  // Tokens nuevos: 48 hex; backfill viejo: 64 hex. Nada más se acepta.
  if (!/^[a-f0-9]{32,96}$/.test(token)) {
    return res.status(404).json({ error: 'Pedido no encontrado.' });
  }
  try {
    const o = await orders.findByTrackToken(token);
    if (!o) return res.status(404).json({ error: 'Pedido no encontrado.' });
    res.json({
      order_number: `EST-${1000 + o.id}`,
      items: o.items || [],
      total: Number(o.total) || 0,
      currency: o.currency || 'usd',
      address: o.address || null,
      ship_status: o.ship_status || 'pendiente',
      ship_tag: o.ship_tag || null,
      tracking_number: o.tracking_number || null,
      carrier: o.carrier || null,
      created_at: o.created_at,
    });
  } catch (err) {
    console.error('track error:', err.message);
    res.status(500).json({ error: 'Error al consultar el pedido.' });
  }
});

module.exports = router;
