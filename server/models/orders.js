/* Órdenes online (compras web pagadas por Stripe Checkout) y manuales de
   FB Marketplace. Las web se crean desde el webhook/sync de checkout; las
   manuales desde el panel. No se anulan ni editan aquí: los reembolsos se
   hacen en Stripe / trato directo en FB. */
const crypto = require('crypto');
const { pool } = require('../db');
const invoices = require('./invoices');

// Toda orden nueva (web o FB) genera su factura automáticamente con los
// datos del cliente ya llenos, lista para "Enviar por correo". Un fallo de
// facturación NUNCA debe impedir registrar la orden.
function autoInvoice(order) {
  if (!order) return;
  invoices.createFromOrder(order).catch((e) => console.error('auto invoice error:', e.message));
}

// Link secreto de seguimiento del cliente (página pública track.html).
function newTrackToken() {
  return crypto.randomBytes(24).toString('hex'); // 48 hex chars, no adivinable
}

// order: { sessionId, customerName, email, phone, address, items, total, currency, createdAt? }
// ON CONFLICT DO NOTHING: Stripe entrega los webhooks "al menos una vez"; si el
// evento se repite (o el server se reinicia y pierde el dedupe en memoria), la
// orden no se duplica. Devuelve la fila insertada o null si ya existía.
async function createFromStripe(order) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, created_at, track_token)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamp, NOW()), $10)
     ON CONFLICT (stripe_session_id) DO NOTHING
     RETURNING *`,
    [
      order.sessionId,
      order.customerName || null,
      order.email || null,
      order.phone || null,
      order.address || null,
      JSON.stringify(order.items || []),
      order.total || 0,
      order.currency || 'usd',
      order.createdAt || null, // backfill: fecha real del pago (epoch de Stripe)
      newTrackToken(),
    ]
  );
  autoInvoice(r.rows[0]);
  return r.rows[0] || null;
}

async function listAll() {
  const r = await pool.query('SELECT * FROM online_orders ORDER BY created_at DESC');
  return r.rows;
}

// Ids de sesión ya guardadas: la sincronización con Stripe los usa para no
// releer (ni reinsertar) órdenes que ya están en la base.
async function listSessionIds() {
  const r = await pool.query('SELECT stripe_session_id FROM online_orders');
  return r.rows.map((x) => x.stripe_session_id);
}

// Órdenes manuales (FB Marketplace): sin stripe_session_id; el total llega ya
// calculado por la ruta (server-side). Nacen como envío 'pendiente'.
async function createManual({ customer_name, email, phone, address, items, total }) {
  const r = await pool.query(
    `INSERT INTO online_orders (stripe_session_id, customer_name, email, phone, address, items, total, currency, origen, track_token)
     VALUES (NULL, $1, $2, $3, $4, $5, $6, 'usd', 'fb_marketplace', $7)
     RETURNING *`,
    [
      customer_name || null,
      email || null,
      phone || null,
      address || null,
      JSON.stringify(items || []),
      total || 0,
      newTrackToken(),
    ]
  );
  autoInvoice(r.rows[0]);
  return r.rows[0];
}

// Guardar el número de tracking: la orden pasa automáticamente a 'enviado'
// (sin tracking no hay envío). tracking_id es el id en AfterShip (si hay API).
async function updateTracking(id, { tracking_number, carrier, tracking_id }) {
  const r = await pool.query(
    `UPDATE online_orders
     SET tracking_number = $2, carrier = $3, tracking_id = COALESCE($4, tracking_id),
         ship_status = CASE WHEN ship_status = 'pendiente' THEN 'enviado' ELSE ship_status END
     WHERE id = $1 RETURNING *`,
    [id, tracking_number || null, carrier || null, tracking_id || null]
  );
  return r.rows[0] || null;
}

const SHIP_STATUSES = ['pendiente', 'enviado', 'entregado'];

// Tag fino de AfterShip (InTransit/OutForDelivery/Delivered): lo escribe el
// job de rastreo y alimenta la barra de progreso de 4 pasos.
async function updateShipTag(id, tag) {
  await pool.query('UPDATE online_orders SET ship_tag = $2 WHERE id = $1', [id, tag || null]);
}

async function updateShipStatus(id, status) {
  const r = await pool.query(
    'UPDATE online_orders SET ship_status = $2 WHERE id = $1 RETURNING *',
    [id, status]
  );
  return r.rows[0] || null;
}

// Órdenes con tracking activo que aún no se marcan entregadas: el job de
// AfterShip las consulta periódicamente (trayendo todo lo que necesita para
// los correos de tránsito/entrega).
async function listInTransit() {
  const r = await pool.query(
    `SELECT * FROM online_orders
     WHERE tracking_id IS NOT NULL AND ship_status <> 'entregado'`
  );
  return r.rows;
}

// Página pública de seguimiento: busca por el token secreto del cliente.
async function findByTrackToken(token) {
  const r = await pool.query('SELECT * FROM online_orders WHERE track_token = $1', [token]);
  return r.rows[0] || null;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM online_orders WHERE id = $1', [id]);
  return r.rows[0] || null;
}

// Marca un correo como enviado para no reenviarlo (whitelist estricta).
const EMAIL_FLAGS = ['email_shipped', 'email_transit', 'email_delivered'];
async function markEmailSent(id, flag) {
  if (!EMAIL_FLAGS.includes(flag)) return;
  await pool.query(`UPDATE online_orders SET ${flag} = true WHERE id = $1`, [id]);
}

module.exports = {
  createFromStripe, createManual, listAll, listSessionIds,
  updateTracking, updateShipStatus, updateShipTag, listInTransit,
  findByTrackToken, findById, markEmailSent, SHIP_STATUSES,
};
