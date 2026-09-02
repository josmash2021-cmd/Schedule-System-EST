/* Rastreo de envíos con AfterShip (https://www.aftership.com, plan gratis).
   Se activa solo si existe AFTERSHIP_API_KEY en el entorno; sin key, todo el
   flujo manual sigue funcionando (pendiente → enviado al poner tracking, y
   'entregado' se marca a mano desde el panel).
   API v4: https://www.aftership.com/docs/tracking/quickstart/api-request */
const { AFTERSHIP_API_KEY } = require('../config');

const API = 'https://api.aftership.com/v4';

// Paqueterías frecuentes → slug de AfterShip. 'otro' = autodetección (sin slug).
const CARRIER_SLUGS = { usps: 'usps', ups: 'ups', fedex: 'fedex', dhl: 'dhl' };

function enabled() {
  return Boolean(AFTERSHIP_API_KEY);
}

function slugFor(carrier) {
  return CARRIER_SLUGS[String(carrier || '').toLowerCase()] || null;
}

async function call(path, options = {}) {
  const res = await fetch(API + path, {
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

// Registra el tracking en AfterShip. Devuelve el tracking id (string) o null
// si ya existía (4003) u otro error no fatal — la orden igual pasa a enviado.
async function register(trackingNumber, carrier) {
  if (!enabled() || !trackingNumber) return null;
  const slug = slugFor(carrier);
  try {
    const d = await call('/trackings', {
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

// Tag actual del paquete ('InTransit', 'OutForDelivery', 'Delivered', …) o
// null si no se pudo saber. Se consulta por tracking id (guardado al registrar).
async function getTag(trackingId) {
  if (!enabled() || !trackingId) return null;
  try {
    const d = await call(`/trackings/${encodeURIComponent(trackingId)}`);
    const t = d && d.data && d.data.tracking;
    return t ? (t.tag || null) : null;
  } catch (e) {
    console.error('AfterShip check error:', e.message);
    return null;
  }
}

module.exports = { enabled, register, getTag };
