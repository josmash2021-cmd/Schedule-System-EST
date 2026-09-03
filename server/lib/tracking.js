/* Rastreo de envíos. Dos proveedores, el que esté configurado gana:
   1) USPS Tracking API v3 (developers.usps.com, GRATIS permanente): activa con
      USPS_CLIENT_ID + USPS_CLIENT_SECRET (OAuth2). El job consulta cada 15 min
      cada paquete activo: estado, "out for delivery", "delivered" y la fecha
      estimada de entrega (expectedDeliveryDate).
   2) AfterShip API v4 (trial/pago): activa con AFTERSHIP_API_KEY; además tiene
      webhook push (POST /api/track/webhook) para aviso inmediato.
   Sin ninguna key, el flujo manual sigue funcionando (pendiente → enviado al
   poner tracking, y 'entregado' se marca a mano desde el panel). */
const { AFTERSHIP_API_KEY, USPS_CLIENT_ID, USPS_CLIENT_SECRET } = require('../config');

// ============================ USPS (gratis) ============================
const USPS_API = 'https://apis.usps.com';

let uspsToken = null; // { value, exp }
async function uspsAccessToken() {
  if (uspsToken && Date.now() < uspsToken.exp) return uspsToken.value;
  const res = await fetch(`${USPS_API}/oauth2/v3/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: USPS_CLIENT_ID,
      client_secret: USPS_CLIENT_SECRET,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`USPS OAuth HTTP ${res.status}`);
  }
  // Margen de 5 min sobre el expires_in (~8 h) para no usar un token al borde.
  uspsToken = { value: data.access_token, exp: Date.now() + (Number(data.expires_in) || 28800) * 1000 - 5 * 60 * 1000 };
  return uspsToken.value;
}

// Estado USPS → tag interno (el mismo vocabulario que AfterShip para no tocar
// el resto del sistema: barras de progreso, correos, etc.).
function uspsTagFrom(text) {
  const s = String(text || '').toLowerCase();
  if (!s) return null;
  if (/delivered|entregado/.test(s)) return 'Delivered';
  if (/out for delivery/.test(s)) return 'OutForDelivery';
  if (/pre-?shipment|label created|shipping label/.test(s)) return null; // aún sin moverse
  return 'InTransit';
}

// Estado completo de un paquete USPS: tag + fecha estimada ('YYYY-MM-DD').
async function uspsGetStatus(trackingNumber) {
  try {
    const token = await uspsAccessToken();
    const res = await fetch(
      `${USPS_API}/tracking/v3r2/tracking/${encodeURIComponent(trackingNumber)}?expand=DETAIL`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 404) return null; // USPS aún no lo tiene (etiqueta recién creada)
    const t = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`USPS tracking HTTP ${res.status}`);
    const tag = uspsTagFrom(t.statusCategory) || uspsTagFrom(t.status) ||
      uspsTagFrom(t.eventSummaries && t.eventSummaries[0]) ||
      uspsTagFrom(t.events && t.events[0] && (t.events[0].eventType || t.events[0].event));
    return {
      tag,
      expectedDelivery: t.expectedDeliveryDate ? String(t.expectedDeliveryDate).slice(0, 10) : null,
    };
  } catch (e) {
    console.error('USPS check error:', e.message);
    return null;
  }
}

// ============================ AfterShip (pago/trial) ============================
const AS_API = 'https://api.aftership.com/v4';

// Paqueterías frecuentes → slug de AfterShip. 'otro' = autodetección (sin slug).
const CARRIER_SLUGS = { usps: 'usps', ups: 'ups', fedex: 'fedex', dhl: 'dhl' };

function slugFor(carrier) {
  return CARRIER_SLUGS[String(carrier || '').toLowerCase()] || null;
}

async function asCall(path, options = {}) {
  const res = await fetch(AS_API + path, {
    ...options,
    headers: {
      'aftership-api-key': AFTERSHIP_API_KEY,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data && data.meta && data.meta.message ? data.meta.message : `AfterShip HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

// ============================ API unificada ============================
function uspsEnabled() {
  return Boolean(USPS_CLIENT_ID && USPS_CLIENT_SECRET);
}

function enabled() {
  return Boolean(AFTERSHIP_API_KEY) || uspsEnabled();
}

// Registra el tracking en el proveedor. Con USPS no hay nada que registrar
// (se consulta directo por número): devuelve el propio número como id. Con
// AfterShip devuelve su tracking id, o null si ya existía (4003) — la orden
// igual pasa a enviado.
async function register(trackingNumber, carrier) {
  if (!trackingNumber) return null;
  if (AFTERSHIP_API_KEY) {
    const slug = slugFor(carrier);
    try {
      const d = await asCall('/trackings', {
        method: 'POST',
        body: JSON.stringify({ tracking: { tracking_number: trackingNumber, ...(slug ? { slug } : {}) } }),
      });
      return d && d.data && d.data.tracking ? d.data.tracking.id : null;
    } catch (e) {
      // 4003 = tracking ya registrado: lo reusamos, no es error para el dueño.
      if (!/4003|already exists/i.test(e.message)) {
        console.error('AfterShip register error:', e.message);
      }
      return null;
    }
  }
  if (uspsEnabled() && String(carrier || '').toLowerCase() === 'usps') {
    return String(trackingNumber);
  }
  return null;
}

// Estado completo del paquete: { tag, expectedDelivery } o null si no se pudo
// saber. Se consulta por tracking id (guardado al registrar).
async function getStatus(trackingId) {
  if (!trackingId) return null;
  if (AFTERSHIP_API_KEY) {
    try {
      const d = await asCall(`/trackings/${encodeURIComponent(trackingId)}`);
      const t = d && d.data && d.data.tracking;
      return t ? { tag: t.tag || null, expectedDelivery: t.expected_delivery || null } : null;
    } catch (e) {
      console.error('AfterShip check error:', e.message);
      return null;
    }
  }
  return uspsGetStatus(trackingId);
}

// Tag actual del paquete ('InTransit', 'OutForDelivery', 'Delivered', …) o
// null si no se pudo saber.
async function getTag(trackingId) {
  const s = await getStatus(trackingId);
  return s ? s.tag : null;
}

// Aplica un cambio de estado a la orden (lo llaman el webhook de AfterShip y
// el job de respaldo): guarda ship_tag y la fecha estimada, manda los correos
// de tránsito/entrega (una sola vez, con flags) y emite el aviso SSE para que
// track.html se actualice al instante. Los requires van dentro para no crear
// un ciclo con models/orders al arrancar.
async function applyUpdate(o, { tag, expectedDelivery }) {
  if (!o) return;
  const orders = require('../models/orders');
  const emailLib = require('./email');
  const trackEvents = require('./trackEvents');
  let changed = false;
  if (tag && tag !== o.ship_tag) {
    await orders.updateShipTag(o.id, tag);
    changed = true;
  }
  const eta = expectedDelivery ? String(expectedDelivery).slice(0, 10) : null;
  const cur = o.expected_delivery ? new Date(o.expected_delivery).toISOString().slice(0, 10) : null;
  if (eta && eta !== cur) {
    await orders.updateExpectedDelivery(o.id, eta);
    changed = true;
  }
  if ((tag === 'InTransit' || tag === 'OutForDelivery') && !o.email_transit) {
    const ok = await emailLib.sendTransitEmail(o);
    if (ok) await orders.markEmailSent(o.id, 'email_transit');
  }
  if (tag === 'Delivered' && o.ship_status !== 'entregado') {
    await orders.updateShipStatus(o.id, 'entregado');
    changed = true;
    console.log(`[tracking] Orden #${o.id} marcada como entregada.`);
    if (!o.email_delivered) {
      const ok = await emailLib.sendDeliveredEmail(o);
      if (ok) await orders.markEmailSent(o.id, 'email_delivered');
    }
  }
  if (changed) trackEvents.emit('update', o.id);
}

module.exports = { enabled, register, getTag, getStatus, applyUpdate };
